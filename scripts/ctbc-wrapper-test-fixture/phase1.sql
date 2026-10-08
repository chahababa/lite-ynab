-- SYNTHETIC LOCAL TEST ONLY. No production target or execution grant.
-- Target: disposable Linux CI Supabase postgres database only.
-- PHASE 1: always report absent/present/drift before any CTBC detail reads.
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='2s';
SELECT current_database(),current_user,session_user,current_setting('server_version_num') AS server_version_num,current_setting('server_encoding') AS server_encoding;
SELECT version,name,cardinality(statements) AS statement_count,encode(sha256(convert_to(array_to_json(statements)::text,'UTF8')),'hex') AS statement_array_sha256 FROM supabase_migrations.schema_migrations ORDER BY version;
WITH wanted(kind,name) AS (VALUES ('table','ctbc_collector_scopes'),('table','ctbc_batches'),('table','ctbc_candidates'),('table','ctbc_events'),('table','ctbc_worker_cursors'),('table','ctbc_worker_attempts'),('function','ctbc_request_owner'),('function','ctbc_lock_references'),('function','ctbc_recheck_risk'),('function','ctbc_act'),('function','ctbc_batch_preflight'),('function','ctbc_retain'),('function','ctbc_begin'),('function','ctbc_ingest'),('function','ctbc_snapshot'),('function','ctbc_worker_binding'),('function','ctbc_worker_probe'),('function','ctbc_worker_finish'),('function','ctbc_worker_commit'),('function','ctbc_worker_poll'),('role','ctbc_executor'),('role','ctbc_link_locker'),('index','ctbc_candidates_owner_pending'),('policy','ctbc_batches_own'),('policy','ctbc_candidates_own'),('policy','ctbc_events_own'),('column','ctbc_batches.error_code')) SELECT w.kind,w.name,
 CASE w.kind WHEN 'table' THEN EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||w.name) AND relkind='r')
 WHEN 'function' THEN EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace=to_regnamespace('public') AND proname=w.name)
 WHEN 'role' THEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname=w.name)
 WHEN 'index' THEN EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||w.name) AND relkind='i')
 WHEN 'policy' THEN EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace=to_regnamespace('public') AND p.polname=w.name)
 WHEN 'column' THEN EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.ctbc_batches') AND attname='error_code' AND NOT attisdropped) END AS present
 FROM wanted w ORDER BY w.kind,w.name;
