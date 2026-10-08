// Disposable CI database only; no application, network client or credentials.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

assert.equal(process.platform, 'linux', 'This harness runs only in disposable Linux CI.');
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.GITHUB_REF, 'refs/heads/test/ctbc-wrapper-isolated-20261008');
const root = process.cwd();
const fixtureDir = path.join(root, 'scripts/ctbc-wrapper-test-fixture');
const resultDir = path.join(root, 'test-results/ctbc-wrapper');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const run = (command, args, input) => spawnSync(command, args, {
  cwd: root, input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
});
const psql = sql => run('docker', ['exec', '-i', 'supabase_db_lite-ynab-local',
  'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-F', '|', '-U', 'postgres', '-d', 'postgres'], sql);
const must = result => {
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout);
  return result.stdout.trim();
};

if (process.argv.includes('--prepare')) {
  // Provision the public, synthetic 16-row baseline. No production history rows
  // or seals enter this checkout. S4A is excluded only from this local fixture.
  const temporary = path.join(process.env.RUNNER_TEMP, 'ctbc-excluded-local-fixture');
  fs.mkdirSync(temporary, { recursive: true });
  for (const file of ['20260917040000_tenant_scoped_monthly_budget_reset.sql',
    '20261008002233_ctbc_inbox.sql', '20261008013654_ctbc_worker_lifecycle.sql']) {
    fs.renameSync(path.join(root, 'supabase/migrations', file), path.join(temporary, file));
  }
  assert.equal(fs.readdirSync(path.join(root, 'supabase/migrations')).filter(f => f.endsWith('.sql')).length, 16);
  console.log('Prepared public-only synthetic 16-migration baseline.');
  process.exit(0);
}

fs.mkdirSync(resultDir, { recursive: true });
const differences = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'guard-differences.json')));
for (const file of differences.files) assert.equal(sha(fs.readFileSync(path.join(fixtureDir, file.file))), file.templateSha256);
const proof = { state: 'RUNNING', productionRequests: 0, target: 'disposable-local-supabase-only',
  commit: process.env.GITHUB_SHA, differences, cases: [],
  limits: ['Native SQL Editor executor and large-payload transport remain UNKNOWN.',
    'Production event catalog and historical rows are replaced by public local fixtures.',
    'No Gmail, OAuth, application, S8/S9 acceptance or full CI was executed.'] };
