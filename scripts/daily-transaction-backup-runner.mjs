import { pathToFileURL } from "node:url";

const DEFAULT_API_URL = "https://api.github.com";
const DEFAULT_BACKUP_JOB_NAME = "Daily backup";
const DEFAULT_PAGE_SIZE = 100;
const GITHUB_FILTERED_RUN_LIMIT = 1000;
const GITHUB_READ_TIMEOUT_MS = 30000;
const EXPECTED_REPOSITORY = "chahababa/lite-ynab";
const EXPECTED_WORKFLOW_FILE = "daily-transaction-backup.yml";
const EXPECTED_REF = "refs/heads/main";
const EXPECTED_EVENT = "schedule";
const EXPECTED_ENDPOINT = "https://lite-ynab.zeabur.app/api/cron/daily-transaction-backup";
const EXPECTED_BACKUP_TIMEOUT_MS = 600000;

class SchedulerError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "SchedulerError";
    this.details = details;
  }
}

export async function assertPreviousRunSafe({
  fetchImpl = fetch,
  apiUrl = DEFAULT_API_URL,
  repository,
  workflowFile,
  runId,
  runAttempt,
  runNumber,
  currentSha,
  reconciledRunAttempt,
  token,
  backupJobName = DEFAULT_BACKUP_JOB_NAME,
  pageSize = DEFAULT_PAGE_SIZE,
  runLimit = GITHUB_FILTERED_RUN_LIMIT,
}) {
  if (Number(runAttempt) > 1) {
    await assertManualRerunSafe({
      fetchImpl,
      apiUrl,
      repository,
      workflowFile,
      runId,
      runAttempt,
      runNumber,
      currentSha,
      reconciledRunAttempt,
      token,
      pageSize,
    });
    return { manualRerun: true, previousRun: null };
  }

  const previousRun = await findPreviousSubstantiveRun({
    fetchImpl,
    apiUrl,
    repository,
    workflowFile,
    runId,
    token,
    runNumber,
    currentSha,
    backupJobName,
    pageSize,
    runLimit,
  });

  if (!previousRun) return { manualRerun: false, previousRun: null };
  if (previousRun.status !== "completed" || previousRun.conclusion !== "success" || previousRun.gateReason) {
    throw new SchedulerError("Previous substantive scheduler run is not safely complete", {
      previousRunId: previousRun.id,
      previousStatus: previousRun.status,
      previousConclusion: previousRun.conclusion,
      gateReason: previousRun.gateReason,
    });
  }
  return { manualRerun: false, previousRun };
}

async function assertManualRerunSafe({
  fetchImpl,
  apiUrl,
  repository,
  workflowFile,
  runId,
  runAttempt,
  runNumber,
  currentSha,
  reconciledRunAttempt,
  token,
  pageSize,
}) {
  if (reconciledRunAttempt !== `${runId}:${runAttempt}`) {
    throw new SchedulerError("Manual re-run is missing its one-attempt reconciliation acknowledgement");
  }

  const runsUrl = new URL(
    `/repos/${repository}/actions/workflows/${encodeURIComponent(workflowFile)}/runs`,
    apiUrl,
  );
  runsUrl.searchParams.set("event", "schedule");
  runsUrl.searchParams.set("per_page", String(pageSize));
  runsUrl.searchParams.set("page", "1");
  const payload = await getGitHubJson(fetchImpl, runsUrl, token, "manual re-run history");
  if (!Array.isArray(payload.workflow_runs)) {
    throw new SchedulerError("GitHub manual re-run history response is invalid");
  }
  const totalCount = payload.total_count;
  if (typeof totalCount !== "number" || !Number.isSafeInteger(totalCount)
    || totalCount < 0 || payload.workflow_runs.length !== Math.min(totalCount, pageSize)) {
    throw new SchedulerError("GitHub manual re-run history pagination is invalid");
  }

  const seenNumbers = new Set();
  const seenIds = new Set();
  let currentRun;
  let highestRunNumber = 0;
  let previousRunNumber = Number.POSITIVE_INFINITY;
  for (const run of payload.workflow_runs) {
    if (seenIds.has(String(run.id))) throw new SchedulerError("GitHub manual re-run history has duplicate run IDs");
    seenIds.add(String(run.id));
    if (!Number.isSafeInteger(run.run_number) || run.run_number <= 0 || seenNumbers.has(run.run_number)) {
      throw new SchedulerError("GitHub manual re-run history has invalid or duplicate run numbers");
    }
    if (run.run_number >= previousRunNumber) {
      throw new SchedulerError("GitHub manual re-run history is not ordered by descending run number");
    }
    seenNumbers.add(run.run_number);
    previousRunNumber = run.run_number;
    highestRunNumber = Math.max(highestRunNumber, run.run_number);
    if (String(run.id) === String(runId)) currentRun = run;
  }
  if (!currentRun) throw new SchedulerError("Manual re-run is not the latest verifiable scheduled run");
  if (currentRun.run_number !== Number(runNumber) || highestRunNumber !== Number(runNumber)) {
    throw new SchedulerError("Manual re-run is older than another scheduled run");
  }
  if (currentRun.head_sha !== currentSha) {
    throw new SchedulerError("Manual re-run history does not match GITHUB_SHA");
  }
}

