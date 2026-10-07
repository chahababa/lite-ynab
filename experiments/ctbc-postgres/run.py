"""Own-container-only synthetic PostgreSQL experiment. Standard library, no DB URL."""
import concurrent.futures
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parent
IMAGE = 'postgres@sha256:f02121de6f74d30d8a94cd1d9584125e2178d7e6c377d8130112d4e52d867995'
DOCKER = ['docker', '--host', 'unix:///var/run/docker.sock']
# Allowlist, not inherited provider/PG/Docker configuration or credential paths.
ENV = {'PATH': os.environ.get('PATH', ''), 'LANG': 'C.UTF-8'}
CID = None
TOKEN = str(uuid.uuid4())
LABEL = 'ctbc.synthetic.owner'
PASS = []


def command(args, input_text=None, ok=True):
    result = subprocess.run(args, input=input_text, capture_output=True, text=True,
                            env=ENV, timeout=60)
    if ok and result.returncode:
        # All contents are synthetic; still avoid SQL/log dumps in CI.
        error = next((line for line in result.stderr.splitlines() if 'ERROR:' in line), '')
        raise AssertionError('command_failed:' + args[0] + ':' + error[:160])
    return result


def inspect_owned():
    info = json.loads(command(DOCKER + ['inspect', CID]).stdout)[0]
    assert info['Id'] == CID and info['Config']['Labels'].get(LABEL) == TOKEN
    assert info['HostConfig']['NetworkMode'] == 'none'
    assert not info['HostConfig'].get('Binds') and not info['HostConfig'].get('PortBindings')
    assert all(m['Type'] == 'tmpfs' for m in info['Mounts'])
    return info


def psql_args(role='postgres'):
    inspect_owned()
    assert role in ('postgres', 'synthetic_a', 'synthetic_b')
    return DOCKER + ['exec', '-i', CID, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
                     '-U', role, '-d', 'synthetic_ctbc']


def sql(text, role='postgres', ok=True):
    return command(psql_args(role), "SET statement_timeout='10s'; SET timezone='UTC';\n" + text, ok)


def value(text, role='postgres'):
    return sql(text, role).stdout.strip()


def check(name, condition):
    assert condition, name
    PASS.append(name)
    print('PASS ' + name, flush=True)


def seed(cid, owner='synthetic_a', risk=False):
    assert re.fullmatch(r'[a-z0-9-]+', cid)
    sql(f"INSERT INTO synthetic.candidates(id,owner,amount,created_at,detail,risk,status) "
        f"VALUES('{cid}','{owner}',35,now(),'SYNTHETIC',{'true' if risk else 'false'},"
        f"'{ 'conflict' if risk else 'pending' }');")


def act(cid, action, key, risk=False, category='cat-a', payment='pay-a', link=None, version=1, batch=False):
    link_sql = "NULL" if link is None else f"'{link}'::uuid"
    return (f"SELECT synthetic.act('{cid}',{version},'{action}','{key}',"
            f"'{category}','{payment}',{link_sql},{str(risk).lower()},{str(batch).lower()});")


def state(cid):
    return value(f"SELECT jsonb_build_array((SELECT to_jsonb(c) FROM synthetic.candidates c WHERE id='{cid}'),"
                 "(SELECT jsonb_agg(l ORDER BY id) FROM synthetic.ledger l),"
                 "(SELECT jsonb_agg(e ORDER BY id) FROM synthetic.events e));")


def deny(name, query, cid, expected, role='synthetic_a'):
    before = state(cid)
    result = sql(query, role, ok=False)
    check(name, result.returncode != 0 and expected in result.stderr and state(cid) == before)


def simultaneous(first, second, expected_lock, first_role='synthetic_a', second_role='synthetic_a'):
    # Two real independent psql sessions. Hold first transaction after its act.
    holder = subprocess.Popen(psql_args(first_role), stdin=subprocess.PIPE,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=ENV)
    try:
        holder.stdin.write("BEGIN; SET LOCAL statement_timeout='10s'; SELECT pg_backend_pid(); " + first + "\n\\echo HELD\n")
        holder.stdin.flush()
        holder_pid = int(holder.stdout.readline().strip())
        first_result = holder.stdout.readline().strip()
        assert holder.stdout.readline().strip() == 'HELD'
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(sql, second, second_role, False)
            blocked = False
            for _ in range(80):
                waiting = value(f"SELECT count(*) FROM pg_stat_activity WHERE usename='{second_role}' "
                                f"AND wait_event_type='Lock' AND state='active' AND {holder_pid}=ANY(pg_blocking_pids(pid));")
                if waiting != '0':
                    blocked = True
                    break
                time.sleep(0.05)
            holder.stdin.write('COMMIT;\n\\q\n')
            holder.stdin.flush()
            holder.wait(timeout=15)
            assert holder.returncode == 0
            second_result = future.result(timeout=15)
        check(expected_lock, blocked)
        return first_result, second_result
    finally:
        if holder.poll() is None:
            holder.kill()
            holder.wait()
        for stream in (holder.stdin, holder.stdout, holder.stderr):
            stream.close()


