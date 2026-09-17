-- Enforce source identity without repairing or changing existing transaction rows.
do $$
begin
  if exists (
    select 1
    from public.transactions
    where source_id is not null
    group by user_id, source, source_id
    having count(*) > 1
  ) then
    raise exception 'duplicate transaction source identities exist; aborting constraint creation';
  end if;
end
$$;

drop index if exists public.idx_transactions_user_source_source_id;

alter table public.transactions
  add constraint transactions_user_source_source_id_key
  unique (user_id, source, source_id);