const save = () => fs.writeFileSync(path.join(resultDir, 'proof.json'), JSON.stringify(proof, null, 2) + '\n');
const reset = () => {
  const result = run('supabase', ['db', 'reset', '--local', '--version', '20260917050000', '--no-seed']);
  fs.writeFileSync(path.join(resultDir, 'last-reset.log'), result.stdout + result.stderr);
  must(result);
};
const eventQuery = `SELECT e.evtname::text AS trigger_name,e.evtevent::text AS event,e.evtenabled::text AS enabled,e.evttags AS tags,pg_get_userbyid(e.evtowner)::text AS owner,e.evtfoid::regprocedure::text AS function_signature,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS function_body_sha256,pg_get_userbyid(p.proowner)::text AS function_owner,p.prosecdef AS security_definer FROM pg_event_trigger e JOIN pg_proc p ON p.oid=e.evtfoid WHERE e.evtenabled<>'D' ORDER BY e.evtname`;
const templates = () => {
  const history = JSON.parse(must(psql(`SELECT json_agg(h ORDER BY version) FROM (SELECT version,name,cardinality(statements) AS statement_count,encode(sha256(convert_to(array_to_json(statements)::text,'UTF8')),'hex') AS statement_array_sha256 FROM supabase_migrations.schema_migrations) h;`)));
  assert.equal(history.length, 16);
  assert.ok(history.every(h => h.statement_count > 0 && h.statement_array_sha256));
  const events = JSON.parse(must(psql(`SELECT coalesce(json_agg(e),'[]'::json) FROM (${eventQuery}) e;`)));
  assert.ok(events.length > 0, 'Require an actual local platform event-trigger fixture.');
  const historyRows = history.map(h => `(${[h.version,h.name,h.statement_count,h.statement_array_sha256].map(quote).join(',')})`).join(',\n');
  const eventRows = events.map(e => `(${[e.trigger_name,e.event,e.enabled].map(quote).join(',')},${e.tags ? 'ARRAY[' + e.tags.map(quote).join(',') + ']::text[]' : 'NULL::text[]'},${[e.owner,e.function_signature,e.function_body_sha256,e.function_owner].map(quote).join(',')},${e.security_definer})`).join(',\n');
  const replacements = { __LOCAL_HISTORY_ROWS__: historyRows, __LOCAL_EVENT_ROWS__: eventRows,
    __LOCAL_EVENT_RECEIPT__: sha(JSON.stringify({ syntheticLocalReview: true, events })) };
  const built = {};
  for (const name of ['apply', 'phase1', 'phase2']) {
    let sql = fs.readFileSync(path.join(fixtureDir, name + '.sql'), 'utf8');
    for (const [token,value] of Object.entries(replacements)) sql = sql.replaceAll(token,value);
    assert.ok(!sql.includes('__LOCAL_'));
    // Reverse the fixture substitutions to recheck the immutable wrapper skeleton.
    let masked = sql;
    for (const [token,value] of Object.entries(replacements)) masked = masked.replaceAll(value,token);
    assert.equal(masked, fs.readFileSync(path.join(fixtureDir, name + '.sql'), 'utf8'));
    built[name] = sql;
  }
  return { ...built, historyRows: history.length, eventRows: events.length };
};
const execute = (name, sql) => {
  const result = psql(sql);
  fs.writeFileSync(path.join(resultDir, name + '.log'), result.stdout + result.stderr);
  return result;
};
const readback = (name, sql, expected) => {
  const output = must(execute(name, sql));
  const states = output.split('\n').filter(line => /^(ABSENT_EXACT_16_BASELINE|ALL_PRESENT_EXACT_18_HISTORY|PARTIAL_OR_DRIFT_STOP)\|/.test(line));
  assert.equal(states.length, 1);
  assert.equal(states[0].split('|')[0], expected);
  const [,expectedObjects,presentObjects,historyRows,newHistoryRows] = states[0].split('|');
  return { state: expected, expectedObjects: Number(expectedObjects), presentObjects: Number(presentObjects),
    historyRows: Number(historyRows), newHistoryRows: Number(newHistoryRows) };
};

