// Server worker only. Raw MIME stays in memory; no mail content enters logs.
import { createHash } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { dkimVerify, type DNSResolver } from "mailauth";
import { simpleParser } from "mailparser";
import { CTBC_ALERT_SENDER, CTBC_ALERT_SUBJECT, parseCtbcContent } from "./ctbcEmailParser";
import { ctbcSlot, prepareCtbcParsedBatch } from "./ctbcCollector";

export const mailboxHash = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
export class CtbcWorkerError extends Error {
  constructor(public readonly code: "provider_failed" | "source_denied" | "account_denied" | "selector_denied" | "parse_failed" | "limit_exceeded" | "attempt_timeout") { super(code); }
}
export type CtbcWorkerConfig = {
  scope: string; owner: string; mailboxBinding: string; mailboxSha256: string; targetLast4: string; armedDate: string;
  // Protected evidence reference, not a fixture/boolean. Live approval must
  // establish SMTP-only receipt and Gmail's inbound header stripping boundary.
  provenance: { policy: "gmail-smtp-reviewed-v1"; evidenceSha256: string; mailboxSha256: string };
};
export function readCtbcWorkerConfig(env: Readonly<Record<string, string | undefined>>): CtbcWorkerConfig {
  let c: CtbcWorkerConfig;
  try { c = JSON.parse(env.CTBC_WORKER_CONFIG ?? "null"); } catch { throw new CtbcWorkerError("selector_denied"); }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!c || ![c.scope, c.owner, c.mailboxBinding].every(v => typeof v === "string" && uuid.test(v)) ||
      typeof c.targetLast4 !== "string" || !/^\d{4}$/.test(c.targetLast4) || !/^[a-f0-9]{64}$/.test(c.mailboxSha256 ?? "")) throw new CtbcWorkerError("selector_denied");
  // Reuse the existing application's fixed server tenant, rather than allowing
  // a collector config to select a different user even with service credentials.
  if (c.owner.toLowerCase() !== env.LITEYNAB_USER_ID?.toLowerCase()) throw new CtbcWorkerError("account_denied");
  try { ctbcSlot(c.armedDate); } catch { throw new CtbcWorkerError("selector_denied"); }
  if (c.provenance?.policy !== "gmail-smtp-reviewed-v1" || !/^[a-f0-9]{64}$/.test(c.provenance.evidenceSha256 ?? "") ||
      c.provenance.mailboxSha256 !== c.mailboxSha256) throw new CtbcWorkerError("source_denied");
  return c;
}

async function boundedJson(response: Response, max: number): Promise<Record<string, unknown>> {
  if (!response.ok || !response.body) throw new CtbcWorkerError("provider_failed");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > max) throw new CtbcWorkerError("limit_exceeded");
      chunks.push(value);
    }
    const json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!json || typeof json !== "object" || Array.isArray(json)) throw new CtbcWorkerError("provider_failed");
    return json;
  } catch (error) { throw error instanceof CtbcWorkerError ? error : new CtbcWorkerError("provider_failed"); }
  finally { await reader.cancel().catch(() => undefined); }
}
export class CtbcGmailClient {
  constructor(private readonly token: string, private readonly signal: AbortSignal, private readonly transport: typeof fetch = fetch) {}
  async get(path: string, params?: URLSearchParams) {
    if (this.signal.aborted) throw new CtbcWorkerError("attempt_timeout");
    try {
      const response = await this.transport(`https://gmail.googleapis.com/gmail/v1/users/me/${path}${params ? `?${params}` : ""}`, {
        headers: { Authorization: `Bearer ${this.token}` }, redirect: "error", signal: AbortSignal.any([this.signal, AbortSignal.timeout(30_000)]),
      });
      return await boundedJson(response, path === "profile" || path === "messages" ? 64_000 : 1_500_000);
    } catch (error) { throw this.signal.aborted ? new CtbcWorkerError("attempt_timeout") : error instanceof CtbcWorkerError ? error : new CtbcWorkerError("provider_failed"); }
  }
}
export async function createCtbcGmailClient(env: Readonly<Record<string, string | undefined>>, signal: AbortSignal) {
  const id = env.CTBC_GMAIL_CLIENT_ID, secret = env.CTBC_GMAIL_CLIENT_SECRET, refresh = env.CTBC_GMAIL_REFRESH_TOKEN;
  if (!id || !secret || !refresh) throw new CtbcWorkerError("account_denied");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const token = await boundedJson(response, 16_000);
  const scopes = typeof token.scope === "string" ? token.scope.split(/\s+/) : [];
  if (typeof token.access_token !== "string" || !scopes.includes("https://www.googleapis.com/auth/gmail.readonly") ||
      scopes.some(s => s.includes("/auth/gmail") && s !== "https://www.googleapis.com/auth/gmail.readonly") || scopes.includes("https://mail.google.com/")) throw new CtbcWorkerError("account_denied");
  return new CtbcGmailClient(token.access_token, signal);
}