WITH objects AS (WITH wanted(kind,name) AS (VALUES ('table','ctbc_collector_scopes'),('table','ctbc_batches'),('table','ctbc_candidates'),('table','ctbc_events'),('table','ctbc_worker_cursors'),('table','ctbc_worker_attempts'),('function','ctbc_request_owner'),('function','ctbc_lock_references'),('function','ctbc_recheck_risk'),('function','ctbc_act'),('function','ctbc_batch_preflight'),('function','ctbc_retain'),('function','ctbc_begin'),('function','ctbc_ingest'),('function','ctbc_snapshot'),('function','ctbc_worker_binding'),('function','ctbc_worker_probe'),('function','ctbc_worker_finish'),('function','ctbc_worker_commit'),('function','ctbc_worker_poll'),('role','ctbc_executor'),('role','ctbc_link_locker'),('index','ctbc_candidates_owner_pending'),('policy','ctbc_batches_own'),('policy','ctbc_candidates_own'),('policy','ctbc_events_own'),('column','ctbc_batches.error_code')) SELECT w.kind,w.name,
 CASE w.kind WHEN 'table' THEN EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||w.name) AND relkind='r')
 WHEN 'function' THEN EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace=to_regnamespace('public') AND proname=w.name)
 WHEN 'role' THEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname=w.name)
 WHEN 'index' THEN EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||w.name) AND relkind='i')
 WHEN 'policy' THEN EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace=to_regnamespace('public') AND p.polname=w.name)
 WHEN 'column' THEN EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.ctbc_batches') AND attname='error_code' AND NOT attisdropped) END AS present
 FROM wanted w ORDER BY w.kind,w.name), totals AS (SELECT count(*) AS expected_objects,count(*) FILTER(WHERE present) AS present_objects FROM objects), h AS (SELECT count(*) AS history_rows,count(*) FILTER(WHERE version IN ('20261008002233','20261008013654')) AS new_history_rows FROM supabase_migrations.schema_migrations)
 SELECT CASE WHEN present_objects=0 AND new_history_rows=0 AND (WITH expected(version,name,count_text,sha) AS (VALUES
__LOCAL_HISTORY_ROWS__
) SELECT count(*) FROM expected e FULL JOIN supabase_migrations.schema_migrations h USING(version) WHERE e.version IS NULL OR h.version IS NULL OR h.name IS DISTINCT FROM e.name OR cardinality(h.statements)::text IS DISTINCT FROM e.count_text OR encode(sha256(convert_to(array_to_json(h.statements)::text,'UTF8')),'hex') IS DISTINCT FROM e.sha)=0 THEN 'ABSENT_EXACT_16_BASELINE'
 WHEN present_objects=expected_objects AND new_history_rows=2 AND (WITH expected(version,name,count_text,sha) AS (VALUES
__LOCAL_HISTORY_ROWS__,
('20261008002233','ctbc_inbox','61','0584d15315624587e72073f13ef347e29e9596edccab1b62c01ebe4014251ec7'),
('20261008013654','ctbc_worker_lifecycle','22','cb4dd1f2f0285e5a252d3dc1f591fd390ee28590a9971d87d74f3fafb0f2fccc')
) SELECT count(*) FROM expected e FULL JOIN supabase_migrations.schema_migrations h USING(version) WHERE e.version IS NULL OR h.version IS NULL OR h.name IS DISTINCT FROM e.name OR cardinality(h.statements)::text IS DISTINCT FROM e.count_text OR encode(sha256(convert_to(array_to_json(h.statements)::text,'UTF8')),'hex') IS DISTINCT FROM e.sha)=0 THEN 'ALL_PRESENT_EXACT_18_HISTORY'
 ELSE 'PARTIAL_OR_DRIFT_STOP' END AS readback_state,expected_objects,present_objects,history_rows,new_history_rows,
 (WITH expected(version,name,count_text,sha) AS (VALUES
__LOCAL_HISTORY_ROWS__
) SELECT count(*) FROM expected e FULL JOIN supabase_migrations.schema_migrations h USING(version) WHERE e.version IS NULL OR h.version IS NULL OR h.name IS DISTINCT FROM e.name OR cardinality(h.statements)::text IS DISTINCT FROM e.count_text OR encode(sha256(convert_to(array_to_json(h.statements)::text,'UTF8')),'hex') IS DISTINCT FROM e.sha) AS mismatch_against_16,(WITH expected(version,name,count_text,sha) AS (VALUES
__LOCAL_HISTORY_ROWS__,
('20261008002233','ctbc_inbox','61','0584d15315624587e72073f13ef347e29e9596edccab1b62c01ebe4014251ec7'),
('20261008013654','ctbc_worker_lifecycle','22','cb4dd1f2f0285e5a252d3dc1f591fd390ee28590a9971d87d74f3fafb0f2fccc')
) SELECT count(*) FROM expected e FULL JOIN supabase_migrations.schema_migrations h USING(version) WHERE e.version IS NULL OR h.version IS NULL OR h.name IS DISTINCT FROM e.name OR cardinality(h.statements)::text IS DISTINCT FROM e.count_text OR encode(sha256(convert_to(array_to_json(h.statements)::text,'UTF8')),'hex') IS DISTINCT FROM e.sha) AS mismatch_against_18 FROM totals CROSS JOIN h;
WITH expected(name,body_sha,owner_name,security_definer,browser_allowed,service_allowed) AS (VALUES
('ctbc_request_owner','34ae01224735e7d8ff5ab5c0a9fc18c6aeea7f6d4cb88807894c8eb06ec12b2e','postgres',true,false,false),
('ctbc_lock_references','f8aab40658ad9238d74e2f5ad40b9dff7000c2756daf11195886bfcc6f824d61','ctbc_link_locker',true,false,false),
('ctbc_recheck_risk','d07ebdfb5c180cfceff80fcc97b4ac9a479667e4314fa910c22c1520aa7339c8','ctbc_executor',true,false,false),
('ctbc_act','38ac40772a520204eaa8770a862dbac89bf1dd682696cbd92eb9ca507e485126','ctbc_executor',true,true,false),
('ctbc_batch_preflight','57211df8b7935e330eb7321b0c6569882e18700935a78b9ba1aff6ee85fde2f7','ctbc_executor',true,true,false),
('ctbc_retain','cbeb86fb96f5abcf64486a91f647abddca67ee0529a6e8ed9c984c2df19fb546','postgres',false,false,true),
('ctbc_begin','356a7a1efbfe1d4a1d125898c8ccde4bdda4bf50add54f49a21f8a21f9bcea13','postgres',false,false,true),
('ctbc_ingest','daa6d0d980f73c78d5b6d3b70b39ee275b6931354d5513d9c5635ab3d17dda4e','postgres',false,false,true),
('ctbc_snapshot','7e48d991098ad96643e6837ce316f10baf81acfd4b3760b5f33ad779f20168db','ctbc_executor',true,true,false),
('ctbc_worker_binding','a657df30a58e1e5e53ced306692d5abe1f097426a70f556872354c42a8e91af4','postgres',false,false,true),
('ctbc_worker_probe','986f1a431ccb6464b4d8020349882562edc336339c472451c2025a6e82ef5e3d','postgres',false,false,true),
('ctbc_worker_finish','ced3b55778ce4cef24ac92244b3f4f05dcfb59d34030be6f0794b97fa6a53ca2','postgres',false,false,true),
('ctbc_worker_commit','3fbc4ef40eadb0c7162a94f6307a2c23c0040c80a985ef7a346bcbba38d94687','postgres',false,false,true),
('ctbc_worker_poll','9724550a760ab442bff530d996b19ec236ae2ae710edc5aa8e80edfc25a223a0','postgres',false,false,true)
) SELECT e.*,p.oid::regprocedure::text AS signature,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS actual_body_sha,pg_get_userbyid(p.proowner) AS actual_owner,p.prosecdef,p.proconfig,has_function_privilege((SELECT oid FROM pg_roles WHERE rolname='anon'),p.oid,'EXECUTE') AS anon_execute,has_function_privilege((SELECT oid FROM pg_roles WHERE rolname='authenticated'),p.oid,'EXECUTE') AS authenticated_execute,has_function_privilege((SELECT oid FROM pg_roles WHERE rolname='service_role'),p.oid,'EXECUTE') AS service_execute FROM expected e LEFT JOIN pg_proc p ON p.proname=e.name AND p.pronamespace='public'::regnamespace ORDER BY e.name;
SELECT r.rolname,c.relname,has_table_privilege(r.oid,c.oid,'SELECT') AS can_select,has_table_privilege(r.oid,c.oid,'INSERT') AS can_insert,has_table_privilege(r.oid,c.oid,'UPDATE') AS can_update,has_table_privilege(r.oid,c.oid,'DELETE') AS can_delete FROM (VALUES ('ctbc_executor'),('ctbc_link_locker')) wanted(name) LEFT JOIN pg_roles r ON r.rolname=wanted.name LEFT JOIN pg_class c ON c.oid=to_regclass('public.transactions');
SELECT current_setting('session_replication_role') AS session_replication_role;
SELECT e.evtname::text AS trigger_name,e.evtevent::text AS event,e.evtenabled::text AS enabled,e.evttags AS tags,pg_get_userbyid(e.evtowner)::text AS owner,e.evtfoid::regprocedure::text AS function_signature,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS function_body_sha256,pg_get_userbyid(p.proowner)::text AS function_owner,p.prosecdef AS security_definer FROM pg_event_trigger e JOIN pg_proc p ON p.oid=e.evtfoid WHERE e.evtenabled<>'D' ORDER BY e.evtname;
SELECT (SELECT encode(sha256(convert_to(COALESCE(json_agg(q ORDER BY trigger_name),'[]'::json)::text,'UTF8')),'hex') FROM (SELECT e.evtname::text AS trigger_name,e.evtevent::text AS event,e.evtenabled::text AS enabled,e.evttags AS tags,pg_get_userbyid(e.evtowner)::text AS owner,e.evtfoid::regprocedure::text AS function_signature,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS function_body_sha256,pg_get_userbyid(p.proowner)::text AS function_owner,p.prosecdef AS security_definer FROM pg_event_trigger e JOIN pg_proc p ON p.oid=e.evtfoid WHERE e.evtenabled<>'D' ORDER BY e.evtname) q) AS observed_event_trigger_array_sha256,(WITH expected(trigger_name,event,enabled,tags,owner,function_signature,function_body_sha256,function_owner,security_definer) AS (VALUES
__LOCAL_EVENT_ROWS__
), actual AS (SELECT e.evtname::text AS trigger_name,e.evtevent::text AS event,e.evtenabled::text AS enabled,e.evttags AS tags,pg_get_userbyid(e.evtowner)::text AS owner,e.evtfoid::regprocedure::text AS function_signature,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS function_body_sha256,pg_get_userbyid(p.proowner)::text AS function_owner,p.prosecdef AS security_definer FROM pg_event_trigger e JOIN pg_proc p ON p.oid=e.evtfoid WHERE e.evtenabled<>'D' ORDER BY e.evtname) SELECT count(*) FROM expected e FULL JOIN actual a USING(trigger_name) WHERE e.trigger_name IS NULL OR a.trigger_name IS NULL OR ROW(e.event,e.enabled,e.tags,e.owner,e.function_signature,e.function_body_sha256,e.function_owner,e.security_definer) IS DISTINCT FROM ROW(a.event,a.enabled,a.tags,a.owner,a.function_signature,a.function_body_sha256,a.function_owner,a.security_definer)) AS reviewed_event_trigger_mismatch_count;
COMMIT;
