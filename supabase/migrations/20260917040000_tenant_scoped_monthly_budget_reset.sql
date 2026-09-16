-- Replace the globally scoped reset RPC with an explicit trusted tenant argument.
-- Repository-only S4A: do not apply this migration to any remote database from this change.
create or replace function public.reset_monthly_auto_budgets(
  p_user_id uuid,
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
  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22004';
  end if;

  if p_month_id is null or p_month_id !~ '^\d{4}-\d{2}$' then
    raise exception 'month_id must use YYYY-MM format' using errcode = '22023';
  end if;

  perform set_config('app.suppress_budget_adjustment_tracking', 'on', true);

  with auto_categories as (
    select c.user_id, c.id as category_id, c.auto_amount
    from public.categories c
    where c.user_id = p_user_id
      and c.is_auto = true
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
    where c.user_id = p_user_id
      and c.is_auto = true
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
    'userId', p_user_id,
    'monthId', p_month_id,
    'changedBudgets', changed_count,
    'trackedAutoCategories', tracked_count
  );
end;
$$;

revoke all on function public.reset_monthly_auto_budgets(uuid, text) from public, anon, authenticated;
grant execute on function public.reset_monthly_auto_budgets(uuid, text) to service_role;
drop function public.reset_monthly_auto_budgets(text);
