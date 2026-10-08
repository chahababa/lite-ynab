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
export async function parseCtbcGmailMime(raw: Buffer, id: string, internalDate: number, resolver?: DNSResolver) {
  if (raw.length > 1_000_000) throw new CtbcWorkerError("limit_exceeded");
  const headers = rawHeaders(raw);
  const one = (name: string) => {
    const values = headers.filter(h => h.name === name); if (values.length !== 1) throw new CtbcWorkerError("source_denied");
    return values[0].value;
  };
  const auth = one("authentication-results");
  for (const name of ["from", "subject", "content-type", ...["content-transfer-encoding", "mime-version"].filter(h => headers.some(v => v.name === h))]) one(name);
  const received = headers.find(h => h.name === "received")?.value;
  const receiptTime = received ? Date.parse(received.slice(received.lastIndexOf(";") + 1)) : NaN;
  if (!received || !/\bby\s+[^\s;]*google\.com\b/i.test(received) || !/\bwith\s+(?:ESMTPS|SMTP)/i.test(received) ||
      !Number.isFinite(receiptTime) || Math.abs(receiptTime - internalDate) > 300_000 || !/^mx\.google\.com\s*;/i.test(auth)) throw new CtbcWorkerError("source_denied");
  if (headers.filter(h => h.name === "dkim-signature").length > 8) throw new CtbcWorkerError("limit_exceeded");
  // No trustReceived, no string-based DKIM pass. Verify the complete body and
  // exact bank signing domain using DNS, rejecting limited-body signatures.
  const verified = await dkimVerify(raw, { strict: true, rejectRsaSha1: true, minBitLength: 2048, resolver });
  if (!verified.results.some(r => r.status.result === "pass" && r.signingDomain?.toLowerCase() === "inib.ctbcbank.com" &&
      r.signatureTimeValid !== false && !r.canonBodyLengthLimited && !r.status.testing && !r.status.warnings?.length &&
      ["from", "subject", "content-type", ...["content-transfer-encoding", "mime-version"].filter(h => headers.some(v => v.name === h))]
        .every(h => r.signingHeaders?.keys.toLowerCase().split(":").map(v => v.trim()).includes(h)))) throw new CtbcWorkerError("source_denied");
  const mail = await simpleParser(raw, { skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true });
  if (mail.from?.value.length !== 1 || mail.from.value[0].address?.toLowerCase() !== CTBC_ALERT_SENDER || mail.subject?.trim() !== CTBC_ALERT_SUBJECT || mail.attachments.length) throw new CtbcWorkerError("source_denied");
  // Require all three results from the audited Gmail boundary as in the prior
  // source policy, AND the independent cryptographic verification above.
  const a = auth.toLowerCase();
  if (!/(?:^|;)\s*dkim=pass\s[^;]*header\.(?:i=@|d=)inib\.ctbcbank\.com(?=[;\s]|$)/.test(a) ||
      !/(?:^|;)\s*spf=pass\s[^;]*smtp\.mailfrom=bank\.csc@inib\.ctbcbank\.com(?=[;\s]|$)/.test(a) ||
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
