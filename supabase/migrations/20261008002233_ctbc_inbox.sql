-- Repository-only CTBC inbox. No scheduler, Gmail, credentials or live activation.
-- Configuration is disabled by default; callers cannot impersonate another owner.
do $$ declare r text; begin
 foreach r in array array['ctbc_executor','ctbc_link_locker'] loop
  if not exists(select 1 from pg_roles where rolname=r) then execute format('create role %I nologin noinherit nobypassrls',r);
  elsif exists(select 1 from pg_roles where rolname=r and (rolcanlogin or rolinherit or rolbypassrls or rolsuper or rolcreaterole or rolcreatedb)) then raise exception 'ctbc_role_drift'; end if;
 end loop;
end $$;
-- Supabase's migration role is not a superuser. Give it temporary membership
-- and the new owners temporary schema CREATE solely for ownership transfer.
do $$ begin execute format('grant ctbc_executor, ctbc_link_locker to %I',current_user); end $$;
grant usage,create on schema public to ctbc_executor, ctbc_link_locker;
-- The migration role cannot grant privileges on the managed auth schema. This
-- fixed helper evaluates actual Supabase auth.uid(), with no caller owner input.
create function public.ctbc_request_owner() returns uuid language sql security definer
set search_path=pg_catalog as $$ select auth.uid() $$;
revoke all on function public.ctbc_request_owner() from public,anon,authenticated;
grant execute on function public.ctbc_request_owner() to ctbc_executor,ctbc_link_locker;

create table public.ctbc_collector_scopes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 enabled boolean not null default false, mailbox_binding uuid not null unique,
 preferred_payment_id uuid references public.payment_methods(id) on delete set null,
 fence bigint not null default 0, lease_until timestamptz, active_batch uuid
);
create table public.ctbc_batches (
 id uuid primary key default gen_random_uuid(), scope_id uuid not null references public.ctbc_collector_scopes(id),
 user_id uuid not null references auth.users(id), slot_date date not null,
 starts_at timestamptz not null, ends_at timestamptz not null, stops_at timestamptz not null,
 status text not null default 'received' check(status in ('received','ready_for_review','partial_failure','failed','missed_run','retry_expired','no_message','zero_new_candidates')),
 attempts integer not null default 0, next_attempt_at timestamptz, last_attempt_at timestamptz, last_success_at timestamptz,
 failures integer not null default 0 check(failures>=0), rejected integer not null default 0 check(rejected>=0),
 outside_window integer not null default 0 check(outside_window>=0), deferred integer not null default 0 check(deferred>=0),
 created_at timestamptz not null default now(), unique(scope_id,slot_date)
);
alter table public.ctbc_collector_scopes add foreign key(active_batch) references public.ctbc_batches(id) on delete set null;
create table public.ctbc_candidates (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 batch_id uuid not null references public.ctbc_batches(id),
 source_id text not null check(source_id ~ '^ctbc:v1:[0-9a-f]{64}:[0-9a-f]{64}$'),
 payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
 occurred_at timestamptz, amount integer check(amount>0), merchant text check(length(merchant)<=100),
 product text check(length(product)<=100), card_role text check(card_role in ('primary','supplementary','unknown')),
 bank_category text check(length(bank_category)<=100), suggested_payment_id uuid references public.payment_methods(id) on delete set null,
 warnings text[] not null default '{}', late boolean not null default false,
 status text not null default 'needs_review' check(status in ('needs_review','conflict','imported','already_recorded','ignored','work_excluded','expired')),
 version integer not null default 1 check(version>0),
 imported_transaction_id uuid references public.transactions(id) on delete set null,
 linked_transaction_id uuid references public.transactions(id) on delete set null,
 created_at timestamptz not null default now(), closed_at timestamptz, scrubbed_at timestamptz,
 unique(user_id,source_id), check((status in ('needs_review','conflict')) = (closed_at is null)),
 check(warnings <@ array['merchant_unknown','payment_unknown','partial_batch','possible_duplicate','cross_message_duplicate','amount_mismatch','source_payload_conflict']::text[])
);
create index ctbc_candidates_owner_pending on public.ctbc_candidates(user_id,status,created_at);
create table public.ctbc_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 candidate_id uuid not null references public.ctbc_candidates(id) on delete cascade,
 action_key uuid not null, request jsonb not null, result jsonb not null,
 code text not null check(code in ('personal_imported','existing_transaction_linked','candidate_ignored','review_deferred','work_expense_excluded')),
 created_at timestamptz not null default now(), unique(user_id,action_key)
);
alter table public.transactions drop constraint transactions_source_check;
alter table public.transactions add constraint transactions_source_check check(source in ('legacy','manual','ynab_import','hermes','email_import'));

