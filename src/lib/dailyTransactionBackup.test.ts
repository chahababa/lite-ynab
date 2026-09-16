import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import * as sheets from "./googleSheetsMonthlyExport";

import {
  buildDailyTransactionBackupSnapshot,
  canonicalJson,
  previewDailyTransactionBackupToGoogleSheets,
  syncDailyTransactionBackupToGoogleSheets,
  TRANSACTION_CURRENT_HEADERS,
  TRANSACTION_HISTORY_HEADERS,
  type DailyTransactionBackupInput,
  type DailyTransactionBackupTransport,
} from "./dailyTransactionBackup";

const input: DailyTransactionBackupInput = {
  transactions: [
    {
      id: "tx-1",
      date: "2026-09-15",
      amount: 120,
      category_id: "cat-food",
      payment_method_id: "pm-cash",
      note: "早餐",
      source: "manual",
      source_text: null,
      source_id: null,
      metadata: { b: 2, a: 1 },
      created_at: "2026-09-15T01:00:00.000Z",
      updated_at: "2026-09-15T01:00:00.000Z",
    },
  ],
  categories: [{ id: "cat-food", category_group_id: "group-home", name: "飲食" }],
  categoryGroups: [{ id: "group-home", name: "家庭" }],
  paymentMethods: [{ id: "pm-cash", name: "現金" }],
};

function currentRow(overrides: Record<string, unknown> = {}) {
  const snapshot = buildDailyTransactionBackupSnapshot(input, { backedUpAt: "2026-09-16T03:30:00.000Z" });
  const row = [...snapshot.current.rows[0]];
  const index = new Map(snapshot.current.headers.map((header, position) => [header, position]));
  for (const [key, value] of Object.entries(overrides)) row[index.get(key)!] = value as string;
  row[16] = createHash("sha256").update(canonicalJson(row.slice(0, 15))).digest("hex");
  return row;
}

