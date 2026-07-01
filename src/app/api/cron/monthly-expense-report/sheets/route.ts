import { NextResponse } from "next/server";

import { buildGoogleSheetsMonthlyExportTables, syncMonthlyReportToGoogleSheets } from "@/lib/googleSheetsMonthlyExport";
import { isCronAuthorized, isValidMonthId } from "@/lib/cronAuth";
import { getPreviousMonthIdInTaipei } from "@/lib/monthlyExpenseReport";
import { fetchMonthlyExpenseReport } from "@/lib/monthlyExpenseReportServer";

export const runtime = "nodejs";

type GoogleSheetsMonthlyReportCronResult =
  | Awaited<ReturnType<typeof syncMonthlyReportToGoogleSheets>>
  | {
      spreadsheetId: string;
      monthId: string;
      dryRun: true;
      tables?: ReturnType<typeof buildGoogleSheetsMonthlyExportTables>;
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

function getSpreadsheetId() {
  return process.env.GOOGLE_SHEET_ID ?? process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
}

async function runGoogleSheetsMonthlyReportSync(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const spreadsheetId = getSpreadsheetId();
    if (!spreadsheetId) {
      return NextResponse.json({ ok: false, error: "Missing GOOGLE_SHEET_ID or GOOGLE_SHEETS_SPREADSHEET_ID" }, { status: 500 });
    }

    const monthIdResult = getMonthId(request);
    if ("error" in monthIdResult) {
      return NextResponse.json({ ok: false, error: monthIdResult.error }, { status: 400 });
    }

    const { monthId } = monthIdResult;
    const dryRun = getBooleanSearchParam(request, "dryRun");
    const includeTables = getBooleanSearchParam(request, "includeTables");
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
          spreadsheetId,
          monthId: report.monthId,
          dryRun: true,
          ...(includeTables ? { tables: buildGoogleSheetsMonthlyExportTables(report) } : {}),
        } satisfies GoogleSheetsMonthlyReportCronResult,
      });
    }

    const result = await syncMonthlyReportToGoogleSheets(report, { spreadsheetId });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Sheets monthly report sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return runGoogleSheetsMonthlyReportSync(request);
}

export async function POST(request: Request) {
  return runGoogleSheetsMonthlyReportSync(request);
}