export async function assertCurrentMainSha({ fetchImpl = fetch, apiUrl = DEFAULT_API_URL, repository, token, currentSha }) {
  const commitUrl = new URL(`/repos/${repository}/commits/main`, apiUrl);
  const payload = await getGitHubJson(fetchImpl, commitUrl, token, "production main commit");
  if (payload.sha !== currentSha) throw new SchedulerError("GITHUB_SHA is not the current production main commit");
}

export async function findPreviousSubstantiveRun({
  fetchImpl = fetch,
  apiUrl = DEFAULT_API_URL,
  repository,
  workflowFile,
  runId,
  token,
  runNumber,
  currentSha,
  backupJobName = DEFAULT_BACKUP_JOB_NAME,
  pageSize = DEFAULT_PAGE_SIZE,
  runLimit = GITHUB_FILTERED_RUN_LIMIT,
}) {
  let page = 1;
  let seenRunCount = 0;
  const seenRunIds = new Set();
  const seenRunNumbers = new Set();
  let expectedRunTotal;
  let currentRunSeen = false;
  let previousRunNumber = Number.POSITIVE_INFINITY;
  for (;;) {
    const runsUrl = new URL(
      `/repos/${repository}/actions/workflows/${encodeURIComponent(workflowFile)}/runs`,
      apiUrl,
    );
    runsUrl.searchParams.set("event", "schedule");
    runsUrl.searchParams.set("per_page", String(pageSize));
    runsUrl.searchParams.set("page", String(page));
    const payload = await getGitHubJson(fetchImpl, runsUrl, token, "workflow run history");
    const runs = Array.isArray(payload.workflow_runs) ? payload.workflow_runs : null;
    if (!runs) throw new SchedulerError("GitHub workflow run history response is invalid");
    const totalCount = payload.total_count;
    if (typeof totalCount !== "number" || !Number.isSafeInteger(totalCount) || totalCount < 0) {
      throw new SchedulerError("GitHub workflow run history pagination is invalid");
    }
    expectedRunTotal ??= totalCount;
    if (totalCount !== expectedRunTotal) {
      throw new SchedulerError("GitHub workflow run history pagination changed during readback");
    }
    const expectedPageLength = Math.min(pageSize, totalCount - seenRunCount);
    if (runs.length !== expectedPageLength) {
      throw new SchedulerError("GitHub workflow run history page is incomplete");
    }

    for (const run of runs) {
      if (seenRunIds.has(String(run.id))) {
        throw new SchedulerError("GitHub workflow run history contains duplicate pages");
      }
      seenRunIds.add(String(run.id));
      if (!Number.isSafeInteger(run.run_number) || run.run_number <= 0 || seenRunNumbers.has(run.run_number)) {
        throw new SchedulerError("GitHub workflow run history has invalid or duplicate run numbers");
      }
      if (run.run_number >= previousRunNumber) {
        throw new SchedulerError("GitHub workflow run history is not ordered by descending run number");
      }
      seenRunNumbers.add(run.run_number);
      previousRunNumber = run.run_number;
    }

    for (const run of runs) {
      seenRunCount += 1;
      if (String(run.id) === String(runId)) {
        if (run.run_number !== Number(runNumber) || run.head_sha !== currentSha) {
          throw new SchedulerError("GitHub workflow run history does not match the current run identity");
        }
        currentRunSeen = true;
        continue;
      }
      if (!currentRunSeen) {
        throw new SchedulerError("GitHub workflow run history did not begin with the current run");
      }
      if (run.status !== "completed") return { ...run, gateReason: "previous-run-not-completed" };

      const jobs = await getAllRunJobs({ fetchImpl, apiUrl, repository, runId: run.id, token, pageSize });
      const backupJobs = jobs.filter((job) => job.name === backupJobName);
      if (backupJobs.length === 0) return { ...run, gateReason: "backup-job-readback-missing" };
      if (backupJobs.every((job) => job.conclusion === "skipped")) {
        if (run.conclusion === "success") continue;
        return { ...run, gateReason: "disabled-run-not-successful" };
      }
      return run;
    }

    if (seenRunCount === totalCount) {
      if (!currentRunSeen) throw new SchedulerError("GitHub workflow run history is missing the current run");
      return null;
    }
    if (seenRunCount > totalCount) throw new SchedulerError("GitHub workflow run history pagination changed during readback");
    if (runs.length === 0) throw new SchedulerError("GitHub workflow run history pagination ended early");
    if (page * pageSize >= runLimit) {
      throw new SchedulerError("GitHub workflow run history exceeded the verifiable pagination limit");
    }
    page += 1;
  }
}

