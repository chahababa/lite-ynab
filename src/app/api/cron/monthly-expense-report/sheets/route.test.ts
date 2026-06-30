import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchMonthlyExpenseReport: vi.fn(),
  getPreviousMonthIdInTaipei: vi.fn(),
  syncMonthlyReportToGoogleSheets: vi.fn(),
  buildGoogleSheetsMonthlyExportTables: vi.fn(),
}));

vi.mock("@/lib/monthlyExpenseReportServer", () => ({
  fetchMonthlyExpenseReport: mocks.fetchMonthlyExpenseReport,
}));

vi.mock("@/lib/monthlyExpenseReport", () => ({
  getPreviousMonthIdInTaipei: mocks.getPreviousMonthIdInTaipei,
}));

vi.mock("@/lib/googleSheetsMonthlyExport", () => ({
  syncMonthlyReportToGoogleSheets: mocks.syncMonthlyReportToGoogleSheets,
  buildGoogleSheetsMonthlyExportTables: mocks.buildGoogleSheetsMonthlyExportTables,
}));

const sampleReport = {
  monthId: "2026-04",
  monthLabel: "2026 年 4 月",
  generatedAt: "2026-05-01T00:10:00+08:00",
  totalSpent: 12000,
  totalBudget: 20000,
  remaining: 8000,
  status: { kind: "remaining", amount: 8000 },
  transactionCount: 3,
  groupBreakdown: [],
  categoryBreakdown: [],
  topExpenses: [],
  overspentAlerts: [],
  highUsageAlerts: [],
};

describe("GET /api/cron/monthly-expense-report/sheets", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.fetchMonthlyExpenseReport.mockReset();
    mocks.getPreviousMonthIdInTaipei.mockReset();
    mocks.syncMonthlyReportToGoogleSheets.mockReset();
    mocks.buildGoogleSheetsMonthlyExportTables.mockReset();
    process.env.CRON_SECRET = "secret";
    process.env.LITEYNAB_USER_ID = "user-1";
    delete process.env.GOOGLE_SHEET_ID;

    mocks.getPreviousMonthIdInTaipei.mockReturnValue("2026-04");
    mocks.fetchMonthlyExpenseReport.mockResolvedValue(sampleReport);
    mocks.syncMonthlyReportToGoogleSheets.mockResolvedValue({
      spreadsheetId: "sheet-1",
      monthId: "2026-04",
      rows: {
        monthlySummary: 1,
        categoryBreakdown: 0,
        transactions: 0,
        exportLog: 1,
      },
    });
    mocks.buildGoogleSheetsMonthlyExportTables.mockReturnValue({ monthlySummary: { rows: [["preview"]] } });
  });

  it("requires the cron bearer token", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("https://lite-ynab.test/api/cron/monthly-expense-report/sheets"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.fetchMonthlyExpenseReport).not.toHaveBeenCalled();
  });

  it("syncs the selected month to the configured Google Sheet", async () => {
    process.env.GOOGLE_SHEET_ID = "sheet-1";
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://lite-ynab.test/api/cron/monthly-expense-report/sheets?monthId=2026-04", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      result: {
        spreadsheetId: "sheet-1",
        monthId: "2026-04",
        rows: {
          monthlySummary: 1,
          categoryBreakdown: 0,
          transactions: 0,
          exportLog: 1,
        },
      },
    });
    expect(mocks.fetchMonthlyExpenseReport).toHaveBeenCalledWith(undefined, "2026-04", { userId: "user-1" });
    expect(mocks.syncMonthlyReportToGoogleSheets).toHaveBeenCalledWith(sampleReport, { spreadsheetId: "sheet-1" });
  });

  it("rejects invalid monthId before fetching report data", async () => {
    process.env.GOOGLE_SHEET_ID = "sheet-1";
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://lite-ynab.test/api/cron/monthly-expense-report/sheets?monthId=2026-00", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "Invalid monthId: 2026-00" });
    expect(mocks.fetchMonthlyExpenseReport).not.toHaveBeenCalled();
    expect(mocks.syncMonthlyReportToGoogleSheets).not.toHaveBeenCalled();
  });

  it("rejects side-effecting syncs without explicit tenant scope", async () => {
    process.env.GOOGLE_SHEET_ID = "sheet-1";
    delete process.env.LITEYNAB_USER_ID;
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://lite-ynab.test/api/cron/monthly-expense-report/sheets?monthId=2026-04", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Missing LITEYNAB_USER_ID; non-dry-run monthly report requires explicit tenant scope",
    });
    expect(mocks.fetchMonthlyExpenseReport).not.toHaveBeenCalled();
    expect(mocks.syncMonthlyReportToGoogleSheets).not.toHaveBeenCalled();
  });

  it("rejects malformed bearer tokens", async () => {
    process.env.GOOGLE_SHEET_ID = "sheet-1";
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://lite-ynab.test/api/cron/monthly-expense-report/sheets?monthId=2026-04", {
        headers: { Authorization: "Bearer nope" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.fetchMonthlyExpenseReport).not.toHaveBeenCalled();
  });

  it("supports dryRun preview without writing to Google Sheets", async () => {
    process.env.GOOGLE_SHEET_ID = "sheet-1";
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://lite-ynab.test/api/cron/monthly-expense-report/sheets?dryRun=1&includeTables=1", {
        headers: { Authorization: "Bearer secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      result: {
        spreadsheetId: "sheet-1",
        monthId: "2026-04",
        dryRun: true,
        tables: { monthlySummary: { rows: [["preview"]] } },
      },
    });
    expect(mocks.buildGoogleSheetsMonthlyExportTables).toHaveBeenCalledWith(sampleReport);
    expect(mocks.syncMonthlyReportToGoogleSheets).not.toHaveBeenCalled();
  });
});
