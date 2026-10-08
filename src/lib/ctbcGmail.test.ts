import { generateKeyPairSync, randomUUID } from "node:crypto";
import { dkimSign, type DKIMSignOptions, type DNSResolver } from "mailauth";
import { beforeAll, describe, expect, it, vi } from "vitest";
import fixture from "@/test-fixtures/ctbc-email-alert.synthetic.json";
import { CtbcGmailClient, mailboxHash, parseCtbcGmailMime, readCtbcGmailSlot, readCtbcWorkerConfig, type CtbcWorkerConfig } from "./ctbcGmail";
import { ctbcSlot } from "./ctbcCollector";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" });
const publicKey = keys.publicKey.export({ type: "spki", format: "der" }).toString("base64");
const resolver: DNSResolver = async domain => {
  expect(domain).toBe("synthetic._domainkey.inib.ctbcbank.com");
  return [[`v=DKIM1; k=rsa; p=${publicKey}`]];
};
const date = "2026-07-23", received = Date.parse(fixture.receivedAt);
export const config: CtbcWorkerConfig = { scope: randomUUID(), owner: randomUUID(), mailboxBinding: randomUUID(),
  mailboxSha256: mailboxHash("synthetic@example.invalid"), targetLast4: "1234", armedDate: date,
  provenance: { policy: "gmail-smtp-reviewed-v1", evidenceSha256: "a".repeat(64), mailboxSha256: mailboxHash("synthetic@example.invalid") } };
