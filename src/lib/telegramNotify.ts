import { formatMonthlyExpenseReportForTelegram, type MonthlyExpenseReport } from "./monthlyExpenseReport";

const DEFAULT_TELEGRAM_TIMEOUT_MS = 30_000;
const DEFAULT_TELEGRAM_RETRY_DELAYS_MS = [1_000, 3_000, 7_000];

type SendMonthlyReportToTelegramOptions = {
  timeoutMs?: number;
  retryDelaysMs?: number[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableTelegramError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    error.name === "AbortError" ||
    message.includes("fetch failed") ||
    message.includes("timed out") ||
    message.includes("econnreset") ||
    message.includes("etimedout")
  );
}

export async function sendMonthlyReportToTelegram(
  report: MonthlyExpenseReport,
  options: SendMonthlyReportToTelegramOptions = {},
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
  }

  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_TELEGRAM_RETRY_DELAYS_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TELEGRAM_TIMEOUT_MS;
  const maxAttempts = retryDelaysMs.length + 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: formatMonthlyExpenseReportForTelegram(report),
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Telegram monthly report send failed: ${response.status} ${body}`);
      }

      return (await response.json()) as { ok: boolean; result?: { message_id: number } };
    } catch (error) {
      lastError = error;
      const hasRetryLeft = attempt < retryDelaysMs.length;
      if (!hasRetryLeft || !isRetryableTelegramError(error)) {
        throw error;
      }

      await sleep(retryDelaysMs[attempt]);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Telegram monthly report send failed after retries: ${getErrorMessage(lastError)}`);
}
