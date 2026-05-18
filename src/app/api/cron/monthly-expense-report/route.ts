import { NextResponse } from "next/server";

import { fetchMonthlyExpenseReport } from "@/lib/monthlyExpenseReportServer";
import { saveMonthlyReportToNotion } from "@/lib/notionMonthlyReports";
import { sendMonthlyReportToTelegram } from "@/lib/telegramNotify";
import { getPreviousMonthIdInTaipei } from "@/lib/monthlyExpenseReport";

export const runtime = "nodejs";

type MonthlyExpenseReportCronResult = {
  monthId: string;
  notionPageId: string;
  notionUrl?: string;
  telegramMessageId?: number;
};

function getMonthId(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("monthId") ?? getPreviousMonthIdInTaipei();
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  return token === secret;
}

async function runMonthlyExpenseReport(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const monthId = getMonthId(request);
    const report = await fetchMonthlyExpenseReport(undefined, monthId);
    const telegram = await sendMonthlyReportToTelegram(report);
    const notionPage = await saveMonthlyReportToNotion(report, { telegramSent: telegram.ok });

    return NextResponse.json({
      ok: true,
      result: {
        monthId: report.monthId,
        notionPageId: notionPage.id,
        notionUrl: notionPage.url,
        telegramMessageId: telegram.result?.message_id,
      } satisfies MonthlyExpenseReportCronResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Monthly expense report failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return runMonthlyExpenseReport(request);
}

export async function POST(request: Request) {
  return runMonthlyExpenseReport(request);
}
