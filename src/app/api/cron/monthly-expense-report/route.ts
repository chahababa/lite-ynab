import { NextResponse } from "next/server";

import { isCronAuthorized, isValidMonthId } from "@/lib/cronAuth";
import { fetchMonthlyExpenseReport } from "@/lib/monthlyExpenseReportServer";
import {
  findExistingMonthlyReportPage,
  saveMonthlyReportToNotion,
  updateMonthlyReportTelegramStatus,
} from "@/lib/notionMonthlyReports";
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
  idempotentSkip?: boolean;
  report?: Awaited<ReturnType<typeof fetchMonthlyExpenseReport>>;
};

function getMonthId(request: Request) {
  const url = new URL(request.url);
  const monthId = url.searchParams.get("monthId") ?? getPreviousMonthIdInTaipei();
  return isValidMonthId(monthId) ? { monthId } : { error: `Invalid monthId: ${monthId}` };
}

function getBooleanSearchParam(request: Request, name: string) {
  const value = new URL(request.url).searchParams.get(name);
  return value === "1" || value === "true";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function runMonthlyExpenseReport(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const monthIdResult = getMonthId(request);
    if ("error" in monthIdResult) {
      return NextResponse.json({ ok: false, error: monthIdResult.error }, { status: 400 });
    }

    const { monthId } = monthIdResult;
    const includeReport = getBooleanSearchParam(request, "includeReport");
    const dryRun = getBooleanSearchParam(request, "dryRun");
    const userId = process.env.LITEYNAB_USER_ID?.trim();

    if (!dryRun && !userId) {
      return NextResponse.json(
        { ok: false, error: "Missing LITEYNAB_USER_ID; non-dry-run monthly report requires explicit tenant scope" },
        { status: 400 },
      );
    }

    const report = await fetchMonthlyExpenseReport(undefined, monthId, { userId });

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

    const existingNotionPage = await findExistingMonthlyReportPage(report.monthId);
    if (existingNotionPage?.telegramSent) {
      return NextResponse.json({
        ok: true,
        result: {
          monthId: report.monthId,
          notionPageId: existingNotionPage.id,
          notionUrl: existingNotionPage.url,
          idempotentSkip: true,
          ...(includeReport ? { report } : {}),
        } satisfies MonthlyExpenseReportCronResult,
      });
    }

    const initialNotionPage = await saveMonthlyReportToNotion(report, { telegramSent: false });
    let telegram: Awaited<ReturnType<typeof sendMonthlyReportToTelegram>>;

    try {
      telegram = await sendMonthlyReportToTelegram(report);
    } catch (telegramError) {
      const telegramErrorMessage = getErrorMessage(telegramError, "Telegram monthly report send failed");
      return NextResponse.json(
        {
          ok: false,
          error: telegramErrorMessage,
          result: {
            monthId: report.monthId,
            notionPageId: initialNotionPage.id,
            notionUrl: initialNotionPage.url,
            telegramError: telegramErrorMessage,
            ...(includeReport ? { report } : {}),
          } satisfies MonthlyExpenseReportCronResult,
        },
        { status: 502 },
      );
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
