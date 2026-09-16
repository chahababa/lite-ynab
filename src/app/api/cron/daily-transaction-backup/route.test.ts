import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    vi.stubEnv("CRON_SECRET", "secret");
    vi.stubEnv("LITEYNAB_USER_ID", "tenant-1");
    vi.stubEnv("GOOGLE_TRANSACTION_BACKUP_SHEET_ID", "backup-sheet");
    mocks.fetchDailyTransactionBackupInput.mockReset().mockResolvedValue(input);
    mocks.previewDailyTransactionBackupToGoogleSheets.mockReset().mockResolvedValue({
      currentRows: 1, rowHashes: ["hash-1"], events: { BACKFILL: 1, INSERT: 0, UPDATE: 0, DELETE: 0, deduped: 0 },
    });
    mocks.syncDailyTransactionBackupToGoogleSheets.mockReset().mockResolvedValue({
      spreadsheetId: "backup-sheet", backupRunId: "run-1", currentRows: 1,
      events: { BACKFILL: 1, INSERT: 0, UPDATE: 0, DELETE: 0, deduped: 0 },
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("requires cron authorization before reading transaction data", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://lite-ynab.test/api/cron/daily-transaction-backup"));
    expect(response.status).toBe(401);
    expect(mocks.fetchDailyTransactionBackupInput).not.toHaveBeenCalled();
  });

  it("fails closed when explicit tenant scope is missing", async () => {
    vi.stubEnv("LITEYNAB_USER_ID", "");
    const { POST } = await import("./route");
    const response = await POST(new Request("https://lite-ynab.test/api/cron/daily-transaction-backup", { method: "POST", headers: { Authorization: "Bearer secret" } }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "Missing LITEYNAB_USER_ID; daily transaction backup requires explicit tenant scope" });
    expect(mocks.fetchDailyTransactionBackupInput).not.toHaveBeenCalled();
  });

  it("returns dry-run counts and hashes without writing Google Sheets", async () => {
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
    expect(mocks.fetchDailyTransactionBackupInput).toHaveBeenCalledWith({ userId: "tenant-1" });
    expect(mocks.syncDailyTransactionBackupToGoogleSheets).toHaveBeenCalledWith(input, { spreadsheetId: "backup-sheet" });
    expect(await response.json()).toEqual({ ok: true, result: expect.objectContaining({ currentRows: 1 }) });
  });

  it("returns a non-2xx response when a Google write fails", async () => {
    mocks.syncDailyTransactionBackupToGoogleSheets.mockRejectedValue(new Error("transport failed"));
    const { POST } = await import("./route");
    const response = await POST(new Request("https://lite-ynab.test/api/cron/daily-transaction-backup", { method: "POST", headers: { Authorization: "Bearer secret" } }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "Daily transaction backup failed" });
  });

  it.each(["wrong!", "secrex", ""])("rejects invalid bearer %s before any provider call", async (token) => {
    const { GET } = await import("./route");
    const response = await GET(request("", token));
    expect(response.status).toBe(401);
    expect(mocks.fetchDailyTransactionBackupInput).not.toHaveBeenCalled();
    expect(mocks.syncDailyTransactionBackupToGoogleSheets).not.toHaveBeenCalled();
    expect(mocks.previewDailyTransactionBackupToGoogleSheets).not.toHaveBeenCalled();
  });

  it("rejects an unset CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { GET } = await import("./route");
    expect((await GET(request())).status).toBe(401);
    expect(mocks.fetchDailyTransactionBackupInput).not.toHaveBeenCalled();
  });

  it("requires a trusted tenant even for dry run and ignores request tenant selectors", async () => {
    vi.stubEnv("LITEYNAB_USER_ID", "  ");
    const { GET } = await import("./route");
    expect((await GET(request("?dryRun=1&userId=untrusted"))).status).toBe(400);
    expect(mocks.fetchDailyTransactionBackupInput).not.toHaveBeenCalled();
    vi.stubEnv("LITEYNAB_USER_ID", " tenant-1 ");
    expect((await GET(request("?dryRun=1&userId=untrusted"))).status).toBe(200);
    expect(mocks.fetchDailyTransactionBackupInput).toHaveBeenCalledWith({ userId: "tenant-1" });
  });

  it("requires a dedicated destination without falling back to the monthly sheet", async () => {
    vi.stubEnv("GOOGLE_TRANSACTION_BACKUP_SHEET_ID", " ");
    vi.stubEnv("GOOGLE_SHEET_ID", "monthly-sheet");
    const { POST } = await import("./route");
    expect((await POST(request())).status).toBe(500);
    expect(mocks.fetchDailyTransactionBackupInput).not.toHaveBeenCalled();
  });

  it.each(["fetchDailyTransactionBackupInput", "previewDailyTransactionBackupToGoogleSheets", "syncDailyTransactionBackupToGoogleSheets"] as const)(
    "sanitizes %s errors and releases the guard for a subsequent request", async (stage) => {
      mocks[stage].mockRejectedValueOnce(new Error("private note/source_text/metadata/token must not escape"));
      const { GET } = await import("./route");
      const suffix = stage === "previewDailyTransactionBackupToGoogleSheets" ? "?dryRun=1" : "";
      const response = await GET(request(suffix));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ ok: false, error: "Daily transaction backup failed" });
      expect((await GET(request(suffix))).status).toBe(200);
    },
  );

  it.each(["source", "sync", "preview"])("blocks GET/POST overlap while %s is pending", async (stage) => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const mock = stage === "source" ? mocks.fetchDailyTransactionBackupInput
      : stage === "sync" ? mocks.syncDailyTransactionBackupToGoogleSheets : mocks.previewDailyTransactionBackupToGoogleSheets;
    mock.mockImplementationOnce(async () => { await pending; return stage === "source" ? input : {}; });
    const { GET, POST } = await import("./route");
    const first = GET(request(stage === "preview" ? "?dryRun=true" : ""));
    // Let the first call reach its provider await without timing-dependent sleeps.
    await Promise.resolve();
    const overlap = await POST(request());
    expect(overlap.status).toBe(409);
    expect(mocks.fetchDailyTransactionBackupInput).toHaveBeenCalledTimes(1);
    finish();
    expect((await first).status).toBe(200);
    expect((await POST(request())).status).toBe(200);
  });
});

function request(suffix = "", token = "secret") {
  return new Request(`https://lite-ynab.test/api/cron/daily-transaction-backup${suffix}`, { headers: { Authorization: `Bearer ${token}` } });
}
