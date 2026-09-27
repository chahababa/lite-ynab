// Synthetic executor experiment only. No user-supplied target or remote credentials.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = "20260917050000";
const filename = `${version}_transaction_source_idempotency.sql`;
const expectedHash = "9bf138a554b78ba42f51d25c68a50d829f0aa1b5fe3ee0e1ba94269f89ac88d7";
const image = "postgres@sha256:f02121de6f74d30d8a94cd1d9584125e2178d7e6c377d8130112d4e52d867995";
const cliVersion = "2.118.0";
const label = "lite-ynab.ctbc-s8-synthetic";
const runId = randomUUID();
const npmCli = process.env.npm_execpath;
assert.equal(process.argv.length, 2, "This synthetic harness accepts no target arguments");
assert.ok(npmCli && existsSync(npmCli), "Run through npm run test:s8-isolated");

function command(bin, args, options = {}) {
  const result = spawnSync(bin, args, { encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  return result;
}
function success(result, code) {
  assert.equal(result.status, 0, `${code}: ${result.stderr.slice(-1500)}`);
  return result.stdout.trim();
}
const docker = (args, options) => command("docker", args, options);
const dockerEndpoint = success(docker(["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"]), "docker-context");
assert.match(JSON.parse(dockerEndpoint), /^(unix:\/\/|npipe:\/\/)/, "Only a local Docker engine is supported");
assert.ok(!process.env.DOCKER_HOST || /^(unix:\/\/|npipe:\/\/)/.test(process.env.DOCKER_HOST), "Remote Docker override rejected");

// Read the sealed Git blob, not CRLF-transformed checkout bytes.
const blobResult = command("git", ["show", `HEAD:supabase/migrations/${filename}`], { cwd: root });
success(blobResult, "migration-blob");
const migration = blobResult.stdout;
assert.equal(createHash("sha256").update(migration).digest("hex"), expectedHash, "S8 SQL artifact changed");
const workspace = mkdtempSync(path.join(tmpdir(), "ctbc-s8-synthetic-"));
const childEnv = { ...process.env };
for (const key of Object.keys(childEnv)) {
  if (/^(SUPABASE_|PG|DATABASE_URL$|DOTENV_PRIVATE_KEY)/.test(key)) delete childEnv[key];
}
let containerId;
let dbUrl;
let holder;
const results = [];
const historical = [
  "202604020001", "202604030001", "202604030002", "202604030003", "202604030004", "202604030005",
  "202604110001", "202605180001", "202605180002", "202605210001", "202605210002", "202605210003",
  "202605210004", "20260703112413", "20260703120000",
];
function manifest(name, mismatched = false) {
  const dir = path.join(workspace, name);
  const migrations = path.join(dir, "supabase", "migrations");
  mkdirSync(migrations, { recursive: true });
  writeFileSync(path.join(dir, "supabase", "config.toml"), 'project_id = "ctbc-s8-synthetic"\n[db.seed]\nenabled = false\n');
  for (const remoteVersion of historical) {
    const localVersion = mismatched && remoteVersion === "20260703112413" ? "202607030001" : remoteVersion;
    // Deliberate synthetic placeholders: NEVER production provenance files.
    writeFileSync(path.join(migrations, `${localVersion}_synthetic_predecessor.sql`), "-- SYNTHETIC ONLY\nSELECT 1;\n");
  }
  if (mismatched) writeFileSync(path.join(migrations, "20260917040000_synthetic_s4a.sql"), "SELECT 1;\n");
  writeFileSync(path.join(migrations, filename), migration);
  return dir;
}
function owned() {
  const data = JSON.parse(success(docker(["inspect", containerId]), "inspect-owned"))[0];
  assert.equal(data.Config.Labels[label], runId, "Container ownership mismatch");
  assert.ok(data.Mounts.every((mount) => mount.Type === "tmpfs" && mount.Destination === "/var/lib/postgresql/data"), "Synthetic container must not mount existing data");
  const bindings = data.NetworkSettings.Ports["5432/tcp"];
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].HostIp, "127.0.0.1", "Database must bind only loopback");
  assert.equal(data.State.Running, true);
  return bindings[0].HostPort;
}
function sql(query, database = "s8_synthetic") {
  return docker(["exec", "-i", containerId, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input: query });
}
function cli(dir, dryRun = false) {
  owned();
  assert.match(dbUrl, /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/s8_synthetic\?/);
  return command(process.execPath, [npmCli, "exec", "--yes", `--package=supabase@${cliVersion}`, "--", "supabase", "db", "push",
    "--db-url", dbUrl, "--skip-vault", "--output-format", "json", ...(dryRun ? ["--dry-run"] : ["--yes"])], { cwd: dir, env: childEnv });
}
const snapshotSql = `SELECT jsonb_build_object(
  'rows', (SELECT count(*) FROM public.transactions),
  'row_hash', (SELECT md5(string_agg(row(t.*)::text, '|' ORDER BY id)) FROM public.transactions t),
  'history', (SELECT jsonb_agg(row(h.*)::text ORDER BY version) FROM supabase_migrations.schema_migrations h),
  'legacy', to_regclass('public.idx_transactions_user_source_source_id') IS NOT NULL,
  'constraint', (SELECT coalesce(jsonb_agg(jsonb_build_object('definition',pg_get_constraintdef(oid,true),'validated',convalidated)),'[]'::jsonb)
      FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_user_source_source_id_key'),
  's4a_sentinel', md5(pg_get_functiondef('public.reset_monthly_auto_budgets(text)'::regprocedure))
);`;
const snapshot = (database) => JSON.parse(success(sql(snapshotSql, database), "snapshot"));
function setup() {
  success(sql(`DROP TABLE IF EXISTS public.transactions CASCADE;
    DROP SCHEMA IF EXISTS supabase_migrations CASCADE;
    CREATE TABLE public.transactions (id integer PRIMARY KEY, user_id uuid NOT NULL, source text NOT NULL, source_id text, amount integer NOT NULL);
    CREATE INDEX idx_transactions_user_source_source_id ON public.transactions(user_id,source,source_id) WHERE source_id IS NOT NULL;
    CREATE SCHEMA supabase_migrations;
    CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, statements text[], name text,
      created_by text, idempotency_key text UNIQUE, rollback text[]);
    INSERT INTO supabase_migrations.schema_migrations(version,statements,name) VALUES ${historical.map((v) => `('${v}',ARRAY['SELECT 1'],'synthetic_predecessor')`).join(",")};
    CREATE OR REPLACE FUNCTION public.reset_monthly_auto_budgets(p_month_id text) RETURNS text LANGUAGE sql AS $$ SELECT 'synthetic_legacy'::text $$;
    INSERT INTO public.transactions SELECT n, '83000000-0000-0000-0000-000000000001', 'manual',
      CASE WHEN n <= 2 THEN NULL ELSE 'synthetic-' || n END, n FROM generate_series(1,10000) n;`), "setup");
}
async function test(name, action) {
  const start = performance.now();
  await action();
  results.push({ name, status: "PASS", elapsedMs: Math.round(performance.now() - start) });
  console.log(`PASS ${name}`);
}

