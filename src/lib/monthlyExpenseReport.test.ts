import { describe, expect, it } from "vitest";

import {
  buildMonthlyExpenseReport,
  formatMonthlyExpenseReportForTelegram,
  getPreviousMonthIdInTaipei,
} from "./monthlyExpenseReport";
import type { ReportData } from "./types";

const baseReportData: ReportData = {
  period: {
    mode: "month",
    startMonthId: "2026-04",
    endMonthId: "2026-04",
    monthCount: 1,
    previousStartMonthId: "2026-03",
    previousEndMonthId: "2026-03",
  },
  summary: {
    income: 0,
    allocated: 30000,
    spent: 29000,
    unallocated: -30000,
    remainingAfterSpending: -29000,
    transactionCount: 8,
    overspentCount: 1,
    previousSpent: 0,
    deltaSpent: 29000,
  },
  categoryGroups: [
    {
      id: "group-family",
      name: "家庭",
      allocated: 16000,
      spent: 17200,
      remaining: -1200,
      transactionCount: 4,
      previousSpent: 0,
      deltaSpent: 17200,
    },
    {
      id: "group-personal",
      name: "個人",
      allocated: 14000,
      spent: 11800,
      remaining: 2200,
      transactionCount: 4,
      previousSpent: 0,
      deltaSpent: 11800,
    },
  ],
  groupDetails: [
    {
      group: {
        id: "group-family",
        name: "家庭",
        allocated: 16000,
        spent: 17200,
        remaining: -1200,
        transactionCount: 4,
        previousSpent: 0,
        deltaSpent: 17200,
      },
      categories: [
        {
          id: "cat-rent",
          name: "房租",
          groupName: "家庭",
          allocated: 12000,
          spent: 12000,
          remaining: 0,
          transactionCount: 1,
          previousSpent: 0,
          deltaSpent: 12000,
        },
        {
          id: "cat-food",
          name: "飲食",
          groupName: "家庭",
          allocated: 4000,
          spent: 5200,
          remaining: -1200,
          transactionCount: 3,
          previousSpent: 0,
          deltaSpent: 5200,
        },
      ],
    },
    {
      group: {
        id: "group-personal",
        name: "個人",
        allocated: 14000,
        spent: 11800,
        remaining: 2200,
        transactionCount: 4,
        previousSpent: 0,
        deltaSpent: 11800,
      },
      categories: [
        {
          id: "cat-guitar",
          name: "吉他",
          groupName: "個人",
          allocated: 10000,
          spent: 9000,
          remaining: 1000,
          transactionCount: 2,
          previousSpent: 0,
          deltaSpent: 9000,
        },
        {
          id: "cat-coffee",
          name: "咖啡",
          groupName: "個人",
          allocated: 4000,
          spent: 2800,
          remaining: 1200,
          transactionCount: 2,
          previousSpent: 0,
          deltaSpent: 2800,
        },
      ],
    },
  ],
  categories: [
    {
      id: "cat-rent",
      name: "房租",
      groupName: "家庭",
      allocated: 12000,
      spent: 12000,
      remaining: 0,
      transactionCount: 1,
      previousSpent: 0,
      deltaSpent: 12000,
    },
    {
      id: "cat-guitar",
      name: "吉他",
      groupName: "個人",
      allocated: 10000,
      spent: 9000,
      remaining: 1000,
      transactionCount: 2,
      previousSpent: 0,
      deltaSpent: 9000,
    },
    {
      id: "cat-food",
      name: "飲食",
      groupName: "家庭",
      allocated: 4000,
      spent: 5200,
      remaining: -1200,
      transactionCount: 3,
      previousSpent: 0,
      deltaSpent: 5200,
    },
    {
      id: "cat-coffee",
      name: "咖啡",
      groupName: "個人",
      allocated: 4000,
      spent: 2800,
      remaining: 1200,
      transactionCount: 2,
      previousSpent: 0,
      deltaSpent: 2800,
    },
  ],
  paymentMethods: [],
  trend: [],
  recentTransactions: [
    {
      id: "tx-1",
      user_id: "user-1",
      date: "2026-04-03",
      amount: 12000,
      category_id: "cat-rent",
      payment_method_id: "pm-card",
      note: "房租",
      categoryGroupName: "家庭",
      categoryName: "房租",
      paymentMethodName: "信用卡",
    },
    {
      id: "tx-2",
      user_id: "user-1",
      date: "2026-04-08",
      amount: 4500,
      category_id: "cat-guitar",
      payment_method_id: "pm-card",
      note: "效果器",
      categoryGroupName: "個人",
      categoryName: "吉他",
      paymentMethodName: "信用卡",
    },
    {
      id: "tx-3",
      user_id: "user-1",
      date: "2026-04-16",
      amount: 3000,
      category_id: "cat-guitar",
      payment_method_id: "pm-card",
      note: "課程",
      categoryGroupName: "個人",
      categoryName: "吉他",
      paymentMethodName: "信用卡",
    },
  ],
};

