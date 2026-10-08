import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createCtbcGmailClient, CtbcWorkerError, readCtbcGmailSlot, readCtbcWorkerConfig, type CtbcGmailClient, type CtbcWorkerConfig } from "./ctbcGmail";

type RpcClient = Pick<SupabaseClient, "rpc">;
type Attempt = { code: string; batchId: string; fence: number; deadline: string; slotDate: string };
type Runtime = {
  client: RpcClient; config: CtbcWorkerConfig;
  gmail: (signal: AbortSignal) => Promise<CtbcGmailClient>;
  signal?: AbortSignal;
};
const binding = (c: CtbcWorkerConfig) => ({ p_scope: c.scope, p_owner: c.owner, p_mailbox: c.mailboxBinding });
// Never throw provider/DB response messages into caller logs.
async function rpc(client: RpcClient, name: string, args: Record<string, unknown>) {
  try {
    const result = await client.rpc(name, args);
    if (result.error || !result.data) return null;
    return result.data;
  } catch { return null; }
}
export async function runCtbcAttempt(runtime: Runtime, attempt: Attempt) {
  const { client, config: c } = runtime, args = { ...binding(c), p_fence: attempt.fence };
  const ms = Date.parse(attempt.deadline) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) {
    const receipt = await rpc(client, "ctbc_worker_probe", args);
    if (!receipt) return { code: "commit_unknown" };
    if (receipt.code !== "running") return receipt;
    return await rpc(client, "ctbc_worker_finish", { ...args, p_code: "attempt_timeout" }) ?? { code: "commit_unknown" };
  }
  // Reserve 30 seconds of the SQL lease for committing/reconciling. Every
  // provider call shares this signal and an additional per-request deadline.
  const deadlineSignal = AbortSignal.timeout(Math.max(1, Math.min(ms, 900_000) - 30_000));
  const signal = runtime.signal ? AbortSignal.any([deadlineSignal, runtime.signal]) : deadlineSignal;
  try {
    const gmail = await runtime.gmail(signal);
    const prepared = await readCtbcGmailSlot(gmail, c, attempt.slotDate);
    if (!prepared.complete && prepared.rows.length === 0) throw new CtbcWorkerError(prepared.errorCode ?? "provider_failed");
    const result = await rpc(client, "ctbc_worker_commit", { ...args, p_batch: attempt.batchId,
      p_rows: prepared.rows, p_counts: prepared.counts, p_complete: prepared.complete, p_error: prepared.errorCode ?? null });
    if (result) return { code: "committed", result };
    // A response timeout is UNKNOWN, not a failed SQL transaction. First read
    // the durable receipt. Finalizer rechecks it under the same scope lock.
    const receipt = await rpc(client, "ctbc_worker_probe", args);
    if (!receipt) return { code: "commit_unknown" };
    if (receipt.code === "committed") return receipt;
    if (receipt.code !== "running") return { code: receipt.code };
    return await rpc(client, "ctbc_worker_finish", { ...args, p_code: "commit_unknown" }) ?? { code: "commit_unknown" };
  } catch (error) {
    const code = signal.aborted ? "attempt_timeout" : error instanceof CtbcWorkerError ? error.code : "provider_failed";
    // Same safe reconciliation for provider exceptions and unexpected throws.
    const receipt = await rpc(client, "ctbc_worker_probe", args);
    if (!receipt) return { code: "commit_unknown" };
    if (receipt.code === "committed") return receipt;
    if (receipt.code !== "running") return { code: receipt.code };
    return await rpc(client, "ctbc_worker_finish", { ...args, p_code: code }) ?? { code: "commit_unknown" };
  }
}
export async function tickCtbcWorker(runtime: Runtime) {
  const attempt = await rpc(runtime.client, "ctbc_worker_poll", { ...binding(runtime.config), p_armed_date: runtime.config.armedDate });
  if (!attempt) return { code: "poll_unknown" }; // no blind claim replay
  if (attempt.code !== "started") return attempt;
  return runCtbcAttempt(runtime, attempt);
}
function serviceClient(env: Readonly<Record<string, string | undefined>>) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("worker_configuration_denied");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co")) throw new Error("worker_configuration_denied");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: (input, init) => fetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(30_000) }),
  } });
}
export async function runCtbcWorkerOnce(env: Readonly<Record<string, string | undefined>> = process.env, signal?: AbortSignal) {
  if (env.CTBC_COLLECTOR_ENABLED !== "true") return { code: "disabled" };
  const config = readCtbcWorkerConfig(env); // before DB, OAuth or mail access
  return tickCtbcWorker({ client: serviceClient(env), config, signal, gmail: attemptSignal => createCtbcGmailClient(env, attemptSignal) });
}
export async function runCtbcRetentionOnce(env: Readonly<Record<string, string | undefined>> = process.env) {
  // Independent of collector/provenance/account, so stopping collection does
  // not stop cleanup. Read-only counts by default; applying needs its own flag.
  if (env.CTBC_RETENTION_ENABLED !== "true") return { code: "disabled" };
  return await rpc(serviceClient(env), "ctbc_retain", { p_dry_run: env.CTBC_RETENTION_APPLY !== "true", p_limit: 200 }) ?? { code: "retention_unknown" };
}
