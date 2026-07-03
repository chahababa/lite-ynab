import { describe, expect, it } from "vitest";

import {
  computeCarryoverByCategory,
  computeDashboardData,
  computeReportData,
  getReportRangeBounds,
  sortQuickCategories,
} from "@/lib/data";
import type { CategoryOption } from "@/lib/types";
import type {
  Budget,
  Category,
  CategoryGroup,
  PaymentMethod,
  Transaction,
} from "@/lib/types";

const userId = "user-1";

function createGroup(overrides: Partial<CategoryGroup>): CategoryGroup {
  return {
    id: "group-default",
    user_id: userId,
    name: "other",
    sort_order: 0,
    ...overrides,
  };
}

function createCategory(overrides: Partial<Category>): Category {
  return {
    id: "category-default",
    user_id: userId,
    category_group_id: "group-default",
    name: "default",
    is_auto: false,
    auto_amount: 0,
    is_quick: false,
    sort_order: 0,
    ...overrides,
  };
}

function createPaymentMethod(overrides: Partial<PaymentMethod>): PaymentMethod {
  return {
    id: "payment-default",
    user_id: userId,
    name: "cash",
    sort_order: 0,
    ...overrides,
  };
}

function createBudget(overrides: Partial<Budget>): Budget {
  return {
    id: "budget-default",
    user_id: userId,
    month_id: "2026-04",
    category_id: "category-default",
    allocated: 0,
    ...overrides,
  };
}

function createTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: "transaction-default",
    user_id: userId,
    date: "2026-04-01",
    amount: 0,
    category_id: "category-default",
    payment_method_id: "payment-default",
    note: "",
    source: "manual",
    source_text: null,
    source_id: null,
    metadata: {},
    created_at: "2026-04-01T08:00:00.000Z",
    ...overrides,
  };
}

describe("computeDashboardData", () => {
  it("computes grouped budget balances, payment methods, quick categories, and unallocated income", () => {
    const groups = [
      createGroup({ id: "group-personal", name: "personal", sort_order: 10 }),
      createGroup({ id: "group-home", name: "home", sort_order: 20 }),
    ];

    const categories = [
      createCategory({
        id: "cat-food",
        category_group_id: "group-personal",
        name: "food",
        is_quick: true,
        sort_order: 20,
      }),
      createCategory({
        id: "cat-rent",
        category_group_id: "group-home",
        name: "rent",
        is_auto: true,
        sort_order: 10,
      }),
      createCategory({
        id: "cat-misc",
        category_group_id: "group-personal",
        name: "misc",
        sort_order: 30,
      }),
    ];

    const paymentMethods = [
      createPaymentMethod({ id: "pm-cash", name: "cash", sort_order: 10 }),
      createPaymentMethod({ id: "pm-card", name: "card-a", sort_order: 20 }),
    ];

    const budgets = [
      createBudget({ id: "budget-food", category_id: "cat-food", allocated: 500 }),
      createBudget({ id: "budget-rent", category_id: "cat-rent", allocated: 0 }),
      createBudget({ id: "budget-missing", category_id: "missing-category", allocated: 999 }),
    ];

    const transactions = [
      createTransaction({
        id: "tx-1",
        category_id: "cat-food",
        payment_method_id: "pm-cash",
        amount: 180,
        note: "lunch",
      }),
      createTransaction({
        id: "tx-2",
        category_id: "cat-food",
        payment_method_id: "pm-card",
        amount: 70,
        note: "coffee beans",
      }),
      createTransaction({
        id: "tx-3",
        category_id: "cat-rent",
        payment_method_id: "pm-card",
        amount: 1200,
      }),
      createTransaction({
        id: "tx-4",
        category_id: "missing-category",
        payment_method_id: "pm-cash",
        amount: 25,
      }),
    ];

    const result = computeDashboardData({
      groups,
      categories,
      paymentMethods,
      budgets,
      transactions,
      income: {
        id: "income-1",
        user_id: userId,
        month_id: "2026-04",
        amount: 3000,
      },
    });

    expect(result.quickCategories.map((category) => category.id)).toEqual(["cat-food"]);
    expect(result.paymentMethods.map((method) => method.name)).toEqual(["cash", "card-a"]);
    expect(result.budgetRows).toEqual([
      {
        budgetId: "budget-food",
        categoryId: "cat-food",
        categoryGroupId: "group-personal",
        categoryGroupName: "personal",
        categoryName: "food",
        allocated: 500,
        carryover: 0,
        spent: 250,
        remaining: 250,
        isQuick: true,
        isAuto: false,
        autoAmount: 0,
        warning: null,
      },
      {
        budgetId: "budget-rent",
        categoryId: "cat-rent",
        categoryGroupId: "group-home",
        categoryGroupName: "home",
        categoryName: "rent",
        allocated: 0,
        carryover: 0,
        spent: 1200,
        remaining: -1200,
        isQuick: false,
        isAuto: true,
        autoAmount: 0,
        warning: "尚未分配預算卻已有支出",
      },
    ]);
    expect(result.recentTransactions[0].categoryName).toBe("food");
    expect(result.recentTransactions[0].paymentMethodName).toBe("cash");
    expect(result.recentTransactions[3].categoryName).toBe("未知分類");
    expect(result.unallocated).toBe(2500);
  });

  it("limits quick categories and recent transactions to ten entries", () => {
    const groups = [createGroup({ id: "group-personal", name: "personal", sort_order: 10 })];
    const categories = Array.from({ length: 12 }, (_, index) =>
      createCategory({
        id: `cat-${index}`,
        category_group_id: "group-personal",
        name: `category-${index}`,
        is_quick: true,
        sort_order: index,
      }),
    );

    const paymentMethods = [createPaymentMethod({ id: "pm-cash", name: "cash", sort_order: 10 })];
    const transactions = Array.from({ length: 12 }, (_, index) =>
      createTransaction({
        id: `tx-${index}`,
        category_id: `cat-${index}`,
        payment_method_id: "pm-cash",
        amount: index + 1,
      }),
    );

    const result = computeDashboardData({
      groups,
      categories,
      paymentMethods,
      budgets: [],
      transactions,
      income: null,
    });

    expect(result.quickCategories).toHaveLength(10);
    expect(result.recentTransactions).toHaveLength(10);
    expect(result.unallocated).toBe(0);
  });
});

