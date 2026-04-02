"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import type {
  Budget,
  BudgetRow,
  Category,
  MonthlyIncome,
  Transaction,
  TransactionWithCategory,
} from "@/lib/types";
import { monthDateRange } from "@/lib/utils";

type DashboardData = {
  user: User;
  categories: Category[];
  income: MonthlyIncome | null;
  budgetRows: BudgetRow[];
  recentTransactions: TransactionWithCategory[];
  quickCategories: Category[];
  unallocated: number;
};

export async function requireSession(supabase: SupabaseClient) {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  if (!session?.user) {
    throw new Error("AUTH_REQUIRED");
  }

  return session.user;
}

export async function bootstrapAndInitializeMonth(
  supabase: SupabaseClient,
  monthId: string,
) {
  const { error } = await supabase.rpc("initialize_monthly_budget", {
    p_month_id: monthId,
  });

  if (error) {
    throw error;
  }
}

export async function fetchDashboardData(
  supabase: SupabaseClient,
  monthId: string,
): Promise<DashboardData> {
  const user = await requireSession(supabase);
  await bootstrapAndInitializeMonth(supabase, monthId);

  const { start, end } = monthDateRange(monthId);

  const [categoriesResult, incomeResult, budgetsResult, transactionsResult] =
    await Promise.all([
      supabase
        .from("categories")
        .select("*")
        .order("sort_order", { ascending: true }),
      supabase
        .from("monthly_incomes")
        .select("*")
        .eq("month_id", monthId)
        .maybeSingle(),
      supabase.from("budgets").select("*").eq("month_id", monthId),
      supabase
        .from("transactions")
        .select("*")
        .gte("date", start)
        .lt("date", end)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  if (categoriesResult.error) {
    throw categoriesResult.error;
  }
  if (incomeResult.error) {
    throw incomeResult.error;
  }
  if (budgetsResult.error) {
    throw budgetsResult.error;
  }
  if (transactionsResult.error) {
    throw transactionsResult.error;
  }

  const categories = (categoriesResult.data ?? []) as Category[];
  const budgets = (budgetsResult.data ?? []) as Budget[];
  const transactions = (transactionsResult.data ?? []) as Transaction[];
  const quickCategories = categories.filter((category) => category.is_quick).slice(0, 10);

  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const spentByCategory = transactions.reduce<Record<string, number>>((accumulator, entry) => {
    accumulator[entry.category_id] = (accumulator[entry.category_id] ?? 0) + entry.amount;
    return accumulator;
  }, {});

  const budgetRows = budgets
    .map((budget) => {
      const category = categoryMap.get(budget.category_id);

      if (!category) {
        return null;
      }

      const spent = spentByCategory[budget.category_id] ?? 0;
      const remaining = budget.allocated - spent;

      return {
        budgetId: budget.id,
        categoryId: budget.category_id,
        categoryName: category.name,
        allocated: budget.allocated,
        spent,
        remaining,
        isQuick: category.is_quick,
        isAuto: category.is_auto,
        warning:
          budget.allocated === 0 && spent > 0 ? "尚未編列預算" : null,
      } satisfies BudgetRow;
    })
    .filter((row): row is BudgetRow => row !== null)
    .sort((left, right) => {
      const leftOrder = categoryMap.get(left.categoryId)?.sort_order ?? 0;
      const rightOrder = categoryMap.get(right.categoryId)?.sort_order ?? 0;
      return leftOrder - rightOrder;
    });

  const recentTransactions = transactions.slice(0, 10).map((entry) => ({
    ...entry,
    categoryName: categoryMap.get(entry.category_id)?.name ?? "未分類",
  }));

  const allocatedTotal = budgetRows.reduce(
    (sum, row) => sum + row.allocated,
    0,
  );
  const income = (incomeResult.data as MonthlyIncome | null) ?? null;

  return {
    user,
    categories,
    income,
    budgetRows,
    recentTransactions,
    quickCategories,
    unallocated: (income?.amount ?? 0) - allocatedTotal,
  };
}

export async function fetchQuickCategories(supabase: SupabaseClient) {
  await requireSession(supabase);

  const { error: bootstrapError } = await supabase.rpc(
    "bootstrap_default_categories",
  );

  if (bootstrapError) {
    throw bootstrapError;
  }

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("is_quick", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as Category[];
}
