-- SYNTHETIC EXPERIMENT ONLY. Not a production migration or Supabase auth model.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
CREATE ROLE synthetic_a LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
CREATE ROLE synthetic_b LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
CREATE ROLE synthetic_executor NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
CREATE SCHEMA synthetic;
REVOKE ALL ON SCHEMA synthetic FROM PUBLIC;
GRANT USAGE ON SCHEMA synthetic TO synthetic_a, synthetic_b, synthetic_executor;
CREATE TABLE synthetic.marker (value text PRIMARY KEY CHECK (value = 'ctbc-ephemeral-only'));
INSERT INTO synthetic.marker VALUES ('ctbc-ephemeral-only');
CREATE TABLE synthetic.categories (id text PRIMARY KEY, owner text NOT NULL);
CREATE TABLE synthetic.payments (id text PRIMARY KEY, owner text NOT NULL);
CREATE TABLE synthetic.candidates (
 id text PRIMARY KEY, owner text NOT NULL, amount integer,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','conflict','imported','linked','ignored','excluded','expired')),
 version integer NOT NULL DEFAULT 1, risk boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL, closed_at timestamptz, detail text, scrubbed_at timestamptz,
 CHECK ((status IN ('pending','conflict')) = (closed_at IS NULL))
);
CREATE TABLE synthetic.ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner text NOT NULL,
 candidate_id text UNIQUE, amount integer NOT NULL, category text NOT NULL, payment text NOT NULL
);
-- No FK from ledger to candidate: retention must never delete accounting records.
CREATE TABLE synthetic.events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner text NOT NULL,
 key text NOT NULL, candidate_id text NOT NULL, request jsonb NOT NULL, result jsonb NOT NULL,
 UNIQUE(owner,key)
);
INSERT INTO synthetic.categories VALUES ('cat-a','synthetic_a'),('cat-b','synthetic_b');
INSERT INTO synthetic.payments VALUES ('pay-a','synthetic_a'),('pay-b','synthetic_b');
INSERT INTO synthetic.ledger(owner,amount,category,payment) VALUES
 ('synthetic_a',180,'cat-a','pay-a'),('synthetic_b',999,'cat-b','pay-b');
DO $setup$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['categories','payments','candidates','ledger','events'] LOOP
  EXECUTE format('ALTER TABLE synthetic.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE synthetic.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY own_rows ON synthetic.%I TO synthetic_a,synthetic_b,synthetic_executor USING (owner = session_user) WITH CHECK (owner = session_user)',t);
 END LOOP;
END $setup$;
GRANT SELECT ON synthetic.categories,synthetic.payments,synthetic.candidates,synthetic.ledger,synthetic.events TO synthetic_a,synthetic_b;
GRANT SELECT,UPDATE ON synthetic.candidates TO synthetic_executor;
GRANT SELECT ON synthetic.categories,synthetic.payments TO synthetic_executor;
GRANT SELECT,INSERT ON synthetic.ledger,synthetic.events TO synthetic_executor;