// Header multiplicity/order is checked on the original bytes, before MIME
// decoding. These checks supplement verified DKIM and the reviewed receive
// boundary; they alone do NOT prove that an Authentication-Results is trusted.
function rawHeaders(raw: Buffer) {
  const end = raw.indexOf("\r\n\r\n");
  if (end < 0 || end > 64_000) throw new CtbcWorkerError("source_denied");
  const headers = raw.subarray(0, end).toString("utf8").replace(/\r\n[ \t]+/g, " ").split("\r\n").map(line => {
    const colon = line.indexOf(":"); if (colon < 1) throw new CtbcWorkerError("source_denied");
    return { name: line.slice(0, colon).toLowerCase(), value: line.slice(colon + 1).trim() };
  });
  return headers;
}
function mimeValue(value: string) {
  const [type, ...fields] = value.split(";");
  const params: Record<string, string> = {};
  for (const field of fields) {
    const match = /^\s*([a-z-]+)\s*=\s*(?:"([^"\\\r\n]+)"|([^\s"\\]+))\s*$/i.exec(field);
    if (!match || Object.hasOwn(params, match[1].toLowerCase())) return null;
    params[match[1].toLowerCase()] = match[2] ?? match[3];
  }
  return { type: type.trim().toLowerCase(), params };
}

function multipart(body: string, boundary: string) {
  if (!/^[a-z0-9_=.-]{1,80}$/i.test(boundary)) return null;
  const delimiter = `--${boundary}`;
  const chunks = body.split(`\r\n${delimiter}`);
  // Allow an empty preamble only; derive the same delimiter from signed bytes.
  if (!chunks[0].startsWith(delimiter + "\r\n")) return null;
  chunks[0] = chunks[0].slice(delimiter.length);
  if (chunks.length !== 3 || !/^--\r\n\s*$/.test(chunks[2])) return null;
  return chunks.slice(0, 2).map(part => part.startsWith("\r\n") ? part.slice(2) : "");
}

function mimePart(part: string, allowedHeaders: string[]) {
  const bytes = Buffer.from(part, "latin1");
  const end = part.indexOf("\r\n\r\n");
  if (end < 0 || end > 4096) return null;
  const headers = rawHeaders(bytes);
  if (headers.some(h => !allowedHeaders.includes(h.name)) || new Set(headers.map(h => h.name)).size !== headers.length) return null;
  return { headers: Object.fromEntries(headers.map(h => [h.name, h.value])), body: part.slice(end + 4) };
}