alter table public.ctbc_collector_scopes enable row level security;
alter table public.ctbc_batches enable row level security;
alter table public.ctbc_candidates enable row level security;
alter table public.ctbc_events enable row level security;
alter table public.ctbc_batches force row level security;
alter table public.ctbc_candidates force row level security;
alter table public.ctbc_events force row level security;
create policy ctbc_batches_own on public.ctbc_batches using(user_id=public.ctbc_request_owner());
create policy ctbc_candidates_own on public.ctbc_candidates using(user_id=public.ctbc_request_owner()) with check(user_id=public.ctbc_request_owner());
create policy ctbc_events_own on public.ctbc_events using(user_id=public.ctbc_request_owner()) with check(user_id=public.ctbc_request_owner());
revoke all on public.ctbc_collector_scopes,public.ctbc_batches,public.ctbc_candidates,public.ctbc_events from public,anon,authenticated;
-- Browser reads only the redacted snapshot RPC, which scrubs overdue details
-- before returning. Direct table reads cannot bypass retention or expose hashes.
grant select,update on public.ctbc_candidates to ctbc_executor;
grant select on public.ctbc_batches to ctbc_executor;
grant select,insert on public.ctbc_events,public.transactions to ctbc_executor;
grant select on public.categories,public.payment_methods to ctbc_executor;
grant select,update(id) on public.transactions,public.categories,public.payment_methods to ctbc_link_locker;
grant all on public.ctbc_collector_scopes,public.ctbc_batches,public.ctbc_candidates,public.ctbc_events to service_role;

