import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CtbcGmailClient, mailboxHash, type CtbcWorkerConfig } from "./ctbcGmail";
import { runCtbcAttempt, runCtbcRetentionOnce, runCtbcWorkerOnce, tickCtbcWorker } from "./ctbcWorker";
const config: CtbcWorkerConfig = { scope: randomUUID(), owner: randomUUID(), mailboxBinding: randomUUID(), mailboxSha256: mailboxHash("fixture@example.invalid"),
  targetLast4: "1234", armedDate: "2026-10-08", provenance: { policy: "gmail-smtp-reviewed-v1", evidenceSha256: "a".repeat(64), mailboxSha256: mailboxHash("fixture@example.invalid") } };
const attempt = () => ({ code: "started", batchId: randomUUID(), fence: 1, deadline: new Date(Date.now() + 900_000).toISOString(), serverNow: new Date().toISOString(), slotDate: "2026-10-08" });
const emptyMailbox = () => new CtbcGmailClient("fixture", new AbortController().signal,
  vi.fn(async input => new Response(JSON.stringify(String(input).endsWith("/profile") ? { emailAddress: "fixture@example.invalid" } : {}))) as typeof fetch);
const client = (handler: (name: string, args: Record<string, unknown>) => unknown) => ({ rpc: vi.fn(async (name, args) => handler(name, args)) }) as unknown as Pick<SupabaseClient, "rpc">;
describe("CTBC execution reconciliation", () => {
  it("default-off collection and cleanup access nothing", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    expect(await runCtbcWorkerOnce({})).toEqual({ code: "disabled" });
    expect(await runCtbcRetentionOnce({})).toEqual({ code: "disabled" });
    expect(fetcher).not.toHaveBeenCalled(); fetcher.mockRestore();
  });
  it("does not invoke Gmail on busy/backoff/missed/reconciling state", async () => {
    for (const code of ["busy", "backoff", "reconciling", "complete", "retry_budget_exhausted", "disabled"]) {
      const gmail = vi.fn();
      expect(await tickCtbcWorker({ config, client: client(() => ({ data: { code } })), gmail })).toEqual({ code });
      expect(gmail).not.toHaveBeenCalled();
    }
  });
  it("lost claim reply is UNKNOWN and never blindly reclaims", async () => {
    const db = client(() => ({ error: {} })), gmail = vi.fn();
    expect(await tickCtbcWorker({ config, client: db, gmail })).toEqual({ code: "poll_unknown" });
    expect(db.rpc).toHaveBeenCalledTimes(1); expect(gmail).not.toHaveBeenCalled();
  });
  it("lost commit reply returns durable success without failure finalizer", async () => {
    const calls: string[] = [];
    const db = client(name => {
      calls.push(name);
      return name === "ctbc_worker_commit" ? { error: {} } : { data: { code: "committed", result: { status: "no_message" } } };
    });
    expect(await runCtbcAttempt({ client: db, config, gmail: async () => emptyMailbox() }, attempt())).toEqual({ code: "committed", result: { status: "no_message" } });
    expect(calls).toEqual(["ctbc_worker_commit", "ctbc_worker_probe"]);
  });
  it("unknown probe leaves lease for durable expiry, never guesses failed", async () => {
    const db = client(() => ({ error: {} }));
    expect(await runCtbcAttempt({ client: db, config, gmail: async () => emptyMailbox() }, attempt())).toEqual({ code: "commit_unknown" });
    expect(db.rpc).toHaveBeenCalledTimes(2);
  });
  it("provider failure uses fixed error after probing, retaining original fence", async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const db = client((name, args) => { calls.push([name, args]); return { data: { code: name === "ctbc_worker_probe" ? "running" : "failed" } }; });
    expect(await runCtbcAttempt({ client: db, config, gmail: async () => { throw new Error("secret/raw provider error"); } }, attempt())).toEqual({ code: "failed" });
    expect(calls.map(c => c[0])).toEqual(["ctbc_worker_probe", "ctbc_worker_finish"]);
    expect(calls[1][1]).toMatchObject({ p_fence: 1, p_code: "provider_failed", p_owner: config.owner });
    expect(JSON.stringify(calls)).not.toContain("secret/raw");
  });
  it("an expired lease is finalized without provider access", async () => {
    const gmail = vi.fn(), calls: string[] = [];
    const db = client(name => { calls.push(name); return { data: { code: name === "ctbc_worker_probe" ? "running" : "failed" } }; });
    expect(await runCtbcAttempt({ client: db, config, gmail }, { ...attempt(), deadline: new Date(Date.now() - 1).toISOString() })).toEqual({ code: "failed" });
    expect(gmail).not.toHaveBeenCalled(); expect(calls).toEqual(["ctbc_worker_probe", "ctbc_worker_finish"]);
  });
  it("uses the DB clock budget even if the host clock is skewed", async () => {
    const a = attempt(); const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 6 * 3600000);
    try {
      const db = client(() => ({ data: { status: "no_message" } }));
      expect((await runCtbcAttempt({ client: db, config, gmail: async () => emptyMailbox() }, a)).code).toBe("committed");
    } finally { now.mockRestore(); }
  });
  it("retention counts without collection config or mail access", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({ p_dry_run: true, p_limit: 200 });
      return new Response(JSON.stringify({ expire: 1, scrub: 2, purge: 3 }), { headers: { "Content-Type": "application/json" } });
    });
    expect(await runCtbcRetentionOnce({ CTBC_RETENTION_ENABLED: "true", CTBC_COLLECTOR_ENABLED: "false", NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "synthetic" })).toEqual({ expire: 1, scrub: 2, purge: 3 });
    expect(fetcher).toHaveBeenCalledTimes(1); fetcher.mockRestore();
  });
});
