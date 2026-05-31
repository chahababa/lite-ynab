import { NextResponse } from "next/server";

import { fetchMonthlyExpenseReport } from "@/lib/monthlyExpenseReportServer";
import { saveMonthlyReportToNotion, updateMonthlyReportTelegramStatus } from "@/lib/notionMonthlyReports";
import { sendMonthlyReportToTelegram } from "@/lib/telegramNotify";
import { getPreviousMonthIdInTaipei } from "@/lib/monthlyExpenseReport";

export const runtime = "nodejs";

type MonthlyExpenseReportCronResult = {
  monthId: string;
  notionPageId?: string;
  notionUrl?: string;
  telegramMessageId?: number;
  telegramError?: string;
  dryRun?: boolean;
  report?: Awaited<ReturnType<typeof fetchMonthlyExpenseReport>>;
};

function getMonthId(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("monthId") ?? getPreviousMonthIdInTaipei();
}

function getBooleanSearchParam(request: Request, name: string) {
  const value = new URL(request.url).searchParams.get(name);
  return value === "1" || value === "true";
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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function runMonthlyExpenseReport(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const monthId = getMonthId(request);
    const includeReport = getBooleanSearchParam(request, "includeReport");
    const dryRun = getBooleanSearchParam(request, "dryRun");
    const report = await fetchMonthlyExpenseReport(undefined, monthId);

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        result: {
          monthId: report.monthId,
          dryRun: true,
          ...(includeReport ? { report } : {}),
        } satisfies MonthlyExpenseReportCronResult,
      });
    }

    const initialNotionPage = await saveMonthlyReportToNotion(report, { telegramSent: false });
    let telegram: Awaited<ReturnType<typeof sendMonthlyReportToTelegram>>;

    try {
      telegram = await sendMonthlyReportToTelegram(report);
    } catch (telegramError) {
      return NextResponse.json({
        ok: true,
        result: {
          monthId: report.monthId,
          notionPageId: initialNotionPage.id,
          notionUrl: initialNotionPage.url,
          telegramError: getErrorMessage(telegramError, "Telegram monthly report send failed"),
          ...(includeReport ? { report } : {}),
        } satisfies MonthlyExpenseReportCronResult,
      });
    }

    const finalNotionPage = await updateMonthlyReportTelegramStatus(initialNotionPage.id, report, telegram.ok);

    return NextResponse.json({
      ok: true,
      result: {
        monthId: report.monthId,
        notionPageId: finalNotionPage.id,
        notionUrl: finalNotionPage.url,
        telegramMessageId: telegram.result?.message_id,
        ...(includeReport ? { report } : {}),
      } satisfies MonthlyExpenseReportCronResult,
    });
  } catch (error) {
    const message = getErrorMessage(error, "Monthly expense report failed");
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return runMonthlyExpenseReport(request);
}

export async function POST(request: Request) {
  return runMonthlyExpenseReport(request);
}