-- Definer is a non-owner, non-login, non-bypass role with narrow grants and RLS.
-- Identity is session_user (actual DB login), never caller-provided owner or GUC.
CREATE FUNCTION synthetic.act(cid text, expected integer, action text, key text,
 category text DEFAULT NULL, payment text DEFAULT NULL, link uuid DEFAULT NULL,
 resolve_risk boolean DEFAULT false, batch boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,synthetic AS $fn$
DECLARE c synthetic.candidates%ROWTYPE; e synthetic.events%ROWTYPE;
 req jsonb; result jsonb; ledger_id uuid; event_id uuid := gen_random_uuid();
BEGIN
 IF session_user NOT IN ('synthetic_a','synthetic_b') THEN RAISE EXCEPTION 'owner_denied'; END IF;
 IF key IS NULL OR length(key) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_key'; END IF;
 IF action IS NULL OR action NOT IN ('import','link','ignore','work','defer') THEN RAISE EXCEPTION 'invalid_action'; END IF;
 req := jsonb_build_array(cid,expected,action,category,payment,link,resolve_risk,batch);
 -- Global key order before row lock: same-key callers serialize before replay lookup.
 PERFORM pg_advisory_xact_lock(hashtextextended(session_user || ':' || key,0));
 SELECT * INTO e FROM synthetic.events WHERE owner=session_user AND events.key=act.key;
 IF FOUND THEN
  IF e.request IS DISTINCT FROM req THEN RAISE EXCEPTION 'idempotency_mismatch'; END IF;
  RETURN e.result;
 END IF;
 SELECT * INTO c FROM synthetic.candidates WHERE id=cid AND owner=session_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'candidate_denied'; END IF;
 IF c.version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'stale_version'; END IF;
 IF c.status NOT IN ('pending','conflict') OR c.amount IS NULL OR c.scrubbed_at IS NOT NULL
  OR c.created_at + interval '30 days' <= transaction_timestamp() THEN RAISE EXCEPTION 'candidate_closed'; END IF;
 IF batch AND (action <> 'import' OR c.risk OR c.status='conflict') THEN RAISE EXCEPTION 'unsafe_batch'; END IF;
 IF action <> 'defer' AND (c.risk OR c.status='conflict') AND resolve_risk IS NOT TRUE THEN RAISE EXCEPTION 'risk_confirmation_required'; END IF;
 IF action='import' THEN
  IF NOT EXISTS(SELECT 1 FROM synthetic.categories WHERE id=category AND owner=session_user)
   OR NOT EXISTS(SELECT 1 FROM synthetic.payments WHERE id=payment AND owner=session_user) THEN RAISE EXCEPTION 'classification_denied'; END IF;
  INSERT INTO synthetic.ledger(owner,candidate_id,amount,category,payment)
   VALUES(session_user,cid,c.amount,category,payment) RETURNING id INTO ledger_id;
 ELSIF action='link' THEN
  SELECT id INTO ledger_id FROM synthetic.ledger WHERE id=link AND owner=session_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'link_denied'; END IF;
 END IF;
 UPDATE synthetic.candidates SET version=version+1,
  status=CASE action WHEN 'import' THEN 'imported' WHEN 'link' THEN 'linked' WHEN 'ignore' THEN 'ignored' WHEN 'work' THEN 'excluded' ELSE status END,
  closed_at=CASE WHEN action='defer' THEN NULL ELSE transaction_timestamp() END
 WHERE id=cid AND owner=session_user;
 result:=jsonb_build_object('event',event_id,'ledger',ledger_id,'version',c.version+1);
 INSERT INTO synthetic.events(id,owner,key,candidate_id,request,result) VALUES(event_id,session_user,key,cid,req,result);
 RETURN result;
END $fn$;
ALTER FUNCTION synthetic.act(text,integer,text,text,text,text,uuid,boolean,boolean) OWNER TO synthetic_executor;
REVOKE ALL ON FUNCTION synthetic.act(text,integer,text,text,text,text,uuid,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION synthetic.act(text,integer,text,text,text,text,uuid,boolean,boolean) TO synthetic_a,synthetic_b;

CREATE FUNCTION synthetic.import_batch(ids text[], versions integer[], key text, category text,payment text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,synthetic AS $fn$
DECLARE i integer; results jsonb := '[]';
BEGIN
 IF ids IS NULL OR cardinality(ids)=0 OR cardinality(ids)>20 OR cardinality(ids) IS DISTINCT FROM cardinality(versions)
  OR (SELECT count(DISTINCT x) FROM unnest(ids) x)<>cardinality(ids) THEN RAISE EXCEPTION 'invalid_batch'; END IF;
 -- Same order as single act: keys first, then sorted rows (avoid key/row inversion).
 FOR i IN SELECT n FROM generate_subscripts(ids,1) n ORDER BY ids[n] LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(session_user || ':' || key || ':' || ids[i],0));
 END LOOP;
 -- Lock all member rows in deterministic order before applying any decisions.
 PERFORM id FROM synthetic.candidates WHERE id=ANY(ids) AND owner=session_user ORDER BY id FOR UPDATE;
 FOR i IN 1..cardinality(ids) LOOP
  results := results || jsonb_build_array(synthetic.act(ids[i],versions[i],'import',key || ':' || ids[i],category,payment,NULL,false,true));
 END LOOP;
 RETURN results;
END $fn$;
ALTER FUNCTION synthetic.import_batch(text[],integer[],text,text,text) OWNER TO synthetic_executor;
REVOKE ALL ON FUNCTION synthetic.import_batch(text[],integer[],text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION synthetic.import_batch(text[],integer[],text,text,text) TO synthetic_a,synthetic_b;
GRANT EXECUTE ON FUNCTION synthetic.act(text,integer,text,text,text,text,uuid,boolean,boolean) TO synthetic_executor;
