import { describe, expect, it, vi } from "vitest";

import {
  buildDailyTransactionBackupSnapshot,
  canonicalJson,
  previewDailyTransactionBackupToGoogleSheets,
  syncDailyTransactionBackupToGoogleSheets,
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
    getValues: vi.fn(async (_spreadsheetId, range) => (range.startsWith("Transactions Current") ? existing.current : existing.history)),
    clearValues: vi.fn(async () => undefined),
    updateValues: vi.fn(async () => undefined),
    appendValues: vi.fn(async () => undefined),
  };
}
