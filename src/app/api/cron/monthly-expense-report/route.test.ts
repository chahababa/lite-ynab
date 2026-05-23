import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchMonthlyExpenseReport: vi.fn(),
  saveMonthlyReportToNotion: vi.fn(),
  sendMonthlyReportToTelegram: vi.fn(),
  getPreviousMonthIdInTaipei: vi.fn(),
}));

vi.mock("@/lib/monthlyExpenseReportServer", () => ({
  fetchMonthlyExpenseReport: mocks.fetchMonthlyExpenseReport,
}));

vi.mock("@/lib/notionMonthlyReports", () => ({
  saveMonthlyReportToNotion: mocks.saveMonthlyReportToNotion,
}));

vi.mock("@/lib/telegramNotify", () => ({
  sendMonthlyReportToTelegram: mocks.sendMonthlyReportToTelegram,
}));

vi.mock("@/lib/monthlyExpenseReport", () => ({
  getPreviousMonthIdInTaipei: mocks.getPreviousMonthIdInTaipei,
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

describe("GET /api/cron/monthly-expense-report", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.fetchMonthlyExpenseReport.mockReset();
    mocks.saveMonthlyReportToNotion.mockReset();
    mocks.sendMonthlyReportToTelegram.mockReset();
    mocks.getPreviousMonthIdInTaipei.mockReset();
    process.env.CRON_SECRET = "secret";

    mocks.getPreviousMonthIdInTaipei.mockReturnValue("2026-04");
    mocks.fetchMonthlyExpenseReport.mockResolvedValue(sampleReport);
    mocks.sendMonthlyReportToTelegram.mockResolvedValue({ ok: true, result: { message_id: 123 } });
    mocks.saveMonthlyReportToNotion.mockResolvedValue({ id: "notion-page", url: "https://notion.test/page" });
  });

  it("keeps the existing side-effecting response shape by default", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://lite-ynab.test/api/cron/monthly-expense-report?monthId=2026-04", {
        headers: { Authorization: "Bearer secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      result: {
        monthId: "2026-04",
        notionPageId: "notion-page",
        notionUrl: "https://notion.test/page",
        telegramMessageId: 123,
      },
    });
    expect(mocks.sendMonthlyReportToTelegram).toHaveBeenCalledWith(sampleReport);
    expect(mocks.saveMonthlyReportToNotion).toHaveBeenCalledWith(sampleReport, { telegramSent: true });
  });

  it("returns the report without Telegram or Notion side effects when dryRun and includeReport are enabled", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://lite-ynab.test/api/cron/monthly-expense-report?monthId=2026-04&includeReport=1&dryRun=1", {
        headers: { Authorization: "Bearer secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      result: {
        monthId: "2026-04",
        dryRun: true,
        report: sampleReport,
      },
    });
    expect(mocks.fetchMonthlyExpenseReport).toHaveBeenCalledWith(undefined, "2026-04");
    expect(mocks.sendMonthlyReportToTelegram).not.toHaveBeenCalled();
    expect(mocks.saveMonthlyReportToNotion).not.toHaveBeenCalled();
  });

  it("can include the report while preserving Telegram and Notion side effects", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://lite-ynab.test/api/cron/monthly-expense-report?monthId=2026-04&includeReport=1", {
        headers: { Authorization: "Bearer secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      result: {
        monthId: "2026-04",
        notionPageId: "notion-page",
        notionUrl: "https://notion.test/page",
        telegramMessageId: 123,
        report: sampleReport,
      },
    });
    expect(mocks.sendMonthlyReportToTelegram).toHaveBeenCalledWith(sampleReport);
    expect(mocks.saveMonthlyReportToNotion).toHaveBeenCalledWith(sampleReport, { telegramSent: true });
  });
});
