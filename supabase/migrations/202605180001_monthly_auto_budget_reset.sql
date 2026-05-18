-- LiteYNAB v3.0: monthly fixed-budget reset + manual adjustment learning signals

create table if not exists public.budget_auto_adjustment_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_id text not null check (month_id ~ '^\d{4}-\d{2}$'),
  category_id uuid not null references public.categories(id) on delete cascade,
  fixed_amount integer not null default 0 check (fixed_amount >= 0),
  latest_allocated integer not null default 0 check (latest_allocated >= 0),
  manual_adjustment_count integer not null default 0 check (manual_adjustment_count >= 0),
  first_adjusted_at timestamptz,
  last_adjusted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, month_id, category_id)
);

create index if not exists idx_budget_auto_adjustment_stats_user_month
  on public.budget_auto_adjustment_stats(user_id, month_id);

alter table public.budget_auto_adjustment_stats enable row level security;

drop policy if exists "budget_auto_adjustment_stats_select_own" on public.budget_auto_adjustment_stats;
create policy "budget_auto_adjustment_stats_select_own"
  on public.budget_auto_adjustment_stats
  for select
  using (auth.uid() = user_id);

create or replace function public.record_budget_auto_manual_adjustment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  category_is_auto boolean;
  category_auto_amount integer;
begin
  if tg_op <> 'UPDATE' or new.allocated is not distinct from old.allocated then
    return new;
  end if;

  if coalesce(current_setting('app.suppress_budget_adjustment_tracking', true), '') = 'on' then
    return new;
  end if;

  select c.is_auto, c.auto_amount
    into category_is_auto, category_auto_amount
  from public.categories c
  where c.id = new.category_id;

  if category_is_auto and category_auto_amount > 0 and new.allocated is distinct from category_auto_amount then
    insert into public.budget_auto_adjustment_stats (
      user_id,
      month_id,
      category_id,
      fixed_amount,
      latest_allocated,
      manual_adjustment_count,
      first_adjusted_at,
      last_adjusted_at
    )
    values (
      new.user_id,
      new.month_id,
      new.category_id,
      category_auto_amount,
      new.allocated,
      1,
      timezone('utc', now()),
      timezone('utc', now())
    )
    on conflict (user_id, month_id, category_id) do update
      set fixed_amount = excluded.fixed_amount,
          latest_allocated = excluded.latest_allocated,
          manual_adjustment_count = public.budget_auto_adjustment_stats.manual_adjustment_count + 1,
          first_adjusted_at = coalesce(public.budget_auto_adjustment_stats.first_adjusted_at, excluded.first_adjusted_at),
          last_adjusted_at = excluded.last_adjusted_at,
          updated_at = timezone('utc', now());
  end if;

  return new;
end;
$$;

drop trigger if exists record_budget_auto_manual_adjustment on public.budgets;
create trigger record_budget_auto_manual_adjustment
after update of allocated on public.budgets
for each row execute function public.record_budget_auto_manual_adjustment();

create or replace function public.reset_monthly_auto_budgets(
  p_month_id text default to_char((now() at time zone 'Asia/Taipei'), 'YYYY-MM')
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_count integer := 0;
  tracked_count integer := 0;
begin
  if p_month_id !~ '^\d{4}-\d{2}$' then
    raise exception 'month_id must use YYYY-MM format';
  end if;

  perform set_config('app.suppress_budget_adjustment_tracking', 'on', true);

  with auto_categories as (
    select c.user_id, c.id as category_id, c.auto_amount
    from public.categories c
    where c.is_auto = true
      and c.auto_amount > 0
  ), upserted as (
    insert into public.budgets (user_id, month_id, category_id, allocated)
    select user_id, p_month_id, category_id, auto_amount
    from auto_categories
    on conflict (user_id, month_id, category_id) do update
      set allocated = excluded.allocated
      where public.budgets.allocated is distinct from excluded.allocated
    returning 1
  )
  select count(*) into changed_count from upserted;

  with auto_categories as (
    select c.user_id, c.id as category_id, c.auto_amount
    from public.categories c
    where c.is_auto = true
      and c.auto_amount > 0
  ), tracked as (
    insert into public.budget_auto_adjustment_stats (
      user_id,
      month_id,
      category_id,
      fixed_amount,
      latest_allocated,
      manual_adjustment_count
    )
    select user_id, p_month_id, category_id, auto_amount, auto_amount, 0
    from auto_categories
    on conflict (user_id, month_id, category_id) do update
      set fixed_amount = excluded.fixed_amount,
          latest_allocated = excluded.latest_allocated,
          updated_at = timezone('utc', now())
    returning 1
  )
  select count(*) into tracked_count from tracked;

  return jsonb_build_object(
    'monthId', p_month_id,
    'changedBudgets', changed_count,
    'trackedAutoCategories', tracked_count
  );
end;
$$;

grant execute on function public.reset_monthly_auto_budgets(text) to service_role;
