import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import {
  SchedulerError,
  assertCurrentMainSha,
  assertPreviousRunSafe,
  formatFailure,
  main,
  runBackup,
} from "./daily-transaction-backup-runner.mjs";

const baseGate = {
  repository: "owner/repo",
  workflowFile: "daily-transaction-backup.yml",
  runId: "300",
  runAttempt: "1",
  runNumber: "3",
  currentSha: "a".repeat(40),
  token: "github-token",
};

const productionEnv = {
  GITHUB_REPOSITORY: "chahababa/lite-ynab",
  SCHEDULER_WORKFLOW_FILE: "daily-transaction-backup.yml",
  GITHUB_RUN_ID: "300",
  GITHUB_RUN_ATTEMPT: "1",
  GITHUB_RUN_NUMBER: "3",
  GITHUB_SHA: "a".repeat(40),
  GITHUB_EVENT_NAME: "schedule",
  GITHUB_REF: "refs/heads/main",
  GITHUB_WORKFLOW_REF: "chahababa/lite-ynab/.github/workflows/daily-transaction-backup.yml@refs/heads/main",
  GITHUB_TOKEN: "github-token",
  BACKUP_ENDPOINT: "https://lite-ynab.zeabur.app/api/cron/daily-transaction-backup",
  BACKUP_CRON_SECRET: "backup-secret",
  BACKUP_TIMEOUT_MS: "600000",
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function apiFixture({ pages, jobs, totalCount = pages.flat().length }) {
  return vi.fn(async (input) => {
    const url = new URL(input);
    const runJobs = url.pathname.match(/\/actions\/runs\/(\d+)\/jobs$/);
    if (runJobs) {
      const values = jobs[runJobs[1]] ?? [];
      return json({ total_count: values.length, jobs: values });
    }
    const page = Number(url.searchParams.get("page"));
    return json({ total_count: totalCount, workflow_runs: pages[page - 1] ?? [] });
  });
}

describe("daily backup workflow contract", () => {
  it("keeps a single non-cancelling queue and has no manual dispatch trigger", () => {
    const workflow = readFileSync(new URL("../.github/workflows/daily-transaction-backup.yml", import.meta.url), "utf8");
    expect(workflow).toMatch(/cron: ["']30 3 \* \* \*["']/);
    expect(workflow).toContain("timezone: Asia/Taipei");
    expect(workflow).toContain("group: daily-transaction-backup-production");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("queue: max");
    expect(workflow).toContain("timeout-minutes: 15");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("actions/checkout@11d5960a326750d5838078e36cf38b85af677262");
    expect(workflow).toContain("vars.DAILY_TRANSACTION_BACKUP_ENABLED == 'true'");
    expect(workflow).not.toContain("workflow_dispatch");
  });
});

describe("daily backup scheduler history gate", () => {
  it("allows the first substantive scheduled run", async () => {
    const fetchImpl = apiFixture({ pages: [[{ id: 300, status: "in_progress", conclusion: null }]], jobs: {} });
    await expect(assertPreviousRunSafe({ ...baseGate, fetchImpl })).resolves.toEqual({
      manualRerun: false,
      previousRun: null,
    });
  });

  it("does not let disabled successful runs hide an older failure", async () => {
    const fetchImpl = apiFixture({
      pages: [[
        { id: 300, status: "in_progress", conclusion: null },
        { id: 200, status: "completed", conclusion: "success" },
        { id: 100, status: "completed", conclusion: "failure" },
      ]],
      jobs: {
        200: [{ name: "Daily backup", conclusion: "skipped" }],
        100: [{ name: "Daily backup", conclusion: "failure" }],
      },
    });
    await expect(assertPreviousRunSafe({ ...baseGate, fetchImpl })).rejects.toMatchObject({
      details: { previousRunId: 100, previousConclusion: "failure" },
    });
  });

  it("paginates past disabled runs before deciding", async () => {
    const fetchImpl = apiFixture({
      pages: [
        [{ id: 300, status: "in_progress", conclusion: null }, { id: 200, status: "completed", conclusion: "success" }],
        [{ id: 100, status: "completed", conclusion: "success" }],
      ],
      jobs: {
        200: [{ id: 20, name: "Daily backup", conclusion: "skipped" }],
        100: [{ id: 10, name: "Daily backup", conclusion: "success" }],
      },
    });
    const result = await assertPreviousRunSafe({ ...baseGate, fetchImpl, pageSize: 2 });
    expect(result.previousRun.id).toBe(100);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("fails closed when prior job readback is missing", async () => {
    const fetchImpl = apiFixture({
      pages: [[{ id: 300, status: "in_progress", conclusion: null }, { id: 200, status: "completed", conclusion: "success" }]],
      jobs: { 200: [] },
    });
    await expect(assertPreviousRunSafe({ ...baseGate, fetchImpl })).rejects.toMatchObject({
      details: { gateReason: "backup-job-readback-missing" },
    });
  });

  it("fails closed when a later history page cannot be read", async () => {
    const fetchImpl = vi.fn(async (input) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/jobs")) {
        return json({ total_count: 1, jobs: [{ id: 20, name: "Daily backup", conclusion: "skipped" }] });
      }
      if (url.searchParams.get("page") === "2") return json({ message: "sensitive provider detail" }, 500);
      return json({
        total_count: 3,
        workflow_runs: [
          { id: 300, status: "in_progress", conclusion: null },
          { id: 200, status: "completed", conclusion: "success" },
        ],
      });
    });
    await expect(assertPreviousRunSafe({ ...baseGate, fetchImpl, pageSize: 2 }))
      .rejects.toThrow("GitHub workflow run history returned HTTP 500");
  });

  it("fails closed when history total_count changes between pages", async () => {
    const fetchImpl = vi.fn(async (input) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/jobs")) {
        return json({ total_count: 1, jobs: [{ id: 20, name: "Daily backup", conclusion: "skipped" }] });
      }
      if (url.searchParams.get("page") === "2") return json({ total_count: 2, workflow_runs: [] });
      return json({
        total_count: 3,
        workflow_runs: [
          { id: 300, status: "in_progress", conclusion: null },
          { id: 200, status: "completed", conclusion: "success" },
        ],
      });
    });
    await expect(assertPreviousRunSafe({ ...baseGate, fetchImpl, pageSize: 2 }))
      .rejects.toThrow("pagination changed during readback");
  });

  it("fails closed on duplicate pagination pages", async () => {
    const duplicate = { id: 200, status: "completed", conclusion: "success" };
    const fetchImpl = vi.fn(async (input) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/jobs")) {
        return json({ total_count: 1, jobs: [{ id: 20, name: "Daily backup", conclusion: "skipped" }] });
      }
      return json({
        total_count: 3,
        workflow_runs: url.searchParams.get("page") === "1"
          ? [{ id: 300, status: "in_progress", conclusion: null }, duplicate]
          : [duplicate],
      });
    });
    await expect(assertPreviousRunSafe({ ...baseGate, fetchImpl, pageSize: 2 }))
      .rejects.toThrow("contains duplicate pages");
  });

  it("uses a recent substantive success even when older history exceeds the API limit", async () => {
    const fetchImpl = apiFixture({
      pages: [[
        { id: 300, status: "in_progress", conclusion: null },
        { id: 200, status: "completed", conclusion: "success" },
        ...Array.from({ length: 98 }, (_, index) => ({ id: 1000 + index, status: "completed", conclusion: "success" })),
      ], ...Array.from({ length: 10 }, () => [])],
      jobs: { 200: [{ id: 20, name: "Daily backup", conclusion: "success" }] },
      totalCount: 1001,
    });
    const result = await assertPreviousRunSafe({ ...baseGate, fetchImpl });
    expect(result.previousRun.id).toBe(200);
  });

  it("fails closed when skipped runs exhaust the verifiable history limit", async () => {
    const disabledRun = (id) => ({ id, status: "completed", conclusion: "success" });
    const fetchImpl = apiFixture({
      pages: [[disabledRun(300), disabledRun(200)], [disabledRun(100), disabledRun(99)]],
      jobs: {
        200: [{ id: 20, name: "Daily backup", conclusion: "skipped" }],
        100: [{ id: 10, name: "Daily backup", conclusion: "skipped" }],
        99: [{ id: 9, name: "Daily backup", conclusion: "skipped" }],
      },
      totalCount: 5,
    });
    await expect(assertPreviousRunSafe({ ...baseGate, fetchImpl, pageSize: 2, runLimit: 4 }))
      .rejects.toThrow("exceeded the verifiable pagination limit");
  });

  it("permits only the latest explicitly reconciled manual re-run attempt", async () => {
    const fetchImpl = apiFixture({
      pages: [[{ id: 300, run_number: 3, head_sha: "a".repeat(40), status: "in_progress", conclusion: null }]],
      jobs: {},
    });
    await expect(assertPreviousRunSafe({
      ...baseGate,
      runAttempt: "2",
      reconciledRunAttempt: "300:2",
      fetchImpl,
    })).resolves.toEqual({
      manualRerun: true,
      previousRun: null,
    });
  });

  it("rejects an old manual re-run after a newer scheduled run exists", async () => {
    const fetchImpl = apiFixture({
      pages: [[
        { id: 400, run_number: 4, head_sha: "a".repeat(40), status: "completed", conclusion: "failure" },
        { id: 300, run_number: 3, head_sha: "a".repeat(40), status: "in_progress", conclusion: null },
      ]],
      jobs: {},
    });
    await expect(assertPreviousRunSafe({
      ...baseGate,
      runAttempt: "2",
      reconciledRunAttempt: "300:2",
      fetchImpl,
    })).rejects.toThrow("older than another scheduled run");
  });

  it("makes reconciliation acknowledgement specific to one run attempt", async () => {
    const fetchImpl = vi.fn();
    await expect(assertPreviousRunSafe({
      ...baseGate,
      runAttempt: "3",
      reconciledRunAttempt: "300:2",
      fetchImpl,
    })).rejects.toThrow("one-attempt reconciliation acknowledgement");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("daily backup scheduler request", () => {
  it("returns only validated aggregate counts", async () => {
    const fetchImpl = vi.fn(async () => json({
      ok: true,
      result: {
        spreadsheetId: "do-not-log-this",
        backupRunId: "do-not-log-this-either",
        currentRows: 4,
        events: { BACKFILL: 0, INSERT: 1, UPDATE: 2, DELETE: 0, deduped: 3 },
      },
    }));
    await expect(runBackup({ fetchImpl, endpoint: "https://example.test/backup", secret: "secret", timeoutMs: 1000 }))
      .resolves.toEqual({ currentRows: 4, events: { BACKFILL: 0, INSERT: 1, UPDATE: 2, DELETE: 0, deduped: 3 } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry an HTTP or transport failure", async () => {
    const httpFailure = vi.fn(async () => json({ ok: false, sensitive: "payload" }, 500));
    await expect(runBackup({ fetchImpl: httpFailure, endpoint: "https://example.test/backup", secret: "secret", timeoutMs: 1000 }))
      .rejects.toThrow("Backup endpoint returned HTTP 500");
    expect(httpFailure).toHaveBeenCalledTimes(1);

    const transportFailure = vi.fn(async () => { throw new Error("response lost"); });
    await expect(runBackup({ fetchImpl: transportFailure, endpoint: "https://example.test/backup", secret: "secret", timeoutMs: 1000 }))
      .rejects.toThrow("without a conclusive HTTP response");
    expect(transportFailure).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed HTTP 200 payloads", async () => {
    const fetchImpl = vi.fn(async () => json({
      ok: true,
      result: { currentRows: 4, events: { BACKFILL: 4 } },
    }));
    await expect(runBackup({ fetchImpl, endpoint: "https://example.test/backup", secret: "secret", timeoutMs: 1000 }))
      .rejects.toThrow("invalid success response");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const unsafeCount = vi.fn(async () => json({
      ok: true,
      result: {
        currentRows: Number.MAX_SAFE_INTEGER + 1,
        events: { BACKFILL: 0, INSERT: 0, UPDATE: 0, DELETE: 0, deduped: 0 },
      },
    }));
    await expect(runBackup({ fetchImpl: unsafeCount, endpoint: "https://example.test/backup", secret: "secret", timeoutMs: 1000 }))
      .rejects.toThrow("invalid success response");
  });

  it("rejects redirects before treating them as success", async () => {
    const redirectedResponse = {
      status: 200,
      redirected: true,
      json: vi.fn(async () => ({
        ok: true,
        result: {
          currentRows: 0,
          events: { BACKFILL: 0, INSERT: 0, UPDATE: 0, DELETE: 0, deduped: 0 },
        },
      })),
    };
    const fetchImpl = vi.fn(async () => redirectedResponse);
    await expect(runBackup({ fetchImpl, endpoint: "https://example.test/backup", secret: "secret", timeoutMs: 1000 }))
      .rejects.toThrow("redirected and was not accepted");
    expect(fetchImpl.mock.calls[0][1].redirect).toBe("error");
  });

  it("keeps credentials and response payloads out of failure text", () => {
    const output = formatFailure(
      new SchedulerError("Backup endpoint returned HTTP 500", { httpStatus: 500 }),
      { GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "1" },
    );
    expect(output).toContain("httpStatus=500");
    expect(output).toContain("runId=123");
    expect(output).not.toContain("secret");
    expect(output).not.toContain("payload");
  });

  it("logs only aggregate counts on success", async () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    const fetchImpl = vi.fn(async (input) => {
      const url = new URL(input);
      if (url.hostname === "api.github.com") {
        if (url.pathname.endsWith("/commits/main")) return json({ sha: "a".repeat(40) });
        return json({ total_count: 1, workflow_runs: [{ id: 300, status: "in_progress", conclusion: null }] });
      }
      return json({
        ok: true,
        result: {
          spreadsheetId: "private-sheet-id",
          backupRunId: "private-run-id",
          currentRows: 2,
          events: { BACKFILL: 2, INSERT: 0, UPDATE: 0, DELETE: 0, deduped: 0 },
        },
      });
    });
    await main({
      fetchImpl,
      logger,
      env: productionEnv,
    });
    const logged = logger.info.mock.calls.flat().join(" ");
    expect(logged).toContain("currentRows=2");
    expect(logged).not.toContain("private-sheet-id");
    expect(logged).not.toContain("private-run-id");
    expect(logged).not.toContain("backup-secret");
  });

  it("rejects a stale rerun SHA before reading scheduler history", async () => {
    const fetchImpl = vi.fn(async () => json({ sha: "b".repeat(40) }));
    await expect(assertCurrentMainSha({
      fetchImpl,
      repository: "chahababa/lite-ynab",
      token: "github-token",
      currentSha: "a".repeat(40),
    })).rejects.toThrow("current production main commit");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects drifted GitHub context before any network request", async () => {
    const fetchImpl = vi.fn();
    await expect(main({
      fetchImpl,
      logger: { info: vi.fn(), warn: vi.fn() },
      env: {
        ...productionEnv,
        GITHUB_RUN_ID: "not-a-run-id",
      },
    })).rejects.toThrow("GITHUB_RUN_ID must be a positive safe integer");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["GITHUB_REPOSITORY", "someone/fork", "production repository"],
    ["GITHUB_EVENT_NAME", "workflow_dispatch", "scheduled production event"],
    ["GITHUB_REF", "refs/heads/release", "production default branch"],
    ["GITHUB_WORKFLOW_REF", "chahababa/lite-ynab/.github/workflows/other.yml@refs/heads/main", "production workflow on main"],
    ["BACKUP_ENDPOINT", "https://example.test/backup", "production endpoint"],
    ["BACKUP_TIMEOUT_MS", "599999", "reviewed production timeout"],
  ])("fails before network when %s drifts", async (name, value, message) => {
    const fetchImpl = vi.fn();
    await expect(main({
      fetchImpl,
      logger: { info: vi.fn(), warn: vi.fn() },
      env: { ...productionEnv, [name]: value },
    })).rejects.toThrow(message);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
