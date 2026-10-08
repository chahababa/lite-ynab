export type CtbcCandidate = {
  id: string; batch_id: string; occurred_at: string | null; amount: number | null; merchant: string | null;
  product: string | null; card_role: string | null; bank_category: string | null; suggested_payment_id: string | null;
  warnings: string[]; late: boolean; status: "needs_review" | "conflict" | "imported" | "already_recorded" | "ignored" | "work_excluded" | "expired";
  version: number; created_at: string; closed_at: string | null; imported_transaction_id: string | null; linked_transaction_id: string | null;
};
export type CtbcAction = "import" | "link" | "ignore" | "defer" | "work";
export type CtbcCommand = { candidateId: string; expectedVersion: number; action: CtbcAction; actionKey: string;
  categoryId?: string | null; paymentId?: string | null; linkedId?: string | null; resolveRisk?: boolean; batch?: boolean };
export type CtbcInboxData = { candidates: CtbcCandidate[]; pendingCount: number; categories: { id: string; name: string }[];
  payments: { id: string; name: string }[]; existing: { id: string; date: string; amount: number; note: string; payment_method_id: string }[];
  latestRun: null | { status: string; slot_date: string; failures: number; rejected: number; outside_window: number; deferred: number; last_attempt_at: string | null; last_success_at: string | null } };
export const ctbcFeedback: Record<CtbcAction, string> = {
  import: "已補記，尚未與月結帳單核對", link: "已連結既有交易", ignore: "已忽略，不會補記", defer: "保留待處理，期限不延長", work: "已排除，不列入個人帳本",
};
export const ctbcWarnings: Record<string, string> = {
  merchant_unknown: "商家未明", payment_unknown: "支付來源待確認", partial_batch: "所屬批次部分失敗", possible_duplicate: "可能已記過",
  cross_message_duplicate: "不同通知可能重複", amount_mismatch: "金額需核對", source_payload_conflict: "來源內容衝突，暫不能補記",
};