describe("getPreviousMonthIdInTaipei", () => {
  it("uses Asia/Taipei calendar date before selecting the previous month", () => {
    expect(getPreviousMonthIdInTaipei(new Date("2026-05-31T16:10:00.000Z"))).toBe("2026-05");
  });
});

describe("buildMonthlyExpenseReport", () => {
  it("summarizes totals, ratios, top spend, overspend, and 80 percent warnings", () => {
    const report = buildMonthlyExpenseReport(baseReportData, {
      generatedAt: "2026-05-01T00:10:00+08:00",
    });

    expect(report.monthId).toBe("2026-04");
    expect(report.totalSpent).toBe(29000);
    expect(report.totalBudget).toBe(30000);
    expect(report.remaining).toBe(1000);
    expect(report.transactionCount).toBe(8);
    expect(report.status).toEqual({ kind: "remaining", amount: 1000 });
    expect(report.groupBreakdown).toEqual([
      expect.objectContaining({ name: "家庭", spent: 17200, share: 17200 / 29000 }),
      expect.objectContaining({ name: "個人", spent: 11800, share: 11800 / 29000 }),
    ]);
    expect(report.categoryBreakdown.slice(0, 3)).toEqual([
      expect.objectContaining({ name: "房租", groupName: "家庭", spent: 12000, share: 12000 / 29000 }),
      expect.objectContaining({ name: "吉他", groupName: "個人", spent: 9000, share: 9000 / 29000 }),
      expect.objectContaining({ name: "飲食", groupName: "家庭", spent: 5200, share: 5200 / 29000 }),
    ]);
    expect(report.topExpenses).toEqual([
      expect.objectContaining({ title: "房租", amount: 12000 }),
      expect.objectContaining({ title: "效果器", amount: 4500 }),
      expect.objectContaining({ title: "課程", amount: 3000 }),
    ]);
    expect(report.overspentAlerts).toEqual([
      expect.objectContaining({ name: "飲食", spent: 5200, budget: 4000, overspent: 1200 }),
    ]);
    expect(report.highUsageAlerts).toEqual([
      expect.objectContaining({ name: "房租", usageRate: 1 }),
      expect.objectContaining({ name: "吉他", usageRate: 0.9 }),
    ]);
  });
});

describe("formatMonthlyExpenseReportForTelegram", () => {
  it("renders a concise Traditional Chinese summary for Telegram", () => {
    const report = buildMonthlyExpenseReport(baseReportData, {
      generatedAt: "2026-05-01T00:10:00+08:00",
    });

    expect(formatMonthlyExpenseReportForTelegram(report)).toContain("LiteYNAB 2026-04 月報");
    expect(formatMonthlyExpenseReportForTelegram(report)).toContain("總支出：NT$29,000");
    expect(formatMonthlyExpenseReportForTelegram(report)).toContain("剩餘：NT$1,000");
    expect(formatMonthlyExpenseReportForTelegram(report)).toContain("超支提醒：飲食超支 NT$1,200");
    expect(formatMonthlyExpenseReportForTelegram(report)).toContain("80% 注意：房租 100%、吉他 90%");
  });
});
