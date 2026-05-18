import { formatMonthlyExpenseReportForTelegram, type MonthlyExpenseReport } from "./monthlyExpenseReport";

export async function sendMonthlyReportToTelegram(report: MonthlyExpenseReport) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
  }

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
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram monthly report send failed: ${response.status} ${body}`);
  }

  return (await response.json()) as { ok: boolean; result?: { message_id: number } };
}
