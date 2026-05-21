-- Fix duplicate rent preview helper text[] concatenation for post-merge/no-op states.
--
-- 202605210001 appended bare text values to text[] in preview notes. That can
-- fail after cleanup when the duplicate category no longer exists. This
-- migration only replaces the preview helper; it does not mutate user data.

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
    note_list := note_list || array['missing 家庭 category group']::text[];
  end if;
  if other_group_id is null then
    note_list := note_list || array['missing 其他 category group']::text[];
  end if;
  if target_id is null then
    note_list := note_list || array['missing target 家庭 / 房租 category']::text[];
  end if;
  if duplicate_id is null then
    note_list := note_list || array['missing duplicate 其他 / 房租 category; merge is already complete or not needed']::text[];
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

revoke all on function public.preview_duplicate_rent_category_merge(uuid) from public, anon, authenticated;