def preview_batch(ids, key):
    # One read-only snapshot. Known unsafe members block the entire preview;
    # there are no act calls, events or accounting mutations at this stage.
    assert 0 < len(ids) <= 20 and len(ids) == len(set(ids))
    assert all(re.fullmatch(r'[a-z0-9-]+', cid) for cid in ids)
    literals=','.join("'"+cid+"'" for cid in ids)
    rows=json.loads(value("BEGIN READ ONLY; SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'safe',"
         "status='pending' AND NOT risk AND amount IS NOT NULL AND scrubbed_at IS NULL "
         f"AND created_at+interval '30 days'>now())), '[]') FROM synthetic.candidates WHERE id IN ({literals}); COMMIT;",'synthetic_a'))
    by_id={row['id']:row for row in rows}
    if any(cid not in by_id or by_id[cid]['safe'] is not True for cid in ids):
        return None
    return [{'cid':cid,'query':act(cid,'import',key+':'+cid,version=by_id[cid]['version'],batch=True)} for cid in ids]


def submit_batch(plan, race_at=None, stop_on_conflict=True):
    # Each psql invocation autocommits its own act; never wrap a batch in BEGIN.
    # Retry uses this original immutable plan (same per-item version/key/request).
    results=[]
    stopped=False
    for item in plan:
        cid=item['cid']
        if stopped:
            results.append({'cid':cid,'status':'not_submitted'})
            continue
        if cid == race_at:
            _,outcome=simultaneous(act(cid,'defer','competitor:'+cid),item['query'],
                                   'batch_submit_real_row_lock_wait')
        else:
            outcome=sql(item['query'],'synthetic_a',ok=False)
        if outcome.returncode==0:
            results.append({'cid':cid,'status':'success','result':json.loads(outcome.stdout)})
        else:
            assert 'stale_version' in outcome.stderr or 'unsafe_batch' in outcome.stderr or 'candidate_closed' in outcome.stderr
            results.append({'cid':cid,'status':'conflict'})
            stopped=stop_on_conflict
    return results