async function isBankSignedMime(raw: Buffer, outerType: string, outerHeaders: ReturnType<typeof rawHeaders>) {
  const type = mimeValue(outerType);
  if (outerHeaders.some(h => h.name === "content-transfer-encoding") || type?.type !== "multipart/signed" || Object.keys(type.params).length !== 3 ||
      type.params.protocol !== "application/x-pkcs7-signature" || type.params.micalg !== "sha256") return false;
  const body = raw.subarray(raw.indexOf("\r\n\r\n") + 4).toString("latin1").replace(/^\r\n/, "");
  const pair = multipart(body, type.params.boundary ?? "");
  if (!pair) return false;
  const mirrored = ["from", "message-id", "mime-version", "date", "to", "reply-to"];
  const content = mimePart(pair[0], [...mirrored, "subject", "precedence", "list-unsubscribe", "content-type"]);
  const signature = mimePart(pair[1], ["content-type", "content-disposition", "content-transfer-encoding"]);
  const inner = mimeValue(content?.headers["content-type"] ?? "");
  const sigType = mimeValue(signature?.headers["content-type"] ?? "");
  const disposition = mimeValue(signature?.headers["content-disposition"] ?? "");
  // The bank repeats these fields inside the DKIM-authenticated body. Outer
  // Subject is only a filter; the signed inner copy must match every mirror.
  if (!content || mirrored.some(name => {
    const outer = outerHeaders.filter(h => h.name === name);
    return outer.length !== 1 || !content.headers[name] || outer[0].value !== content.headers[name];
  }) || content.headers["mime-version"] !== "1.0" || (content.headers.precedence && content.headers.precedence !== "bulk") ||
      !signature || inner?.type !== "multipart/alternative" || Object.keys(inner.params).length !== 1 ||
      sigType?.type !== "application/x-pkcs7-signature" || Object.keys(sigType.params).length !== 1 || sigType.params.name !== "smime.p7s" ||
      disposition?.type !== "attachment" || Object.keys(disposition.params).length !== 1 || disposition.params.filename !== "smime.p7s" ||
      signature.headers["content-transfer-encoding"]?.toLowerCase() !== "base64") return false;
  const signatureText = signature.body.replace(/\r\n/g, "");
  if (!/^[a-z0-9+/]+={0,2}$/i.test(signatureText) || signatureText.length % 4 || signatureText.length > 32_000 || Buffer.from(signatureText, "base64")[0] !== 0x30) return false;
  const alternatives = multipart(content.body, inner.params.boundary ?? "");
  if (!alternatives) return false;
  if (!alternatives.every((part, index) => {
    const parsed = mimePart(part, ["content-type", "content-transfer-encoding"]);
    const format = mimeValue(parsed?.headers["content-type"] ?? "");
    return !!parsed && format?.type === (index === 0 ? "text/plain" : "text/html") && Object.keys(format.params).length === 1 &&
      ["big5", "utf-8"].includes(format.params.charset?.toLowerCase()) &&
      ["quoted-printable", "base64"].includes(parsed.headers["content-transfer-encoding"]?.toLowerCase());
  })) return false;
  // RFC 2047 encodings may differ; compare the signed inner subject after MIME
  // decoding, never trust an unsigned outer subject to establish provenance.
  const innerMail = await simpleParser(Buffer.from(pair[0], "latin1"), { skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true });
  return innerMail.subject?.trim() === CTBC_ALERT_SUBJECT;
}

