import type { CtbcCandidate } from "./ctbcInbox";

export type CtbcAutoRule = {
  id: string;
  pattern: string;
  /** import：補記到 category_id；work：標為工作支出、不記入個人帳本 */
  action: "import" | "work";
  category_id: string | null;
  max_amount: number | null;
  enabled: boolean;
};

/** excluded = true 代表這筆被標為工作支出，沒有記進個人帳本。 */
export type CtbcAutoImported = { merchant: string; amount: number; categoryName: string; excluded?: boolean };
export type CtbcAutoResult = { imported: CtbcAutoImported[] };

/** 一次最多自動補記幾筆；剩下的下次開 App 再處理。 */
export const CTBC_AUTO_LIMIT = 40;

/**
 * 銀行通知的商店名稱常混用全形字（例如「５５６８８ＡＰＰ」），
 * 比對前先轉成半形、小寫，並拿掉空白。
 */
export function normalizeMerchant(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

/**
 * 找出這筆刷卡適用的規則。
 * - 商店名稱包含規則文字就算符合；多條符合時取文字最長（最具體）的那條。
 * - 最具體的那條如果停用、或金額超過上限，就「不自動記」，不會退而求其次用比較籠統的規則。
 */
export function matchAutoRule(
  rules: CtbcAutoRule[],
  merchant: string | null,
  amount: number | null,
): CtbcAutoRule | null {
  if (!merchant || amount === null) return null;
  const name = normalizeMerchant(merchant);

  let best: CtbcAutoRule | null = null;
  let bestLength = 0;
  for (const rule of rules) {
    const pattern = normalizeMerchant(rule.pattern);
    if (pattern.length < 2 || !name.includes(pattern)) continue;
    if (pattern.length > bestLength || (pattern.length === bestLength && best && rule.id < best.id)) {
      best = rule;
      bestLength = pattern.length;
    }
  }

  if (!best || !best.enabled) return null;
  if (best.max_amount !== null && amount > best.max_amount) return null;
  return best;
}

/**
 * 哪些待確認的刷卡可以自動補記。
 * 只處理「乾淨」的：還在待確認、沒有任何警示（可能重複、商家未明、批次異常…）、
 * 有金額、有商店名稱、有建議的支付方式。其餘一律留給使用者自己確認。
 */
export function pickAutoImports(
  candidates: CtbcCandidate[],
  rules: CtbcAutoRule[],
): Array<{ candidate: CtbcCandidate; rule: CtbcAutoRule }> {
  const picked: Array<{ candidate: CtbcCandidate; rule: CtbcAutoRule }> = [];
  for (const candidate of candidates) {
    if (candidate.status !== "needs_review" || candidate.warnings.length > 0) continue;
    if (!candidate.occurred_at || !candidate.suggested_payment_id) continue;
    const rule = matchAutoRule(rules, candidate.merchant, candidate.amount);
    if (rule) picked.push({ candidate, rule });
    if (picked.length >= CTBC_AUTO_LIMIT) break;
  }
  return picked;
}
