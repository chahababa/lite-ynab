import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchMonthlyExpenseReport: vi.fn(),
  findExistingMonthlyReportPage: vi.fn(),
  saveMonthlyReportToNotion: vi.fn(),
  updateMonthlyReportTelegramStatus: vi.fn(),
  sendMonthlyReportToTelegram: vi.fn(),
  getPreviousMonthIdInTaipei: vi.fn(),
}));

vi.mock("@/lib/monthlyExpenseReportServer", () => ({
  fetchMonthlyExpenseReport: mocks.fetchMonthlyExpenseReport,
}));

vi.mock("@/lib/notionMonthlyReports", () => ({
  findExistingMonthlyReportPage: mocks.findExistingMonthlyReportPage,
  saveMonthlyReportToNotion: mocks.saveMonthlyReportToNotion,
  updateMonthlyReportTelegramStatus: mocks.updateMonthlyReportTelegramStatus,
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
    mocks.findExistingMonthlyReportPage.mockReset();
    mocks.saveMonthlyReportToNotion.mockReset();
    mocks.updateMonthlyReportTelegramStatus.mockReset();
    mocks.sendMonthlyReportToTelegram.mockReset();
    mocks.getPreviousMonthIdInTaipei.mockReset();
    process.env.CRON_SECRET = "secret";
    process.env.LITEYNAB_USER_ID = "user-1";

    mocks.getPreviousMonthIdInTaipei.mockReturnValue("2026-04");
    mocks.fetchMonthlyExpenseReport.mockResolvedValue(sampleReport);
    mocks.findExistingMonthlyReportPage.mockResolvedValue(null);
    mocks.sendMonthlyReportToTelegram.mockResolvedValue({ ok: true, result: { message_id: 123 } });
    mocks.saveMonthlyReportToNotion.mockResolvedValue({ id: "notion-page", url: "https://notion.test/page" });
    mocks.updateMonthlyReportTelegramStatus.mockResolvedValue({ id: "notion-page", url: "https://notion.test/page" });
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
    expect(mocks.fetchMonthlyExpenseReport).toHaveBeenCalledWith(undefined, "2026-04", { userId: "user-1" });
    expect(mocks.findExistingMonthlyReportPage).toHaveBeenCalledWith("2026-04");
    expect(mocks.saveMonthlyReportToNotion).toHaveBeenCalledTimes(1);
    expect(mocks.saveMonthlyReportToNotion).toHaveBeenCalledWith(sampleReport, { telegramSent: false });
    expect(mocks.sendMonthlyReportToTelegram).toHaveBeenCalledWith(sampleReport);
    expect(mocks.updateMonthlyReportTelegramStatus).toHaveBeenCalledWith("notion-page", sampleReport, true);
    expect(mocks.saveMonthlyReportToNotion.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sendMonthlyReportToTelegram.mock.invocationCallOrder[0],
    );
  });

  it("returns the report without Telegram or Notion side effects when dryRun and includeReport are enabled", async () => {
    delete process.env.LITEYNAB_USER_ID;
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
    expect(mocks.fetchMonthlyExpenseReport).toHaveBeenCalledWith(undefined, "2026-04", { userId: undefined });
    expect(mocks.sendMonthlyReportToTelegram).not.toHaveBeenCalled();
    expect(mocks.saveMonthlyReportToNotion).not.toHaveBeenCalled();
  });

  it("rejects side-effecting runs without explicit tenant scope", async () => {
    delete process.env.LITEYNAB_USER_ID;
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://lite-ynab.test/api/cron/monthly-expense-report?monthId=2026-04", {
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
    expect(mocks.saveMonthlyReportToNotion).not.toHaveBeenCalled();
  });

  it("rejects invalid monthId before fetching report data", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://lite-ynab.test/api/cron/monthly-expense-report?monthId=2026-13", {
        headers: { Authorization: "Bearer secret" },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "Invalid monthId: 2026-13" });
    expect(mocks.fetchMonthlyExpenseReport).not.toHaveBeenCalled();
  });

  it("uses timing-safe bearer auth and rejects malformed tokens", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://lite-ynab.test/api/cron/monthly-expense-report?monthId=2026-04", {
        headers: { Authorization: "Bearer nope" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.fetchMonthlyExpenseReport).not.toHaveBeenCalled();
  });

  it("skips Notion update and Telegram when a sent monthly report already exists", async () => {
    mocks.findExistingMonthlyReportPage.mockResolvedValue({
      id: "existing-page",
      url: "https://notion.test/existing",
      telegramSent: true,
    });
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
        notionPageId: "existing-page",
        notionUrl: "https://notion.test/existing",
        idempotentSkip: true,
        report: sampleReport,
      },
    });
    expect(mocks.saveMonthlyReportToNotion).not.toHaveBeenCalled();
    expect(mocks.sendMonthlyReportToTelegram).not.toHaveBeenCalled();
    expect(mocks.updateMonthlyReportTelegramStatus).not.toHaveBeenCalled();
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
    expect(mocks.saveMonthlyReportToNotion).toHaveBeenCalledTimes(1);
    expect(mocks.saveMonthlyReportToNotion).toHaveBeenCalledWith(sampleReport, { telegramSent: false });
    expect(mocks.sendMonthlyReportToTelegram).toHaveBeenCalledWith(sampleReport);
    expect(mocks.updateMonthlyReportTelegramStatus).toHaveBeenCalledWith("notion-page", sampleReport, true);
    expect(mocks.saveMonthlyReportToNotion.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sendMonthlyReportToTelegram.mock.invocationCallOrder[0],
    );
  });

  it("returns non-success for cron monitoring when Telegram send fails", async () => {
    mocks.sendMonthlyReportToTelegram.mockRejectedValue(new TypeError("fetch failed"));
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://lite-ynab.test/api/cron/monthly-expense-report?monthId=2026-04", {
        headers: { Authorization: "Bearer secret" },
      }),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      ok: false,
      error: "fetch failed",
      result: {
        monthId: "2026-04",
        notionPageId: "notion-page",
        notionUrl: "https://notion.test/page",
        telegramError: "fetch failed",
      },
    });
    expect(mocks.saveMonthlyReportToNotion).toHaveBeenCalledWith(sampleReport, { telegramSent: false });
    expect(mocks.sendMonthlyReportToTelegram).toHaveBeenCalledWith(sampleReport);
  });

  it("returns 500 when the post-Telegram Notion status update fails", async () => {
    mocks.updateMonthlyReportTelegramStatus.mockRejectedValueOnce(new Error("Notion update failed"));
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://lite-ynab.test/api/cron/monthly-expense-report?monthId=2026-04", {
        headers: { Authorization: "Bearer secret" },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "Notion update failed" });
    expect(mocks.sendMonthlyReportToTelegram).toHaveBeenCalledWith(sampleReport);
  });
});