describe("sortQuickCategories", () => {
  function createOption(overrides: Partial<CategoryOption> & { id: string }): CategoryOption {
    return {
      groupId: "group-1",
      groupName: "個人",
      name: overrides.id,
      isQuick: false,
      isAuto: false,
      autoAmount: 0,
      sortOrder: 0,
      ...overrides,
    };
  }

  it("puts most-used categories first even when they are not flagged quick", () => {
    const categories = [
      createOption({ id: "cat-quick-a", isQuick: true, sortOrder: 10 }),
      createOption({ id: "cat-quick-b", isQuick: true, sortOrder: 20 }),
      createOption({ id: "cat-hot", isQuick: false, sortOrder: 30 }),
    ];
    const usage = new Map([
      ["cat-hot", 12],
      ["cat-quick-a", 3],
    ]);

    const result = sortQuickCategories(categories, usage);

    expect(result.map((c) => c.id)).toEqual(["cat-hot", "cat-quick-a", "cat-quick-b"]);
  });

  it("excludes unused non-quick categories and keeps original order for ties", () => {
    const categories = [
      createOption({ id: "cat-a", isQuick: true, sortOrder: 10 }),
      createOption({ id: "cat-unused", isQuick: false, sortOrder: 20 }),
      createOption({ id: "cat-b", isQuick: true, sortOrder: 30 }),
    ];

    const result = sortQuickCategories(categories, new Map());

    expect(result.map((c) => c.id)).toEqual(["cat-a", "cat-b"]);
  });
});

