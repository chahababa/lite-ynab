import { describe, expect, it, vi } from "vitest";

import {
  buildGoogleSheetsMonthlyExportTables,
  syncMonthlyReportToGoogleSheets,
  type GoogleSheetsTransport,
} from "./googleSheetsMonthlyExport";
import type { MonthlyExpenseReport } from "./monthlyExpenseReport";

const sampleReport: MonthlyExpenseReport = {
  monthId: "2026-04",
  monthLabel: "2026 年 4 月",
  generatedAt: "2026-05-01T00:10:00+08:00",
  totalSpent: 29000,
  totalBudget: 30000,
  remaining: 1000,
  status: { kind: "remaining", amount: 1000 },
  transactionCount: 8,
  groupBreakdown: [
    {
      id: "group-family",
      name: "家庭",
      budget: 16000,
      spent: 17200,
      remaining: -1200,
      transactionCount: 4,
      share: 17200 / 29000,
      usageRate: 17200 / 16000,
    },
  ],
  categoryBreakdown: [
    {
      id: "cat-rent",
      name: "房租",
      groupName: "家庭",
      budget: 12000,
      spent: 12000,
      remaining: 0,
      transactionCount: 1,
      share: 12000 / 29000,
      usageRate: 1,
    },
    {
      id: "cat-food",
      name: "飲食",
      groupName: "家庭",
      budget: 4000,
      spent: 5200,
      remaining: -1200,
      transactionCount: 3,
      share: 5200 / 29000,
      usageRate: 1.3,
    },
  ],
  topExpenses: [
    {
      id: "tx-1",
      date: "2026-04-03",
      title: "房租",
      amount: 12000,
      categoryName: "房租",
      groupName: "家庭",
      paymentMethodName: "信用卡",
    },
  ],
  overspentAlerts: [
    {
      id: "cat-food",
      name: "飲食",
      groupName: "家庭",
      budget: 4000,
      spent: 5200,
      overspent: 1200,
      usageRate: 1.3,
    },
  ],
  highUsageAlerts: [],
};

describe("buildGoogleSheetsMonthlyExportTables", () => {
  it("maps a monthly report into stable Sheets headers and rows", () => {
    const tables = buildGoogleSheetsMonthlyExportTables(sampleReport, { exportedAt: "2026-05-01T00:15:00+08:00" });

    expect(tables.monthlySummary.headers).toEqual([
      "monthId",
      "monthLabel",
      "generatedAt",
      "totalBudget",
      "totalSpent",
      "remaining",
      "statusKind",
      "statusAmount",
      "transactionCount",
      "overspentAlertCount",
      "highUsageAlertCount",
      "topExpenseSummary",
    ]);
    expect(tables.monthlySummary.rows).toEqual([
      [
        "2026-04",
        "2026 年 4 月",
        "2026-05-01T00:10:00+08:00",
        30000,
        29000,
        1000,
        "remaining",
        1000,
        8,
        1,
        0,
        "房租 NT$12,000",
      ],
    ]);
    expect(tables.categoryBreakdown.rows).toEqual([
      ["2026-04", "cat-rent", "房租", "家庭", 12000, 12000, 0, 1, 12000 / 29000, 1, "2026-05-01T00:10:00+08:00"],
      ["2026-04", "cat-food", "飲食", "家庭", 4000, 5200, -1200, 3, 5200 / 29000, 1.3, "2026-05-01T00:10:00+08:00"],
    ]);
    expect(tables.transactions.rows).toEqual([
      ["2026-04", "2026-04-03", "房租", "家庭", "房租", "信用卡", 12000, "tx-1", "2026-05-01T00:10:00+08:00"],
    ]);
    expect(tables.exportLog.rows).toEqual([
      ["2026-05-01T00:15:00+08:00", "2026-04", "success", "monthly-report", 1, 2, 1, ""],
    ]);
  });
});

describe("syncMonthlyReportToGoogleSheets", () => {
  it("rewrites sheet tabs while preserving rows for other months and replacing the target month", async () => {
    const transport: GoogleSheetsTransport = {
      getValues: vi.fn(async (_spreadsheetId, range) => {
        if (range === "Monthly Summary!A2:L") {
          return [
            ["2026-03", "old March"],
            ["2026-04", "old April"],
          ];
        }
        if (range === "Category Breakdown!A2:K") {
          return [
            ["2026-03", "cat-old"],
            ["2026-04", "cat-stale"],
          ];
        }
        if (range === "Transactions!A2:I") {
          return [
            ["2026-03", "tx-old"],
            ["2026-04", "tx-stale"],
          ];
        }
        return [];
      }),
      clearValues: vi.fn(async () => undefined),
      updateValues: vi.fn(async () => undefined),
      appendValues: vi.fn(async () => undefined),
    };

    const result = await syncMonthlyReportToGoogleSheets(sampleReport, {
      spreadsheetId: "sheet-1",
      exportedAt: "2026-05-01T00:15:00+08:00",
      transport,
    });

    expect(result).toEqual({
      spreadsheetId: "sheet-1",
      monthId: "2026-04",
      rows: {
        monthlySummary: 1,
        categoryBreakdown: 2,
        transactions: 1,
        exportLog: 1,
      },
    });

    expect(transport.clearValues).toHaveBeenCalledWith("sheet-1", "Monthly Summary!A1:L");
    expect(transport.updateValues).toHaveBeenCalledWith(
      "sheet-1",
      "Monthly Summary!A1:L3",
      expect.arrayContaining([
        expect.arrayContaining(["monthId", "monthLabel"]),
        ["2026-03", "old March"],
        expect.arrayContaining(["2026-04", "2026 年 4 月"]),
      ]),
    );
    expect(transport.updateValues).toHaveBeenCalledWith(
      "sheet-1",
      "Category Breakdown!A1:K4",
      expect.arrayContaining([
        expect.arrayContaining(["monthId", "categoryId"]),
        ["2026-03", "cat-old"],
        expect.arrayContaining(["2026-04", "cat-rent"]),
        expect.arrayContaining(["2026-04", "cat-food"]),
      ]),
    );
    expect(transport.appendValues).toHaveBeenCalledWith(
      "sheet-1",
      "Export Log!A:H",
      [["2026-05-01T00:15:00+08:00", "2026-04", "success", "monthly-report", 1, 2, 1, ""]],
    );
  });
});
