import type { SupabaseClient } from "@supabase/supabase-js";

import type { Transaction } from "@/lib/types";
import { listMonthIds, shiftMonth } from "@/lib/utils";

// 建議預算看「目標月份之前」最近幾個完整月份的實際花費。
export const SUGGESTION_MONTHS = 3;
// 至少要有這麼多個月有花費才給建議；只出現一次的大筆支出（例如機票）不適合拿來當每月預算。
const MIN_ACTIVE_MONTHS = 2;

export type BudgetSuggestion = {
  suggested: number;
  average: number;
  max: number;
  activeMonths: number;
  months: number;
};

/** 無條件進位成好記的數字：2,000 以下進位到百位，以上進位到 500。 */
export function roundUpBudget(value: number): number {
  if (value <= 0) return 0;
  const step = value < 2000 ? 100 : 500;
  return Math.ceil(value / step) * step;
}

export function computeBudgetSuggestions(
  transactions: Pick<Transaction, "date" | "category_id" | "amount">[],
  targetMonthId: string,
  months: number = SUGGESTION_MONTHS,
): Record<string, BudgetSuggestion> {
  const monthIds = listMonthIds(shiftMonth(targetMonthId, -months), shiftMonth(targetMonthId, -1));
  const spentByCategory = new Map<string, Map<string, number>>();

  for (const transaction of transactions) {
    const monthId = transaction.date.slice(0, 7);
    if (!monthIds.includes(monthId)) continue;

    const byMonth = spentByCategory.get(transaction.category_id) ?? new Map<string, number>();
    byMonth.set(monthId, (byMonth.get(monthId) ?? 0) + transaction.amount);
    spentByCategory.set(transaction.category_id, byMonth);
  }

  const suggestions: Record<string, BudgetSuggestion> = {};

  for (const [categoryId, byMonth] of spentByCategory) {
    const amounts = monthIds.map((monthId) => byMonth.get(monthId) ?? 0);
    const activeMonths = amounts.filter((amount) => amount > 0).length;
    if (activeMonths < MIN_ACTIVE_MONTHS) continue;

    const average = Math.round(amounts.reduce((sum, amount) => sum + amount, 0) / months);
    suggestions[categoryId] = {
      suggested: roundUpBudget(average),
      average,
      max: Math.max(...amounts),
      activeMonths,
      months,
    };
  }

  return suggestions;
}

export function describeBudgetSuggestion(suggestion: BudgetSuggestion): string {
  return `近 ${suggestion.months} 個月平均花 $${suggestion.average.toLocaleString("en-US")}，最高 $${suggestion.max.toLocaleString("en-US")}`;
}

export async function fetchBudgetSuggestions(
  supabase: SupabaseClient,
  targetMonthId: string,
  months: number = SUGGESTION_MONTHS,
): Promise<Record<string, BudgetSuggestion>> {
  const transactions: Pick<Transaction, "date" | "category_id" | "amount">[] = [];
  const pageSize = 1000;

  // Supabase 一次最多回 1000 筆，分頁讀完才不會漏算。
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("transactions")
      .select("date,category_id,amount")
      .gte("date", `${shiftMonth(targetMonthId, -months)}-01`)
      .lt("date", `${targetMonthId}-01`)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    transactions.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  return computeBudgetSuggestions(transactions, targetMonthId, months);
}