const mime = (html = fixture.html, extra = "") => Buffer.from([
  `Received: from synthetic.example.invalid by mx.google.com with ESMTPS id fixture; ${new Date(received).toUTCString()}`,
  `Authentication-Results: ${fixture.authenticationResults}`, `From: ${fixture.from}`,
  `Subject: =?UTF-8?B?${Buffer.from(fixture.subject.trim()).toString("base64")}?=`,
  'MIME-Version: 1.0', 'Content-Type: multipart/alternative; boundary="synthetic"', extra,
].filter(Boolean).join("\r\n") + '\r\n\r\n--synthetic\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nsynthetic\r\n--synthetic\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + Buffer.from(html).toString("base64") + '\r\n--synthetic--\r\n');
const signed = async (raw = mime(), options: Partial<DKIMSignOptions> = {}) => {
  const signature = { signingDomain: "inib.ctbcbank.com", selector: "synthetic", privateKey,
    headerList: ["from", "subject", "content-type", "mime-version"], ...options };
  const sign = await dkimSign(raw, { ...signature, signatureData: [signature] });
  expect(sign.errors).toHaveLength(0);
  expect(sign.signatures).toContain("DKIM-Signature:");
  return Buffer.concat([Buffer.from(sign.signatures), raw]);
};
let raw: Buffer;
beforeAll(async () => { raw = await signed(); });
const provider = (handler: (url: URL) => unknown) => new CtbcGmailClient("synthetic-token", new AbortController().signal,
  vi.fn(async input => new Response(JSON.stringify(handler(new URL(String(input)))), { status: 200 })) as typeof fetch);

describe("bounded Gmail adapter (synthetic signed MIME, no real network)", () => {
  it("requires a protected account/selector and reviewed receipt boundary", () => {
    expect(readCtbcWorkerConfig({ CTBC_WORKER_CONFIG: JSON.stringify(config) })).toEqual(config);
    expect(() => readCtbcWorkerConfig({})).toThrow("selector_denied");
    expect(() => readCtbcWorkerConfig({ CTBC_WORKER_CONFIG: JSON.stringify({ ...config, provenance: { policy: "mx.google.com" } }) })).toThrow("source_denied");
    expect(() => readCtbcWorkerConfig({ CTBC_WORKER_CONFIG: JSON.stringify({ ...config, provenance: { ...config.provenance, mailboxSha256: "b".repeat(64) } }) })).toThrow("source_denied");
  });
  it("cryptographically verifies full-body DKIM then decodes nested/base64 MIME", async () => {
    const result = await parseCtbcGmailMime(raw, "synthetic-id", received, resolver);
    expect(result.candidates).toHaveLength(3); expect(result.candidates[0].amountTwd).toBe(1280);
    expect(result.messageId).toBe("synthetic-id");
  });
  it("rejects forged pass strings, altered body, duplicate headers, wrong domain, and limited signatures", async () => {
    await expect(parseCtbcGmailMime(mime(), "id", received, resolver)).rejects.toThrow("source_denied");
    const altered = Buffer.from(raw.toString().replace(Buffer.from(fixture.html).toString("base64"), Buffer.from(fixture.html.replace("1,280", "9,280")).toString("base64")));
    await expect(parseCtbcGmailMime(altered, "id", received, resolver)).rejects.toThrow("source_denied");
    await expect(parseCtbcGmailMime(await signed(mime(undefined, "From: attacker@example.invalid")), "id", received, resolver)).rejects.toThrow("source_denied");
    await expect(parseCtbcGmailMime(await signed(mime(), { signingDomain: "attacker.example.invalid" }), "id", received, async () => [[`v=DKIM1; k=rsa; p=${publicKey}`]])).rejects.toThrow("source_denied");
    await expect(parseCtbcGmailMime(await signed(mime(), { maxBodyLength: 10 }), "id", received, resolver)).rejects.toThrow("source_denied");
    await expect(parseCtbcGmailMime(raw, "id", received + 300_001, resolver)).rejects.toThrow("source_denied");
  });
  it("reads actual list/get pagination, filters exact internalDate, and never persists other cards", async () => {
    const urls: URL[] = [];
    const client = provider(url => {
      urls.push(url);
      if (url.pathname.endsWith("/profile")) return { emailAddress: "synthetic@example.invalid" };
      if (url.pathname.endsWith("/messages")) return url.searchParams.has("pageToken") ? { messages: [{ id: "end" }] } : { messages: [{ id: "inside" }], nextPageToken: "next" };
      return { id: url.pathname.split("/").at(-1), internalDate: String(url.pathname.endsWith("/end") ? ctbcSlot(date).end : received), raw: raw.toString("base64url") };
    });
    const result = await readCtbcGmailSlot(client, config, date, resolver);
    expect(result.complete).toBe(true); expect(result.rows).toHaveLength(1);
    expect(urls.some(u => u.searchParams.get("pageToken") === "next")).toBe(true);
    expect(urls.filter(u => u.pathname.includes("/messages/")).every(u => u.searchParams.get("format") === "raw")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("5678"); expect(JSON.stringify(result)).not.toContain("inside");
    expect(JSON.stringify(result)).not.toContain("synthetic-token");
  });
  it("fails closed on account mismatch before listing or getting mail", async () => {
    const calls: string[] = [];
    const client = provider(url => { calls.push(url.pathname); return { emailAddress: "other@example.invalid" }; });
    await expect(readCtbcGmailSlot(client, config, date, resolver)).rejects.toThrow("account_denied");
    expect(calls).toHaveLength(1);
  });
  it("retains sanitized prior successes after pagination failure/repeated tokens", async () => {
    const result = await readCtbcGmailSlot(provider(url => {
      if (url.pathname.endsWith("/profile")) return { emailAddress: "synthetic@example.invalid" };
      if (url.pathname.endsWith("/messages")) return url.searchParams.has("pageToken") ? { nextPageToken: "repeat" } : { messages: [{ id: "first" }], nextPageToken: "repeat" };
      return { id: "first", internalDate: String(received), raw: raw.toString("base64url") };
    }), config, date, resolver);
    expect(result.complete).toBe(false); expect(result.errorCode).toBe("provider_failed");
    expect(result.rows).toHaveLength(1); expect(result.rows[0].warnings).toContain("partial_batch");
  });
  it("enforces response/attempt limits", async () => {
    const client = new CtbcGmailClient("fixture", AbortSignal.abort());
    await expect(client.get("profile")).rejects.toThrow("attempt_timeout");
    const huge = new CtbcGmailClient("fixture", new AbortController().signal, vi.fn(async () => new Response("a".repeat(64_001))) as typeof fetch);
    await expect(huge.get("profile")).rejects.toThrow("limit_exceeded");
  });
  it("bounds pagination even when every page gives a new token", async () => {
    let page = 0;
    const result = await readCtbcGmailSlot(provider(url => url.pathname.endsWith("/profile") ? { emailAddress: "synthetic@example.invalid" } : { nextPageToken: `page-${++page}` }), config, date, resolver);
    expect(page).toBe(3); expect(result.complete).toBe(false); expect(result.errorCode).toBe("limit_exceeded"); expect(result.rows).toHaveLength(0);
  });
});
