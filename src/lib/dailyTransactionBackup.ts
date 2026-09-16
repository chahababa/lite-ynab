import { createHash } from "node:crypto";

import { createGoogleSheetsTransport, type GoogleSheetsRow, type GoogleSheetsTransport } from "./googleSheetsMonthlyExport";

const CURRENT_SHEET = "Transactions Current";
const HISTORY_SHEET = "Transaction History";

export const TRANSACTION_CURRENT_HEADERS = [
  "transaction_id", "date", "amount", "category_id", "category_group_name", "category_name", "payment_method_id",
  "payment_method_name", "note", "source", "source_text", "source_id", "metadata_json", "created_at", "updated_at", "backed_up_at", "row_hash",
] as const;
export const TRANSACTION_HISTORY_HEADERS = [
  "event_id", "event_type", "detected_at", "backup_run_id", ...TRANSACTION_CURRENT_HEADERS.slice(0, 15), "row_hash",
] as const;

type TransactionRecord = {
  id: string;
  date: string;
  amount: number;
  category_id: string;
  payment_method_id: string;
  note: string;
  source: string;
  source_text: string | null;
  source_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type NamedRecord = { id: string; name: string };
type CategoryRecord = NamedRecord & { category_group_id: string };
type CategoryGroupRecord = NamedRecord;

export type DailyTransactionBackupInput = {
  transactions: TransactionRecord[];
  categories: CategoryRecord[];
  categoryGroups: CategoryGroupRecord[];
  paymentMethods: NamedRecord[];
};

export type DailyTransactionBackupSnapshot = {
  current: { headers: readonly string[]; rows: GoogleSheetsRow[] };
};

export type DailyTransactionBackupTransport = GoogleSheetsTransport;

type CurrentRow = GoogleSheetsRow;
type EventType = "BACKFILL" | "INSERT" | "UPDATE" | "DELETE";

type SyncOptions = {
  spreadsheetId?: string;
  backupRunId?: string;
  detectedAt?: string;
  transport?: DailyTransactionBackupTransport;
};

export type DailyTransactionBackupSyncResult = {
  spreadsheetId: string;
  backupRunId: string;
  currentRows: number;
  events: Record<EventType | "deduped", number>;
};

export type DailyTransactionBackupPreview = Pick<DailyTransactionBackupSyncResult, "currentRows" | "events"> & {
  rowHashes: GoogleSheetsRow[number][];
};

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

export function buildDailyTransactionBackupSnapshot(
  input: DailyTransactionBackupInput,
  options: { backedUpAt?: string } = {},
): DailyTransactionBackupSnapshot {
  const backedUpAt = options.backedUpAt ?? new Date().toISOString();
  const groups = new Map(input.categoryGroups.map((group) => [group.id, group.name]));
  const categories = new Map(input.categories.map((category) => [category.id, category]));
  const paymentMethods = new Map(input.paymentMethods.map((method) => [method.id, method.name]));

  const rows = input.transactions
    .map((transaction) => {
      const category = categories.get(transaction.category_id);
      const metadataJson = canonicalJson(transaction.metadata ?? {});
      const canonicalValues = [
        transaction.id, transaction.date, transaction.amount, transaction.category_id,
        category ? groups.get(category.category_group_id) ?? "未分類大項" : "未分類大項",
        category?.name ?? "未知分類", transaction.payment_method_id, paymentMethods.get(transaction.payment_method_id) ?? "未知支付方式",
        transaction.note ?? "", transaction.source ?? "", transaction.source_text ?? "", transaction.source_id ?? "", metadataJson,
        transaction.created_at ?? "", transaction.updated_at ?? "",
      ];
      const rowHash = sha256(canonicalJson(canonicalValues));
      return [...canonicalValues, backedUpAt, rowHash] satisfies CurrentRow;
    })
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])));

  return { current: { headers: TRANSACTION_CURRENT_HEADERS, rows } };
}