def tests():
    check('non_bypass_roles', value("SELECT count(*) FROM pg_roles WHERE rolname IN "
          "('synthetic_a','synthetic_b','synthetic_executor','synthetic_link_locker') AND NOT rolsuper AND NOT rolbypassrls;") == '4')
    check('forced_rls_five_tables', value("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
          "WHERE n.nspname='synthetic' AND c.relrowsecurity AND c.relforcerowsecurity;") == '5')
    seed('owner-a'); seed('owner-b', 'synthetic_b')
    check('rls_read_a', value("SELECT string_agg(id,',') FROM synthetic.candidates;", 'synthetic_a') == 'owner-a')
    check('rls_read_b', value("SELECT string_agg(id,',') FROM synthetic.candidates;", 'synthetic_b') == 'owner-b')
    deny('foreign_candidate', act('owner-b','work','foreign'), 'owner-b', 'candidate_denied')
    deny('direct_update_denied', "UPDATE synthetic.candidates SET owner='synthetic_b';", 'owner-a', 'permission denied')
    deny('direct_ledger_insert_denied', "INSERT INTO synthetic.ledger(owner,amount,category,payment) VALUES('synthetic_a',1,'cat-a','pay-a');", 'owner-a', 'permission denied')
    deny('direct_ledger_update_denied', "UPDATE synthetic.ledger SET amount=0;", 'owner-a', 'permission denied')
    deny('direct_ledger_delete_denied', "DELETE FROM synthetic.ledger;", 'owner-a', 'permission denied')
    check('executor_no_ledger_update_delete',value("SELECT NOT has_any_column_privilege('synthetic_executor','synthetic.ledger','UPDATE') "
          "AND NOT has_table_privilege('synthetic_executor','synthetic.ledger','DELETE');")=='t')
    check('locker_only_update_id',value("SELECT has_column_privilege('synthetic_link_locker','synthetic.ledger','id','UPDATE') "
          "AND NOT has_column_privilege('synthetic_link_locker','synthetic.ledger','amount','UPDATE') "
          "AND NOT has_table_privilege('synthetic_link_locker','synthetic.ledger','INSERT,DELETE') "
          "AND NOT (SELECT rolcanlogin FROM pg_roles WHERE rolname='synthetic_link_locker');")=='t')
    deny('role_impersonation_denied', 'SET ROLE synthetic_b;', 'owner-a', 'permission denied')
    deny('guc_cannot_impersonate', "SET app.owner='synthetic_b';" + act('owner-b','ignore','guc'), 'owner-b', 'candidate_denied')
    deny('foreign_category', act('owner-a','import','cat',category='cat-b'), 'owner-a', 'classification_denied')
    deny('foreign_payment', act('owner-a','import','pay',payment='pay-b'), 'owner-a', 'classification_denied')
    foreign = value("SELECT id FROM synthetic.ledger WHERE owner='synthetic_b';")
    own = value("SELECT id FROM synthetic.ledger WHERE owner='synthetic_a';")
    deny('internal_locker_not_callable',f"SELECT synthetic.lock_link('{own}');",'owner-a','permission denied')
    deny('foreign_link', act('owner-a','link','foreign-link',link=foreign), 'owner-a', 'link_denied')
    deny('invalid_action_denied', act('owner-a','invalid','invalid'), 'owner-a', 'invalid_action')
    for action in ('import','link','ignore','work'):
        cid='risk-'+action
        seed(cid,risk=True)
        query=act(cid,action,cid,link=own)
        deny('risk_denied_'+action,query,cid,'risk_confirmation_required')
        check('risk_resolved_'+action, sql(act(cid,action,cid,True,link=own),'synthetic_a').returncode == 0)
    seed('risk-defer',risk=True)
    before=value("SELECT jsonb_build_array(status,risk,created_at,closed_at) FROM synthetic.candidates WHERE id='risk-defer';")
    sql(act('risk-defer','defer','defer'),'synthetic_a')
    check('defer_preserves_risk_deadline',before == value("SELECT jsonb_build_array(status,risk,created_at,closed_at) FROM synthetic.candidates WHERE id='risk-defer';"))
    # All four non-import decisions keep the entire ledger identical.
    for action in ('link','ignore','work','defer'):
        cid='nonimport-'+action
        seed(cid)
        before=value('SELECT jsonb_agg(l ORDER BY id) FROM synthetic.ledger l;')
        sql(act(cid,action,cid,link=own),'synthetic_a')
        check('ledger_unchanged_'+action,before == value('SELECT jsonb_agg(l ORDER BY id) FROM synthetic.ledger l;'))
    seed('race-version')
    first,second=simultaneous(act('race-version','import','winner'),act('race-version','work','loser'),'real_row_lock_wait')
    check('same_version_one_winner',second.returncode != 0 and 'stale_version' in second.stderr and
          value("SELECT count(*) FROM synthetic.events WHERE candidate_id='race-version';") == '1' and
          value("SELECT count(*) FROM synthetic.ledger WHERE candidate_id='race-version';") == '1')
    seed('race-key')
    query=act('race-key','import','same-key')
    first,second=simultaneous(query,query,'real_idempotency_lock_wait')
    check('same_key_same_result_once',second.returncode == 0 and json.loads(first)==json.loads(second.stdout) and
          value("SELECT count(*) FROM synthetic.events WHERE candidate_id='race-key';") == '1' and
          value("SELECT count(*) FROM synthetic.ledger WHERE candidate_id='race-key';") == '1')
    deny('key_payload_mismatch',act('race-key','work','same-key'),'race-key','idempotency_mismatch')
    # Separate administrative deletion is fault injection; every act uses the login role.
    for cid in ('link-missing','delete-first','link-first'):
        seed(cid)
        target=value("INSERT INTO synthetic.ledger(owner,amount,category,payment) VALUES "
                     "('synthetic_a',55,'cat-a','pay-a') RETURNING id;")
        if cid=='link-missing':
            sql(f"DELETE FROM synthetic.ledger WHERE id='{target}';")
            deny('missing_link_fail_closed',act(cid,'link',cid,link=target),cid,'link_denied')
        elif cid=='delete-first':
            before=value(f"SELECT jsonb_build_array((SELECT to_jsonb(c) FROM synthetic.candidates c WHERE id='{cid}'),"
                         f"(SELECT jsonb_agg(e) FROM synthetic.events e WHERE candidate_id='{cid}'));")
            _,outcome=simultaneous(f"DELETE FROM synthetic.ledger WHERE id='{target}' RETURNING id;",
                                  act(cid,'link',cid,link=target),'delete_first_link_waits',first_role='postgres')
            check('delete_first_link_rejected_unchanged',outcome.returncode!=0 and 'link_denied' in outcome.stderr and before==
                  value(f"SELECT jsonb_build_array((SELECT to_jsonb(c) FROM synthetic.candidates c WHERE id='{cid}'),"
                        f"(SELECT jsonb_agg(e) FROM synthetic.events e WHERE candidate_id='{cid}'));"))
        else:
            result,outcome=simultaneous(act(cid,'link',cid,link=target),
                         f"DELETE FROM synthetic.ledger WHERE id='{target}' RETURNING id;",
                         'link_first_delete_waits',second_role='postgres')
            check('link_first_commits_before_delete',outcome.returncode==0 and outcome.stdout.strip()==target and
                  value(f"SELECT status FROM synthetic.candidates WHERE id='{cid}';")=='linked' and
                  value(f"SELECT count(*) FROM synthetic.events WHERE candidate_id='{cid}';")=='1' and
                  value(f"SELECT count(*) FROM synthetic.ledger WHERE id='{target}';")=='0')
            check('deleted_link_same_key_replay',json.loads(result)==json.loads(value(act(cid,'link',cid,link=target),'synthetic_a')))
            deny('deleted_link_no_reopen_or_import',act(cid,'import','reopen',version=2),cid,'candidate_closed')
    for table in ('ledger','events'):
        cid='rollback-'+table
        seed(cid)
        sql(f"CREATE FUNCTION synthetic.fail_{table}() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected_failure'; END$$;"
            f"CREATE TRIGGER injected BEFORE INSERT ON synthetic.{table} FOR EACH ROW EXECUTE FUNCTION synthetic.fail_{table}();")
        deny('rollback_'+table,act(cid,'import',cid),cid,'injected_failure')
        sql(f'DROP TRIGGER injected ON synthetic.{table};')
    seed('batch-safe'); seed('batch-risk',risk=True)
    for order in (['batch-safe','batch-risk'],['batch-risk','batch-safe']):
        before=state('batch-safe')
        check('batch_known_risk_no_submit_'+order[0],preview_batch(order,'batch') is None and state('batch-safe')==before)
    deny('batch_risk_server_guard',act('batch-risk','import','batch-risk-forged',risk=True,batch=True),'batch-risk','unsafe_batch')
    seed('batch-safe-two')
    plan=preview_batch(['batch-safe','batch-safe-two'],'batch-ok')
    first=submit_batch(plan)
    check('batch_success_retry',first==submit_batch(plan) and
          value("SELECT count(*) FROM synthetic.ledger WHERE candidate_id IN ('batch-safe','batch-safe-two');")=='2')
    for cid in ('batch-race-first','batch-race-second','batch-race-third'):
        seed(cid)
    plan=preview_batch(['batch-race-first','batch-race-second','batch-race-third'],'batch-race')
    results=submit_batch(plan,race_at='batch-race-second')
    check('batch_partial_results', [r['status'] for r in results]==['success','conflict','not_submitted'])
    check('batch_prior_success_survives_race',value("SELECT count(*) FROM synthetic.ledger WHERE candidate_id='batch-race-first';")=='1' and
          value("SELECT status FROM synthetic.candidates WHERE id='batch-race-first';")=='imported' and
          value("SELECT count(*) FROM synthetic.ledger WHERE candidate_id IN ('batch-race-second','batch-race-third');")=='0' and
          value("SELECT version FROM synthetic.candidates WHERE id='batch-race-third';")=='1')
    retry=submit_batch(plan,stop_on_conflict=False)
    check('batch_retry_original_keys', [r['status'] for r in retry]==['success','conflict','success'] and retry[0]==results[0] and
          value("SELECT count(*) FROM synthetic.events WHERE candidate_id='batch-race-first';")=='1' and
          value("SELECT count(*) FROM synthetic.ledger WHERE candidate_id IN ('batch-race-first','batch-race-third');")=='2')
    seed('null-risk',risk=True)
    deny('null_confirmation_denied',"SELECT synthetic.act('null-risk',1,'work','null-risk',NULL,NULL,NULL,NULL);",'null-risk','risk_confirmation_required')
    retention_tests()


