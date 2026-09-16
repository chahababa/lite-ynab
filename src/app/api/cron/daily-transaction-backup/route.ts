import { NextResponse } from "next/server";

import { previewDailyTransactionBackupToGoogleSheets, syncDailyTransactionBackupToGoogleSheets } from "@/lib/dailyTransactionBackup";
import { fetchDailyTransactionBackupInput } from "@/lib/dailyTransactionBackupServer";
import { isCronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";

function isDryRun(request: Request) {
  const value = new URL(request.url).searchParams.get("dryRun");
  return value === "1" || value === "true";
}

async function runDailyTransactionBackup(request: Request) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = process.env.LITEYNAB_USER_ID?.trim();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Missing LITEYNAB_USER_ID; daily transaction backup requires explicit tenant scope" },
      { status: 400 },
    );
  }

  const spreadsheetId = process.env.GOOGLE_TRANSACTION_BACKUP_SHEET_ID?.trim();
  if (!spreadsheetId) {
    return NextResponse.json({ ok: false, error: "Missing GOOGLE_TRANSACTION_BACKUP_SHEET_ID" }, { status: 500 });
  }

  try {
    const input = await fetchDailyTransactionBackupInput(undefined, userId);
    if (isDryRun(request)) {
      const preview = await previewDailyTransactionBackupToGoogleSheets(input, { spreadsheetId });
      return NextResponse.json({
        ok: true,
        result: {
          dryRun: true,
          ...preview,
        },
      });
    }

    const result = await syncDailyTransactionBackupToGoogleSheets(input, { spreadsheetId });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Daily transaction backup failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return runDailyTransactionBackup(request);
}

export async function POST(request: Request) {
  return runDailyTransactionBackup(request);
}
