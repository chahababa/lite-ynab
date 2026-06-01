import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendMonthlyReportToTelegram } from "./telegramNotify";
import type { MonthlyExpenseReport } from "./monthlyExpenseReport";

const sampleReport: MonthlyExpenseReport = {
  monthId: "2026-05",
  monthLabel: "2026 年 5 月",
  generatedAt: "2026-06-01T08:11:15+08:00",
  totalSpent: 82450,
  totalBudget: 100000,
  remaining: 17550,
  status: { kind: "remaining", amount: 17550 },
  transactionCount: 51,
  groupBreakdown: [],
  categoryBreakdown: [],
  topExpenses: [],
  overspentAlerts: [],
  highUsageAlerts: [],
};

function okTelegramResponse(messageId: number) {
  return new Response(JSON.stringify({ ok: true, result: { message_id: messageId } }), { status: 200 });
}

describe("sendMonthlyReportToTelegram", () => {
  beforeEach(() => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "1234567890");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("retries transient Telegram fetch failures before succeeding", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(okTelegramResponse(172));
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = sendMonthlyReportToTelegram(sampleReport, { retryDelaysMs: [10] });
    await vi.advanceTimersByTimeAsync(10);

    await expect(resultPromise).resolves.toEqual({ ok: true, result: { message_id: 172 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses AbortSignal timeout for each Telegram send attempt", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okTelegramResponse(173));
    vi.stubGlobal("fetch", fetchMock);

    await sendMonthlyReportToTelegram(sampleReport, { timeoutMs: 1234, retryDelaysMs: [] });

    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