async function getAllRunJobs({ fetchImpl, apiUrl, repository, runId, token, pageSize }) {
  const jobs = [];
  const seenJobIds = new Set();
  let expectedJobTotal;
  let page = 1;
  for (;;) {
    const jobsUrl = new URL(`/repos/${repository}/actions/runs/${runId}/jobs`, apiUrl);
    jobsUrl.searchParams.set("filter", "latest");
    jobsUrl.searchParams.set("per_page", String(pageSize));
    jobsUrl.searchParams.set("page", String(page));
    const payload = await getGitHubJson(fetchImpl, jobsUrl, token, "workflow job history");
    if (!Array.isArray(payload.jobs)) throw new SchedulerError("GitHub workflow job history response is invalid");
    const totalCount = payload.total_count;
    if (typeof totalCount !== "number" || !Number.isSafeInteger(totalCount)
      || totalCount < 0 || totalCount > GITHUB_FILTERED_RUN_LIMIT) {
      throw new SchedulerError("GitHub workflow job history pagination is invalid");
    }
    expectedJobTotal ??= totalCount;
    if (totalCount !== expectedJobTotal) {
      throw new SchedulerError("GitHub workflow job history pagination changed during readback");
    }
    const expectedPageLength = Math.min(pageSize, totalCount - jobs.length);
    if (payload.jobs.length !== expectedPageLength) {
      throw new SchedulerError("GitHub workflow job history page is incomplete");
    }
    for (const job of payload.jobs) {
      if (seenJobIds.has(String(job.id))) throw new SchedulerError("GitHub workflow job history contains duplicate pages");
      seenJobIds.add(String(job.id));
    }
    jobs.push(...payload.jobs);
    if (jobs.length === totalCount) return jobs;
    if (jobs.length > totalCount) throw new SchedulerError("GitHub workflow job history pagination changed during readback");
    if (payload.jobs.length === 0) throw new SchedulerError("GitHub workflow job history pagination ended early");
    if (page * pageSize >= GITHUB_FILTERED_RUN_LIMIT) {
      throw new SchedulerError("GitHub workflow job history exceeded the verifiable pagination limit");
    }
    page += 1;
  }
}

async function getGitHubJson(fetchImpl, url, token, operation) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      redirect: "error",
      signal: AbortSignal.timeout(GITHUB_READ_TIMEOUT_MS),
    });
  } catch {
    throw new SchedulerError(`GitHub ${operation} request failed`);
  }
  if (response.redirected) throw new SchedulerError(`GitHub ${operation} redirected unexpectedly`);
  if (!response.ok) throw new SchedulerError(`GitHub ${operation} returned HTTP ${response.status}`, { httpStatus: response.status });
  try {
    return await response.json();
  } catch {
    throw new SchedulerError(`GitHub ${operation} response is invalid`);
  }
}

