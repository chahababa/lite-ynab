-- Fix duplicate rent category helper ON CONFLICT ambiguity.
--
-- The helper returns an output column named user_id. Inside PL/pgSQL, using
-- ON CONFLICT (user_id, month_id, category_id) can be ambiguous with that
-- output variable. Target the named unique constraint instead.
-- This migration only replaces the helper function; it does not mutate user data.

create or replace function public.merge_duplicate_rent_category(
  p_user_id uuid,
  p_dry_run boolean default true
)
returns table (
  dry_run boolean,
  user_id uuid,
  target_category_id uuid,
  duplicate_category_id uuid,
  transactions_repointed bigint,
  duplicate_budget_rows_merged bigint,
  duplicate_category_deleted boolean,
  notes text[]
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  preview_row record;
  tx_count bigint := 0;
  budget_count bigint := 0;
begin
  select * into preview_row
  from public.preview_duplicate_rent_category_merge(p_user_id);

  if preview_row.user_id is null then
    raise exception 'Unable to load duplicate rent category preview for user %', p_user_id;
  end if;

  if not preview_row.can_merge then
    return query
    select
      p_dry_run,
      p_user_id,
      preview_row.target_category_id,
      preview_row.duplicate_category_id,
      0::bigint,
      0::bigint,
      false,
      preview_row.notes;
    return;
  end if;

  tx_count := preview_row.duplicate_transaction_count;
  budget_count := preview_row.duplicate_budget_count;

  if p_dry_run then
    return query
    select
      true,
      p_user_id,
      preview_row.target_category_id,
      preview_row.duplicate_category_id,
      tx_count,
      budget_count,
      false,
      preview_row.notes || array['dry run: no rows changed']::text[];
    return;
  end if;

  -- Merge duplicate budgets into the target category, summing allocations when
  -- both categories already have a budget for the same user/month.
  insert into public.budgets (user_id, month_id, category_id, allocated)
  select b.user_id, b.month_id, preview_row.target_category_id, b.allocated
  from public.budgets b
  where b.user_id = p_user_id
    and b.category_id = preview_row.duplicate_category_id
  on conflict on constraint budgets_user_id_month_id_category_id_key
  do update set
    allocated = public.budgets.allocated + excluded.allocated,
    updated_at = timezone('utc', now());

  delete from public.budgets b
  where b.user_id = p_user_id
    and b.category_id = preview_row.duplicate_category_id;

  update public.transactions t
  set category_id = preview_row.target_category_id,
      updated_at = timezone('utc', now())
  where t.user_id = p_user_id
    and t.category_id = preview_row.duplicate_category_id;

  delete from public.categories c
  where c.user_id = p_user_id
    and c.id = preview_row.duplicate_category_id;

  return query
  select
    false,
    p_user_id,
    preview_row.target_category_id,
    preview_row.duplicate_category_id,
    tx_count,
    budget_count,
    true,
    preview_row.notes || array['merged: budgets and transactions now point to 家庭 / 房租; duplicate 其他 / 房租 deleted']::text[];
end;
$$;

revoke all on function public.merge_duplicate_rent_category(uuid, boolean) from public, anon, authenticated;