describe("computeCarryoverByCategory", () => {
  it("accumulates unspent budget month by month from the rollover start month", () => {
    const budgets = [
      createBudget({ id: "b-1", month_id: "2026-07", category_id: "cat-save", allocated: 3000 }),
      createBudget({ id: "b-2", month_id: "2026-08", category_id: "cat-save", allocated: 3000 }),
    ];
    const transactions = [
      createTransaction({ id: "t-1", date: "2026-07-15", category_id: "cat-save", amount: 500 }),
    ];

    const result = computeCarryoverByCategory(budgets, transactions, "2026-09", "2026-07");

    expect(result.get("cat-save")).toBe(5500);
  });

  it("resets overspent months to zero instead of carrying a negative balance", () => {
    const budgets = [
      createBudget({ id: "b-1", month_id: "2026-07", category_id: "cat-food", allocated: 1000 }),
      createBudget({ id: "b-2", month_id: "2026-08", category_id: "cat-food", allocated: 1000 }),
    ];
    const transactions = [
      createTransaction({ id: "t-1", date: "2026-07-20", category_id: "cat-food", amount: 4000 }),
      createTransaction({ id: "t-2", date: "2026-08-10", category_id: "cat-food", amount: 300 }),
    ];

    const result = computeCarryoverByCategory(budgets, transactions, "2026-09", "2026-07");

    expect(result.get("cat-food")).toBe(700);
  });

  it("returns no carryover for the rollover start month or earlier", () => {
    const budgets = [
      createBudget({ id: "b-1", month_id: "2026-06", category_id: "cat-food", allocated: 9999 }),
    ];

    expect(computeCarryoverByCategory(budgets, [], "2026-07", "2026-07").size).toBe(0);
    expect(computeCarryoverByCategory(budgets, [], "2026-06", "2026-07").size).toBe(0);
  });

  it("ignores months outside the rollover window", () => {
    const budgets = [
      createBudget({ id: "b-1", month_id: "2026-05", category_id: "cat-food", allocated: 8000 }),
      createBudget({ id: "b-2", month_id: "2026-07", category_id: "cat-food", allocated: 1000 }),
      createBudget({ id: "b-3", month_id: "2026-09", category_id: "cat-food", allocated: 8000 }),
    ];
    const transactions = [
      createTransaction({ id: "t-1", date: "2026-07-05", category_id: "cat-food", amount: 400 }),
    ];

    const result = computeCarryoverByCategory(budgets, transactions, "2026-08", "2026-07");

    expect(result.get("cat-food")).toBe(600);
  });
});

describe("computeDashboardData with carryover", () => {
  it("adds carryover to remaining and suppresses the missing-budget warning", () => {
    const groups = [createGroup({ id: "group-personal", name: "personal", sort_order: 10 })];
    const categories = [
      createCategory({ id: "cat-save", category_group_id: "group-personal", name: "save", sort_order: 10 }),
    ];
    const paymentMethods = [createPaymentMethod({ id: "pm-cash", name: "cash", sort_order: 10 })];
    const budgets = [createBudget({ id: "budget-save", category_id: "cat-save", allocated: 0 })];
    const transactions = [
      createTransaction({ id: "tx-1", category_id: "cat-save", payment_method_id: "pm-cash", amount: 800 }),
    ];

    const result = computeDashboardData({
      groups,
      categories,
      paymentMethods,
      budgets,
      transactions,
      income: null,
      carryoverByCategory: new Map([["cat-save", 2000]]),
    });

    expect(result.budgetRows[0]).toMatchObject({
      allocated: 0,
      carryover: 2000,
      spent: 800,
      remaining: 1200,
      warning: null,
    });
  });
});

