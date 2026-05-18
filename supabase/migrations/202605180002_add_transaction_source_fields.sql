-- LiteYNAB: transaction source metadata for Hermes / imports

alter table public.transactions
  add column if not exists source text,
  add column if not exists source_text text,
  add column if not exists source_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.transactions
set source = 'legacy'
where source is null;

alter table public.transactions
  alter column source set default 'manual',
  alter column source set not null;

alter table public.transactions
  drop constraint if exists transactions_source_check;

alter table public.transactions
  add constraint transactions_source_check
  check (source in ('legacy', 'manual', 'ynab_import', 'hermes'));

create index if not exists idx_transactions_user_source
  on public.transactions(user_id, source);

create index if not exists idx_transactions_user_source_source_id
  on public.transactions(user_id, source, source_id)
  where source_id is not null;
