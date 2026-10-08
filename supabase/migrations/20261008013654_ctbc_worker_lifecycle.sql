-- Disabled runtime wiring; no cron, credentials, scope activation or live data.
alter table public.ctbc_batches add column error_code text check(error_code in
 ('provider_failed','source_denied','account_denied','selector_denied','parse_failed','limit_exceeded','attempt_timeout','retry_budget_exhausted','retry_expired','missed_run','commit_unknown'));
create table public.ctbc_worker_cursors (
 scope_id uuid primary key references public.ctbc_collector_scopes(id),
 armed_date date not null, reconciled_through date not null
);
create table public.ctbc_worker_attempts (
 scope_id uuid not null references public.ctbc_collector_scopes(id), fence bigint not null,
 batch_id uuid not null references public.ctbc_batches(id) on delete cascade,
 status text not null check(status in ('running','committed','failed')),
 result jsonb, error_code text, created_at timestamptz not null default now(), finished_at timestamptz,
 primary key(scope_id,fence)
);
alter table public.ctbc_worker_cursors enable row level security;
alter table public.ctbc_worker_attempts enable row level security;
revoke all on public.ctbc_worker_cursors,public.ctbc_worker_attempts from public,anon,authenticated;
grant all on public.ctbc_worker_cursors,public.ctbc_worker_attempts to service_role;

-- Every runtime operation binds the server-selected scope to its fixed tenant
-- and opaque mailbox binding. No browser/HTTP caller supplies these values.
create function public.ctbc_worker_binding(p_scope uuid,p_owner uuid,p_mailbox uuid) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if current_user<>'service_role' or p_owner is null or p_mailbox is null then raise exception 'worker_binding_denied'; end if;
 -- Keep identity stable through the complete RPC, including a concurrent
 -- protected configuration edit. Same lock order for probe/commit/finalizer.
 perform 1 from public.ctbc_collector_scopes where id=p_scope and user_id=p_owner and mailbox_binding=p_mailbox for update;
 if not found then raise exception 'worker_binding_denied'; end if;
