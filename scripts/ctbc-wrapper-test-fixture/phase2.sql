-- SYNTHETIC LOCAL TEST ONLY. No production target or execution grant.
-- Target: disposable Linux CI Supabase postgres database only.
-- PHASE 2 ONLY after PHASE 1 reports ALL_PRESENT_EXACT_18_HISTORY.
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='2s';
DO $details_gate$ BEGIN IF EXISTS(SELECT 1 FROM (WITH wanted(kind,name) AS (VALUES ('table','ctbc_collector_scopes'),('table','ctbc_batches'),('table','ctbc_candidates'),('table','ctbc_events'),('table','ctbc_worker_cursors'),('table','ctbc_worker_attempts'),('function','ctbc_request_owner'),('function','ctbc_lock_references'),('function','ctbc_recheck_risk'),('function','ctbc_act'),('function','ctbc_batch_preflight'),('function','ctbc_retain'),('function','ctbc_begin'),('function','ctbc_ingest'),('function','ctbc_snapshot'),('function','ctbc_worker_binding'),('function','ctbc_worker_probe'),('function','ctbc_worker_finish'),('function','ctbc_worker_commit'),('function','ctbc_worker_poll'),('role','ctbc_executor'),('role','ctbc_link_locker'),('index','ctbc_candidates_owner_pending'),('policy','ctbc_batches_own'),('policy','ctbc_candidates_own'),('policy','ctbc_events_own'),('column','ctbc_batches.error_code')) SELECT w.kind,w.name,
 CASE w.kind WHEN 'table' THEN EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||w.name) AND relkind='r')
 WHEN 'function' THEN EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace=to_regnamespace('public') AND proname=w.name)
 WHEN 'role' THEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname=w.name)
 WHEN 'index' THEN EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||w.name) AND relkind='i')
 WHEN 'policy' THEN EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace=to_regnamespace('public') AND p.polname=w.name)
 WHEN 'column' THEN EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.ctbc_batches') AND attname='error_code' AND NOT attisdropped) END AS present
 FROM wanted w ORDER BY w.kind,w.name) q WHERE present IS NOT TRUE) OR (WITH expected(version,name,count_text,sha) AS (VALUES
__LOCAL_HISTORY_ROWS__,
('20261008002233','ctbc_inbox','61','0584d15315624587e72073f13ef347e29e9596edccab1b62c01ebe4014251ec7'),
('20261008013654','ctbc_worker_lifecycle','22','cb4dd1f2f0285e5a252d3dc1f591fd390ee28590a9971d87d74f3fafb0f2fccc')
) SELECT count(*) FROM expected e FULL JOIN supabase_migrations.schema_migrations h USING(version) WHERE e.version IS NULL OR h.version IS NULL OR h.name IS DISTINCT FROM e.name OR cardinality(h.statements)::text IS DISTINCT FROM e.count_text OR encode(sha256(convert_to(array_to_json(h.statements)::text,'UTF8')),'hex') IS DISTINCT FROM e.sha)<>0 THEN RAISE EXCEPTION 'DETAILS_NOT_ALLOWED_RUN_PHASE_1'; END IF; END; $details_gate$;
SELECT c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND (c.relname LIKE 'ctbc_%' OR c.relname IN ('transactions','categories','payment_methods')) ORDER BY c.relname;
SELECT p.oid::regprocedure::text AS signature,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'ctbc_%' ORDER BY p.proname;
SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolcanlogin,rolinherit,rolbypassrls FROM pg_roles WHERE rolname IN ('postgres','anon','authenticated','service_role','ctbc_executor','ctbc_link_locker') ORDER BY rolname;
SELECT pg_get_userbyid(roleid) AS role_name,pg_get_userbyid(member) AS member_name,admin_option,inherit_option,set_option FROM pg_auth_members WHERE roleid IN (SELECT oid FROM pg_roles WHERE rolname IN ('ctbc_executor','ctbc_link_locker'));
SELECT conname,contype,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname IN ('transactions_source_check','transactions_user_source_source_id_key');
SELECT indexrelid::regclass::text AS index_name,indisunique,indisvalid,indisready FROM pg_index WHERE indrelid='public.transactions'::regclass;
SELECT tgname FROM pg_trigger WHERE tgrelid='supabase_migrations.schema_migrations'::regclass AND NOT tgisinternal;
SELECT pg_get_userbyid(relowner) AS history_owner,relkind FROM pg_class WHERE oid=to_regclass('supabase_migrations.schema_migrations');
SELECT nspname,pg_get_userbyid(nspowner) AS schema_owner,nspacl FROM pg_namespace WHERE nspname IN ('public','auth','supabase_migrations');
SELECT has_schema_privilege('postgres','public','USAGE') AS public_usage,has_schema_privilege('postgres','public','CREATE') AS public_create,has_schema_privilege('postgres','auth','USAGE') AS auth_usage,has_function_privilege('postgres','auth.uid()','EXECUTE') AS auth_uid_execute,has_schema_privilege('postgres','supabase_migrations','USAGE') AS history_usage,has_table_privilege('postgres','supabase_migrations.schema_migrations','INSERT') AS history_insert;
SELECT count(*) AS ledger_rows FROM public.transactions;
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
SELECT rolname,rolcanlogin,rolinherit,rolbypassrls,rolsuper,rolcreaterole,rolcreatedb,has_schema_privilege(rolname,'public','USAGE') AS public_usage,has_schema_privilege(rolname,'public','CREATE') AS public_create FROM pg_roles WHERE rolname IN ('ctbc_executor','ctbc_link_locker');
SELECT has_table_privilege('ctbc_executor','public.transactions','SELECT') AS executor_select,has_table_privilege('ctbc_executor','public.transactions','INSERT') AS executor_insert,has_table_privilege('ctbc_executor','public.transactions','UPDATE') AS executor_update,has_table_privilege('ctbc_executor','public.transactions','DELETE') AS executor_delete,has_column_privilege('ctbc_link_locker','public.transactions','id','UPDATE') AS locker_id_update;
SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'ctbc_%' ORDER BY tablename,policyname;
SELECT c.relname,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS anon_dml,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS authenticated_dml FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('ctbc_collector_scopes','ctbc_batches','ctbc_candidates','ctbc_events','ctbc_worker_cursors','ctbc_worker_attempts');
SELECT enabled,count(*) AS scopes FROM public.ctbc_collector_scopes GROUP BY enabled;
SELECT 'ctbc_collector_scopes' AS name,count(*) AS rows FROM public.ctbc_collector_scopes UNION ALL SELECT 'ctbc_batches',count(*) FROM public.ctbc_batches UNION ALL SELECT 'ctbc_candidates',count(*) FROM public.ctbc_candidates UNION ALL SELECT 'ctbc_events',count(*) FROM public.ctbc_events UNION ALL SELECT 'ctbc_worker_cursors',count(*) FROM public.ctbc_worker_cursors UNION ALL SELECT 'ctbc_worker_attempts',count(*) FROM public.ctbc_worker_attempts;
COMMIT;
