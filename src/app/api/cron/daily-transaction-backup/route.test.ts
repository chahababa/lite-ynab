import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchDailyTransactionBackupInput: vi.fn(),
  previewDailyTransactionBackupToGoogleSheets: vi.fn(),
  syncDailyTransactionBackupToGoogleSheets: vi.fn(),
}));

vi.mock("@/lib/dailyTransactionBackupServer", () => ({ fetchDailyTransactionBackupInput: mocks.fetchDailyTransactionBackupInput }));
vi.mock("@/lib/dailyTransactionBackup", () => ({
  previewDailyTransactionBackupToGoogleSheets: mocks.previewDailyTransactionBackupToGoogleSheets,
  syncDailyTransactionBackupToGoogleSheets: mocks.syncDailyTransactionBackupToGoogleSheets,
}));

const input = { transactions: [{ id: "tx-1" }], categories: [], categoryGroups: [], paymentMethods: [] };

describe("daily transaction backup cron", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.assign(process.env, {
      CRON_SECRET: "secret",
      LITEYNAB_USER_ID: "tenant-1",
      GOOGLE_TRANSACTION_BACKUP_SHEET_ID: "backup-sheet",
    });
    mocks.fetchDailyTransactionBackupInput.mockReset().mockResolvedValue(input);
    mocks.previewDailyTransactionBackupToGoogleSheets.mockReset().mockResolvedValue({
      currentRows: 1, rowHashes: ["hash-1"], events: { BACKFILL: 1, INSERT: 0, UPDATE: 0, DELETE: 0, deduped: 0 },
    });
    mocks.syncDailyTransactionBackupToGoogleSheets.mockReset().mockResolvedValue({
      spreadsheetId: "backup-sheet", backupRunId: "run-1", currentRows: 1,
      events: { BACKFILL: 1, INSERT: 0, UPDATE: 0, DELETE: 0, deduped: 0 },
    });
  });

  it("requires cron authorization before reading transaction data", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://lite-ynab.test/api/cron/daily-transaction-backup"));
    expect(response.status).toBe(401);
    expect(mocks.fetchDailyTransactionBackupInput).not.toHaveBeenCalled();
  });

  it("fails closed when explicit tenant scope is missing", async () => {
    delete process.env.LITEYNAB_USER_ID;
    const { POST } = await import("./route");
    const response = await POST(new Request("https://lite-ynab.test/api/cron/daily-transaction-backup", { method: "POST", headers: { Authorization: "Bearer secret" } }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "Missing LITEYNAB_USER_ID; daily transaction backup requires explicit tenant scope" });
    expect(mocks.fetchDailyTransactionBackupInput).not.toHaveBeenCalled();
  });

  it("returns dry-run counts and hashes without calling Google Sheets", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://lite-ynab.test/api/cron/daily-transaction-backup?dryRun=1", { headers: { Authorization: "Bearer secret" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, result: { dryRun: true, currentRows: 1, rowHashes: ["hash-1"], events: { BACKFILL: 1, INSERT: 0, UPDATE: 0, DELETE: 0, deduped: 0 } } });
    expect(mocks.syncDailyTransactionBackupToGoogleSheets).not.toHaveBeenCalled();
    expect(mocks.previewDailyTransactionBackupToGoogleSheets).toHaveBeenCalledWith(input, { spreadsheetId: "backup-sheet" });
  });

  it("syncs only to the dedicated transaction backup sheet", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://lite-ynab.test/api/cron/daily-transaction-backup", { method: "POST", headers: { Authorization: "Bearer secret" } }));
    expect(response.status).toBe(200);
    expect(mocks.fetchDailyTransactionBackupInput).toHaveBeenCalledWith(undefined, "tenant-1");
    expect(mocks.syncDailyTransactionBackupToGoogleSheets).toHaveBeenCalledWith(input, { spreadsheetId: "backup-sheet" });
    expect(await response.json()).toEqual({ ok: true, result: expect.objectContaining({ currentRows: 1 }) });
  });

  it("returns a non-2xx response when a Google write fails", async () => {
    mocks.syncDailyTransactionBackupToGoogleSheets.mockRejectedValue(new Error("transport failed"));
    const { POST } = await import("./route");
    const response = await POST(new Request("https://lite-ynab.test/api/cron/daily-transaction-backup", { method: "POST", headers: { Authorization: "Bearer secret" } }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "transport failed" });
  });
});
