import { NextResponse } from "next/server";

import { buildGoogleSheetsMonthlyExportTables, syncMonthlyReportToGoogleSheets } from "@/lib/googleSheetsMonthlyExport";
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
  return url.searchParams.get("monthId") ?? getPreviousMonthIdInTaipei();
}

function getBooleanSearchParam(request: Request, name: string) {
  const value = new URL(request.url).searchParams.get(name);
  return value === "1" || value === "true";
}

function getSpreadsheetId() {
  return process.env.GOOGLE_SHEET_ID ?? process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
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

async function runGoogleSheetsMonthlyReportSync(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const spreadsheetId = getSpreadsheetId();
    if (!spreadsheetId) {
      return NextResponse.json({ ok: false, error: "Missing GOOGLE_SHEET_ID or GOOGLE_SHEETS_SPREADSHEET_ID" }, { status: 500 });
    }

    const monthId = getMonthId(request);
    const dryRun = getBooleanSearchParam(request, "dryRun");
    const includeTables = getBooleanSearchParam(request, "includeTables");
    const report = await fetchMonthlyExpenseReport(undefined, monthId);

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
