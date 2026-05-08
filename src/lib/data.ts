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

type DashboardCollections = {
  groups: CategoryGroup[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  budgets: Budget[];
  transactions: Transaction[];
  income: MonthlyIncome | null;
};

type ReportCollections = {
  groups: CategoryGroup[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  budgets: Budget[];
  transactions: Transaction[];
  incomes: MonthlyIncome[];
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

export function getReportRangeBounds(startMonthId: string, endMonthId: string) {
  const { start } = monthDateRange(startMonthId);
  const { end } = monthDateRange(endMonthId);

  return { start, end };
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

function createTransactionViews(
  groups: CategoryGroup[],
  categories: Category[],
  paymentMethods: PaymentMethod[],
  transactions: Transaction[],
  limit?: number,
) {
  const groupMap = new Map(groups.map((group) => [group.id, group]));
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const paymentMethodMap = new Map(paymentMethods.map((method) => [method.id, method]));
  const source = typeof limit === "number" ? transactions.slice(0, limit) : transactions;

  return source.map((entry) => {
    const category = categoryMap.get(entry.category_id);
    const group = category ? groupMap.get(category.category_group_id) : null;
    const paymentMethod = paymentMethodMap.get(entry.payment_method_id);

    return {
      ...entry,
      categoryGroupName: group?.name ?? "未分類大項",
      categoryName: category?.name ?? "未知分類",
      paymentMethodName: paymentMethod?.name ?? "未知支付方式",
    } satisfies TransactionWithCategory;
  });
}

export function computeDashboardData({
  groups,
  categories,
  paymentMethods,
  budgets,
  transactions,
  income,
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
      const remaining = budget.allocated - spent;

      return {
        budgetId: budget.id,
        categoryId: budget.category_id,
        categoryGroupId: group.id,
        categoryGroupName: group.name,
        categoryName: category.name,
        allocated: budget.allocated,
        spent,
        remaining,
        isQuick: category.is_quick,
        isAuto: category.is_auto,
        autoAmount: category.auto_amount,
        warning: budget.allocated === 0 && spent > 0 ? "尚未分配預算卻已有支出" : null,
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

export function computeReportData(
  {
    groups,
    categories,
    paymentMethods,
    budgets,
    transactions,
    incomes,
  }: ReportCollections,
  previousTransactions: Transaction[] = [],
  period?: ReportPeriod,
): ReportData {
  const groupMap = new Map(groups.map((group) => [group.id, group]));
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const spentByCategory = new Map<string, number>();
  const countByCategory = new Map<string, number>();
  const spentByPaymentMethod = new Map<string, number>();
  const countByPaymentMethod = new Map<string, number>();
  const previousSpentByCategory = new Map<string, number>();
  const previousSpentByPaymentMethod = new Map<string, number>();
  const incomeByMonth = new Map(incomes.map((item) => [item.month_id, item.amount]));
  const allocatedByMonth = new Map<string, number>();
  const spentByMonth = new Map<string, number>();

  for (const transaction of transactions) {
    spentByCategory.set(
      transaction.category_id,
      (spentByCategory.get(transaction.category_id) ?? 0) + transaction.amount,
    );
    countByCategory.set(
      transaction.category_id,
      (countByCategory.get(transaction.category_id) ?? 0) + 1,
    );
    spentByPaymentMethod.set(
      transaction.payment_method_id,
      (spentByPaymentMethod.get(transaction.payment_method_id) ?? 0) + transaction.amount,
    );
    countByPaymentMethod.set(
      transaction.payment_method_id,
      (countByPaymentMethod.get(transaction.payment_method_id) ?? 0) + 1,
    );
    spentByMonth.set(
      transaction.date.slice(0, 7),
      (spentByMonth.get(transaction.date.slice(0, 7)) ?? 0) + transaction.amount,
    );
  }

  for (const transaction of previousTransactions) {
    previousSpentByCategory.set(
      transaction.category_id,
      (previousSpentByCategory.get(transaction.category_id) ?? 0) + transaction.amount,
    );
    previousSpentByPaymentMethod.set(
      transaction.payment_method_id,
      (previousSpentByPaymentMethod.get(transaction.payment_method_id) ?? 0) + transaction.amount,
    );
  }

  for (const budget of budgets) {
    allocatedByMonth.set(
      budget.month_id,
      (allocatedByMonth.get(budget.month_id) ?? 0) + budget.allocated,
    );
  }

  const allocatedByCategory = new Map<string, number>();

  for (const budget of budgets) {
    allocatedByCategory.set(
      budget.category_id,
      (allocatedByCategory.get(budget.category_id) ?? 0) + budget.allocated,
    );
  }

  const categoryRows = Array.from(allocatedByCategory.entries()).flatMap(
    ([categoryId, allocated]) => {
      const category = categoryMap.get(categoryId);
      if (!category) return [];

      const spent = spentByCategory.get(category.id) ?? 0;
      const previousSpent = previousSpentByCategory.get(category.id) ?? 0;
      const transactionCount = countByCategory.get(category.id) ?? 0;

      const group = groups.find((g) => g.id === category.category_group_id);
      return [
        {
          id: category.id,
          name: category.name,
          groupName: group?.name,
          allocated,
          spent,
          remaining: allocated - spent,
          transactionCount,
          previousSpent,
          deltaSpent: spent - previousSpent,
          groupId: category.category_group_id,
        },
      ];
    },
  );

  const groupRows = groups
    .map((group) => {
      const items = categoryRows.filter((row) => row.groupId === group.id);
      const allocated = items.reduce((sum, row) => sum + row.allocated, 0);
      const spent = items.reduce((sum, row) => sum + row.spent, 0);
      const transactionCount = items.reduce((sum, row) => sum + row.transactionCount, 0);
      const previousSpent = items.reduce((sum, row) => sum + row.previousSpent, 0);

      return {
        id: group.id,
        name: group.name,
        allocated,
        spent,
        remaining: allocated - spent,
        transactionCount,
        previousSpent,
        deltaSpent: spent - previousSpent,
        sortOrder: group.sort_order,
      };
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);

  const categoryGroups = groupRows.map(
    ({ sortOrder: _sortOrder, ...row }) => row satisfies ReportBreakdownItem,
  );

  const categoriesBreakdown = categoryRows
    .map(({ groupId: _groupId, ...row }) => row satisfies ReportBreakdownItem)
    .sort((left, right) => {
      if (right.spent !== left.spent) {
        return right.spent - left.spent;
      }

      return left.name.localeCompare(right.name, "zh-Hant");
    });

  const paymentMethodsBreakdown = paymentMethods
    .map((paymentMethod) => ({
      id: paymentMethod.id,
      name: paymentMethod.name,
      spent: spentByPaymentMethod.get(paymentMethod.id) ?? 0,
      transactionCount: countByPaymentMethod.get(paymentMethod.id) ?? 0,
      previousSpent: previousSpentByPaymentMethod.get(paymentMethod.id) ?? 0,
      deltaSpent:
        (spentByPaymentMethod.get(paymentMethod.id) ?? 0) -
        (previousSpentByPaymentMethod.get(paymentMethod.id) ?? 0),
      share: 0,
      sortOrder: paymentMethod.sort_order,
    }))
    .sort((left, right) => {
      if (right.spent !== left.spent) {
        return right.spent - left.spent;
      }

      return left.sortOrder - right.sortOrder;
    })
    .map(({ sortOrder: _sortOrder, ...row }) => row);

  const allocated = budgets.reduce((sum, budget) => sum + budget.allocated, 0);
  const income = incomes.reduce((sum, item) => sum + item.amount, 0);
  const spent = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const previousSpent = previousTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const overspentCount = categoryGroups.filter((group) => group.remaining < 0).length;
  const totalPaymentSpent = paymentMethodsBreakdown.reduce((sum, item) => sum + item.spent, 0);
  const detailedPaymentMethods = paymentMethodsBreakdown.map(
    (item) =>
      ({
        ...item,
        share: totalPaymentSpent > 0 ? item.spent / totalPaymentSpent : 0,
      }) satisfies PaymentMethodReportItem,
  );

  const recentTransactions = createTransactionViews(
    groups,
    categories,
    paymentMethods,
    transactions,
    12,
  );

  const normalizedPeriod =
    period ??
    ({
      mode: "month",
      startMonthId: incomes[0]?.month_id ?? "1970-01",
      endMonthId: incomes[0]?.month_id ?? "1970-01",
      monthCount: 1,
      previousStartMonthId: shiftMonth(incomes[0]?.month_id ?? "1970-01", -1),
      previousEndMonthId: shiftMonth(incomes[0]?.month_id ?? "1970-01", -1),
    } satisfies ReportPeriod);

  const trend: ReportTrendPoint[] = listMonthIds(
    normalizedPeriod.startMonthId,
    normalizedPeriod.endMonthId,
  ).map((monthId) => {
    const monthlyIncome = incomeByMonth.get(monthId) ?? 0;
    const monthlyAllocated = allocatedByMonth.get(monthId) ?? 0;
    const monthlySpent = spentByMonth.get(monthId) ?? 0;

    return {
      monthId,
      label: formatMonthLabel(monthId),
      income: monthlyIncome,
      allocated: monthlyAllocated,
      spent: monthlySpent,
      unallocated: monthlyIncome - monthlyAllocated,
    } satisfies ReportTrendPoint;
  });

  const groupDetails: ReportGroupDetail[] = groupRows.map(({ sortOrder: _sortOrder, ...group }) => ({
    group,
    categories: categoriesBreakdown.filter((category) => {
      const source = categoryRows.find((row) => row.id === category.id);
      return source?.groupId === group.id;
    }),
  }));

  return {
    period: normalizedPeriod,
    summary: {
      income,
      allocated,
      spent,
      unallocated: income - allocated,
      remainingAfterSpending: income - spent,
      transactionCount: transactions.length,
      overspentCount,
      previousSpent,
      deltaSpent: spent - previousSpent,
    },
    categoryGroups,
    groupDetails,
    categories: categoriesBreakdown,
    paymentMethods: detailedPaymentMethods,
    trend,
    recentTransactions,
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

  const collections = await fetchBaseCollections(supabase, monthId);

  return {
    user,
    ...computeDashboardData(collections),
  };
}

export async function fetchBudgetAllocationData(
  supabase: SupabaseClient,
  monthId: string,
): Promise<BudgetAllocationData> {
  const user = await requireSession(supabase);
  await bootstrapAndInitializeMonth(supabase, monthId);
  await runLegacyCategoryNormalization(supabase, user.id);

  const collections = await fetchBaseCollections(supabase, monthId);

  return {
    user,
    ...computeDashboardData(collections),
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

  const collections = await fetchBaseCollections(supabase, monthId);
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
      const remaining = budget.allocated - spent;
      const usageRate = budget.allocated > 0 ? spent / budget.allocated : 0;

      return {
        id: category.id,
        groupId: category.category_group_id,
        groupName: groupMap.get(category.category_group_id)?.name ?? "未分組",
        name: category.name,
        allocated: budget.allocated,
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
      const spent = categories.reduce((sum, item) => sum + item.spent, 0);
      const remaining = categories.reduce((sum, item) => sum + item.remaining, 0);
      const hasOverspentItem = categories.some((item) => item.isOverspent);

      return {
        id: group.id,
        name: group.name,
        allocated,
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

export async function fetchQuickEntryData(
  supabase: SupabaseClient,
  monthId: string,
) {
  const user = await requireSession(supabase);
  await bootstrapAndInitializeMonth(supabase, monthId);
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

  const allCategories = createCategoryOptions(
    (groupsResult.data ?? []) as CategoryGroup[],
    (categoriesResult.data ?? []) as Category[],
  );

  return {
    allCategories,
    quickCategories: allCategories.filter((category) => category.isQuick),
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