describe("computeReportData", () => {
  it("computes summary, trend, breakdowns, group details, and payment method totals", () => {
    const groups = [
      createGroup({ id: "group-personal", name: "個人", sort_order: 10 }),
      createGroup({ id: "group-home", name: "家庭", sort_order: 20 }),
    ];

    const categories = [
      createCategory({ id: "cat-food", category_group_id: "group-personal", name: "飲食", sort_order: 10 }),
      createCategory({ id: "cat-coffee", category_group_id: "group-personal", name: "咖啡", sort_order: 20 }),
      createCategory({ id: "cat-rent", category_group_id: "group-home", name: "房租", sort_order: 10 }),
    ];

    const budgets = [
      createBudget({ id: "budget-food", category_id: "cat-food", allocated: 1000 }),
      createBudget({ id: "budget-coffee", category_id: "cat-coffee", allocated: 500 }),
      createBudget({ id: "budget-rent", category_id: "cat-rent", allocated: 12000 }),
    ];

    const paymentMethods = [
      createPaymentMethod({ id: "pm-cash", name: "現金", sort_order: 10 }),
      createPaymentMethod({ id: "pm-card", name: "信用卡", sort_order: 20 }),
    ];

    const transactions = [
      createTransaction({ id: "tx-food-1", category_id: "cat-food", payment_method_id: "pm-cash", amount: 300 }),
      createTransaction({ id: "tx-food-2", category_id: "cat-food", payment_method_id: "pm-card", amount: 200 }),
      createTransaction({ id: "tx-coffee", category_id: "cat-coffee", payment_method_id: "pm-card", amount: 150 }),
      createTransaction({ id: "tx-rent", category_id: "cat-rent", payment_method_id: "pm-card", amount: 12000 }),
    ];

    const result = computeReportData(
      {
        groups,
        categories,
        paymentMethods,
        budgets,
        transactions,
        incomes: [
          {
            id: "income-1",
            user_id: userId,
            month_id: "2026-04",
            amount: 20000,
          },
        ],
      },
      [
        createTransaction({
          id: "prev-food",
          date: "2026-03-20",
          category_id: "cat-food",
          payment_method_id: "pm-cash",
          amount: 250,
        }),
        createTransaction({
          id: "prev-rent",
          date: "2026-03-05",
          category_id: "cat-rent",
          payment_method_id: "pm-card",
          amount: 12000,
        }),
      ],
    );

    expect(result.period.mode).toBe("month");
    expect(result.summary).toEqual({
      income: 20000,
      allocated: 13500,
      spent: 12650,
      unallocated: 6500,
      remainingAfterSpending: 7350,
      transactionCount: 4,
      overspentCount: 0,
      previousSpent: 12250,
      deltaSpent: 400,
    });
    expect(result.categoryGroups).toEqual([
      {
        id: "group-personal",
        name: "個人",
        allocated: 1500,
        spent: 650,
        remaining: 850,
        transactionCount: 3,
        previousSpent: 250,
        deltaSpent: 400,
      },
      {
        id: "group-home",
        name: "家庭",
        allocated: 12000,
        spent: 12000,
        remaining: 0,
        transactionCount: 1,
        previousSpent: 12000,
        deltaSpent: 0,
      },
    ]);
    expect(result.groupDetails).toHaveLength(2);
    expect(result.categories[0]).toEqual({
      id: "cat-rent",
      name: "房租",
      groupName: "家庭",
      allocated: 12000,
      spent: 12000,
      remaining: 0,
      transactionCount: 1,
      previousSpent: 12000,
      deltaSpent: 0,
    });
    expect(result.paymentMethods).toEqual([
      {
        id: "pm-card",
        name: "信用卡",
        spent: 12350,
        transactionCount: 3,
        previousSpent: 12000,
        deltaSpent: 350,
        share: 12350 / 12650,
      },
      {
        id: "pm-cash",
        name: "現金",
        spent: 300,
        transactionCount: 1,
        previousSpent: 250,
        deltaSpent: 50,
        share: 300 / 12650,
      },
    ]);
    expect(result.trend).toEqual([
      {
        monthId: "2026-04",
        label: "2026 年 4 月",
        income: 20000,
        allocated: 13500,
        spent: 12650,
        unallocated: 6500,
      },
    ]);
    expect(result.recentTransactions).toHaveLength(4);
  });

  it("uses an exclusive end date for the selected report range", () => {
    expect(getReportRangeBounds("2026-04", "2026-04")).toEqual({
      start: "2026-04-01",
      end: "2026-05-01",
    });

    expect(getReportRangeBounds("2026-04", "2026-05")).toEqual({
      start: "2026-04-01",
      end: "2026-06-01",
    });
  });

  it("aggregates multi-month category budgets without duplicating spent totals", () => {
    const groups = [createGroup({ id: "group-personal", name: "個人", sort_order: 10 })];
    const categories = [
      createCategory({ id: "cat-food", category_group_id: "group-personal", name: "飲食", sort_order: 10 }),
    ];
    const paymentMethods = [createPaymentMethod({ id: "pm-cash", name: "現金", sort_order: 10 })];
    const budgets = [
      createBudget({ id: "budget-food-apr", month_id: "2026-04", category_id: "cat-food", allocated: 1000 }),
      createBudget({ id: "budget-food-may", month_id: "2026-05", category_id: "cat-food", allocated: 1500 }),
    ];
    const transactions = [
      createTransaction({
        id: "tx-food-apr",
        date: "2026-04-10",
        category_id: "cat-food",
        payment_method_id: "pm-cash",
        amount: 300,
      }),
      createTransaction({
        id: "tx-food-may",
        date: "2026-05-10",
        category_id: "cat-food",
        payment_method_id: "pm-cash",
        amount: 700,
      }),
    ];

    const result = computeReportData(
      {
        groups,
        categories,
        paymentMethods,
        budgets,
        transactions,
        incomes: [],
      },
      [],
      {
        mode: "range",
        startMonthId: "2026-04",
        endMonthId: "2026-05",
        monthCount: 2,
        previousStartMonthId: "2026-02",
        previousEndMonthId: "2026-03",
      },
    );

    expect(result.summary.allocated).toBe(2500);
    expect(result.summary.spent).toBe(1000);
    expect(result.categoryGroups[0]).toMatchObject({
      allocated: 2500,
      spent: 1000,
      remaining: 1500,
      transactionCount: 2,
    });
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0]).toMatchObject({
      allocated: 2500,
      spent: 1000,
      remaining: 1500,
      transactionCount: 2,
    });
  });
});
