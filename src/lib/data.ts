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

  const categoryRows = budgets
    .map((budget) => {
      const category = categoryMap.get(budget.category_id);

      if (!category) {
        return null;
      }

      const spent = spentByCategory.get(category.id) ?? 0;
      const previousSpent = previousSpentByCategory.get(category.id) ?? 0;
      const transactionCount = countByCategory.get(category.id) ?? 0;

      return {
        id: category.id,
        name: category.name,
        allocated: budget.allocated,
        spent,
        remaining: budget.allocated - spent,
        transactionCount,
        previousSpent,
        deltaSpent: spent - previousSpent,
        groupId: category.category_group_id,
      };
    })
    .filter(
      (
        row,
      ): row is ReportBreakdownItem & {
        groupId: string;
      } => row !== null,
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
  const { start } = monthDateRange(startMonthId);
  const { end } = monthDateRange(shiftMonth(endMonthId, 1));

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
  const { start } = monthDateRange(startMonthId);
  const { end } = monthDateRange(shiftMonth(endMonthId, 1));

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
  await requireSession(supabase);
  await bootstrapAndInitializeMonth(supabase, monthId);

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
  await requireSession(supabase);
  await bootstrapAndInitializeMonth(supabase, monthId);

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
