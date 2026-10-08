// Server-only parsing/sanitizing boundary. No Gmail client or scheduler.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCtbcEmail, type CtbcEmailInput } from "./ctbcEmailParser";

const DAY = 86_400_000;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
export function ctbcSlot(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("invalid_slot");
  const midnight = Date.parse(`${date}T00:00:00+08:00`);
  return { start: midnight - 4 * DAY, end: midnight + 17 * 3_600_000, stop: midnight + DAY,
    cohorts: [3, 2, 1].map((n) => new Date(midnight - n * DAY + 8 * 3_600_000).toISOString().slice(0, 10)),
    query: `after:${midnight / 1000 - 4 * DAY / 1000 - 1} before:${midnight / 1000 + 17 * 3600 + 1}` };
}
export type CtbcSyntheticEnvelope = { synthetic: true; internalDate: number; trustedHeader: boolean; input: CtbcEmailInput };
export function prepareCtbcSyntheticBatch(date: string, messages: CtbcSyntheticEnvelope[], target: string, complete: boolean) {
  if (!/^\d{4}$/.test(target) || messages.length > 100) throw new Error("invalid_input");
  const window = ctbcSlot(date);
  let failures = complete ? 0 : 1;
  let rejected = 0;
  let accepted = 0;
  const rows: Array<{ source_id: string; payload_hash: string; received_at: string; occurred_at: string; amount: number; merchant: string | null; product: string | null; card_role: string; bank_category: string | null; warnings: string[] }> = [];
  const clean = (value: string | null) => value?.replace(/[^\p{L}\p{N} .\-/]/gu, " ").replace(/\b\d{4,}\b/g, " ").replaceAll(target, " ").replace(/\s+/g, " ").trim().slice(0, 100) || null;
  for (const message of messages) {
    if (message.synthetic !== true || !Number.isFinite(message.internalDate) || !message.trustedHeader) { rejected++; continue; }
    if (message.internalDate < window.start || message.internalDate >= window.end) continue;
    const parsed = parseCtbcEmail(message.input, { preserveRows: true });
    if (!parsed.accepted) { rejected++; continue; }
    accepted++;
    failures += parsed.errors.length;
    const selected = parsed.candidates.filter((c) => c.cardLast4 === target);
    if (new Set(selected.map((c) => c.sourceId)).size !== selected.length) { failures++; continue; }
    for (const c of selected) {
      const source_id = `ctbc:v1:${sha(parsed.messageId)}:${sha(c.sourceId)}`;
      const detail = { occurred_at: c.occurredAt, amount: c.amountTwd, merchant: clean(c.merchantNormalized), product: clean(c.cardProductName), card_role: c.cardRole, bank_category: clean(c.bankCategoryRaw) };
      rows.push({ source_id, payload_hash: sha(JSON.stringify([source_id, detail])), received_at: new Date(message.internalDate).toISOString(), ...detail, warnings: [] });
    }
  }
  if (failures || rejected) for (const row of rows) row.warnings.push("partial_batch");
  if (rows.length > 200) throw new Error("batch_too_large");
  return { rows, counts: { failures, rejected, messages: accepted } };
}

// Deliberately synthetic-only until separate trusted Gmail provenance/selector
// activation. Fixed owner comes from the disabled-by-default DB scope, never input.
export async function collectCtbcSynthetic(client: SupabaseClient, scope: string, date: string,
  messages: CtbcSyntheticEnvelope[], target: string, complete = true) {
  const prepared = prepareCtbcSyntheticBatch(date, messages, target, complete);
  const begun = await client.rpc("ctbc_begin", { p_scope: scope, p_date: date });
  if (begun.error) throw new Error("collector_begin_failed");
  if (begun.data.code !== "started") return { status: begun.data.code };
  const result = await client.rpc("ctbc_ingest", { p_scope: scope, p_batch: begun.data.batchId, p_fence: begun.data.fence,
    p_rows: prepared.rows, p_counts: prepared.counts, p_complete: complete });
  if (result.error) throw new Error("collector_ingest_failed");
  return result.data;
}