describe("daily transaction backup", () => {
  it("uses canonical metadata JSON so key order does not cause a false update", () => {
    expect(canonicalJson({ b: [2, { z: 3, a: 1 }], a: true })).toBe('{"a":true,"b":[2,{"a":1,"z":3}]}');

    const previous = currentRow({ metadata_json: '{"a":1,"b":2}' });
    const snapshot = buildDailyTransactionBackupSnapshot(input, { backedUpAt: "2026-09-16T03:30:00.000Z" });
    expect(snapshot.current.rows[0][12]).toBe('{"a":1,"b":2}');
    expect(previous[16]).toBe(snapshot.current.rows[0][16]);
  });

  it("appends BACKFILL on an empty destination, then keeps retries idempotent", async () => {
    const transport = createTransport({ current: [], history: [] });

    const first = await syncDailyTransactionBackupToGoogleSheets(input, {
      spreadsheetId: "sheet-1",
      backupRunId: "run-1",
      detectedAt: "2026-09-16T03:30:00.000Z",
      transport,
    });

    expect(first.events).toEqual({ BACKFILL: 1, INSERT: 0, UPDATE: 0, DELETE: 0, deduped: 0 });
    expect(transport.appendValues).toHaveBeenCalledTimes(1);
    const appended = vi.mocked(transport.appendValues).mock.calls[0][2][0];
    expect(appended[1]).toBe("BACKFILL");

    const retryTransport = createTransport({ current: [currentRow()], history: [appended] });
    const retry = await syncDailyTransactionBackupToGoogleSheets(input, {
      spreadsheetId: "sheet-1",
      backupRunId: "run-2",
      detectedAt: "2026-09-16T04:00:00.000Z",
      transport: retryTransport,
    });
    expect(retry.events).toEqual({ BACKFILL: 0, INSERT: 0, UPDATE: 0, DELETE: 0, deduped: 0 });
    expect(retryTransport.appendValues).not.toHaveBeenCalled();
  });

  it("previews row and diff counts without any Google write", async () => {
    const transport = createTransport({ current: [], history: [] });
    const preview = await previewDailyTransactionBackupToGoogleSheets(input, {
      spreadsheetId: "sheet-1", backupRunId: "run-preview", detectedAt: "2026-09-16T03:30:00.000Z", transport,
    });
    expect(preview).toMatchObject({ currentRows: 1, events: { BACKFILL: 1 } });
    expect(preview.rowHashes).toHaveLength(1);
    expect(transport.appendValues).not.toHaveBeenCalled();
    expect(transport.updateValues).not.toHaveBeenCalled();
    expect(transport.clearValues).not.toHaveBeenCalled();
  });

  it("detects INSERT, UPDATE, DELETE and dedupes an already appended event", async () => {
    const changed = buildDailyTransactionBackupSnapshot(
      { ...input, transactions: [{ ...input.transactions[0], amount: 199 }, { ...input.transactions[0], id: "tx-2", note: "午餐" }] },
      { backedUpAt: "2026-09-16T03:30:00.000Z" },
    );
    const deleted = currentRow({ transaction_id: "tx-deleted", note: "已刪除交易" });
    const transport = createTransport({ current: [currentRow(), deleted], history: [] });

    const result = await syncDailyTransactionBackupToGoogleSheets(
      { ...input, transactions: [{ ...input.transactions[0], amount: 199 }, { ...input.transactions[0], id: "tx-2", note: "午餐" }] },
      { spreadsheetId: "sheet-1", backupRunId: "run-1", detectedAt: "2026-09-16T03:30:00.000Z", transport },
    );

    expect(result.events).toMatchObject({ INSERT: 1, UPDATE: 1, DELETE: 1 });
    const types = vi.mocked(transport.appendValues).mock.calls[0][2].map((row) => row[1]);
    expect(types).toEqual(["INSERT", "UPDATE", "DELETE"]);
    expect(changed.current.rows).toHaveLength(2);

    const existingEvents = vi.mocked(transport.appendValues).mock.calls[0][2];
    const dedupeTransport = createTransport({ current: [currentRow(), deleted], history: existingEvents });
    const deduped = await syncDailyTransactionBackupToGoogleSheets(
      { ...input, transactions: [{ ...input.transactions[0], amount: 199 }, { ...input.transactions[0], id: "tx-2", note: "午餐" }] },
      { spreadsheetId: "sheet-1", backupRunId: "run-2", detectedAt: "2026-09-16T04:00:00.000Z", transport: dedupeTransport },
    );
    expect(deduped.events).toMatchObject({ deduped: 3 });
    expect(dedupeTransport.appendValues).not.toHaveBeenCalled();
  });

  it("writes history first, Current second, then clears stale Current rows", async () => {
    const transport = createTransport({ current: [currentRow(), currentRow({ transaction_id: "stale" })], history: [] });
    const calls: string[] = [];
    vi.mocked(transport.appendValues).mockImplementation(async () => { calls.push("append-history"); });
    vi.mocked(transport.updateValues).mockImplementation(async (_spreadsheetId, range) => { calls.push(range.startsWith("Transaction History") ? "write-history-header" : "update-current"); });
    vi.mocked(transport.clearValues).mockImplementation(async () => { calls.push("clear-tail"); });

    await syncDailyTransactionBackupToGoogleSheets(input, {
      spreadsheetId: "sheet-1",
      backupRunId: "run-1",
      detectedAt: "2026-09-16T03:30:00.000Z",
      transport,
    });

    expect(calls).toEqual(["write-history-header", "append-history", "update-current", "clear-tail"]);
    expect(transport.clearValues).toHaveBeenCalledWith("sheet-1", "Transactions Current!A3:Q3");
  });
});

function createTransport(existing: { current: (string | number | boolean | null)[][]; history: (string | number | boolean | null)[][] }): DailyTransactionBackupTransport {
  return {
    getValues: vi.fn(async (_spreadsheetId, range) => (range.startsWith("Transactions Current")
      ? [[...TRANSACTION_CURRENT_HEADERS], ...existing.current] : [[...TRANSACTION_HISTORY_HEADERS], ...existing.history])),
    clearValues: vi.fn(async () => undefined),
    updateValues: vi.fn(async () => undefined),
    appendValues: vi.fn(async () => undefined),
  };
}

