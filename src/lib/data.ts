"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import type {
  Budget,
  BudgetUsageData,
  BudgetUsageGroup,
  BudgetUsageItem,
  BudgetUsageScope,
  BudgetRow,
  Category,
  CategoryGroup,
  CategoryOption,
  MonthlyIncome,
  PaymentMethod,
  PaymentMethodOption,
  PaymentMethodReportItem,
  ReportBreakdownItem,
  ReportData,
  ReportGroupDetail,
  ReportPeriod,
  ReportTrendPoint,
  SettingsCategoryItem,
  SettingsOverview,
  Transaction,
  TransactionWithCategory,
} from "@/lib/types";
import { formatMonthLabel, getTodayInTaipei, listMonthIds, monthDateRange, shiftMonth } from "@/lib/utils";
import { computeReportData, createTransactionViews, getReportRangeBounds } from "@/lib/reportData";
export { computeReportData, getReportRangeBounds } from "@/lib/reportData";
import type { ReportCollections } from "@/lib/reportData";

type DashboardCollections = {
  groups: CategoryGroup[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  budgets: Budget[];
  transactions: Transaction[];
  income: MonthlyIncome | null;
  carryoverByCategory?: Map<string, number>;
};

type DashboardComputedData = {
  groups: CategoryGroup[];
  categoryOptions: CategoryOption[];
  paymentMethods: PaymentMethodOption[];
  income: MonthlyIncome | null;
  budgetRows: BudgetRow[];
  recentTransactions: TransactionWithCategory[];
  quickCategories: CategoryOption[];
  unallocated: number;
};

export type DashboardData = DashboardComputedData & {
  user: User;
};

export type BudgetAllocationData = DashboardComputedData & {
  user: User;
};

export type ReportsPageData = ReportData & {
  user: User;
};

export type TransactionsPageData = {
  user: User;
  categories: CategoryOption[];
  paymentMethods: PaymentMethodOption[];
  transactions: TransactionWithCategory[];
};

export type SettingsPageData = {
  user: User;
  overview: SettingsOverview;
  categories: SettingsCategoryItem[];
  paymentMethods: PaymentMethodOption[];
};

export type BudgetUsagePageData = BudgetUsageData & {
  user: User;
};

export type BudgetReferenceItem = {
  categoryId: string;
  allocated: number;
  spent: number;
};

const LEGACY_CATEGORY_NAME_MAP = {
  Food: "飲食",
  Coffee: "咖啡",
  Transport: "交通",
  "Daily Needs": "日常用品",
  "Fun Money": "娛樂",
  Health: "健康",
  Rent: "房租",
  Travel: "旅行",
  Subscriptions: "訂閱",
  "Emergency Fund": "緊急預備金",
} as const;

const legacyCategoryNormalizationTasks = new Map<string, Promise<void>>();

// 預算結轉的起算月份。這個月之前的歷史資料（YNAB 匯入）分配不完整，
// 拿來累積結轉會失真，所以結轉一律從這個月開始往後算。
export const ROLLOVER_START_MONTH = "2026-07";

// 逐月累積「分配 - 支出」作為結轉；超支的月份歸零重新起算，不把負數帶到下個月。
export function computeCarryoverByCategory(
  budgets: Pick<Budget, "month_id" | "category_id" | "allocated">[],
  transactions: Pick<Transaction, "date" | "category_id" | "amount">[],
  targetMonthId: string,
  startMonthId: string = ROLLOVER_START_MONTH,
): Map<string, number> {
  if (targetMonthId <= startMonthId) {
    return new Map();
  }

  const monthIds = listMonthIds(startMonthId, shiftMonth(targetMonthId, -1));
  const allocatedByMonthCategory = new Map<string, number>();
  const spentByMonthCategory = new Map<string, number>();
  const categoryIds = new Set<string>();

  for (const budget of budgets) {
    if (budget.month_id < startMonthId || budget.month_id >= targetMonthId) {
      continue;
    }

    const key = `${budget.month_id}:${budget.category_id}`;
    allocatedByMonthCategory.set(key, (allocatedByMonthCategory.get(key) ?? 0) + budget.allocated);
    categoryIds.add(budget.category_id);
  }

  for (const transaction of transactions) {
    const monthId = transaction.date.slice(0, 7);

    if (monthId < startMonthId || monthId >= targetMonthId) {
      continue;
    }

    const key = `${monthId}:${transaction.category_id}`;
    spentByMonthCategory.set(key, (spentByMonthCategory.get(key) ?? 0) + transaction.amount);
    categoryIds.add(transaction.category_id);
  }

  const carryoverByCategory = new Map<string, number>();

  for (const categoryId of categoryIds) {
    let balance = 0;

    for (const monthId of monthIds) {
      const key = `${monthId}:${categoryId}`;
      balance += (allocatedByMonthCategory.get(key) ?? 0) - (spentByMonthCategory.get(key) ?? 0);
      balance = Math.max(balance, 0);
    }

    if (balance > 0) {
      carryoverByCategory.set(categoryId, balance);
    }
  }

  return carryoverByCategory;
}

export async function fetchCarryoverByCategory(
  supabase: SupabaseClient,
  monthId: string,
): Promise<Map<string, number>> {
  if (monthId <= ROLLOVER_START_MONTH) {
    return new Map();
  }

  const { start: rangeStart } = monthDateRange(ROLLOVER_START_MONTH);
  const { start: rangeEnd } = monthDateRange(monthId);

  const [budgetsResult, transactionsResult] = await Promise.all([
    supabase
      .from("budgets")
      .select("month_id,category_id,allocated")
      .gte("month_id", ROLLOVER_START_MONTH)
      .lt("month_id", monthId),
    supabase
      .from("transactions")
      .select("date,category_id,amount")
      .gte("date", rangeStart)
      .lt("date", rangeEnd),
  ]);

  if (budgetsResult.error) {
    throw budgetsResult.error;
  }
  if (transactionsResult.error) {
    throw transactionsResult.error;
  }

  return computeCarryoverByCategory(
    (budgetsResult.data ?? []) as Pick<Budget, "month_id" | "category_id" | "allocated">[],
    (transactionsResult.data ?? []) as Pick<Transaction, "date" | "category_id" | "amount">[],
    monthId,
  );
}

function getLegacyCategoryTargetName(name: string) {
  return LEGACY_CATEGORY_NAME_MAP[name as keyof typeof LEGACY_CATEGORY_NAME_MAP] ?? null;
}

async function normalizeLegacyDuplicateCategories(
  supabase: SupabaseClient,
  userId: string,
) {
  const categoriesResult = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (categoriesResult.error) {
    throw categoriesResult.error;
  }

  const categories = (categoriesResult.data ?? []) as Category[];
  const legacyCategories = categories.filter((category) => getLegacyCategoryTargetName(category.name));

  if (legacyCategories.length === 0) {
    return;
  }

  const categoryMap = new Map<string, Category>(
    categories.map((category) => [`${category.category_group_id}:${category.name}`, category] as const),
  );

  for (const sourceCategory of legacyCategories) {
    const targetName = getLegacyCategoryTargetName(sourceCategory.name);

    if (!targetName) {
      continue;
    }

    const targetKey = `${sourceCategory.category_group_id}:${targetName}`;
    let targetCategory = categoryMap.get(targetKey);

    if (!targetCategory) {
      const insertCategoryResult = await supabase
        .from("categories")
        .insert({
          user_id: userId,
          category_group_id: sourceCategory.category_group_id,
          name: targetName,
          is_auto: sourceCategory.is_auto,
          auto_amount: sourceCategory.auto_amount,
          is_quick: sourceCategory.is_quick,
          sort_order: sourceCategory.sort_order,
        })
        .select("*")
        .single();

      if (insertCategoryResult.error) {
        throw insertCategoryResult.error;
      }

      targetCategory = insertCategoryResult.data as Category;
      categoryMap.set(targetKey, targetCategory);
    }

    if (targetCategory.id === sourceCategory.id) {
      continue;
    }

    const mergedCategoryValues = {
      is_quick: targetCategory.is_quick || sourceCategory.is_quick,
      is_auto: targetCategory.is_auto || sourceCategory.is_auto,
      auto_amount: Math.max(targetCategory.auto_amount, sourceCategory.auto_amount),
      sort_order: Math.min(targetCategory.sort_order, sourceCategory.sort_order),
    };

    if (
      mergedCategoryValues.is_quick !== targetCategory.is_quick ||
      mergedCategoryValues.is_auto !== targetCategory.is_auto ||
      mergedCategoryValues.auto_amount !== targetCategory.auto_amount ||
      mergedCategoryValues.sort_order !== targetCategory.sort_order
    ) {
      const updateCategoryResult = await supabase
        .from("categories")
        .update(mergedCategoryValues)
        .eq("id", targetCategory.id);

      if (updateCategoryResult.error) {
        throw updateCategoryResult.error;
      }

      targetCategory = {
        ...targetCategory,
        is_quick: mergedCategoryValues.is_quick,
        is_auto: mergedCategoryValues.is_auto,
        auto_amount: mergedCategoryValues.auto_amount,
        sort_order: mergedCategoryValues.sort_order,
      };
      categoryMap.set(targetKey, targetCategory);
    }

    const budgetsResult = await supabase
      .from("budgets")
      .select("*")
      .in("category_id", [sourceCategory.id, targetCategory.id]);

    if (budgetsResult.error) {
      throw budgetsResult.error;
    }

    const budgets = (budgetsResult.data ?? []) as Budget[];
    const sourceBudgets = budgets.filter((budget) => budget.category_id === sourceCategory.id);
    const targetBudgetByMonth = new Map(
      budgets
        .filter((budget) => budget.category_id === targetCategory.id)
        .map((budget) => [budget.month_id, budget] as const),
    );

    for (const sourceBudget of sourceBudgets) {
      const existingTargetBudget = targetBudgetByMonth.get(sourceBudget.month_id);

      if (existingTargetBudget) {
        const updateBudgetResult = await supabase
          .from("budgets")
          .update({
            allocated: existingTargetBudget.allocated + sourceBudget.allocated,
          })
          .eq("id", existingTargetBudget.id);

        if (updateBudgetResult.error) {
          throw updateBudgetResult.error;
        }

        targetBudgetByMonth.set(sourceBudget.month_id, {
          ...existingTargetBudget,
          allocated: existingTargetBudget.allocated + sourceBudget.allocated,
        });
        continue;
      }

      const insertBudgetResult = await supabase.from("budgets").insert({
        user_id: userId,
        month_id: sourceBudget.month_id,
        category_id: targetCategory.id,
        allocated: sourceBudget.allocated,
      });

      if (insertBudgetResult.error) {
        throw insertBudgetResult.error;
      }
    }

    if (sourceBudgets.length > 0) {
      const deleteBudgetsResult = await supabase
        .from("budgets")
        .delete()
        .eq("category_id", sourceCategory.id);

      if (deleteBudgetsResult.error) {
        throw deleteBudgetsResult.error;
      }
    }

    const updateTransactionsResult = await supabase
      .from("transactions")
      .update({ category_id: targetCategory.id })
      .eq("category_id", sourceCategory.id);

    if (updateTransactionsResult.error) {
      throw updateTransactionsResult.error;
    }

    const deleteCategoryResult = await supabase.from("categories").delete().eq("id", sourceCategory.id);

    if (deleteCategoryResult.error) {
      throw deleteCategoryResult.error;
    }

    categoryMap.delete(`${sourceCategory.category_group_id}:${sourceCategory.name}`);
  }
}

async function ensureLegacyCategoryNormalization(
  supabase: SupabaseClient,
  userId: string,
) {
  const existingTask = legacyCategoryNormalizationTasks.get(userId);

  if (existingTask) {
    return existingTask;
  }

  const task = normalizeLegacyDuplicateCategories(supabase, userId).finally(() => {
    legacyCategoryNormalizationTasks.delete(userId);
  });

  legacyCategoryNormalizationTasks.set(userId, task);
  return task;
}

async function runLegacyCategoryNormalization(
  supabase: SupabaseClient,
  userId: string,
) {
  try {
    await ensureLegacyCategoryNormalization(supabase, userId);
  } catch (error) {
    console.error("Failed to normalize legacy duplicate categories", error);
  }
}

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

export async function bootstrapUserDefaults(supabase: SupabaseClient) {
  const categoryGroupsResult = await supabase.rpc("bootstrap_default_category_groups");
  if (categoryGroupsResult.error) {
    throw categoryGroupsResult.error;
  }

  const categoriesResult = await supabase.rpc("bootstrap_default_categories");
  if (categoriesResult.error) {
    throw categoriesResult.error;
  }

  const paymentMethodsResult = await supabase.rpc("bootstrap_default_payment_methods");
  if (paymentMethodsResult.error) {
    throw paymentMethodsResult.error;
  }
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

export async function bootstrapAndInitializeMonths(
  supabase: SupabaseClient,
  monthIds: string[],
) {
  for (const monthId of monthIds) {
    await bootstrapAndInitializeMonth(supabase, monthId);
  }
}

function createCategoryOptions(
  groups: CategoryGroup[],
  categories: Category[],
): CategoryOption[] {
  const groupMap = new Map(groups.map((group) => [group.id, group]));

  return categories
    .map((category) => {
      const group = groupMap.get(category.category_group_id);

      if (!group) {
        return null;
      }

      return {
        id: category.id,
        groupId: group.id,
        groupName: group.name,
        name: category.name,
        isQuick: category.is_quick,
        isAuto: category.is_auto,
        autoAmount: category.auto_amount,
        sortOrder: category.sort_order,
      } satisfies CategoryOption;
    })
    .filter((option): option is CategoryOption => option !== null)
    .sort((left, right) => {
      const leftGroupOrder = groupMap.get(left.groupId)?.sort_order ?? 0;
      const rightGroupOrder = groupMap.get(right.groupId)?.sort_order ?? 0;

      if (leftGroupOrder !== rightGroupOrder) {
        return leftGroupOrder - rightGroupOrder;
      }

      return left.sortOrder - right.sortOrder;
    });
}

function createPaymentMethodOptions(paymentMethods: PaymentMethod[]): PaymentMethodOption[] {
  return paymentMethods
    .map((method) => ({
      id: method.id,
      name: method.name,
      sortOrder: method.sort_order,
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export function computeDashboardData({
  groups,
  categories,
  paymentMethods,
  budgets,
  transactions,
  income,
  carryoverByCategory,
}: DashboardCollections): DashboardComputedData {
  const groupMap = new Map(groups.map((group) => [group.id, group]));
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const paymentMethodMap = new Map(paymentMethods.map((method) => [method.id, method]));
  const categoryOptions = createCategoryOptions(groups, categories);
  const paymentMethodOptions = createPaymentMethodOptions(paymentMethods);
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

      const group = groupMap.get(category.category_group_id);

      if (!group) {
        return null;
      }

      const spent = spentByCategory[budget.category_id] ?? 0;
      const carryover = carryoverByCategory?.get(budget.category_id) ?? 0;
      const available = budget.allocated + carryover;
      const remaining = available - spent;

      return {
        budgetId: budget.id,
        categoryId: budget.category_id,
        categoryGroupId: group.id,
        categoryGroupName: group.name,
        categoryName: category.name,
        allocated: budget.allocated,
        carryover,
        spent,
        remaining,
        isQuick: category.is_quick,
        isAuto: category.is_auto,
        autoAmount: category.auto_amount,
        warning: available === 0 && spent > 0 ? "尚未分配預算卻已有支出" : null,
      } satisfies BudgetRow;
    })
    .filter((row): row is BudgetRow => row !== null)
    .sort((left, right) => {
      const leftGroupOrder = groupMap.get(left.categoryGroupId)?.sort_order ?? 0;
      const rightGroupOrder = groupMap.get(right.categoryGroupId)?.sort_order ?? 0;

      if (leftGroupOrder !== rightGroupOrder) {
        return leftGroupOrder - rightGroupOrder;
      }

      const leftCategoryOrder = categoryMap.get(left.categoryId)?.sort_order ?? 0;
      const rightCategoryOrder = categoryMap.get(right.categoryId)?.sort_order ?? 0;
      return leftCategoryOrder - rightCategoryOrder;
    });

  const recentTransactions = createTransactionViews(
    groups,
    categories,
    paymentMethods,
    transactions,
    10,
  );

  const allocatedTotal = budgetRows.reduce((sum, row) => sum + row.allocated, 0);
  const quickCategories = categoryOptions.filter((category) => category.isQuick).slice(0, 10);

  return {
    groups,
    categoryOptions,
    paymentMethods: paymentMethodOptions,
    income,
    budgetRows,
    recentTransactions,
    quickCategories,
    unallocated: (income?.amount ?? 0) - allocatedTotal,
  };
}

async function fetchBaseCollections(supabase: SupabaseClient, monthId: string) {
  const { start, end } = monthDateRange(monthId);

  const [groupsResult, categoriesResult, paymentMethodsResult, incomeResult, budgetsResult, transactionsResult] =
    await Promise.all([
      supabase.from("category_groups").select("*").order("sort_order", { ascending: true }),
      supabase.from("categories").select("*").order("sort_order", { ascending: true }),
      supabase.from("payment_methods").select("*").order("sort_order", { ascending: true }),
      supabase.from("monthly_incomes").select("*").eq("month_id", monthId).maybeSingle(),
      supabase.from("budgets").select("*").eq("month_id", monthId),
      supabase
        .from("transactions")
        .select("*")
        .gte("date", start)
        .lt("date", end)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  if (groupsResult.error) {
    throw groupsResult.error;
  }
  if (categoriesResult.error) {
    throw categoriesResult.error;
  }
  if (paymentMethodsResult.error) {
    throw paymentMethodsResult.error;
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

  return {
    groups: (groupsResult.data ?? []) as CategoryGroup[],
    categories: (categoriesResult.data ?? []) as Category[],
    paymentMethods: (paymentMethodsResult.data ?? []) as PaymentMethod[],
    budgets: (budgetsResult.data ?? []) as Budget[],
    transactions: (transactionsResult.data ?? []) as Transaction[],
    income: (incomeResult.data as MonthlyIncome | null) ?? null,
  };
}

async function fetchTransactionsForMonth(supabase: SupabaseClient, monthId: string) {
  const { start, end } = monthDateRange(monthId);

  const result = await supabase
    .from("transactions")
    .select("*")
    .gte("date", start)
    .lt("date", end)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (result.error) {
    throw result.error;
  }

  return (result.data ?? []) as Transaction[];
}

async function fetchTransactionsForRange(
  supabase: SupabaseClient,
  startMonthId: string,
  endMonthId: string,
) {
  const { start, end } = getReportRangeBounds(startMonthId, endMonthId);

  const result = await supabase
    .from("transactions")
    .select("*")
    .gte("date", start)
    .lt("date", end)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (result.error) {
    throw result.error;
  }

  return (result.data ?? []) as Transaction[];
}

async function fetchReportCollections(
  supabase: SupabaseClient,
  startMonthId: string,
  endMonthId: string,
) {
  const monthIds = listMonthIds(startMonthId, endMonthId);
  const { start, end } = getReportRangeBounds(startMonthId, endMonthId);

  const [groupsResult, categoriesResult, paymentMethodsResult, incomesResult, budgetsResult, transactionsResult] =
    await Promise.all([
      supabase.from("category_groups").select("*").order("sort_order", { ascending: true }),
      supabase.from("categories").select("*").order("sort_order", { ascending: true }),
      supabase.from("payment_methods").select("*").order("sort_order", { ascending: true }),
      supabase.from("monthly_incomes").select("*").in("month_id", monthIds),
      supabase.from("budgets").select("*").in("month_id", monthIds),
      supabase
        .from("transactions")
        .select("*")
        .gte("date", start)
        .lt("date", end)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  if (groupsResult.error) {
    throw groupsResult.error;
  }
  if (categoriesResult.error) {
    throw categoriesResult.error;
  }
  if (paymentMethodsResult.error) {
    throw paymentMethodsResult.error;
  }
  if (incomesResult.error) {
    throw incomesResult.error;
  }
  if (budgetsResult.error) {
    throw budgetsResult.error;
  }
  if (transactionsResult.error) {
    throw transactionsResult.error;
  }

  return {
    groups: (groupsResult.data ?? []) as CategoryGroup[],
    categories: (categoriesResult.data ?? []) as Category[],
    paymentMethods: (paymentMethodsResult.data ?? []) as PaymentMethod[],
    incomes: (incomesResult.data ?? []) as MonthlyIncome[],
    budgets: (budgetsResult.data ?? []) as Budget[],
    transactions: (transactionsResult.data ?? []) as Transaction[],
  } satisfies ReportCollections;
}

export async function fetchDashboardData(
  supabase: SupabaseClient,
  monthId: string,
): Promise<DashboardData> {
  const user = await requireSession(supabase);
  await bootstrapAndInitializeMonth(supabase, monthId);
  await runLegacyCategoryNormalization(supabase, user.id);

  const [collections, carryoverByCategory] = await Promise.all([
    fetchBaseCollections(supabase, monthId),
    fetchCarryoverByCategory(supabase, monthId),
  ]);

  return {
    user,
    ...computeDashboardData({ ...collections, carryoverByCategory }),
  };
}

export async function fetchBudgetAllocationData(
  supabase: SupabaseClient,
  monthId: string,
): Promise<BudgetAllocationData> {
  const user = await requireSession(supabase);
  await bootstrapAndInitializeMonth(supabase, monthId);
  await runLegacyCategoryNormalization(supabase, user.id);

  const [collections, carryoverByCategory] = await Promise.all([
    fetchBaseCollections(supabase, monthId),
    fetchCarryoverByCategory(supabase, monthId),
  ]);

  return {
    user,
    ...computeDashboardData({ ...collections, carryoverByCategory }),
  };
}

export async function fetchBudgetReferenceData(
  supabase: SupabaseClient,
  monthId: string,
): Promise<BudgetReferenceItem[]> {
  const user = await requireSession(supabase);
  await bootstrapAndInitializeMonth(supabase, monthId);
  await runLegacyCategoryNormalization(supabase, user.id);

  const { start, end } = monthDateRange(monthId);
  const [budgetsResult, transactionsResult] = await Promise.all([
    supabase.from("budgets").select("category_id,allocated").eq("month_id", monthId),
    supabase
      .from("transactions")
      .select("category_id,amount")
      .gte("date", start)
      .lt("date", end),
  ]);

  if (budgetsResult.error) {
    throw budgetsResult.error;
  }

  if (transactionsResult.error) {
    throw transactionsResult.error;
  }

  const spentByCategory = (transactionsResult.data ?? []).reduce<Map<string, number>>(
    (accumulator, transaction) => {
      accumulator.set(
        transaction.category_id,
        (accumulator.get(transaction.category_id) ?? 0) + transaction.amount,
      );
      return accumulator;
    },
    new Map(),
  );

  return (budgetsResult.data ?? []).map((budget) => ({
    categoryId: budget.category_id,
    allocated: budget.allocated,
    spent: spentByCategory.get(budget.category_id) ?? 0,
  }));
}

export async function fetchBudgetUsageData(
  supabase: SupabaseClient,
  monthId: string,
  scope: BudgetUsageScope,
): Promise<BudgetUsagePageData> {
  const user = await requireSession(supabase);
  await bootstrapAndInitializeMonth(supabase, monthId);
  await runLegacyCategoryNormalization(supabase, user.id);

  const [collections, carryoverByCategory] = await Promise.all([
    fetchBaseCollections(supabase, monthId),
    fetchCarryoverByCategory(supabase, monthId),
  ]);
  const today = getTodayInTaipei();
  const scopedTransactions =
    scope === "today"
      ? collections.transactions.filter((transaction) => transaction.date === today)
      : collections.transactions;

  const categoryMap = new Map(collections.categories.map((category) => [category.id, category]));
  const groupMap = new Map(collections.groups.map((group) => [group.id, group]));
  const spentByCategory = scopedTransactions.reduce<Map<string, number>>((accumulator, transaction) => {
    accumulator.set(transaction.category_id, (accumulator.get(transaction.category_id) ?? 0) + transaction.amount);
    return accumulator;
  }, new Map());

  const usageItems = collections.budgets
    .map((budget) => {
      const category = categoryMap.get(budget.category_id);
      if (!category) {
        return null;
      }

      const spent = spentByCategory.get(category.id) ?? 0;
      const carryover = carryoverByCategory.get(category.id) ?? 0;
      const available = budget.allocated + carryover;
      const remaining = available - spent;
      const usageRate = available > 0 ? spent / available : 0;

      return {
        id: category.id,
        groupId: category.category_group_id,
        groupName: groupMap.get(category.category_group_id)?.name ?? "未分組",
        name: category.name,
        allocated: budget.allocated,
        carryover,
        spent,
        remaining,
        usageRate,
        isOverspent: remaining < 0,
      } satisfies BudgetUsageItem;
    })
    .filter((item): item is BudgetUsageItem => item !== null)
    .sort((left, right) => {
      if (left.isOverspent !== right.isOverspent) {
        return left.isOverspent ? -1 : 1;
      }

      if (right.usageRate !== left.usageRate) {
        return right.usageRate - left.usageRate;
      }

      return left.name.localeCompare(right.name, "zh-Hant");
    });

  const groups = collections.groups
    .map((group) => {
      const categories = usageItems.filter((item) => item.groupId === group.id);
      const allocated = categories.reduce((sum, item) => sum + item.allocated, 0);
      const carryover = categories.reduce((sum, item) => sum + item.carryover, 0);
      const spent = categories.reduce((sum, item) => sum + item.spent, 0);
      const remaining = categories.reduce((sum, item) => sum + item.remaining, 0);
      const hasOverspentItem = categories.some((item) => item.isOverspent);

      return {
        id: group.id,
        name: group.name,
        allocated,
        carryover,
        spent,
        remaining,
        hasOverspentItem,
        categories,
      } satisfies BudgetUsageGroup;
    })
    .filter((group) => group.categories.length > 0)
    .sort((left, right) => {
      if (left.hasOverspentItem !== right.hasOverspentItem) {
        return left.hasOverspentItem ? -1 : 1;
      }

      return right.spent - left.spent;
    });

  const summarySpent = usageItems.reduce((sum, item) => sum + item.spent, 0);
  const summaryRemaining = usageItems.reduce((sum, item) => sum + item.remaining, 0);
  const overspentCount = usageItems.filter((item) => item.isOverspent).length;

  return {
    user,
    monthId,
    scope,
    summary: {
      spent: summarySpent,
      remaining: summaryRemaining,
      overspentCount,
    },
    groups,
  };
}

export async function fetchReportsData(
  supabase: SupabaseClient,
  monthId: string,
  options?: {
    startMonthId?: string;
    endMonthId?: string;
  },
): Promise<ReportsPageData> {
  const user = await requireSession(supabase);
  const startMonthId = options?.startMonthId ?? monthId;
  const endMonthId = options?.endMonthId ?? monthId;
  const monthIds = listMonthIds(startMonthId, endMonthId);
  await bootstrapAndInitializeMonths(supabase, monthIds);
  await runLegacyCategoryNormalization(supabase, user.id);

  const monthCount = monthIds.length;
  const previousStartMonthId = shiftMonth(startMonthId, -monthCount);
  const previousEndMonthId = shiftMonth(endMonthId, -monthCount);

  const [collections, previousTransactions] = await Promise.all([
    fetchReportCollections(supabase, startMonthId, endMonthId),
    fetchTransactionsForRange(supabase, previousStartMonthId, previousEndMonthId),
  ]);

  return {
    user,
    ...computeReportData(collections, previousTransactions, {
      mode: startMonthId === endMonthId ? "month" : "range",
      startMonthId,
      endMonthId,
      monthCount,
      previousStartMonthId,
      previousEndMonthId,
    }),
  };
}

export async function fetchTransactionsPageData(
  supabase: SupabaseClient,
  monthId: string,
): Promise<TransactionsPageData> {
  const user = await requireSession(supabase);
  await bootstrapAndInitializeMonth(supabase, monthId);
  await runLegacyCategoryNormalization(supabase, user.id);

  const collections = await fetchBaseCollections(supabase, monthId);

  return {
    user,
    categories: createCategoryOptions(collections.groups, collections.categories),
    paymentMethods: createPaymentMethodOptions(collections.paymentMethods),
    transactions: createTransactionViews(
      collections.groups,
      collections.categories,
      collections.paymentMethods,
      collections.transactions,
    ),
  };
}

const QUICK_USAGE_WINDOW_DAYS = 30;

function shiftDate(dateText: string, deltaDays: number): string {
  const [year, month, day] = dateText.split("-").map(Number);
  const shifted = new Date(year, month - 1, day + deltaDays);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

// 快速格子的排序：最近使用次數多的優先；沒有使用紀錄時退回手動標記（isQuick）與原本排序。
export function sortQuickCategories(
  allCategories: CategoryOption[],
  usageCountByCategory: Map<string, number>,
): CategoryOption[] {
  return allCategories
    .filter((category) => category.isQuick || (usageCountByCategory.get(category.id) ?? 0) > 0)
    .sort((left, right) => {
      const usageDiff =
        (usageCountByCategory.get(right.id) ?? 0) - (usageCountByCategory.get(left.id) ?? 0);

      if (usageDiff !== 0) {
        return usageDiff;
      }

      if (left.isQuick !== right.isQuick) {
        return left.isQuick ? -1 : 1;
      }

      return 0;
    });
}

export async function fetchQuickEntryData(
  supabase: SupabaseClient,
  monthId: string,
) {
  const user = await requireSession(supabase);
  await bootstrapAndInitializeMonth(supabase, monthId);
  await runLegacyCategoryNormalization(supabase, user.id);

  const usageSince = shiftDate(getTodayInTaipei(), -QUICK_USAGE_WINDOW_DAYS);

  const [groupsResult, categoriesResult, paymentMethodsResult, recentUsageResult] = await Promise.all([
    supabase.from("category_groups").select("*").order("sort_order", { ascending: true }),
    supabase.from("categories").select("*").order("sort_order", { ascending: true }),
    supabase.from("payment_methods").select("*").order("sort_order", { ascending: true }),
    supabase.from("transactions").select("category_id").gte("date", usageSince),
  ]);

  if (groupsResult.error) {
    throw groupsResult.error;
  }
  if (categoriesResult.error) {
    throw categoriesResult.error;
  }
  if (paymentMethodsResult.error) {
    throw paymentMethodsResult.error;
  }
  if (recentUsageResult.error) {
    throw recentUsageResult.error;
  }

  const allCategories = createCategoryOptions(
    (groupsResult.data ?? []) as CategoryGroup[],
    (categoriesResult.data ?? []) as Category[],
  );

  const usageCountByCategory = new Map<string, number>();

  for (const row of (recentUsageResult.data ?? []) as Pick<Transaction, "category_id">[]) {
    usageCountByCategory.set(row.category_id, (usageCountByCategory.get(row.category_id) ?? 0) + 1);
  }

  return {
    allCategories,
    quickCategories: sortQuickCategories(allCategories, usageCountByCategory),
    paymentMethods: createPaymentMethodOptions((paymentMethodsResult.data ?? []) as PaymentMethod[]),
  };
}

export async function fetchSettingsData(
  supabase: SupabaseClient,
): Promise<SettingsPageData> {
  const user = await requireSession(supabase);
  await bootstrapUserDefaults(supabase);
  await runLegacyCategoryNormalization(supabase, user.id);

  const [groupsResult, categoriesResult, paymentMethodsResult] = await Promise.all([
    supabase.from("category_groups").select("*").order("sort_order", { ascending: true }),
    supabase.from("categories").select("*").order("sort_order", { ascending: true }),
    supabase.from("payment_methods").select("*").order("sort_order", { ascending: true }),
  ]);

  if (groupsResult.error) {
    throw groupsResult.error;
  }
  if (categoriesResult.error) {
    throw categoriesResult.error;
  }
  if (paymentMethodsResult.error) {
    throw paymentMethodsResult.error;
  }

  const groups = (groupsResult.data ?? []) as CategoryGroup[];
  const categories = createCategoryOptions(
    groups,
    (categoriesResult.data ?? []) as Category[],
  ).map((category) => ({ ...category })) satisfies SettingsCategoryItem[];
  const paymentMethods = createPaymentMethodOptions(
    (paymentMethodsResult.data ?? []) as PaymentMethod[],
  );

  return {
    user,
    overview: {
      groupCount: groups.length,
      categoryCount: categories.length,
      quickCategoryCount: categories.filter((category) => category.isQuick).length,
      paymentMethodCount: paymentMethods.length,
    },
    categories,
    paymentMethods,
  };
}