export async function runBackup({ fetchImpl = fetch, endpoint, secret, timeoutMs }) {
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${secret}`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new SchedulerError("Backup request ended without a conclusive HTTP response");
  }

  if (response.redirected) throw new SchedulerError("Backup request redirected and was not accepted");

  if (response.status !== 200) {
    throw new SchedulerError(`Backup endpoint returned HTTP ${response.status}`, { httpStatus: response.status });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new SchedulerError("Backup endpoint returned an invalid success response");
  }
  const result = payload?.result;
  const events = result?.events;
  const eventNames = ["BACKFILL", "INSERT", "UPDATE", "DELETE", "deduped"];
  if (payload?.ok !== true || !isCount(result?.currentRows)
    || !events || eventNames.some((name) => !isCount(events[name]))) {
    throw new SchedulerError("Backup endpoint returned an invalid success response");
  }
  return {
    currentRows: result.currentRows,
    events: Object.fromEntries(eventNames.map((name) => [name, events[name]])),
  };
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function requiredEnv(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new SchedulerError(`Missing required scheduler setting: ${name}`);
  return value;
}

export async function main({ env = process.env, fetchImpl = fetch, logger = console } = {}) {
  const repository = requiredEnv(env, "GITHUB_REPOSITORY");
  const workflowFile = requiredEnv(env, "SCHEDULER_WORKFLOW_FILE");
  const runId = requiredEnv(env, "GITHUB_RUN_ID");
  const runAttempt = requiredEnv(env, "GITHUB_RUN_ATTEMPT");
  const runNumber = requiredEnv(env, "GITHUB_RUN_NUMBER");
  const currentSha = requiredEnv(env, "GITHUB_SHA");
  const eventName = requiredEnv(env, "GITHUB_EVENT_NAME");
  const ref = requiredEnv(env, "GITHUB_REF");
  const workflowRef = requiredEnv(env, "GITHUB_WORKFLOW_REF");
  const token = requiredEnv(env, "GITHUB_TOKEN");
  const endpoint = requiredEnv(env, "BACKUP_ENDPOINT");
  const secret = requiredEnv(env, "BACKUP_CRON_SECRET");
  const timeoutMs = Number(requiredEnv(env, "BACKUP_TIMEOUT_MS"));
  if (!/^\d+$/.test(runId) || !Number.isSafeInteger(Number(runId)) || Number(runId) <= 0) {
    throw new SchedulerError("GITHUB_RUN_ID must be a positive safe integer");
  }
  if (!/^\d+$/.test(runAttempt) || !Number.isSafeInteger(Number(runAttempt)) || Number(runAttempt) <= 0) {
    throw new SchedulerError("GITHUB_RUN_ATTEMPT must be a positive safe integer");
  }
  if (!/^\d+$/.test(runNumber) || !Number.isSafeInteger(Number(runNumber)) || Number(runNumber) <= 0) {
    throw new SchedulerError("GITHUB_RUN_NUMBER must be a positive safe integer");
  }
  if (!/^[0-9a-f]{40}$/.test(currentSha)) throw new SchedulerError("GITHUB_SHA must be a full commit SHA");
  if (repository !== EXPECTED_REPOSITORY) throw new SchedulerError("GITHUB_REPOSITORY does not match the production repository");
  if (workflowFile !== EXPECTED_WORKFLOW_FILE) throw new SchedulerError("SCHEDULER_WORKFLOW_FILE does not match the production workflow");
  if (eventName !== EXPECTED_EVENT) throw new SchedulerError("GITHUB_EVENT_NAME is not the scheduled production event");
  if (ref !== EXPECTED_REF) throw new SchedulerError("GITHUB_REF is not the production default branch");
  if (workflowRef !== `${EXPECTED_REPOSITORY}/.github/workflows/${EXPECTED_WORKFLOW_FILE}@${EXPECTED_REF}`) {
    throw new SchedulerError("GITHUB_WORKFLOW_REF does not match the production workflow on main");
  }
  if (endpoint !== EXPECTED_ENDPOINT) throw new SchedulerError("BACKUP_ENDPOINT does not match the production endpoint");
  if (timeoutMs !== EXPECTED_BACKUP_TIMEOUT_MS) {
    throw new SchedulerError("BACKUP_TIMEOUT_MS must match the reviewed production timeout");
  }

  await assertCurrentMainSha({ fetchImpl, repository, token, currentSha });

  const gate = await assertPreviousRunSafe({
    fetchImpl,
    repository,
    workflowFile,
    runId,
    runAttempt,
    runNumber,
    currentSha,
    reconciledRunAttempt: env.RECONCILED_RUN_ATTEMPT?.trim(),
    token,
  });
  if (gate.manualRerun) {
    logger.warn(`Manual re-run attempt ${runAttempt}; operator reconciliation is required before this attempt`);
  }

  const result = await runBackup({ fetchImpl, endpoint, secret, timeoutMs });
  logger.info(
    `Backup completed: currentRows=${result.currentRows}; `
      + `BACKFILL=${result.events.BACKFILL}; INSERT=${result.events.INSERT}; `
      + `UPDATE=${result.events.UPDATE}; DELETE=${result.events.DELETE}; deduped=${result.events.deduped}`,
  );
  return result;
}

function formatFailure(error, env) {
  const details = error instanceof SchedulerError ? error.details : {};
  const fields = [
    "Daily backup scheduler failed",
    `at=${new Date().toISOString()}`,
    `runId=${env.GITHUB_RUN_ID ?? "unknown"}`,
    `runAttempt=${env.GITHUB_RUN_ATTEMPT ?? "unknown"}`,
    `reason=${error instanceof SchedulerError ? error.message : "Unexpected scheduler error"}`,
  ];
  if (details.httpStatus) fields.push(`httpStatus=${details.httpStatus}`);
  if (details.previousRunId) fields.push(`previousRunId=${details.previousRunId}`);
  if (details.previousStatus) fields.push(`previousStatus=${details.previousStatus}`);
  if (details.previousConclusion) fields.push(`previousConclusion=${details.previousConclusion}`);
  if (details.gateReason) fields.push(`gateReason=${details.gateReason}`);
  return fields.join("; ");
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(formatFailure(error, process.env));
    process.exitCode = 1;
  });
}

export { SchedulerError, formatFailure };