// Stateful Sheets fake models writes that persisted even though the response failed,
// and updateValues leaving old trailing rows until clearValues succeeds.
function journal(initial: sheets.GoogleSheetsRow[] = []) {
  const state = { current: structuredClone(initial), history: [] as sheets.GoogleSheetsRow[] };
  let failure: { stage: string; after: boolean } | undefined;
  const calls: string[] = [];
  async function at(stage: string, action: () => void) {
    calls.push(stage);
    const selected = failure?.stage === stage ? failure : undefined;
    if (selected) failure = undefined;
    if (selected && !selected.after) throw new Error(`failed ${stage}`);
    action();
    if (selected) throw new Error(`lost ${stage} response`);
  }
  const transport: DailyTransactionBackupTransport = {
    getValues: async (_id, range) => {
      const key = range.startsWith("Transactions Current") ? "current" : "history";
      await at(`read-${key}`, () => undefined);
      const headers = key === "current" ? TRANSACTION_CURRENT_HEADERS : TRANSACTION_HISTORY_HEADERS;
      return [[...headers], ...structuredClone(state[key])];
    },
    updateValues: async (_id, range, values) => {
      if (range.startsWith("Transaction History")) await at("header", () => undefined);
      else await at("current", () => {
        const rows = structuredClone(values.slice(1));
        state.current.splice(0, rows.length, ...rows);
      });
    },
    appendValues: async (_id, _range, values) => { await at("append", () => state.history.push(...structuredClone(values))); },
    clearValues: async (_id, range) => {
      await at("tail", () => { state.current.splice(Number(range.match(/!A(\d+)/)![1]) - 2); });
    },
  };
  return { state, calls, transport, fail: (stage: string, after = false) => { failure = { stage, after }; } };
}

function sync(inputValue: DailyTransactionBackupInput, transport: DailyTransactionBackupTransport, run = "run-1") {
  return syncDailyTransactionBackupToGoogleSheets(inputValue, {
    spreadsheetId: "sheet-1", detectedAt: "2026-09-16T03:30:00.000Z", backupRunId: run, transport,
  });
}