def retain(now):
    sql("\\set now '"+now+"'\n"+(ROOT/'retention.sql').read_text())


def retention_tests():
    for status in ('pending','conflict'):
        for kind,created in (('exact','2040-01-01'),('before','2040-01-01 00:00:01Z')):
            sql("INSERT INTO synthetic.candidates(id,owner,amount,status,risk,created_at,detail) VALUES "
                f"('{kind}-{status}','synthetic_a',1,'{status}',{str(status=='conflict').lower()},'{created}','SYNTHETIC');")
    for status in ('imported','linked','ignored','excluded'):
        for kind,closed in (('exact7','2040-01-24'),('before7','2040-01-24 00:00:01Z')):
            sql("INSERT INTO synthetic.candidates(id,owner,amount,status,created_at,closed_at,detail) VALUES "
                f"('{kind}-{status}','synthetic_a',1,'{status}','2039-01-01','{closed}','SYNTHETIC');")
    sql("INSERT INTO synthetic.candidates(id,owner,amount,status,created_at,closed_at,detail) VALUES "
        "('purge90','synthetic_a',1,'imported','2039-01-01','2039-11-02','SYNTHETIC'),"
        "('purge90-expired','synthetic_a',1,'expired','2039-10-03','2039-11-02','SYNTHETIC'),"
        "('before90','synthetic_a',1,'ignored','2039-01-01','2039-11-02 00:00:01Z','SYNTHETIC');"
        "INSERT INTO synthetic.ledger(owner,candidate_id,amount,category,payment) VALUES ('synthetic_a','purge90',1,'cat-a','pay-a');")
    for cid in ('purge90','purge90-expired','before90'):
        sql("INSERT INTO synthetic.events(owner,key,candidate_id,request,result) VALUES "
            f"('synthetic_a','retention-{cid}','{cid}','[]','{{}}');")
    ledger_before=value('SELECT jsonb_agg(l ORDER BY id) FROM synthetic.ledger l;')
    retain('2040-01-30 23:59:59Z')
    for status in ('pending','conflict'):
        check('retention_d30_minus_second_'+status,value(f"SELECT status='{status}' AND amount=1 AND detail='SYNTHETIC' "
              f"AND scrubbed_at IS NULL AND closed_at IS NULL AND version=1 FROM synthetic.candidates WHERE id='exact-{status}';")=='t')
    check('retention_four_terminal_before7',value("SELECT count(*) FROM synthetic.candidates WHERE id LIKE 'exact7-%' "
          "AND amount=1 AND detail='SYNTHETIC' AND scrubbed_at IS NULL;")=='4')
    check('retention_shell_event_before90',value("SELECT count(*) FROM synthetic.candidates WHERE id IN ('purge90','purge90-expired');")=='2' and
          value("SELECT count(*) FROM synthetic.events WHERE candidate_id IN ('purge90','purge90-expired');")=='2')
    # Add already-overdue open rows after the earlier sweep to model a late worker.
    for status in ('pending','conflict'):
        sql("INSERT INTO synthetic.candidates(id,owner,amount,status,created_at,detail) VALUES "
            f"('late-{status}','synthetic_a',1,'{status}','2039-12-31','SYNTHETIC');")
    retain('2040-01-31 00:00:00Z')
    for status in ('pending','conflict'):
        check('retention_d30_immediate_scrub_'+status,value("SELECT status='expired' AND amount IS NULL AND detail IS NULL "
              "AND scrubbed_at='2040-01-31'::timestamptz AND closed_at='2040-01-31'::timestamptz "
              f"AND created_at='2040-01-01'::timestamptz AND version=2 FROM synthetic.candidates WHERE id='exact-{status}';")=='t')
        check('retention_still_before30_'+status,value(f"SELECT status='{status}' AND amount=1 AND detail='SYNTHETIC' "
              f"AND scrubbed_at IS NULL AND version=1 FROM synthetic.candidates WHERE id='before-{status}';")=='t')
        check('retention_late_expiry_immediate_'+status,value("SELECT status='expired' AND amount IS NULL AND detail IS NULL "
              "AND scrubbed_at='2040-01-31'::timestamptz AND closed_at='2040-01-30'::timestamptz "
              f"AND version=2 FROM synthetic.candidates WHERE id='late-{status}';")=='t')
    check('retention_four_terminal_7_boundary',value("SELECT count(*) FROM synthetic.candidates WHERE id LIKE 'exact7-%' "
          "AND amount IS NULL AND detail IS NULL AND scrubbed_at='2040-01-31'::timestamptz;")=='4' and
          value("SELECT count(*) FROM synthetic.candidates WHERE id LIKE 'before7-%' AND amount=1 AND detail='SYNTHETIC' AND scrubbed_at IS NULL;")=='4')
    check('retention_shell_event_90_boundary',value("SELECT count(*) FROM synthetic.candidates WHERE id IN ('purge90','purge90-expired');")=='0' and
          value("SELECT count(*) FROM synthetic.events WHERE candidate_id IN ('purge90','purge90-expired');")=='0' and
          value("SELECT count(*) FROM synthetic.candidates WHERE id='before90';")=='1' and
          value("SELECT count(*) FROM synthetic.events WHERE candidate_id='before90';")=='1')
    all_before=value("SELECT jsonb_build_array((SELECT jsonb_agg(c ORDER BY id) FROM synthetic.candidates c),"
                     "(SELECT jsonb_agg(e ORDER BY id) FROM synthetic.events e));")
    retain('2040-01-31 00:00:00Z')
    check('retention_repeat_idempotent',all_before==value("SELECT jsonb_build_array((SELECT jsonb_agg(c ORDER BY id) FROM synthetic.candidates c),"
                     "(SELECT jsonb_agg(e ORDER BY id) FROM synthetic.events e));"))
    check('retention_never_deletes_ledger',ledger_before==value('SELECT jsonb_agg(l ORDER BY id) FROM synthetic.ledger l;'))