try {
  reset();
  // Diagnostic transaction only: preserve both public migration blobs exactly,
  // observe the grantors of residual memberships, then roll everything back.
  // This does not alter any wrapper guard or count as a wrapper PASS.
  const publicSql = [['20261008002233_ctbc_inbox.sql','0700d8fe87f9bb8612ca2e8b7afec676ba5772bd8ace631a6ecfe2dd9be3f89b'],
    ['20261008013654_ctbc_worker_lifecycle.sql','619dcda59d4fed2f06dd3f82f9c698bdff1d54b91551ab893a1effb190935bf6']]
    .map(([file,hash]) => { const blob = run('git', ['show', 'HEAD:supabase/migrations/' + file]);
      must(blob); assert.equal(sha(blob.stdout),hash); return blob.stdout; }).join('\n');
  const diagnostic = must(execute('membership-diagnostic', `BEGIN;
SELECT json_agg(q) FROM (SELECT oid AS executor_oid,rolname,rolsuper,rolcreaterole,rolcreatedb,rolcanlogin,rolinherit,rolbypassrls,current_user,session_user,current_setting('server_version') AS server_version FROM pg_roles WHERE rolname=current_user) q;
${publicSql}
SELECT json_agg(q) FROM (SELECT a.roleid AS role_oid,pg_get_userbyid(a.roleid) AS role_name,a.member AS member_oid,pg_get_userbyid(a.member) AS member_name,a.grantor AS grantor_oid,g.rolname AS grantor_name,g.rolsuper AS grantor_superuser,a.grantor=10 AS bootstrap_oid_10,a.admin_option,a.inherit_option,a.set_option FROM pg_auth_members a JOIN pg_roles g ON g.oid=a.grantor WHERE a.roleid IN (SELECT oid FROM pg_roles WHERE rolname IN ('ctbc_executor','ctbc_link_locker')) ORDER BY role_name,member_name,grantor_name) q;
ROLLBACK;`));
  const metadata = [...diagnostic.matchAll(/\[\{"[\s\S]*?\}\]/g)].map(match => JSON.parse(match[0]));
  proof.executor = metadata.find(rows => rows[0]?.executor_oid)?.[0];
  proof.bootstrapMemberships = metadata.find(rows => rows[0]?.role_oid);
  assert.equal(proof.executor?.rolsuper, false);
  assert.equal(proof.executor?.rolcreaterole, true);
  assert.equal(proof.bootstrapMemberships?.length, 2);
  for (const member of proof.bootstrapMemberships) {
    assert.equal(member.member_name, 'postgres');
    assert.equal(member.member_oid, proof.executor.executor_oid);
    assert.equal(Number(member.grantor_oid), 10);
    assert.equal(member.grantor_name, 'supabase_admin');
    assert.equal(member.grantor_superuser, true);
    assert.equal(member.admin_option, true);
    assert.equal(member.set_option, false);
    assert.equal(member.inherit_option, false);
  }
  save();
  let sql = templates();
  assert.equal(sql.apply.match(/\nCOMMIT;\n$/g)?.length, 1);
  const injected = sql.apply.replace(/\nCOMMIT;\n$/, "\nDO $synthetic_failure$ BEGIN RAISE EXCEPTION 'SYNTHETIC_BEFORE_COMMIT'; END; $synthetic_failure$;\nCOMMIT;\n");
  const failed = execute('rollback-apply', injected);
  assert.notEqual(failed.status, 0);
  assert.ok(failed.stderr.includes('SYNTHETIC_BEFORE_COMMIT'), 'Wrapper must reach the final injected failure after all guards and DDL.');
  const absent = readback('rollback-phase1', sql.phase1, 'ABSENT_EXACT_16_BASELINE');
  assert.equal(absent.presentObjects, 0);
  assert.equal(absent.newHistoryRows, 0);
  proof.cases.push({ name: 'pre-COMMIT-failure', state: 'PASS', failureReached: true, phase1: absent,
    phase2Executed: false, originalBaselineRows: sql.historyRows, localEventRows: sql.eventRows }); save();

  reset();
  sql = templates();
  must(execute('half-fixture', 'CREATE TABLE public.ctbc_events(id bigint);'));
  const partial = readback('half-phase1', sql.phase1, 'PARTIAL_OR_DRIFT_STOP');
  assert.equal(partial.presentObjects, 1);
  assert.equal(partial.newHistoryRows, 0);
  const stopped = execute('half-apply', sql.apply);
  assert.notEqual(stopped.status, 0);
  assert.ok(stopped.stderr.includes('CTBC existing objects/roles STOP'));
  const unchanged = readback('half-phase1-after-stop', sql.phase1, 'PARTIAL_OR_DRIFT_STOP');
  assert.deepEqual(unchanged, partial);
  proof.cases.push({ name: 'half-present', state: 'PASS', phase1: partial, applyStopped: true,
    phase2Executed: false, noFurtherObjectsOrHistory: true }); save();

  reset();
  sql = templates();
  must(execute('success-apply', sql.apply));
  const present = readback('success-phase1', sql.phase1, 'ALL_PRESENT_EXACT_18_HISTORY');
  assert.equal(present.presentObjects, 27);
  assert.equal(present.newHistoryRows, 2);
  must(execute('success-phase2', sql.phase2));
  proof.cases.push({ name: 'successful-apply', state: 'PASS', phase1: present, phase2Executed: true,
    originalBaselineRows: sql.historyRows, localEventRows: sql.eventRows });
  proof.state = 'PASS_ISOLATED_WRAPPER_ONLY'; save();
  console.log(JSON.stringify(proof));
} catch (error) {
  proof.state = 'FAIL'; proof.failure = error.message; save(); throw error;
}