describe("daily backup serial failure recovery", () => {
  it.each(["read-current", "read-history", "header", "append", "current"])("recovers %s failure before or after persistence without BACKFILL/INSERT duplication", async (stage) => {
    for (const after of [false, true]) {
      const store = journal();
      store.fail(stage, after);
      await expect(sync(input, store.transport)).rejects.toThrow();
      if (stage !== "current") expect(store.calls).not.toContain("current");
      // A fresh invocation/run ID must recover using only persisted Sheets state.
      await sync(input, store.transport, "retry");
      await sync(input, store.transport, "next-day");
      expect(store.state.history.map((row) => row[1])).toEqual(["BACKFILL"]);
      expect(store.state.current).toHaveLength(1);
      expect(store.state.current[0][16]).toBe(currentRow()[16]);
    }
  });

  it("records a changed source after a failed initial Current write as UPDATE, not INSERT", async () => {
    const store = journal();
    store.fail("current");
    await expect(sync(input, store.transport)).rejects.toThrow();
    const changed = { ...input, transactions: [{ ...input.transactions[0], amount: 999 }] };
    await sync(changed, store.transport, "retry");
    expect(store.state.history.map((row) => row[1])).toEqual(["BACKFILL", "UPDATE"]);
    expect(store.state.current[0][2]).toBe(999);
  });

  it("keeps repeated A/B updates and delete/reinsert cycles as distinct events", async () => {
    const store = journal();
    const changed = { ...input, transactions: [{ ...input.transactions[0], amount: 999 }] };
    const empty = { ...input, transactions: [] };
    for (const snapshot of [input, changed, input, changed, empty, changed, empty, changed]) await sync(snapshot, store.transport);
    expect(store.state.history.map((row) => row[1])).toEqual(["BACKFILL", "UPDATE", "UPDATE", "UPDATE", "DELETE", "INSERT", "DELETE", "INSERT"]);
    expect(new Set(store.state.history.map((row) => row[0])).size).toBe(8);
    await sync(changed, store.transport);
    expect(store.state.history).toHaveLength(8);
  });

  it.each([false, true])("recovers a tail-clear failure (persisted=%s), including duplicate IDs in the stale tail", async (after) => {
    const store = journal();
    const three = { ...input, transactions: ["a", "b", "c"].map((id) => ({ ...input.transactions[0], id })) };
    const two = { ...three, transactions: three.transactions.slice(1) };
    await sync(three, store.transport);
    store.fail("tail", after);
    await expect(sync(two, store.transport)).rejects.toThrow();
    await sync(two, store.transport, "retry");
    expect(store.state.current.map((row) => row[0])).toEqual(["b", "c"]);
    expect(store.state.history.map((row) => row[1])).toEqual(["BACKFILL", "BACKFILL", "BACKFILL", "DELETE"]);
  });

  it.each(["append", "current", "tail"])("recovers mixed INSERT/UPDATE/DELETE after %s failure", async (stage) => {
    const store = journal();
    const before = { ...input, transactions: ["a", "b", "c"].map((id) => ({ ...input.transactions[0], id })) };
    const after = { ...input, transactions: [{ ...input.transactions[0], id: "a", amount: 42 }, { ...input.transactions[0], id: "d" }] };
    await sync(before, store.transport);
    store.fail(stage, stage === "append");
    await expect(sync(after, store.transport)).rejects.toThrow();
    await sync(after, store.transport, "retry");
    expect(store.state.history.map((row) => row[1])).toEqual(["BACKFILL", "BACKFILL", "BACKFILL", "INSERT", "UPDATE", "DELETE", "DELETE"]);
    expect(store.state.current.map((row) => row[0])).toEqual(["a", "d"]);
    expect(store.state.history.filter((row) => row[1] === "DELETE").map((row) => row[6])).toEqual([120, 120]);
  });

  it("repairs an empty Current after all rows were deleted without duplicating tombstones", async () => {
    const store = journal();
    await sync(input, store.transport);
    store.fail("current");
    const empty = { ...input, transactions: [] };
    await expect(sync(empty, store.transport)).rejects.toThrow();
    await sync(empty, store.transport);
    await sync(empty, store.transport);
    expect(store.state.current).toEqual([]);
    expect(store.state.history.map((row) => row[1])).toEqual(["BACKFILL", "DELETE"]);
  });

  it("uses stable deterministic IDs across fresh identical destinations", async () => {
    const a = journal(); const b = journal();
    await sync(input, a.transport, "run-a"); await sync(input, b.transport, "run-b");
    expect(a.state.history[0][0]).toBe(b.state.history[0][0]);
    expect(a.state.history[0][3]).not.toBe(b.state.history[0][3]);
  });

  it.each(["current-hash", "history-hash", "history-type", "history-id", "conflicting-event"])("rejects corrupted %s before any write", async (kind) => {
    const store = journal();
    await sync(input, store.transport);
    if (kind === "current-hash") store.state.current[0][8] = "tampered";
    if (kind === "history-hash") store.state.history[0][12] = "tampered";
    if (kind === "history-type") store.state.history[0][1] = "UNKNOWN";
    if (kind === "history-id") store.state.history[0][0] = "";
    if (kind === "conflicting-event") store.state.history.push([...store.state.history[0].slice(0, 3), "another-run", ...store.state.history[0].slice(4)]);
    store.calls.length = 0;
    await expect(sync(input, store.transport)).rejects.toThrow();
    expect(store.calls.sort()).toEqual(["read-current", "read-history"]);
  });

  it("rejects a wrong destination schema before writes", async () => {
    const transport = createTransport({ current: [], history: [] });
    vi.mocked(transport.getValues).mockResolvedValue([["wrong", "headers"]]);
    await expect(sync(input, transport)).rejects.toThrow("headers");
    expect(transport.updateValues).not.toHaveBeenCalled();
    expect(transport.appendValues).not.toHaveBeenCalled();
    expect(transport.clearValues).not.toHaveBeenCalled();
  });

  it("keeps preview payload restricted even after a failed Current write", async () => {
    const store = journal();
    store.fail("current");
    await expect(sync(input, store.transport)).rejects.toThrow();
    store.calls.length = 0;
    const preview = await previewDailyTransactionBackupToGoogleSheets(input, { spreadsheetId: "sheet-1", transport: store.transport });
    expect(preview.events).toMatchObject({ BACKFILL: 0, INSERT: 0, deduped: 1 });
    expect(Object.keys(preview).sort()).toEqual(["currentRows", "events", "rowHashes"]);
    expect(JSON.stringify(preview)).not.toContain("早餐");
    expect(store.calls.sort()).toEqual(["read-current", "read-history"]);
  });
});