def static_check():
    fixture=(ROOT/'fixture.sql').read_text()
    retention=(ROOT/'retention.sql').read_text()
    assert 'session_user' in fixture and 'FOR UPDATE' in fixture
    assert 'NOBYPASSRLS' in fixture and 'FORCE ROW LEVEL SECURITY' in fixture
    assert 'DELETE FROM synthetic.ledger' not in retention
    assert re.fullmatch(r'postgres@sha256:[a-f0-9]{64}',IMAGE)
    print('STATIC_CHECK_PASS (not SQL execution / DB proof)')


def main():
    global CID
    if sys.argv[1:] == ['--check']:
        static_check(); return
    if sys.argv[1:] or platform.system() != 'Linux':
        raise SystemExit('REFUSED: Linux own-container runner only; use --check for static checks')
    try:
        command(DOCKER+['pull',IMAGE])
        CID=command(DOCKER+['create','--name','ctbc-synthetic-'+TOKEN,'--label',LABEL+'='+TOKEN,
                            '--network','none','--read-only','--tmpfs','/var/lib/postgresql/data:rw',
                            '--tmpfs','/var/run/postgresql:rw','--tmpfs','/tmp:rw',
                            '-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=synthetic_ctbc',IMAGE]).stdout.strip()
        assert re.fullmatch(r'[a-f0-9]{64}',CID)
        inspect_owned()
        command(DOCKER+['start',CID])
        for _ in range(120):
            result=command(DOCKER+['exec',CID,'pg_isready','-U','postgres','-d','synthetic_ctbc'],ok=False)
            if result.returncode==0: break
            time.sleep(0.25)
        else: raise AssertionError('database_not_ready')
        sql((ROOT/'fixture.sql').read_text())
        check('own_database_marker',value('SELECT value FROM synthetic.marker;')=='ctbc-ephemeral-only')
        print('POSTGRES_VERSION '+value('SHOW server_version;'),flush=True)
        tests()
        print(f'SYNTHETIC_DB_PASS {len(PASS)} assertions; production_mutation=false',flush=True)
    finally:
        if CID:
            inspect_owned()
            command(DOCKER+['rm','-f',CID])
            CID=None
            print('OWN_CONTAINER_REMOVED',flush=True)


if __name__=='__main__':
    main()