export async function parseCtbcGmailMime(raw: Buffer, id: string, internalDate: number, resolver?: DNSResolver) {
  if (raw.length > 1_000_000) throw new CtbcWorkerError("limit_exceeded");
  const headers = rawHeaders(raw);
  const one = (name: string) => {
    const values = headers.filter(h => h.name === name); if (values.length !== 1) throw new CtbcWorkerError("source_denied");
    return values[0].value;
  };
  const auth = one("authentication-results");
  for (const name of ["from", "subject", "content-type", ...["content-transfer-encoding", "mime-version"].filter(h => headers.some(v => v.name === h))]) one(name);
  // Only the first SMTP ingress, optionally preceded by Gmail's internal hop.
  // Never search arbitrary lower Received fields supplied by the sender.
  const hops = headers.filter(h => h.name === "received");
  const internalHop = /^by\s+2002:[0-9a-f:]+\s+with\s+SMTP\b/i.test(hops[0]?.value ?? "");
  const ingress = hops[internalHop ? 1 : 0];
  const received = ingress?.value;
  const ingressIndex = ingress ? headers.indexOf(ingress) : -1;
  const authIndex = headers.findIndex(h => h.name === "authentication-results");
  const signatureIndex = headers.findIndex(h => h.name === "dkim-signature");
  const traceNames = new Set(["delivered-to", "received", "x-received", "arc-seal", "arc-message-signature", "arc-authentication-results", "return-path", "received-spf", "authentication-results"]);
  const receiptTime = received ? Date.parse(received.slice(received.lastIndexOf(";") + 1)) : NaN;
  if (hops.length !== (internalHop ? 2 : 1) || !received || !/^from\s+[^;]+\s+by\s+mx\.google\.com\s+with\s+ESMTPS\b/i.test(received) ||
      authIndex <= ingressIndex || signatureIndex <= authIndex || headers.slice(0, authIndex).some(h => !traceNames.has(h.name)) ||
      !Number.isFinite(receiptTime) || Math.abs(receiptTime - internalDate) > 300_000 || !/^mx\.google\.com\s*;/i.test(auth)) throw new CtbcWorkerError("source_denied");
  if (headers.filter(h => h.name === "dkim-signature").length > 8) throw new CtbcWorkerError("limit_exceeded");
  // No trustReceived, no string-based DKIM pass. Verify the complete body and
  // exact bank signing domain using DNS, rejecting limited-body signatures.
  const verified = await dkimVerify(raw, { strict: true, rejectRsaSha1: true, minBitLength: 1024, resolver });
  const bankSigned = verified.results.some(r => r.status.result === "pass" && r.signingDomain?.toLowerCase() === "inib.ctbcbank.com" &&
      r.selector === "s1024" && r.algo === "rsa-sha256" && (r.modulusLength ?? 0) >= 1024 &&
      r.signatureTimeValid !== false && !r.canonBodyLengthLimited && !r.status.testing && !r.status.warnings?.length &&
      ["from", "message-id", "mime-version"].every(h => r.signingHeaders?.keys.toLowerCase().split(":").map(v => v.trim()).includes(h)));
  // RFC 8301 permits 1024-bit verification. The bank's observed selector may
  // use unsigned outer MIME only when it agrees with its authenticated body.
  const bankMime = bankSigned && await isBankSignedMime(raw, one("content-type"), headers);
  if (bankMime) { one("message-id"); if (one("mime-version") !== "1.0") throw new CtbcWorkerError("source_denied"); }
  if (!bankMime && !verified.results.some(r => r.status.result === "pass" && r.signingDomain?.toLowerCase() === "inib.ctbcbank.com" &&
      (r.modulusLength ?? 0) >= 2048 &&
      r.signatureTimeValid !== false && !r.canonBodyLengthLimited && !r.status.testing && !r.status.warnings?.length &&
      ["from", "subject", "content-type", ...["content-transfer-encoding", "mime-version"].filter(h => headers.some(v => v.name === h))]
        .every(h => r.signingHeaders?.keys.toLowerCase().split(":").map(v => v.trim()).includes(h)))) throw new CtbcWorkerError("source_denied");
  const mail = await simpleParser(raw, { skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true });
  if (mail.from?.value.length !== 1 || mail.from.value[0].address?.toLowerCase() !== CTBC_ALERT_SENDER || mail.subject?.trim() !== CTBC_ALERT_SUBJECT ||
      (bankMime ? mail.attachments.length !== 1 || mail.attachments[0].contentType !== "application/x-pkcs7-signature" || mail.attachments[0].filename !== "smime.p7s" : mail.attachments.length > 0)) throw new CtbcWorkerError("source_denied");
  // Require all three results from the audited Gmail boundary as in the prior
  // source policy, AND the independent cryptographic verification above.
  const a = auth.toLowerCase();
  if (!/(?:^|;)\s*dkim=pass\s[^;]*header\.(?:i=@|d=)inib\.ctbcbank\.com(?=[;\s]|$)/.test(a) ||
      !/(?:^|;)\s*spf=pass\s[^;]*smtp\.mailfrom=(?:bank\.csc|return\+eid[0-9a-f]+\+[a-z0-9._-]+)@inib\.ctbcbank\.com(?=[;\s]|$)/.test(a) ||
      !/(?:^|;)\s*dmarc=pass\s[^;]*header\.from=inib\.ctbcbank\.com(?=[;\s]|$)/.test(a) ||
      /(?:^|;)\s*(?:dkim|spf|dmarc)=(?!pass(?:[;\s]|$))/.test(a)) throw new CtbcWorkerError("source_denied");
  return parseCtbcContent({ messageId: id, html: typeof mail.html === "string" ? mail.html : null, text: mail.text }, { preserveRows: true });
}

