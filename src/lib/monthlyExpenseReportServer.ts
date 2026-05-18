import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { buildMonthlyExpenseReport, getPreviousMonthIdInTaipei, type MonthlyExpenseReport } from "./monthlyExpenseReport";
import { computeReportData, getReportRangeBounds } from "./data";
import type { Budget, Category, CategoryGroup, MonthlyIncome, PaymentMethod, Transaction } from "./types";
import { listMonthIds, shiftMonth } from "./utils";

export function createMonthlyReportServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function fetchMonthlyExpenseReport(
  supabase: SupabaseClient = createMonthlyReportServiceClient(),
  monthId: string = getPreviousMonthIdInTaipei(),
): Promise<MonthlyExpenseReport> {
  const previousMonthId = shiftMonth(monthId, -1);
  const [collections, previousTransactions] = await Promise.all([
    fetchMonthlyReportCollections(supabase, monthId),
    fetchTransactionsForMonth(supabase, previousMonthId),
  ]);

  const reportData = computeReportData(collections, previousTransactions, {
    mode: "month",
    startMonthId: monthId,
    endMonthId: monthId,
    monthCount: 1,
    previousStartMonthId: previousMonthId,
    previousEndMonthId: previousMonthId,
  });

  return buildMonthlyExpenseReport(reportData);
}

async function fetchMonthlyReportCollections(supabase: SupabaseClient, monthId: string) {
  const monthIds = listMonthIds(monthId, monthId);
  const { start, end } = getReportRangeBounds(monthId, monthId);
  const userId = process.env.LITEYNAB_USER_ID;

  const groupsQuery = maybeFilterByUser(supabase.from("category_groups").select("*").order("sort_order"), userId);
  const categoriesQuery = maybeFilterByUser(supabase.from("categories").select("*").order("sort_order"), userId);
  const paymentMethodsQuery = maybeFilterByUser(supabase.from("payment_methods").select("*").order("sort_order"), userId);
  const incomesQuery = maybeFilterByUser(supabase.from("monthly_incomes").select("*").in("month_id", monthIds), userId);
  const budgetsQuery = maybeFilterByUser(supabase.from("budgets").select("*").in("month_id", monthIds), userId);
  const transactionsQuery = maybeFilterByUser(
    supabase
      .from("transactions")
      .select("*")
      .gte("date", start)
      .lt("date", end)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    userId,
  );

  const [groupsResult, categoriesResult, paymentMethodsResult, incomesResult, budgetsResult, transactionsResult] =
    await Promise.all([groupsQuery, categoriesQuery, paymentMethodsQuery, incomesQuery, budgetsQuery, transactionsQuery]);

  throwIfSupabaseError(groupsResult.error);
  throwIfSupabaseError(categoriesResult.error);
  throwIfSupabaseError(paymentMethodsResult.error);
  throwIfSupabaseError(incomesResult.error);
  throwIfSupabaseError(budgetsResult.error);
  throwIfSupabaseError(transactionsResult.error);

  return {
    groups: (groupsResult.data ?? []) as CategoryGroup[],
    categories: (categoriesResult.data ?? []) as Category[],
    paymentMethods: (paymentMethodsResult.data ?? []) as PaymentMethod[],
    incomes: (incomesResult.data ?? []) as MonthlyIncome[],
    budgets: (budgetsResult.data ?? []) as Budget[],
    transactions: (transactionsResult.data ?? []) as Transaction[],
  };
}

async function fetchTransactionsForMonth(supabase: SupabaseClient, monthId: string) {
  const { start, end } = getReportRangeBounds(monthId, monthId);
  const userId = process.env.LITEYNAB_USER_ID;
  const query = maybeFilterByUser(
    supabase
      .from("transactions")
      .select("*")
      .gte("date", start)
      .lt("date", end)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    userId,
  );
  const result = await query;

  throwIfSupabaseError(result.error);
  return (result.data ?? []) as Transaction[];
}

function maybeFilterByUser<T extends { eq: (column: string, value: string) => T }>(query: T, userId?: string): T {
  return userId ? query.eq("user_id", userId) : query;
}

function throwIfSupabaseError(error: unknown) {
  if (error) {
    throw error;
  }
}