export async function previewDailyTransactionBackupToGoogleSheets(
  input: DailyTransactionBackupInput,
  options: SyncOptions = {},
): Promise<DailyTransactionBackupPreview> {
  const spreadsheetId = getBackupSpreadsheetId(options.spreadsheetId);
  const detectedAt = options.detectedAt ?? new Date().toISOString();
  const backupRunId = options.backupRunId ?? `daily-transaction-backup-${detectedAt}`;
  const transport = options.transport ?? createGoogleSheetsTransport({ valueInputOption: "RAW" });
  const snapshot = buildDailyTransactionBackupSnapshot(input, { backedUpAt: formatBackupTimestamp(detectedAt) });
  const [existingCurrent, existingHistory] = await readBackupState(spreadsheetId, transport);
  const plan = buildHistoryPlan(snapshot.current.rows, existingCurrent, existingHistory, detectedAt, backupRunId);
  return { currentRows: snapshot.current.rows.length, rowHashes: snapshot.current.rows.map((row) => row[16]), events: plan.events };
}

export async function syncDailyTransactionBackupToGoogleSheets(
  input: DailyTransactionBackupInput,
  options: SyncOptions = {},
): Promise<DailyTransactionBackupSyncResult> {
  const spreadsheetId = getBackupSpreadsheetId(options.spreadsheetId);

  const detectedAt = options.detectedAt ?? new Date().toISOString();
  const backupRunId = options.backupRunId ?? `daily-transaction-backup-${detectedAt}`;
  const transport = options.transport ?? createGoogleSheetsTransport({ valueInputOption: "RAW" });
  const readableTimestamp = formatBackupTimestamp(detectedAt);
  const snapshot = buildDailyTransactionBackupSnapshot(input, { backedUpAt: readableTimestamp });
  const [existingCurrent, existingHistory] = await readBackupState(spreadsheetId, transport);
  const plan = buildHistoryPlan(snapshot.current.rows, existingCurrent, existingHistory, readableTimestamp, backupRunId);

  // The ordering is intentional: once history is durable, Current can always be reconstructed from Supabase.
  if (existingHistory.length === 0) {
    await transport.updateValues(spreadsheetId, `${HISTORY_SHEET}!A1:T1`, [[...TRANSACTION_HISTORY_HEADERS]]);
  }
  if (plan.historyRows.length > 0) await transport.appendValues(spreadsheetId, `${HISTORY_SHEET}!A:T`, plan.historyRows);
  await transport.updateValues(spreadsheetId, `${CURRENT_SHEET}!A1:Q${snapshot.current.rows.length + 1}`, [
    [...TRANSACTION_CURRENT_HEADERS],
    ...snapshot.current.rows,
  ]);
  if (existingCurrent.length > snapshot.current.rows.length) {
    await transport.clearValues(spreadsheetId, `${CURRENT_SHEET}!A${snapshot.current.rows.length + 2}:Q${existingCurrent.length + 1}`);
  }

  return { spreadsheetId, backupRunId, currentRows: snapshot.current.rows.length, events: plan.events };
}

async function readBackupState(spreadsheetId: string, transport: DailyTransactionBackupTransport) {
  const tables = await Promise.all([
    transport.getValues(spreadsheetId, `${CURRENT_SHEET}!A1:Q`),
    transport.getValues(spreadsheetId, `${HISTORY_SHEET}!A1:T`),
  ]);
  return tables.map((table, index) => {
    const headers = index === 0 ? TRANSACTION_CURRENT_HEADERS : TRANSACTION_HISTORY_HEADERS;
    if (table.length === 0) return [];
    if (canonicalJson(table[0]) !== canonicalJson(headers)) throw new Error("Invalid transaction backup headers; repair before retry");
    const rows = table.slice(1);
    for (const row of rows) {
      const values = index === 0 ? row.slice(0, 15) : row.slice(4, 19);
      const hash = row[index === 0 ? 16 : 19];
      if (row.length !== headers.length || typeof values[0] !== "string" || !values[0]
        || typeof values[2] !== "number" || !Number.isFinite(values[2])
        || sha256(canonicalJson(values)) !== hash) {
        throw new Error("Invalid transaction backup row; repair before retry");
      }
    }
    return rows;
  });
}