export async function readCtbcGmailSlot(client: CtbcGmailClient, c: CtbcWorkerConfig, date: string, resolver?: DNSResolver) {
  const profile = await client.get("profile");
  if (typeof profile.emailAddress !== "string" || mailboxHash(profile.emailAddress) !== c.mailboxSha256) throw new CtbcWorkerError("account_denied");
  const slot = ctbcSlot(date), seen = new Set<string>(), pages = new Set<string>();
  const messages: Parameters<typeof prepareCtbcParsedBatch>[1] = [];
  let pageToken: string | undefined, totalBytes = 0, complete = true;
  let errorCode: CtbcWorkerError["code"] | undefined;
  const dns = new Resolver({ timeout: 5_000, tries: 1 }); let queries = 0;
  const boundedResolver: DNSResolver = resolver ?? (async (domain, type) => {
    if (++queries > 100 || type !== "TXT" || !/^[a-z0-9._-]+$/i.test(domain)) throw new CtbcWorkerError("limit_exceeded");
    return dns.resolveTxt(domain);
  });
  try {
    for (let page = 0; page < 3; page++) {
      const query = new URLSearchParams({ q: `${slot.query} from:${CTBC_ALERT_SENDER} subject:"${CTBC_ALERT_SUBJECT}"`, maxResults: "50", includeSpamTrash: "false" });
      if (pageToken) query.set("pageToken", pageToken);
      const list = await client.get("messages", query);
      if (list.messages !== undefined && !Array.isArray(list.messages)) throw new CtbcWorkerError("provider_failed");
      for (const item of (list.messages ?? []) as Array<{ id?: unknown }>) {
        if (typeof item.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(item.id) || seen.has(item.id)) throw new CtbcWorkerError("provider_failed");
        if (seen.size >= 100) throw new CtbcWorkerError("limit_exceeded");
        seen.add(item.id);
        const message = await client.get(`messages/${item.id}`, new URLSearchParams({ format: "raw" }));
        if (message.id !== item.id || typeof message.internalDate !== "string" || !/^\d{1,16}$/.test(message.internalDate)) throw new CtbcWorkerError("provider_failed");
        const received = Number(message.internalDate);
        if (!Number.isSafeInteger(received)) throw new CtbcWorkerError("provider_failed");
        if (received < slot.start || received >= slot.end) continue;
        if (typeof message.raw !== "string" || !/^[A-Za-z0-9_-]+={0,2}$/.test(message.raw)) throw new CtbcWorkerError("provider_failed");
        const raw = Buffer.from(message.raw, "base64url"); totalBytes += raw.length;
        if (totalBytes > 10_000_000) throw new CtbcWorkerError("limit_exceeded");
        try { messages.push({ internalDate: received, parsed: await parseCtbcGmailMime(raw, item.id, received, boundedResolver) }); }
        catch (error) {
          if (error instanceof CtbcWorkerError && error.code === "source_denied") { messages.push({ internalDate: received, parsed: null }); errorCode = "source_denied"; complete = false; }
          else throw error;
        }
      }
      if (list.nextPageToken === undefined) { pageToken = undefined; break; }
      if (typeof list.nextPageToken !== "string" || !list.nextPageToken || list.nextPageToken.length > 512 || pages.has(list.nextPageToken)) throw new CtbcWorkerError("provider_failed");
      pageToken = list.nextPageToken; pages.add(pageToken);
    }
    if (pageToken) throw new CtbcWorkerError("limit_exceeded");
  } catch (error) { complete = false; errorCode = error instanceof CtbcWorkerError ? error.code : "provider_failed"; }
  const prepared = prepareCtbcParsedBatch(date, messages, c.targetLast4, complete, true);
  if (prepared.counts.failures || prepared.counts.rejected) { complete = false; errorCode ??= "parse_failed"; }
  return { ...prepared, complete, errorCode };
}
