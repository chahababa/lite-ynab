import { createSign } from "node:crypto";

import type { MonthlyExpenseReport } from "./monthlyExpenseReport";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const GOOGLE_SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

export type GoogleSheetsValue = string | number | boolean | null;
export type GoogleSheetsRow = GoogleSheetsValue[];

export type GoogleSheetsTable = {
  sheetName: string;
  headers: string[];
  rows: GoogleSheetsRow[];
};

export type GoogleSheetsMonthlyExportTables = {
  monthlySummary: GoogleSheetsTable;
  categoryBreakdown: GoogleSheetsTable;
  transactions: GoogleSheetsTable;
  exportLog: GoogleSheetsTable;
};

export type GoogleSheetsTransport = {
  getValues: (spreadsheetId: string, range: string) => Promise<GoogleSheetsRow[]>;
  clearValues: (spreadsheetId: string, range: string) => Promise<void>;
  updateValues: (spreadsheetId: string, range: string, values: GoogleSheetsRow[]) => Promise<void>;
  appendValues: (spreadsheetId: string, range: string, values: GoogleSheetsRow[]) => Promise<void>;
};

export type GoogleSheetsSyncResult = {
  spreadsheetId: string;
  monthId: string;
  rows: {
    monthlySummary: number;
    categoryBreakdown: number;
    transactions: number;
    exportLog: number;
  };
};

type BuildTablesOptions = {
  exportedAt?: string;
};

type SyncOptions = BuildTablesOptions & {
  spreadsheetId?: string;
  transport?: GoogleSheetsTransport;
};

export function buildGoogleSheetsMonthlyExportTables(
  report: MonthlyExpenseReport,
  options: BuildTablesOptions = {},
): GoogleSheetsMonthlyExportTables {
  const exportedAt = options.exportedAt ?? new Date().toISOString();
  const topExpenseSummary = report.topExpenses
    .map((expense) => `${expense.title} ${formatTwd(expense.amount)}`)
    .join("、");

  const monthlySummary: GoogleSheetsTable = {
    sheetName: "Monthly Summary",
    headers: [
      "monthId",
      "monthLabel",
      "generatedAt",
      "totalBudget",
      "totalSpent",
      "remaining",
      "statusKind",
      "statusAmount",
      "transactionCount",
      "overspentAlertCount",
      "highUsageAlertCount",
      "topExpenseSummary",
    ],
    rows: [
      [
        report.monthId,
        report.monthLabel,
        report.generatedAt,
        report.totalBudget,
        report.totalSpent,
        report.remaining,
        report.status.kind,
        report.status.amount,
        report.transactionCount,
        report.overspentAlerts.length,
        report.highUsageAlerts.length,
        topExpenseSummary,
      ],
    ],
  };

  const categoryBreakdown: GoogleSheetsTable = {
    sheetName: "Category Breakdown",
    headers: [
      "monthId",
      "categoryId",
      "categoryName",
      "groupName",
      "budget",
      "spent",
      "remaining",
      "transactionCount",
      "share",
      "usageRate",
      "reportGeneratedAt",
    ],
    rows: report.categoryBreakdown.map((item) => [
      report.monthId,
      item.id,
      item.name,
      item.groupName ?? "",
      item.budget,
      item.spent,
      item.remaining,
      item.transactionCount,
      item.share,
      item.usageRate ?? "",
      report.generatedAt,
    ]),
  };

  const transactions: GoogleSheetsTable = {
    sheetName: "Transactions",
    headers: [
      "monthId",
      "date",
      "title",
      "groupName",
      "categoryName",
      "paymentMethodName",
      "amount",
      "transactionId",
      "reportGeneratedAt",
    ],
    rows: report.topExpenses.map((item) => [
      report.monthId,
      item.date,
      item.title,
      item.groupName,
      item.categoryName,
      item.paymentMethodName,
      item.amount,
      item.id,
      report.generatedAt,
    ]),
  };

  const exportLog: GoogleSheetsTable = {
    sheetName: "Export Log",
    headers: [
      "exportedAt",
      "monthId",
      "status",
      "source",
      "rowsMonthlySummary",
      "rowsCategoryBreakdown",
      "rowsTransactions",
      "message",
    ],
    rows: [[exportedAt, report.monthId, "success", "monthly-report", 1, categoryBreakdown.rows.length, transactions.rows.length, ""]],
  };

  return { monthlySummary, categoryBreakdown, transactions, exportLog };
}