end $$;
revoke all on function public.ctbc_worker_binding(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ctbc_worker_binding(uuid,uuid,uuid) to service_role;

-- Read-after-unknown is mandatory. The commit result and ingest are one SQL
-- transaction, so a lost response can never leave a successful ingest unreceipted.
create function public.ctbc_worker_probe(p_scope uuid,p_owner uuid,p_mailbox uuid,p_fence bigint) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare a public.ctbc_worker_attempts%rowtype;
begin
 perform public.ctbc_worker_binding(p_scope,p_owner,p_mailbox);
 select * into a from public.ctbc_worker_attempts where scope_id=p_scope and fence=p_fence;
 if not found then return jsonb_build_object('code','unknown_attempt'); end if;
 return jsonb_build_object('code',a.status,'result',a.result,'errorCode',a.error_code);
end $$;
revoke all on function public.ctbc_worker_probe(uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.ctbc_worker_probe(uuid,uuid,uuid,bigint) to service_role;

create function public.ctbc_worker_finish(p_scope uuid,p_owner uuid,p_mailbox uuid,p_fence bigint,p_code text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.ctbc_collector_scopes%rowtype; a public.ctbc_worker_attempts%rowtype; b public.ctbc_batches%rowtype; final_status text;
begin
 perform public.ctbc_worker_binding(p_scope,p_owner,p_mailbox);
 if p_code is null or p_code not in ('provider_failed','source_denied','account_denied','selector_denied','parse_failed','limit_exceeded','attempt_timeout','commit_unknown') then raise exception 'invalid_error_code'; end if;
 select * into s from public.ctbc_collector_scopes where id=p_scope for update;
 select * into a from public.ctbc_worker_attempts where scope_id=p_scope and fence=p_fence for update;
 if not found then return jsonb_build_object('code','unknown_attempt'); end if;
 if a.status<>'running' then return jsonb_build_object('code',a.status,'result',a.result); end if;
 if s.fence is distinct from p_fence or s.active_batch is distinct from a.batch_id then return jsonb_build_object('code','stale_fence'); end if;
 select * into b from public.ctbc_batches where id=a.batch_id for update;
 final_status:=case when b.status='partial_failure' or exists(select 1 from public.ctbc_candidates where batch_id=b.id) then 'partial_failure' else 'failed' end;
 update public.ctbc_batches set status=final_status,failures=greatest(1,failures),
  error_code=case when now()>=stops_at then 'retry_expired' when attempts>=3 then 'retry_budget_exhausted' else p_code end,
  next_attempt_at=case when now()>=stops_at or attempts>=3 then null else least(stops_at,now()+case when attempts=1 then interval '5 minutes' else interval '15 minutes' end) end
  where id=b.id;
 update public.ctbc_candidates set warnings=array_append(warnings,'partial_batch'),status=case when status='needs_review' then 'conflict' else status end,version=version+1
  where batch_id=b.id and scrubbed_at is null and not ('partial_batch'=any(warnings));
 update public.ctbc_worker_attempts set status='failed',error_code=p_code,finished_at=now() where scope_id=p_scope and fence=p_fence;
 update public.ctbc_collector_scopes set active_batch=null,lease_until=null where id=p_scope;
 return jsonb_build_object('code','failed','status',final_status);
end $$;
revoke all on function public.ctbc_worker_finish(uuid,uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.ctbc_worker_finish(uuid,uuid,uuid,bigint,text) to service_role;

create function public.ctbc_worker_commit(p_scope uuid,p_owner uuid,p_mailbox uuid,p_batch uuid,p_fence bigint,p_rows jsonb,p_counts jsonb,p_complete boolean,p_error text default null) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.ctbc_collector_scopes%rowtype; a public.ctbc_worker_attempts%rowtype; res jsonb;
begin
 perform public.ctbc_worker_binding(p_scope,p_owner,p_mailbox);
 if p_error is not null and p_error not in ('provider_failed','source_denied','parse_failed','limit_exceeded','attempt_timeout') then raise exception 'invalid_error_code'; end if;
 select * into s from public.ctbc_collector_scopes where id=p_scope for update;
 select * into a from public.ctbc_worker_attempts where scope_id=p_scope and fence=p_fence for update;
 if not found or a.batch_id is distinct from p_batch then raise exception 'unknown_attempt'; end if;
 if a.status='committed' then return a.result; end if;
 if a.status<>'running' then raise exception 'attempt_closed'; end if;
 if s.fence is distinct from p_fence or s.active_batch is distinct from p_batch or s.lease_until is null or clock_timestamp()>=s.lease_until then raise exception 'stale_lease'; end if;
 res:=public.ctbc_ingest(p_scope,p_batch,p_fence,p_rows,p_counts,p_complete);
 -- now() is frozen at transaction start. Check wall clock after ingestion too;
 -- a lock wait that crossed the lease/midnight rolls the entire ingest back.
 if clock_timestamp()>=s.lease_until or clock_timestamp()>=(select stops_at from public.ctbc_batches where id=p_batch) then raise exception 'attempt_timeout'; end if;
 update public.ctbc_worker_attempts set status='committed',result=res,finished_at=now() where scope_id=p_scope and fence=p_fence;
 update public.ctbc_batches set error_code=case when status='partial_failure' then coalesce(p_error,'parse_failed') else null end,
  next_attempt_at=case when last_success_at is not null or attempts>=3 then null else least(stops_at,next_attempt_at) end where id=p_batch;
 if exists(select 1 from public.ctbc_batches where id=p_batch and attempts>=3 and last_success_at is null) then
  update public.ctbc_batches set error_code='retry_budget_exhausted' where id=p_batch;
 end if;
 return res;
end $$;
revoke all on function public.ctbc_worker_commit(uuid,uuid,uuid,uuid,bigint,jsonb,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.ctbc_worker_commit(uuid,uuid,uuid,uuid,bigint,jsonb,jsonb,boolean,text) to service_role;

-- The worker polls this durable scheduler. Native DB time decides the slot.
-- A restart reconciles closed dates in bounded chunks; no clock/slot override.
create function public.ctbc_worker_poll(p_scope uuid,p_owner uuid,p_mailbox uuid,p_armed_date date) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.ctbc_collector_scopes%rowtype; c public.ctbc_worker_cursors%rowtype; b public.ctbc_batches%rowtype;
 today date:=(now() at time zone 'Asia/Taipei')::date; d date; midnight timestamptz; begun jsonb; n integer:=0;
begin
 perform public.ctbc_worker_binding(p_scope,p_owner,p_mailbox);
 select * into s from public.ctbc_collector_scopes where id=p_scope for update;
 if p_armed_date is null or p_armed_date>today then raise exception 'invalid_armed_date'; end if;
 insert into public.ctbc_worker_cursors values(p_scope,p_armed_date,p_armed_date-1) on conflict do nothing;
 select * into c from public.ctbc_worker_cursors where scope_id=p_scope for update;
 if c.armed_date<>p_armed_date then raise exception 'schedule_binding_changed'; end if;
 if s.active_batch is not null and (s.lease_until is null or s.lease_until<=now()) then
  perform public.ctbc_worker_finish(p_scope,p_owner,p_mailbox,s.fence,'attempt_timeout');
 end if;
 d:=c.reconciled_through+1;
 while d<today and n<31 loop
  midnight:=d::timestamp at time zone 'Asia/Taipei';
  insert into public.ctbc_batches(scope_id,user_id,slot_date,starts_at,ends_at,stops_at,status,error_code)
   values(s.id,s.user_id,d,midnight-interval '4 days',midnight+interval '17 hours',midnight+interval '1 day','missed_run','missed_run') on conflict do nothing;
  update public.ctbc_batches set status=case when status='partial_failure' then status when attempts=0 then 'missed_run' else 'retry_expired' end,
   error_code=case when attempts=0 then 'missed_run' else 'retry_expired' end,next_attempt_at=null
   where scope_id=p_scope and slot_date=d and last_success_at is null;
  d:=d+1; n:=n+1;
 end loop;
 update public.ctbc_worker_cursors set reconciled_through=d-1 where scope_id=p_scope;
 if d<today then return jsonb_build_object('code','reconciling','missedDaysChecked',n); end if;
 if not s.enabled then return jsonb_build_object('code','disabled'); end if;
 if now()<(today::timestamp at time zone 'Asia/Taipei')+interval '17 hours' then return jsonb_build_object('code','not_due'); end if;
 -- Re-read after expiry finalization; the old fence cannot release a new lease.
 select * into s from public.ctbc_collector_scopes where id=p_scope;
 if s.lease_until>now() then return jsonb_build_object('code','busy'); end if;
 select * into b from public.ctbc_batches where scope_id=p_scope and slot_date=today;
 if found then
  if b.last_success_at is not null then return jsonb_build_object('code','complete','slotDate',today); end if;
  if b.attempts>=3 then
   update public.ctbc_batches set error_code='retry_budget_exhausted',next_attempt_at=null where id=b.id;
   return jsonb_build_object('code','retry_budget_exhausted','slotDate',today);
  end if;
  if b.next_attempt_at>now() then return jsonb_build_object('code','backoff','slotDate',today); end if;
 end if;
 begun:=public.ctbc_begin(p_scope,today);
 if begun->>'code'='started' then
  insert into public.ctbc_worker_attempts(scope_id,fence,batch_id,status) values(p_scope,(begun->>'fence')::bigint,(begun->>'batchId')::uuid,'running');
 end if;
 return begun||jsonb_build_object('serverNow',clock_timestamp());
end $$;
revoke all on function public.ctbc_worker_poll(uuid,uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.ctbc_worker_poll(uuid,uuid,uuid,date) to service_role;