function buildHistoryPlan(currentRows: CurrentRow[], existingCurrent: GoogleSheetsRow[], existingHistory: GoogleSheetsRow[], detectedAt: string, backupRunId: string) {
  const storedCurrentById = new Map(existingCurrent.filter((row) => row[0]).map((row) => [String(row[0]), row]));
  const previousById = new Map(storedCurrentById);
  const latestEventById = new Map<string, GoogleSheetsRow>();
  const existingEventIds = new Map<string, string>();
  // History is the durable journal. Current may be old, partly overwritten, or have
  // an uncleared tail after an acknowledged/ambiguous failure. Replay in append order.
  for (const event of existingHistory) {
    if (!event[0]) throw new Error("Missing transaction backup event ID");
    const eventId = String(event[0]);
    const serialized = canonicalJson(event);
    if (existingEventIds.has(eventId)) {
      if (existingEventIds.get(eventId) !== serialized) throw new Error("Conflicting transaction backup event ID");
      continue;
    }
    existingEventIds.set(eventId, serialized);
    const id = String(event[4] ?? "");
    const type = String(event[1]);
    if (!id || !["BACKFILL", "INSERT", "UPDATE", "DELETE"].includes(type) || !event[19]) {
      throw new Error("Invalid transaction backup history; repair before retry");
    }
    latestEventById.set(id, event);
    if (type === "DELETE") previousById.delete(id);
    else previousById.set(id, [...event.slice(4, 19), event[2], event[19]]);
  }
  const currentById = new Map(currentRows.map((row) => [String(row[0]), row]));
  const candidates: Array<{ type: EventType; row: CurrentRow }> = [];
  if (existingCurrent.length === 0 && existingHistory.length === 0) for (const row of currentRows) candidates.push({ type: "BACKFILL", row });
  else {
    for (const [id, row] of currentById) {
      const previous = previousById.get(id);
      if (!previous) candidates.push({ type: "INSERT", row });
      else if (String(previous[16] ?? "") !== String(row[16])) candidates.push({ type: "UPDATE", row });
    }
    for (const [id, row] of previousById) if (!currentById.has(id)) candidates.push({ type: "DELETE", row });
  }
  const eventOrder: Record<EventType, number> = { BACKFILL: 0, INSERT: 1, UPDATE: 2, DELETE: 3 };
  candidates.sort((left, right) => eventOrder[left.type] - eventOrder[right.type] || String(left.row[0]).localeCompare(String(right.row[0])));
  const events = { BACKFILL: 0, INSERT: 0, UPDATE: 0, DELETE: 0, deduped: 0 };
  for (const [id, event] of latestEventById) {
    const journalHash = event[1] === "DELETE" ? undefined : event[19];
    if (currentById.get(id)?.[16] === journalHash && storedCurrentById.get(id)?.[16] !== journalHash) events.deduped += 1;
  }
  const historyRows: GoogleSheetsRow[] = [];
  for (const candidate of candidates) {
    const id = String(candidate.row[0]);
    // Include the predecessor: A -> B -> A -> B and delete/reinsert cycles are
    // distinct transitions, while a serial retry sees the same persisted journal.
    const predecessor = latestEventById.get(id)?.[0] ?? storedCurrentById.get(id)?.[16] ?? "absent";
    const eventId = sha256(canonicalJson([predecessor, candidate.type, id, candidate.row[16]]));
    if (existingEventIds.has(eventId)) { events.deduped += 1; continue; }
    events[candidate.type] += 1;
    historyRows.push([eventId, candidate.type, detectedAt, backupRunId, ...candidate.row.slice(0, 15), candidate.row[16]]);
  }
  return { events, historyRows };
}

function getBackupSpreadsheetId(value?: string) {
  const spreadsheetId = (value ?? process.env.GOOGLE_TRANSACTION_BACKUP_SHEET_ID)?.trim();
  if (!spreadsheetId) throw new Error("Missing GOOGLE_TRANSACTION_BACKUP_SHEET_ID");
  if ([process.env.GOOGLE_SHEET_ID, process.env.GOOGLE_SHEETS_SPREADSHEET_ID].some((id) => id?.trim() === spreadsheetId)) {
    throw new Error("Transaction backup must use a dedicated spreadsheet");
  }
  return spreadsheetId;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function formatBackupTimestamp(timestamp: string) {
  const taipei = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestamp));
  return `${timestamp} (Asia/Taipei ${taipei})`;
}