-- Row locks protect against deletion/ownership changes, without granting the
-- action executor any ability to update existing accounting rows.
create function public.ctbc_lock_references(p_category uuid,p_payment uuid,p_link uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare found_id uuid; u uuid:=public.ctbc_request_owner();
begin
 if u is null then raise exception 'owner_denied'; end if;
 if p_link is not null then
  select id into found_id from public.transactions where id=p_link and user_id=u for share;
  if found_id is null then raise exception 'reference_denied'; end if;
  return found_id;
 end if;
 perform 1 from public.categories where id=p_category and user_id=u for share;
 if not found then raise exception 'reference_denied'; end if;
 perform 1 from public.payment_methods where id=p_payment and user_id=u for share;
 if not found then raise exception 'reference_denied'; end if;
 return null;
end $$;
alter function public.ctbc_lock_references(uuid,uuid,uuid) owner to ctbc_link_locker;
revoke all on function public.ctbc_lock_references(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ctbc_lock_references(uuid,uuid,uuid) to ctbc_executor;

-- Recheck the payment chosen NOW, not the collector's historical suggestion.
-- Newly discovered risks are persisted before returning, without any ledger write.
create function public.ctbc_recheck_risk(p_id uuid,p_payment uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=public.ctbc_request_owner(); c public.ctbc_candidates%rowtype; risks text[]:='{}'; d date;
begin
 select * into c from public.ctbc_candidates where id=p_id and user_id=u for update;
 if not found then raise exception 'candidate_denied'; end if;
 if not exists(select 1 from public.payment_methods where id=p_payment and user_id=u) then raise exception 'reference_denied'; end if;
 d:=(c.occurred_at at time zone 'Asia/Taipei')::date;
 if exists(select 1 from public.transactions t where t.user_id=u and t.payment_method_id=p_payment and t.date between d-1 and d+1 and t.amount=c.amount) then risks:=array_append(risks,'possible_duplicate'); end if;
 if c.merchant is not null and exists(select 1 from public.transactions t where t.user_id=u and t.payment_method_id=p_payment and t.date between d-1 and d+1 and t.note=c.merchant and t.amount<>c.amount) then risks:=array_append(risks,'amount_mismatch'); end if;
 select coalesce(array_agg(r),'{}') into risks from unnest(risks) r where not(r=any(c.warnings));
 if cardinality(risks)=0 then return false; end if;
 update public.ctbc_candidates set warnings=warnings||risks,status='conflict',version=version+1 where id=c.id and user_id=u;
 return true;
end $$;
alter function public.ctbc_recheck_risk(uuid,uuid) owner to ctbc_executor;
revoke all on function public.ctbc_recheck_risk(uuid,uuid) from public,anon,authenticated;

create function public.ctbc_act(p_id uuid,p_expected integer,p_action text,p_key uuid,
 p_category uuid default null,p_payment uuid default null,p_link uuid default null,
 p_resolve boolean default false,p_batch boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=public.ctbc_request_owner(); c public.ctbc_candidates%rowtype; e public.ctbc_events%rowtype;
 req jsonb; res jsonb; tid uuid; eid uuid:=gen_random_uuid(); event_code text;
begin
 if u is null or p_key is null then raise exception 'owner_denied'; end if;
 if p_action is null or p_action not in ('import','link','ignore','defer','work') then raise exception 'invalid_action'; end if;
 req:=jsonb_build_array(p_id,p_expected,p_action,p_category,p_payment,p_link,p_resolve,p_batch);
 perform pg_advisory_xact_lock(hashtextextended(u::text||':'||p_key::text,0));
 select * into e from public.ctbc_events where user_id=u and action_key=p_key;
 if found then
  if e.request is distinct from req then raise exception 'idempotency_mismatch'; end if;
  return e.result;
 end if;
 select * into c from public.ctbc_candidates where id=p_id and user_id=u for update;
 if not found then raise exception 'candidate_denied'; end if;
 if c.version is distinct from p_expected then raise exception 'stale_version'; end if;
 if c.status not in ('needs_review','conflict') or c.amount is null or c.created_at+interval '30 days'<=now() then raise exception 'candidate_closed'; end if;
 if p_action='import' then
  perform public.ctbc_lock_references(p_category,p_payment,null);
  if public.ctbc_recheck_risk(c.id,p_payment) then return jsonb_build_object('candidateId',c.id,'version',c.version+1,'code','risk_recheck_required'); end if;
 end if;
 if p_batch and (p_action<>'import' or c.status='conflict' or cardinality(c.warnings)>0) then raise exception 'unsafe_batch'; end if;
 if p_action<>'defer' and (c.status='conflict' or cardinality(c.warnings)>0) and p_resolve is not true then raise exception 'risk_confirmation_required'; end if;
 if p_action='import' and 'source_payload_conflict'=any(c.warnings) then raise exception 'source_conflict_unresolved'; end if;
 if p_action='import' then
  insert into public.transactions(user_id,date,amount,category_id,payment_method_id,note,source,source_id,metadata)
   values(u,(c.occurred_at at time zone 'Asia/Taipei')::date,c.amount,p_category,p_payment,
    coalesce(c.merchant,'商家未明'),'email_import',c.source_id,jsonb_build_object('ctbc',jsonb_build_object('candidateId',c.id,'version',1))) returning id into tid;
 elsif p_action='link' then
  if p_link is null then raise exception 'reference_denied'; end if;
  tid:=public.ctbc_lock_references(null,null,p_link);
 end if;
 event_code:=case p_action when 'import' then 'personal_imported' when 'link' then 'existing_transaction_linked' when 'ignore' then 'candidate_ignored' when 'work' then 'work_expense_excluded' else 'review_deferred' end;
 update public.ctbc_candidates set version=version+1,
  status=case p_action when 'import' then 'imported' when 'link' then 'already_recorded' when 'ignore' then 'ignored' when 'work' then 'work_excluded' else status end,
  closed_at=case when p_action='defer' then null else now() end,
  imported_transaction_id=case when p_action='import' then tid else imported_transaction_id end,
  linked_transaction_id=case when p_action='link' then tid else linked_transaction_id end
 where id=c.id and user_id=u;
 res:=jsonb_build_object('candidateId',c.id,'version',c.version+1,'transactionId',tid,'code',event_code);
 insert into public.ctbc_events(id,user_id,candidate_id,action_key,request,result,code) values(eid,u,c.id,p_key,req,res,event_code);
 return res;
end $$;
alter function public.ctbc_act(uuid,integer,text,uuid,uuid,uuid,uuid,boolean,boolean) owner to ctbc_executor;
revoke all on function public.ctbc_act(uuid,integer,text,uuid,uuid,uuid,uuid,boolean,boolean) from public,anon;
grant execute on function public.ctbc_act(uuid,integer,text,uuid,uuid,uuid,uuid,boolean,boolean) to authenticated;

-- Exact event replay is validated BEFORE the old candidate/version gate. A
-- terminal candidate without this exact key and payload is never a success.
-- All remaining fresh commands are risk-checked before the first ledger write.
create function public.ctbc_batch_preflight(p_commands jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=public.ctbc_request_owner(); item jsonb; req jsonb; c public.ctbc_candidates%rowtype; e public.ctbc_events%rowtype;
 cid uuid; expected integer; key uuid; cat uuid; payment uuid; linked uuid; resolve boolean; first_cat uuid; first_payment uuid;
 ready boolean:=true; seen_ids uuid[]:='{}'; seen_keys uuid[]:='{}';
begin
 if u is null or jsonb_typeof(p_commands) is distinct from 'array' or jsonb_array_length(p_commands) not between 1 and 20 then raise exception 'invalid_batch'; end if;
 for item in select value from jsonb_array_elements(p_commands) loop
  if jsonb_typeof(item) is distinct from 'object' or item->>'action' is distinct from 'import' or item->>'batch' is distinct from 'true' then raise exception 'invalid_batch'; end if;
  if exists(select 1 from jsonb_object_keys(item) k where k not in ('candidateId','expectedVersion','action','actionKey','categoryId','paymentId','linkedId','resolveRisk','batch')) then raise exception 'invalid_batch'; end if;
  cid:=(item->>'candidateId')::uuid; expected:=(item->>'expectedVersion')::integer; key:=(item->>'actionKey')::uuid;
  cat:=(item->>'categoryId')::uuid; payment:=(item->>'paymentId')::uuid; linked:=(item->>'linkedId')::uuid; resolve:=coalesce((item->>'resolveRisk')::boolean,false);
  if cid is null or key is null or expected is null or expected<1 or cat is null or payment is null or cid=any(seen_ids) or key=any(seen_keys) then raise exception 'invalid_batch'; end if;
  if first_cat is null then first_cat:=cat; first_payment:=payment; elsif cat is distinct from first_cat or payment is distinct from first_payment then raise exception 'invalid_batch'; end if;
  seen_ids:=array_append(seen_ids,cid); seen_keys:=array_append(seen_keys,key);
  req:=jsonb_build_array(cid,expected,'import',cat,payment,linked,resolve,true);
  perform pg_advisory_xact_lock(hashtextextended(u::text||':'||key::text,0));
  select * into e from public.ctbc_events where user_id=u and action_key=key;
  if found then if e.request is distinct from req then ready:=false; end if; continue; end if;
  select * into c from public.ctbc_candidates where id=cid and user_id=u for update;
  if not found or c.version is distinct from expected or c.status not in ('needs_review','conflict') or c.amount is null or c.created_at+interval '30 days'<=now() then ready:=false; continue; end if;
  perform public.ctbc_lock_references(cat,payment,null);
  if public.ctbc_recheck_risk(cid,payment) or c.status<>'needs_review' or cardinality(c.warnings)>0 then ready:=false; end if;
 end loop;
 return jsonb_build_object('code',case when ready then 'ready' else 'conflict' end);
end $$;
alter function public.ctbc_batch_preflight(jsonb) owner to ctbc_executor;
revoke all on function public.ctbc_batch_preflight(jsonb) from public,anon;
grant execute on function public.ctbc_batch_preflight(jsonb) to authenticated;

-- Service-only maintenance; no clock argument, browser grant, schedule or cron.
create function public.ctbc_retain(p_dry_run boolean default true,p_limit integer default 200)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare expire_count integer; scrub_count integer; purge_count integer; ids uuid[];
begin
 if current_user<>'service_role' or p_dry_run is null or p_limit is null or p_limit not between 1 and 500 then raise exception 'maintenance_denied'; end if;
 select count(*) into expire_count from public.ctbc_candidates where status in ('needs_review','conflict') and created_at+interval '30 days'<=now();
 select count(*) into scrub_count from public.ctbc_candidates where scrubbed_at is null and (status='expired' or (status not in ('needs_review','conflict') and closed_at+interval '7 days'<=now()));
 select count(*) into purge_count from public.ctbc_candidates where closed_at+interval '90 days'<=now();
 if p_dry_run then return jsonb_build_object('expire',expire_count,'scrub',scrub_count,'purge',purge_count); end if;
 select array_agg(id) into ids from (select id from public.ctbc_candidates where
  (status in ('needs_review','conflict') and created_at+interval '30 days'<=now()) or
  (scrubbed_at is null and (status='expired' or closed_at+interval '7 days'<=now())) or closed_at+interval '90 days'<=now()
  order by created_at,id limit p_limit for update skip locked) pending;
 update public.ctbc_candidates set status='expired',version=version+1,closed_at=created_at+interval '30 days'
  where id=any(ids) and status in ('needs_review','conflict') and created_at+interval '30 days'<=now();
 update public.ctbc_candidates set occurred_at=null,amount=null,merchant=null,product=null,card_role=null,bank_category=null,
  suggested_payment_id=null,warnings='{}',late=false,scrubbed_at=now()
  where id=any(ids) and scrubbed_at is null and (status='expired' or closed_at+interval '7 days'<=now());
 delete from public.ctbc_candidates where id=any(ids) and closed_at+interval '90 days'<=now();
 delete from public.ctbc_batches where id in (select b.id from public.ctbc_batches b where b.created_at+interval '120 days'<=now() and not exists(select 1 from public.ctbc_candidates c where c.batch_id=b.id) order by b.created_at,b.id limit p_limit for update skip locked);
 return jsonb_build_object('expire',expire_count,'scrub',scrub_count,'purge',purge_count,'limit',p_limit);
end $$;
revoke all on function public.ctbc_retain(boolean,integer) from public,anon,authenticated;
grant execute on function public.ctbc_retain(boolean,integer) to service_role;

-- Identity, window, retry budget and fencing are fixed in persistent state.
create function public.ctbc_begin(p_scope uuid,p_date date) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.ctbc_collector_scopes%rowtype; b public.ctbc_batches%rowtype; midnight timestamptz; deadline timestamptz;
begin
 if current_user<>'service_role' then raise exception 'collector_denied'; end if;
 select * into s from public.ctbc_collector_scopes where id=p_scope and enabled for update;
 if not found then raise exception 'collector_disabled'; end if;
 midnight:=p_date::timestamp at time zone 'Asia/Taipei';
 if now()<midnight+interval '17 hours' then raise exception 'too_early'; end if;
 if s.lease_until>now() then raise exception 'scope_busy'; end if;
 insert into public.ctbc_batches(scope_id,user_id,slot_date,starts_at,ends_at,stops_at)
  values(s.id,s.user_id,p_date,midnight-interval '4 days',midnight+interval '17 hours',midnight+interval '1 day') on conflict(scope_id,slot_date) do nothing;
 select * into b from public.ctbc_batches where scope_id=s.id and slot_date=p_date for update;
 if now()>=b.stops_at then
  update public.ctbc_batches set status=case when attempts=0 then 'missed_run' else 'retry_expired' end where id=b.id;
  return jsonb_build_object('code',case when b.attempts=0 then 'missed_run' else 'retry_expired' end);
 end if;
 if b.attempts>=3 or b.last_success_at is not null or b.next_attempt_at>now() then raise exception 'retry_blocked'; end if;
 deadline:=least(now()+interval '15 minutes',b.stops_at);
 update public.ctbc_collector_scopes set fence=fence+1,lease_until=deadline,active_batch=b.id where id=s.id;
 update public.ctbc_batches set attempts=attempts+1,last_attempt_at=now(),next_attempt_at=deadline+case when attempts=0 then interval '5 minutes' else interval '15 minutes' end where id=b.id;
 return jsonb_build_object('code','started','batchId',b.id,'fence',s.fence+1,'deadline',deadline,'startsAt',b.starts_at,'endsAt',b.ends_at,'slotDate',b.slot_date);
end $$;
revoke all on function public.ctbc_begin(uuid,date) from public,anon,authenticated;
grant execute on function public.ctbc_begin(uuid,date) to service_role;

create function public.ctbc_ingest(p_scope uuid,p_batch uuid,p_fence bigint,p_rows jsonb,p_counts jsonb,p_complete boolean)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.ctbc_collector_scopes%rowtype; b public.ctbc_batches%rowtype; c public.ctbc_candidates%rowtype;
 row jsonb; dt timestamptz; d date; added integer:=0; existing integer:=0; conflicts integer:=0; outside_count integer:=0; deferred_count integer:=0;
 failures_count integer; rejected_count integer; warns text[]; visited uuid[]:='{}'; partial boolean; row_id uuid; count_key text; final_status text;
begin
 if current_user<>'service_role' then raise exception 'collector_denied'; end if;
 select * into s from public.ctbc_collector_scopes where id=p_scope and enabled for update;
 if not found or s.active_batch is distinct from p_batch or s.fence is distinct from p_fence or s.lease_until is null or s.lease_until<=now() then raise exception 'stale_lease'; end if;
 select * into b from public.ctbc_batches where id=p_batch and scope_id=s.id and user_id=s.user_id for update;
 if not found or now()>=b.stops_at then raise exception 'retry_expired'; end if;
 if p_rows is null or p_counts is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>200 or jsonb_typeof(p_counts)<>'object' or p_complete is null then raise exception 'invalid_batch'; end if;
 for count_key in select jsonb_object_keys(p_counts) loop
  if count_key not in ('failures','rejected','messages') or p_counts->>count_key is null or (p_counts->>count_key)!~'^[0-9]{1,6}$' then raise exception 'invalid_counts'; end if;
 end loop;
 failures_count:=greatest(coalesce((p_counts->>'failures')::integer,0),case when p_complete then 0 else 1 end);
 rejected_count:=coalesce((p_counts->>'rejected')::integer,0);
 for row in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(row) is distinct from 'object' or jsonb_typeof(row->'warnings') is distinct from 'array' then raise exception 'invalid_candidate_fields'; end if;
  if exists(select 1 from jsonb_object_keys(row) k where k not in ('source_id','payload_hash','received_at','occurred_at','amount','merchant','product','card_role','bank_category','warnings')) then raise exception 'invalid_candidate_fields'; end if;
  if row->>'received_at' is null or (row->>'received_at')::timestamptz<b.starts_at or (row->>'received_at')::timestamptz>=b.ends_at then raise exception 'received_outside_window'; end if;
  if row->>'source_id' is null or row->>'payload_hash' is null or row->>'source_id'!~'^ctbc:v1:[0-9a-f]{64}:[0-9a-f]{64}$' or row->>'payload_hash'!~'^[0-9a-f]{64}$' then raise exception 'invalid_identity'; end if;
  select * into c from public.ctbc_candidates where user_id=s.user_id and source_id=row->>'source_id' for update;
  if found then
   visited:=array_append(visited,c.id); existing:=existing+1;
   if c.payload_hash is distinct from row->>'payload_hash' then
    conflicts:=conflicts+1;
    if c.scrubbed_at is null and not ('source_payload_conflict'=any(c.warnings)) then
     update public.ctbc_candidates set warnings=array_append(warnings,'source_payload_conflict'),
      status=case when status in ('needs_review','conflict') then 'conflict' else status end,
      version=version+1 where id=c.id;
    end if;
   end if;
   continue;
  end if;
  dt:=(row->>'occurred_at')::timestamptz; d:=(dt at time zone 'Asia/Taipei')::date;
  if dt is null or dt>now() then failures_count:=failures_count+1; continue; end if;
  if d=b.slot_date then deferred_count:=deferred_count+1; continue; end if;
  if d<b.slot_date-3 or d>b.slot_date-1 then outside_count:=outside_count+1; continue; end if;
  if row->>'amount' is null or (row->>'amount')!~'^[0-9]{1,9}$' or (row->>'amount')::integer<1 then raise exception 'invalid_amount'; end if;
  select coalesce(array_agg(value),'{}') into warns from jsonb_array_elements_text(row->'warnings');
  if row->>'merchant' is null then warns:=array_append(warns,'merchant_unknown'); end if;
  if s.preferred_payment_id is null then warns:=array_append(warns,'payment_unknown'); end if;
  if s.preferred_payment_id is not null and not exists(select 1 from public.payment_methods where id=s.preferred_payment_id and user_id=s.user_id) then raise exception 'payment_denied'; end if;
  if exists(select 1 from public.transactions t where t.user_id=s.user_id and t.payment_method_id=s.preferred_payment_id and t.date between d-1 and d+1 and t.amount=(row->>'amount')::integer) then warns:=array_append(warns,'possible_duplicate'); end if;
  if exists(select 1 from public.transactions t where t.user_id=s.user_id and t.payment_method_id=s.preferred_payment_id and t.date between d-1 and d+1 and t.note=row->>'merchant' and t.amount<>(row->>'amount')::integer) then warns:=array_append(warns,'amount_mismatch'); end if;
  if exists(select 1 from public.ctbc_candidates q where q.user_id=s.user_id and q.amount=(row->>'amount')::integer and (q.occurred_at at time zone 'Asia/Taipei')::date=d and q.merchant=row->>'merchant') then
   warns:=array_append(warns,'cross_message_duplicate');
   update public.ctbc_candidates set warnings=array_append(warnings,'cross_message_duplicate'),status=case when status='needs_review' then 'conflict' else status end,version=version+1
    where user_id=s.user_id and amount=(row->>'amount')::integer and (occurred_at at time zone 'Asia/Taipei')::date=d and merchant=row->>'merchant' and scrubbed_at is null and not ('cross_message_duplicate'=any(warnings));
  end if;
  insert into public.ctbc_candidates(user_id,batch_id,source_id,payload_hash,occurred_at,amount,merchant,product,card_role,bank_category,suggested_payment_id,warnings,late,status)
   values(s.user_id,b.id,row->>'source_id',row->>'payload_hash',dt,(row->>'amount')::integer,row->>'merchant',row->>'product',row->>'card_role',row->>'bank_category',s.preferred_payment_id,warns,d<>b.slot_date-1,case when cardinality(warns)>0 then 'conflict' else 'needs_review' end) returning id into row_id;
  visited:=array_append(visited,row_id); added:=added+1;
 end loop;
 partial:=b.failures>0 or b.rejected>0 or failures_count>0 or rejected_count>0 or conflicts>0;
 if partial then
  update public.ctbc_candidates set warnings=array_append(warnings,'partial_batch'),status=case when status='needs_review' then 'conflict' else status end,version=version+1
   where user_id=s.user_id and (batch_id=b.id or id=any(visited)) and scrubbed_at is null and not ('partial_batch'=any(warnings));
 end if;
 final_status:=case when partial then 'partial_failure' when added>0 then 'ready_for_review' when coalesce((p_counts->>'messages')::integer,0)=0 then 'no_message' else 'zero_new_candidates' end;
 update public.ctbc_batches set status=final_status,failures=greatest(failures,failures_count+conflicts),rejected=greatest(rejected,rejected_count),outside_window=outside_window+outside_count,deferred=deferred+deferred_count,
  last_success_at=case when p_complete and not partial then now() else last_success_at end,
  next_attempt_at=case when p_complete and not partial then null else now()+case when attempts=1 then interval '5 minutes' else interval '15 minutes' end end where id=b.id;
 update public.ctbc_collector_scopes set lease_until=null,active_batch=null where id=s.id;
 return jsonb_build_object('status',final_status,'added',added,'existing',existing,'conflicts',conflicts,'outside_window',outside_count,'deferred',deferred_count);
end $$;
revoke all on function public.ctbc_ingest(uuid,uuid,bigint,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.ctbc_ingest(uuid,uuid,bigint,jsonb,jsonb,boolean) to service_role;

-- Loading the inbox enforces overdue detail scrubbing even before a maintenance
-- worker runs. No source hashes or event receipts are returned to the browser.
create function public.ctbc_snapshot() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=public.ctbc_request_owner(); rows_json jsonb; latest jsonb; pending integer;
begin
 if u is null then raise exception 'owner_denied'; end if;
 update public.ctbc_candidates set status='expired',version=version+1,closed_at=created_at+interval '30 days'
  where user_id=u and status in ('needs_review','conflict') and created_at+interval '30 days'<=now();
 update public.ctbc_candidates set occurred_at=null,amount=null,merchant=null,product=null,card_role=null,bank_category=null,
  suggested_payment_id=null,warnings='{}',late=false,scrubbed_at=now()
  where user_id=u and scrubbed_at is null and (status='expired' or closed_at+interval '7 days'<=now());
 select count(*) into pending from public.ctbc_candidates where user_id=u and status in ('needs_review','conflict');
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows_json from (
  select id,batch_id,occurred_at,amount,merchant,product,card_role,bank_category,suggested_payment_id,warnings,late,status,version,created_at,closed_at,imported_transaction_id,linked_transaction_id
  from public.ctbc_candidates where user_id=u
  order by case status when 'conflict' then 0 when 'needs_review' then 1 else 2 end,created_at desc,id limit 200
 ) q;
 select to_jsonb(q) into latest from (
  select status,slot_date,failures,rejected,outside_window,deferred,last_attempt_at,last_success_at
  from public.ctbc_batches where user_id=u order by slot_date desc,last_attempt_at desc nulls last limit 1
 ) q;
 return jsonb_build_object('candidates',rows_json,'pendingCount',pending,'latestRun',latest);
end $$;
alter function public.ctbc_snapshot() owner to ctbc_executor;
revoke all on function public.ctbc_snapshot() from public,anon;
grant execute on function public.ctbc_snapshot() to authenticated;
revoke create on schema public from ctbc_executor,ctbc_link_locker;
do $$ begin execute format('revoke ctbc_executor, ctbc_link_locker from %I',current_user); end $$;
