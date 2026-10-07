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
    return command(psql_args(role), "SET statement_timeout='10s';\n" + text, ok)


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


def act(cid, action, key, risk=False, category='cat-a', payment='pay-a', link=None, version=1):
    link_sql = "NULL" if link is None else f"'{link}'::uuid"
    return (f"SELECT synthetic.act('{cid}',{version},'{action}','{key}',"
            f"'{category}','{payment}',{link_sql},{str(risk).lower()});")


def state(cid):
    return value(f"SELECT jsonb_build_array((SELECT to_jsonb(c) FROM synthetic.candidates c WHERE id='{cid}'),"
                 "(SELECT jsonb_agg(l ORDER BY id) FROM synthetic.ledger l),"
                 "(SELECT jsonb_agg(e ORDER BY id) FROM synthetic.events e));")


def deny(name, query, cid, expected, role='synthetic_a'):
    before = state(cid)
    result = sql(query, role, ok=False)
    check(name, result.returncode != 0 and expected in result.stderr and state(cid) == before)


def simultaneous(first, second, expected_lock):
    # Two real independent psql sessions. Hold first transaction after its act.
    holder = subprocess.Popen(psql_args('synthetic_a'), stdin=subprocess.PIPE,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=ENV)
    try:
        holder.stdin.write("BEGIN; SET LOCAL statement_timeout='10s'; " + first + "\n\\echo HELD\n")
        holder.stdin.flush()
        first_result = holder.stdout.readline().strip()
        assert holder.stdout.readline().strip() == 'HELD'
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(sql, second, 'synthetic_a', False)
            blocked = False
            for _ in range(80):
                waiting = value("SELECT count(*) FROM pg_stat_activity WHERE usename='synthetic_a' "
                                "AND wait_event_type='Lock' AND state='active';")
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


def tests():
    check('non_bypass_roles', value("SELECT count(*) FROM pg_roles WHERE rolname IN "
          "('synthetic_a','synthetic_b','synthetic_executor') AND NOT rolsuper AND NOT rolbypassrls;") == '3')
    check('forced_rls_five_tables', value("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
          "WHERE n.nspname='synthetic' AND c.relrowsecurity AND c.relforcerowsecurity;") == '5')
    seed('owner-a'); seed('owner-b', 'synthetic_b')
    check('rls_read_a', value("SELECT string_agg(id,',') FROM synthetic.candidates;", 'synthetic_a') == 'owner-a')
    check('rls_read_b', value("SELECT string_agg(id,',') FROM synthetic.candidates;", 'synthetic_b') == 'owner-b')
    deny('foreign_candidate', act('owner-b','work','foreign'), 'owner-b', 'candidate_denied')
    deny('direct_update_denied', "UPDATE synthetic.candidates SET owner='synthetic_b';", 'owner-a', 'permission denied')
    deny('direct_ledger_insert_denied', "INSERT INTO synthetic.ledger(owner,amount,category,payment) VALUES('synthetic_a',1,'cat-a','pay-a');", 'owner-a', 'permission denied')
    deny('role_impersonation_denied', 'SET ROLE synthetic_b;', 'owner-a', 'permission denied')
    deny('guc_cannot_impersonate', "SET app.owner='synthetic_b';" + act('owner-b','ignore','guc'), 'owner-b', 'candidate_denied')
    deny('foreign_category', act('owner-a','import','cat',category='cat-b'), 'owner-a', 'classification_denied')
    deny('foreign_payment', act('owner-a','import','pay',payment='pay-b'), 'owner-a', 'classification_denied')
    foreign = value("SELECT id FROM synthetic.ledger WHERE owner='synthetic_b';")
    own = value("SELECT id FROM synthetic.ledger WHERE owner='synthetic_a';")
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
    for table in ('ledger','events'):
        cid='rollback-'+table
        seed(cid)
        sql(f"CREATE FUNCTION synthetic.fail_{table}() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected_failure'; END$$;"
            f"CREATE TRIGGER injected BEFORE INSERT ON synthetic.{table} FOR EACH ROW EXECUTE FUNCTION synthetic.fail_{table}();")
        deny('rollback_'+table,act(cid,'import',cid),cid,'injected_failure')
        sql(f'DROP TRIGGER injected ON synthetic.{table};')
    seed('batch-safe'); seed('batch-risk',risk=True)
    for order in (['batch-safe','batch-risk'],['batch-risk','batch-safe']):
        ids=','.join("'"+x+"'" for x in order)
        deny('batch_risk_atomic_'+order[0],f"SELECT synthetic.import_batch(ARRAY[{ids}],ARRAY[1,1],'batch','cat-a','pay-a');",'batch-safe','unsafe_batch')
    seed('batch-safe-two')
    query="SELECT synthetic.import_batch(ARRAY['batch-safe','batch-safe-two'],ARRAY[1,1],'batch-ok','cat-a','pay-a');"
    first=value(query,'synthetic_a')
    check('batch_success_retry',first==value(query,'synthetic_a') and
          value("SELECT count(*) FROM synthetic.ledger WHERE candidate_id IN ('batch-safe','batch-safe-two');")=='2')
    seed('null-risk',risk=True)
    deny('null_confirmation_denied',"SELECT synthetic.act('null-risk',1,'work','null-risk',NULL,NULL,NULL,NULL);",'null-risk','risk_confirmation_required')
    # Deterministic boundary fixtures: 30 days pending, 7 days closed detail, 90 days shell.
    sql("INSERT INTO synthetic.candidates(id,owner,amount,status,created_at,closed_at,detail) VALUES "
        "('expire30','synthetic_a',1,'pending','2040-01-01',NULL,'SYNTHETIC'),"
        "('before30','synthetic_a',1,'pending','2040-01-01 00:00:01Z',NULL,'SYNTHETIC'),"
        "('scrub7','synthetic_a',1,'imported','2039-01-01','2040-01-24','SYNTHETIC'),"
        "('before7','synthetic_a',1,'ignored','2039-01-01','2040-01-24 00:00:01Z','SYNTHETIC'),"
        "('purge90','synthetic_a',1,'imported','2039-01-01','2039-11-02','SYNTHETIC'),"
        "('before90','synthetic_a',1,'ignored','2039-01-01','2039-11-02 00:00:01Z','SYNTHETIC');"
        "INSERT INTO synthetic.ledger(owner,candidate_id,amount,category,payment) VALUES ('synthetic_a','purge90',1,'cat-a','pay-a');")
    before=value('SELECT jsonb_agg(l ORDER BY id) FROM synthetic.ledger l;')
    query="\\set now '2040-01-31 00:00:00Z'\n"+(ROOT/'retention.sql').read_text()
    sql(query)
    check('retention_30_boundary',value("SELECT string_agg(status,',' ORDER BY id) FROM synthetic.candidates WHERE id IN ('before30','expire30');")=='pending,expired')
    check('retention_7_boundary',value("SELECT detail IS NULL FROM synthetic.candidates WHERE id='scrub7';")=='t' and value("SELECT detail IS NOT NULL FROM synthetic.candidates WHERE id='before7';")=='t')
    check('retention_90_boundary',value("SELECT count(*) FROM synthetic.candidates WHERE id='purge90';")=='0' and value("SELECT count(*) FROM synthetic.candidates WHERE id='before90';")=='1')
    check('retention_never_deletes_ledger',before==value('SELECT jsonb_agg(l ORDER BY id) FROM synthetic.ledger l;'))


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
