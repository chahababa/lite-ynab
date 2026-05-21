-- Lite YNAB duplicate rent category safety helpers
--
-- Purpose:
--   Provide an explicit, idempotent preflight + optional merge path for the known
--   duplicate category issue where a user's "其他 / 房租" category should be merged
--   into "家庭 / 房租".
--
-- Safety model:
--   - This migration only creates helper RPC functions; it does NOT mutate data.
--   - Execute is revoked from public/anon/authenticated by default.
--   - The mutating helper requires an explicit p_user_id and defaults to dry-run.
--   - Production execution still requires Matt's explicit targeted approval.
--
-- Recommended preflight:
--   select * from public.preview_duplicate_rent_category_merge('<USER_UUID>'::uuid);
--   select * from public.merge_duplicate_rent_category('<USER_UUID>'::uuid, true);
--
-- Approved execution only after reviewing the preflight result:
--   select * from public.merge_duplicate_rent_category('<USER_UUID>'::uuid, false);
--
-- Rollback notes:
--   Before running with p_dry_run = false, export the rows returned by the
--   diagnostic plus affected budgets/transactions/categories for p_user_id.
--   A rollback is manual: recreate the deleted duplicate "其他 / 房租" category
--   with its exported id/group metadata, move exported transaction ids back to it,
--   and restore exported per-month budget allocations. Because the merge adds
--   duplicate budget allocations into the target row, exact rollback requires the
--   pre-run budget export.

create or replace function public.preview_duplicate_rent_category_merge(p_user_id uuid)
returns table (
  user_id uuid,
  target_category_id uuid,
  duplicate_category_id uuid,
  duplicate_transaction_count bigint,
  duplicate_transaction_amount bigint,
  duplicate_budget_count bigint,
  duplicate_budget_allocated bigint,
  overlapping_budget_month_count bigint,
  can_merge boolean,
  notes text[]
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  home_group_id uuid;
  other_group_id uuid;
  target_id uuid;
  duplicate_id uuid;
  note_list text[] := array[]::text[];
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  select id into home_group_id
  from public.category_groups
  where category_groups.user_id = p_user_id
    and category_groups.name = '家庭';

  select id into other_group_id
  from public.category_groups
  where category_groups.user_id = p_user_id
    and category_groups.name = '其他';

  select id into target_id
  from public.categories
  where categories.user_id = p_user_id
    and categories.category_group_id = home_group_id
    and categories.name = '房租';

  select id into duplicate_id
  from public.categories
  where categories.user_id = p_user_id
    and categories.category_group_id = other_group_id
    and categories.name = '房租';

  if home_group_id is null then
    note_list := note_list || 'missing 家庭 category group';
  end if;
  if other_group_id is null then
    note_list := note_list || 'missing 其他 category group';
  end if;
  if target_id is null then
    note_list := note_list || 'missing target 家庭 / 房租 category';
  end if;
  if duplicate_id is null then
    note_list := note_list || 'missing duplicate 其他 / 房租 category; merge is already complete or not needed';
  end if;

  return query
  select
    p_user_id,
    target_id,
    duplicate_id,
    (select count(*) from public.transactions t where t.user_id = p_user_id and t.category_id = duplicate_id),
    coalesce((select sum(t.amount)::bigint from public.transactions t where t.user_id = p_user_id and t.category_id = duplicate_id), 0),
    (select count(*) from public.budgets b where b.user_id = p_user_id and b.category_id = duplicate_id),
    coalesce((select sum(b.allocated)::bigint from public.budgets b where b.user_id = p_user_id and b.category_id = duplicate_id), 0),
    (select count(*)
     from public.budgets source_budget
     join public.budgets target_budget
       on target_budget.user_id = source_budget.user_id
      and target_budget.month_id = source_budget.month_id
      and target_budget.category_id = target_id
     where source_budget.user_id = p_user_id
       and source_budget.category_id = duplicate_id),
    target_id is not null and duplicate_id is not null,
    case
      when array_length(note_list, 1) is null then array['ready: dry-run only unless p_dry_run=false']::text[]
      else note_list
    end;
end;
$$;

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
      preview_row.notes || 'dry run: no rows changed';
    return;
  end if;

  -- Merge duplicate budgets into the target category, summing allocations when
  -- both categories already have a budget for the same user/month.
  insert into public.budgets (user_id, month_id, category_id, allocated)
  select b.user_id, b.month_id, preview_row.target_category_id, b.allocated
  from public.budgets b
  where b.user_id = p_user_id
    and b.category_id = preview_row.duplicate_category_id
  on conflict (user_id, month_id, category_id)
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
    preview_row.notes || 'merged: budgets and transactions now point to 家庭 / 房租; duplicate 其他 / 房租 deleted';
end;
$$;

revoke all on function public.preview_duplicate_rent_category_merge(uuid) from public, anon, authenticated;
revoke all on function public.merge_duplicate_rent_category(uuid, boolean) from public, anon, authenticated;
