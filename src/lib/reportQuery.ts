import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportCollections } from "@/lib/reportData";
import { getReportRangeBounds } from "@/lib/reportData";
import { listMonthIds } from "@/lib/utils";

type Page = { data: unknown[] | null; error: unknown; count: number | null };

// Advance by the actual page size: a project's API cap may be below 1,000.
// Fail closed if a page fails or the result changes while it is being read.
async function readAll<T extends { id: string }>(query: (from: number, to: number) => PromiseLike<Page>): Promise<T[]> {
  const rows: T[] = [];
  const ids = new Set<string>();
  let total: number | undefined;
  do {
    const result = await query(rows.length, rows.length + 999);
    if (result.error) throw result.error;
    if (result.count === null || (total !== undefined && total !== result.count)) {
      throw new Error("報表資料已變動，請重新載入。");
    }
    total = result.count;
    const page = (result.data ?? []) as T[];
    if ((!page.length && rows.length < total) || rows.length + page.length > total) {
      throw new Error("報表資料不完整，請重新載入。");
    }
    for (const row of page) {
      if (ids.has(row.id)) throw new Error("報表資料已變動，請重新載入。");
      ids.add(row.id);
      rows.push(row);
    }
  } while (rows.length < total);
  return rows;
}

/** Browser session + RLS, explicit tenant scope, SELECT only, on every table/page. */
export async function fetchReportCollections(
  supabase: SupabaseClient, userId: string, startMonthId: string, endMonthId: string,
): Promise<ReportCollections> {
  const monthIds = listMonthIds(startMonthId, endMonthId);
  const { start, end } = getReportRangeBounds(startMonthId, endMonthId);
  const base = (table: string) => supabase.from(table).select("*", { count: "exact" }).eq("user_id", userId);
  const [groups, categories, paymentMethods, incomes, budgets, transactions] = await Promise.all([
    readAll<ReportCollections["groups"][number]>((from, to) => base("category_groups").order("sort_order").order("id").range(from, to)),
    readAll<ReportCollections["categories"][number]>((from, to) => base("categories").order("sort_order").order("id").range(from, to)),
    readAll<ReportCollections["paymentMethods"][number]>((from, to) => base("payment_methods").order("sort_order").order("id").range(from, to)),
    readAll<ReportCollections["incomes"][number]>((from, to) => base("monthly_incomes").in("month_id", monthIds).order("id").range(from, to)),
    readAll<ReportCollections["budgets"][number]>((from, to) => base("budgets").in("month_id", monthIds).order("id").range(from, to)),
    readAll<ReportCollections["transactions"][number]>((from, to) => base("transactions").gte("date", start).lt("date", end)
      .order("date", { ascending: false }).order("created_at", { ascending: false }).order("id").range(from, to)),
  ]);
  return { groups, categories, paymentMethods, incomes, budgets, transactions };
}