try {
  const actualCliVersion = success(command(process.execPath, [npmCli, "exec", "--yes", `--package=supabase@${cliVersion}`, "--", "supabase", "--version"], { cwd: workspace, env: childEnv }), "cli-version");
  assert.equal(actualCliVersion, cliVersion);
  success(docker(["pull", image]), "pinned-postgres-image");
  containerId = success(docker(["run", "--detach", "--rm", "--name", `ctbc-s8-synthetic-${runId}`, "--label", `${label}=${runId}`,
    "--publish", "127.0.0.1::5432", "--tmpfs", "/var/lib/postgresql/data:rw", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "--env", "POSTGRES_DB=s8_synthetic", image]), "create-isolated-container");
  assert.match(containerId, /^[a-f0-9]{64}$/);
  const port = owned();
  // Plaintext is confined to this disposable loopback fixture, never a provider URL.
  dbUrl = `postgresql://postgres@127.0.0.1:${port}/s8_synthetic?sslmode=disable&options=${encodeURIComponent("-c lock_timeout=250ms -c statement_timeout=5s")}`;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (docker(["exec", containerId, "pg_isready", "-U", "postgres", "-d", "s8_synthetic"]).status === 0) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready, "Synthetic PostgreSQL did not become ready");
  const aligned = manifest("aligned");
  const mismatched = manifest("repo-shaped", true);
  setup();
  const baseline = snapshot();
  const checkpoint = success(docker(["exec", containerId, "pg_dump", "-U", "postgres", "-d", "s8_synthetic", "--no-owner", "--no-privileges"]), "synthetic-checkpoint");

  await test("july-drift-rejects-without-mutation", () => {
    const result = cli(mismatched, true);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /20260703112413/);
    assert.deepEqual(snapshot(), baseline);
  });
  await test("aligned-dry-run-selects-only-sealed-s8", () => {
    const result = cli(aligned, true);
    success(result, "dry-run");
    const plan = JSON.parse(result.stdout);
    const payload = plan.result ?? plan;
    assert.deepEqual(payload.migrations, [filename]);
    assert.equal(payload.dryRun, true);
    assert.deepEqual(snapshot(), baseline);
  });
  await test("duplicate-guard-preserves-catalog-history-and-rows", () => {
    success(sql("INSERT INTO public.transactions VALUES (10001,'83000000-0000-0000-0000-000000000001','manual','synthetic-3',3);"), "duplicate-fixture");
    const before = snapshot();
    const result = cli(aligned);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /duplicate transaction source identities exist/);
    assert.deepEqual(snapshot(), before);
    success(sql("DELETE FROM public.transactions WHERE id=10001;"), "remove-owned-fixture");
  });
  await test("history-insert-failure-rolls-back-s8-ddl", () => {
    success(sql(`CREATE FUNCTION supabase_migrations.reject_s8() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.version='${version}' THEN RAISE EXCEPTION 'synthetic_history_rejection'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_s8 BEFORE INSERT ON supabase_migrations.schema_migrations FOR EACH ROW EXECUTE FUNCTION supabase_migrations.reject_s8();`), "ledger-fault");
    const before = snapshot();
    const result = cli(aligned);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /synthetic_history_rejection/);
    assert.deepEqual(snapshot(), before);
    success(sql("DROP TRIGGER reject_s8 ON supabase_migrations.schema_migrations; DROP FUNCTION supabase_migrations.reject_s8();"), "clear-ledger-fault");
  });
  await test("lock-timeout-bounds-wait-and-rolls-back", async () => {
    holder = spawn("docker", ["exec", "-i", containerId, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "s8_synthetic"], { stdio: ["pipe", "ignore", "ignore"] });
    const holderDone = new Promise((resolve) => holder.on("close", resolve));
    holder.stdin.end("SET application_name='ctbc_s8_synthetic_holder'; BEGIN; LOCK TABLE public.transactions IN ACCESS SHARE MODE; SELECT pg_sleep(30); ROLLBACK;");
    let locked = false;
    for (let n = 0; n < 50; n++) {
      if (success(sql("SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name='ctbc_s8_synthetic_holder' AND l.relation='public.transactions'::regclass AND l.granted;"), "lock-probe") !== "0") { locked = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(locked, "Synthetic lock holder not ready");
    const before = snapshot();
    const result = cli(aligned);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /lock timeout/);
    assert.deepEqual(snapshot(), before);
    success(sql("SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE application_name='ctbc_s8_synthetic_holder';"), "cancel-owned-holder");
    await holderDone;
    holder = undefined;
  });
  await test("success-records-original-version-and-preserves-previous-history", () => {
    success(cli(aligned), "single-s8-apply");
    const after = snapshot();
    assert.equal(after.rows, baseline.rows);
    assert.equal(after.row_hash, baseline.row_hash);
    assert.equal(after.s4a_sentinel, baseline.s4a_sentinel);
    assert.equal(after.legacy, false);
    assert.deepEqual(after.constraint, [{ definition: "UNIQUE (user_id, source, source_id)", validated: true }]);
    assert.deepEqual(after.history.slice(0,-1), baseline.history);
    const ledger = JSON.parse(success(sql(`SELECT jsonb_build_object('version',version,'name',name,'statements',cardinality(statements)) FROM supabase_migrations.schema_migrations WHERE version='${version}';`), "new-ledger"));
    assert.deepEqual(ledger, { version, name: "transaction_source_idempotency", statements: 3 });
  });
  await test("replay-is-up-to-date-without-new-history-or-row-change", () => {
    const before = snapshot();
    success(cli(aligned), "replay");
    assert.deepEqual(snapshot(), before);
  });
  await test("constraint-rejects-duplicate-and-permits-null-and-other-owner", () => {
    const duplicate = sql("INSERT INTO public.transactions VALUES(10001,'83000000-0000-0000-0000-000000000001','manual','synthetic-3',3);");
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /transactions_user_source_source_id_key/);
    success(sql("BEGIN; INSERT INTO public.transactions VALUES(10001,'83000000-0000-0000-0000-000000000002','manual','synthetic-3',3),(10002,'83000000-0000-0000-0000-000000000001','manual',NULL,3); ROLLBACK;"), "unique-scope");
    assert.equal(snapshot().row_hash, baseline.row_hash);
  });
  await test("synthetic-pre-s8-checkpoint-restores-schema-history-and-rows", () => {
    success(sql("CREATE DATABASE s8_restore;"), "create-owned-restore-db");
    success(sql(checkpoint, "s8_restore"), "restore-owned-checkpoint");
    assert.deepEqual(snapshot("s8_restore"), baseline);
  });
  console.log(JSON.stringify({ syntheticOnly: true, productionMutation: false, cliVersion, postgresVersion: success(sql("SHOW server_version;"), "server-version"), image,
    migrationVersion: version, migrationSha256: expectedHash, syntheticRows: 10000, tests: results }, null, 2));
} finally {
  if (containerId) {
    // Remove only this run's immutable container ID, after ownership inspection.
    const data = JSON.parse(success(docker(["inspect", containerId]), "cleanup-inspect"))[0];
    assert.equal(data.Config.Labels[label], runId, "Refusing cleanup of unowned container");
    success(docker(["rm", "--force", containerId]), "cleanup-owned-container");
  }
  const relative = path.relative(tmpdir(), workspace);
  assert.ok(relative.startsWith("ctbc-s8-synthetic-") && !relative.includes(path.sep), "Refusing cleanup outside created task directory");
  rmSync(workspace, { recursive: true, force: true });
}