export async function syncMonthlyReportToGoogleSheets(
  report: MonthlyExpenseReport,
  options: SyncOptions = {},
): Promise<GoogleSheetsSyncResult> {
  const spreadsheetId = options.spreadsheetId ?? process.env.GOOGLE_SHEET_ID ?? process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error("Missing GOOGLE_SHEET_ID or GOOGLE_SHEETS_SPREADSHEET_ID");
  }

  const transport = options.transport ?? createGoogleSheetsTransport();
  const tables = buildGoogleSheetsMonthlyExportTables(report, options);

  await rewriteMonthlyTable(spreadsheetId, transport, tables.monthlySummary, report.monthId);
  await rewriteMonthlyTable(spreadsheetId, transport, tables.categoryBreakdown, report.monthId);
  await rewriteMonthlyTable(spreadsheetId, transport, tables.transactions, report.monthId);
  await transport.appendValues(spreadsheetId, `${tables.exportLog.sheetName}!A:H`, tables.exportLog.rows);

  return {
    spreadsheetId,
    monthId: report.monthId,
    rows: {
      monthlySummary: tables.monthlySummary.rows.length,
      categoryBreakdown: tables.categoryBreakdown.rows.length,
      transactions: tables.transactions.rows.length,
      exportLog: tables.exportLog.rows.length,
    },
  };
}

async function rewriteMonthlyTable(
  spreadsheetId: string,
  transport: GoogleSheetsTransport,
  table: GoogleSheetsTable,
  monthId: string,
) {
  const lastColumn = columnName(table.headers.length);
  const existingRows = await transport.getValues(spreadsheetId, `${table.sheetName}!A2:${lastColumn}`);
  const preservedRows = existingRows.filter((row) => row[0] !== monthId);
  const values = [table.headers, ...preservedRows, ...table.rows];

  await transport.clearValues(spreadsheetId, `${table.sheetName}!A1:${lastColumn}`);
  await transport.updateValues(spreadsheetId, `${table.sheetName}!A1:${lastColumn}${values.length}`, values);
}

export function createGoogleSheetsTransport(options?: { accessToken?: string; fetchImpl?: typeof fetch }): GoogleSheetsTransport {
  const fetchImpl = options?.fetchImpl ?? fetch;
  let cachedAccessToken = options?.accessToken;

  async function getAccessToken() {
    if (!cachedAccessToken) {
      cachedAccessToken = await createGoogleServiceAccountAccessToken({ fetchImpl });
    }
    return cachedAccessToken;
  }

  async function request(path: string, init: RequestInit = {}) {
    const accessToken = await getAccessToken();
    const response = await fetchImpl(`${GOOGLE_SHEETS_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google Sheets API failed: ${response.status} ${body}`);
    }

    return response;
  }

  return {
    async getValues(spreadsheetId, range) {
      const response = await request(`/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`);
      const data = (await response.json()) as { values?: GoogleSheetsRow[] };
      return data.values ?? [];
    },
    async clearValues(spreadsheetId, range) {
      await request(`/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:clear`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
    async updateValues(spreadsheetId, range, values) {
      await request(`/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
        method: "PUT",
        body: JSON.stringify({ values }),
      });
    },
    async appendValues(spreadsheetId, range, values) {
      await request(
        `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method: "POST",
          body: JSON.stringify({ values }),
        },
      );
    },
  };
}

async function createGoogleServiceAccountAccessToken(options?: { fetchImpl?: typeof fetch }) {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const rawPrivateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? process.env.GOOGLE_SHEETS_PRIVATE_KEY;

  if (!clientEmail || !rawPrivateKey) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_SHEETS_CLIENT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY/GOOGLE_SHEETS_PRIVATE_KEY");
  }

  const privateKey = rawPrivateKey.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(
    { alg: "RS256", typ: "JWT" },
    {
      iss: clientEmail,
      scope: GOOGLE_SHEETS_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      exp: now + 3600,
      iat: now,
    },
    privateKey,
  );

  const fetchImpl = options?.fetchImpl ?? fetch;
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google service account token request failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Google service account token response missing access_token");
  }

  return data.access_token;
}

function signJwt(header: object, payload: object, privateKey: string) {
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(privateKey);
  return `${signingInput}.${base64Url(signature)}`;
}

function base64UrlJson(value: object) {
  return base64Url(Buffer.from(JSON.stringify(value), "utf8"));
}

function base64Url(value: Buffer) {
  return value.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function columnName(columnCount: number) {
  let result = "";
  let current = columnCount;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
}

function formatTwd(amount: number) {
  return `NT$${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(amount)}`;
}
