export type CtbcCandidate = {
  id: string; batch_id: string; occurred_at: string | null; amount: number | null; merchant: string | null;
  product: string | null; card_role: string | null; bank_category: string | null; suggested_payment_id: string | null;
  warnings: string[]; late: boolean; status: "needs_review" | "conflict" | "imported" | "already_recorded" | "ignored" | "work_excluded" | "expired";
  version: number; created_at: string; closed_at: string | null; imported_transaction_id: string | null; linked_transaction_id: string | null;
};
export type CtbcAction = "import" | "link" | "ignore" | "defer" | "work";
export type CtbcCommand = { candidateId: string; expectedVersion: number; action: CtbcAction; actionKey: string;
  categoryId?: string | null; paymentId?: string | null; linkedId?: string | null; resolveRisk?: boolean; batch?: boolean };
export type CtbcCategory = { id: string; name: string; groupName: string };
export type CtbcExisting = { id: string; date: string; amount: number; note: string; payment_method_id: string; category_id: string | null };
export type CtbcInboxData = { candidates: CtbcCandidate[]; pendingCount: number; categories: CtbcCategory[];
  payments: { id: string; name: string }[]; existing: CtbcExisting[];
  latestRun: null | { status: string; slot_date: string; failures: number; rejected: number; outside_window: number; deferred: number; last_attempt_at: string | null; last_success_at: string | null } };
export const ctbcFeedback: Record<CtbcAction, string> = {
  import: "已補記，尚未與月結帳單核對", link: "已連結既有交易", ignore: "已忽略，不會補記", defer: "保留待處理，期限不延長", work: "已排除，不列入個人帳本",
};
export const ctbcWarnings: Record<string, string> = {
  merchant_unknown: "商家未明", payment_unknown: "支付來源待確認", partial_batch: "所屬批次部分失敗", possible_duplicate: "可能已記過",
  cross_message_duplicate: "不同通知可能重複", amount_mismatch: "金額需核對", source_payload_conflict: "來源內容衝突，暫不能補記",
};

const taipeiDateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" });
/** 刷卡時間換成台北日期（YYYY-MM-DD），用來跟帳本的日期比對。 */
export function ctbcTaipeiDate(occurredAt: string): string {
  return taipeiDateFormat.format(new Date(occurredAt));
}

export const ctbcIsPending = (c: CtbcCandidate) => c.status === "needs_review" || c.status === "conflict";

export type CtbcMatches = {
  /** 同一天、同金額：視為已經記過 */
  recorded: Map<string, CtbcExisting>;
  /** 前後一天、同金額：只提醒，不自動視為同一筆 */
  nearby: Map<string, CtbcExisting>;
};

/**
 * 判斷哪些待確認的刷卡「看起來已經記過」。
 * 規則：帳本裡同一天有一模一樣金額的交易，就視為同一筆。
 * 一筆帳本交易只會配給一筆刷卡；已經被其他刷卡補記或連結過的交易不再拿來配對，
 * 所以同一天刷兩次同金額、只記了一次時，只有一筆會被視為已記過。
 */
export function ctbcMatchRecorded(candidates: CtbcCandidate[], existing: CtbcExisting[]): CtbcMatches {
  const used = new Set<string>();
  for (const c of candidates) {
    if (c.imported_transaction_id) used.add(c.imported_transaction_id);
    if (c.linked_transaction_id) used.add(c.linked_transaction_id);
  }
  const pending = candidates
    .filter((c) => ctbcIsPending(c) && c.occurred_at !== null && c.amount !== null)
    .sort((a, b) => (a.occurred_at! < b.occurred_at! ? -1 : a.occurred_at! > b.occurred_at! ? 1 : a.id.localeCompare(b.id)));
  const recorded = new Map<string, CtbcExisting>();
  const nearby = new Map<string, CtbcExisting>();
  for (const c of pending) {
    const date = ctbcTaipeiDate(c.occurred_at!);
    const hit = existing.find((t) => !used.has(t.id) && t.date === date && t.amount === c.amount);
    if (hit) { recorded.set(c.id, hit); used.add(hit.id); }
  }
  for (const c of pending) {
    if (recorded.has(c.id)) continue;
    const day = Date.parse(ctbcTaipeiDate(c.occurred_at!));
    const hit = existing.find((t) => !used.has(t.id) && t.amount === c.amount && Math.abs(Date.parse(t.date) - day) === 86_400_000);
    if (hit) { nearby.set(c.id, hit); used.add(hit.id); }
  }
  return { recorded, nearby };
}

/** 最近最常用的分類排前面（用最近的帳本交易計算），不足時照原本順序補滿。 */
export function ctbcTopCategories(categories: CtbcCategory[], existing: CtbcExisting[], size: number): CtbcCategory[] {
  const count = new Map<string, number>();
  for (const t of existing) if (t.category_id) count.set(t.category_id, (count.get(t.category_id) ?? 0) + 1);
  const picked = categories
    .map((category, index) => ({ category, index, used: count.get(category.id) ?? 0 }))
    .sort((a, b) => b.used - a.used || a.index - b.index)
    .slice(0, size);
  // 顯示時照原本（大項 → 分類）順序，位置才固定
  return picked.sort((a, b) => a.index - b.index).map((p) => p.category);
}
