import type {
  Budget,
  Category,
  CategoryGroup,
  MonthlyIncome,
  PaymentMethod,
  PaymentMethodReportItem,
  ReportBreakdownItem,
  ReportData,
  ReportGroupDetail,
  ReportPeriod,
  ReportTrendPoint,
  Transaction,
  TransactionWithCategory,
} from "@/lib/types";
import { formatMonthLabel, listMonthIds, monthDateRange, shiftMonth } from "@/lib/utils";

export type ReportCollections = {
  groups: CategoryGroup[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  budgets: Budget[];
  transactions: Transaction[];
  incomes: MonthlyIncome[];
};

export function getReportRangeBounds(startMonthId: string, endMonthId: string) {
  const { start } = monthDateRange(startMonthId);
  const { end } = monthDateRange(endMonthId);

  return { start, end };
}

export function createTransactionViews(
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
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const spentByCategory = new Map<string, number>();
  const countByCategory = new Map<string, number>();
  const spentByPaymentMethod = new Map<string, number>();
  const countByPaymentMethod = new Map<string, number>();
  const previousSpentByCategory = new Map<string, number>();
  const previousSpentByPaymentMethod = new Map<string, number>();

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

  const allocatedByCategory = new Map<string, number>();

  for (const budget of budgets) {
    allocatedByCategory.set(
      budget.category_id,
      (allocatedByCategory.get(budget.category_id) ?? 0) + budget.allocated,
    );
  }

  const categoryIds = new Set([...allocatedByCategory.keys(), ...spentByCategory.keys(), ...previousSpentByCategory.keys()]);
  const unknownGroupId = "__report_unknown_group__";
  const categoryRows = Array.from(categoryIds).map((categoryId) => {
    const category = categoryMap.get(categoryId);
    const group = groups.find((item) => item.id === category?.category_group_id);
    const allocated = allocatedByCategory.get(categoryId) ?? 0;
    const spent = spentByCategory.get(categoryId) ?? 0;
    const previousSpent = previousSpentByCategory.get(categoryId) ?? 0;
    return {
      id: categoryId,
      name: category?.name ?? "未知分類",
      groupName: group?.name ?? "未分類大項",
      groupId: group?.id ?? unknownGroupId,
      allocated, spent, previousSpent,
      remaining: allocated - spent,
      transactionCount: countByCategory.get(categoryId) ?? 0,
      deltaSpent: spent - previousSpent,
    };
  });
  const reportGroups = categoryRows.some((row) => row.groupId === unknownGroupId)
    ? [...groups, { id: unknownGroupId, name: "未分類大項", sort_order: Infinity }]
    : groups;

  const groupRows = reportGroups
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

  const methodIds = new Set(paymentMethods.map((method) => method.id));
  const missingMethodIds = [...new Set([...spentByPaymentMethod.keys(), ...previousSpentByPaymentMethod.keys()])]
    .filter((id) => !methodIds.has(id));
  const reportMethods = [...paymentMethods, ...missingMethodIds.map((id) => ({ id, name: "未知支付方式", sort_order: Infinity }))];
  const paymentMethodsBreakdown = reportMethods
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

  const trend = computeReportTrend({ incomes, budgets, transactions }, normalizedPeriod.startMonthId, normalizedPeriod.endMonthId);

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

/** Keep the headline and breakdown restricted to the selected period. */
export function selectReportPeriod(collections: ReportCollections, startMonthId: string, endMonthId: string): ReportCollections {
  const { start, end } = getReportRangeBounds(startMonthId, endMonthId);
  return {
    ...collections,
    incomes: collections.incomes.filter((row) => row.month_id >= startMonthId && row.month_id <= endMonthId),
    budgets: collections.budgets.filter((row) => row.month_id >= startMonthId && row.month_id <= endMonthId),
    transactions: collections.transactions.filter((row) => row.date >= start && row.date < end),
  };
}

export function computeReportTrend(
  collections: Pick<ReportCollections, "incomes" | "budgets" | "transactions">,
  startMonthId: string, endMonthId: string,
): ReportTrendPoint[] {
  return listMonthIds(startMonthId, endMonthId).map((monthId) => {
    const income = collections.incomes.filter((row) => row.month_id === monthId).reduce((sum, row) => sum + row.amount, 0);
    const allocated = collections.budgets.filter((row) => row.month_id === monthId).reduce((sum, row) => sum + row.allocated, 0);
    const spent = collections.transactions.filter((row) => row.date.slice(0, 7) === monthId).reduce((sum, row) => sum + row.amount, 0);
    return { monthId, label: formatMonthLabel(monthId), income, allocated, spent, unallocated: income - allocated };
  });
}