describe("daily backup literal transport", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("uses RAW for the default backup transport", async () => {
    const factory = vi.spyOn(sheets, "createGoogleSheetsTransport").mockReturnValue(createTransport({ current: [], history: [] }));
    await syncDailyTransactionBackupToGoogleSheets(input, { spreadsheetId: "sheet-1" });
    await previewDailyTransactionBackupToGoogleSheets(input, { spreadsheetId: "sheet-1" });
    expect(factory).toHaveBeenCalledTimes(2);
    expect(factory).toHaveBeenNthCalledWith(1, { valueInputOption: "RAW" });
    expect(factory).toHaveBeenNthCalledWith(2, { valueInputOption: "RAW" });
  });

  it("transmits formula/locale-looking strings literally in History and Current", async () => {
    const requests: Array<{ url: string; method: string; values?: sheets.GoogleSheetsRow[] }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), method: init?.method ?? "GET", values: init?.body ? JSON.parse(String(init.body)).values : undefined });
      return new Response(JSON.stringify({ values: [] }), { status: 200 });
    });
    const transport = sheets.createGoogleSheetsTransport({ accessToken: "synthetic", fetchImpl, valueInputOption: "RAW" });
    const risky = { ...input, transactions: [{ ...input.transactions[0], note: '=IMPORTXML("https://example.invalid","x")', source: "+SUM(1,2)", source_text: "00123", source_id: "1/2", metadata: { formula: "@SUM(1,2)" } }], categories: [{ ...input.categories[0], name: "-1+2" }] };
    await sync(risky, transport);
    expect(requests.filter((r) => r.method === "GET").every((r) => new URL(r.url).searchParams.get("valueRenderOption") === "UNFORMATTED_VALUE")).toBe(true);
    const writes = requests.filter((r) => r.values);
    expect(writes).toHaveLength(3);
    expect(writes.every((r) => new URL(r.url).searchParams.get("valueInputOption") === "RAW")).toBe(true);
    const current = writes.find((r) => r.method === "PUT" && decodeURIComponent(r.url).includes("Transactions Current"))!.values![1];
    const history = writes.find((r) => r.url.includes(":append"))!.values![0];
    expect(current.slice(8, 12)).toEqual([risky.transactions[0].note, "+SUM(1,2)", "00123", "1/2"]);
    expect(history.slice(12, 16)).toEqual(current.slice(8, 12));
    expect(current[2]).toBe(120);
  });

  it("retains the monthly transport default", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{}"));
    const transport = sheets.createGoogleSheetsTransport({ accessToken: "synthetic", fetchImpl });
    await transport.updateValues("monthly", "Sheet!A1", [[1]]);
    expect(String(fetchImpl.mock.calls[0][0])).toContain("valueInputOption=USER_ENTERED");
  });

  it("rejects a monthly destination and never falls back to it", async () => {
    vi.stubEnv("GOOGLE_TRANSACTION_BACKUP_SHEET_ID", ""); vi.stubEnv("GOOGLE_SHEET_ID", "monthly");
    const transport = createTransport({ current: [], history: [] });
    await expect(syncDailyTransactionBackupToGoogleSheets(input, { transport })).rejects.toThrow("Missing GOOGLE_TRANSACTION_BACKUP_SHEET_ID");
    await expect(syncDailyTransactionBackupToGoogleSheets(input, { transport, spreadsheetId: "monthly" })).rejects.toThrow("dedicated spreadsheet");
    expect(transport.getValues).not.toHaveBeenCalled();
  });
});
