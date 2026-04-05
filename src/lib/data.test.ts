import { describe, expect, it } from "vitest";

import { computeDashboardData, computeReportData } from "@/lib/data";
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
        label: "2026年 4月",
        income: 20000,
        allocated: 13500,
        spent: 12650,
        unallocated: 6500,
      },
    ]);
    expect(result.recentTransactions).toHaveLength(4);
  });
});
