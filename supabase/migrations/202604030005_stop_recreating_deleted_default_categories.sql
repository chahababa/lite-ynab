create or replace function public.bootstrap_default_categories()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  personal_group_id uuid;
  home_group_id uuid;
  other_group_id uuid;
  existing_category_count integer;
begin
  if current_user_id is null then
    raise exception '尚未登入';
  end if;

  perform public.bootstrap_default_category_groups();

  select count(*)
  into existing_category_count
  from public.categories
  where user_id = current_user_id;

  if existing_category_count > 0 then
    return;
  end if;

  select id into personal_group_id
  from public.category_groups
  where user_id = current_user_id and name = '個人';

  select id into home_group_id
  from public.category_groups
  where user_id = current_user_id and name = '家庭';

  select id into other_group_id
  from public.category_groups
  where user_id = current_user_id and name = '其他';

  insert into public.categories (
    user_id,
    category_group_id,
    name,
    is_auto,
    auto_amount,
    is_quick,
    sort_order
  )
  values
    (current_user_id, personal_group_id, '飲食', true, 6000, true, 10),
    (current_user_id, other_group_id, '交通', true, 4000, true, 20),
    (current_user_id, personal_group_id, '咖啡', true, 2000, true, 30),
    (current_user_id, home_group_id, '日常用品', false, 0, true, 40),
    (current_user_id, personal_group_id, '娛樂', false, 0, true, 50),
    (current_user_id, personal_group_id, '健康', false, 0, false, 60),
    (current_user_id, home_group_id, '房租', true, 12000, false, 70),
    (current_user_id, other_group_id, '旅行', false, 0, false, 80),
    (current_user_id, other_group_id, '訂閱', false, 0, false, 90),
    (current_user_id, other_group_id, '緊急預備金', false, 0, false, 100)
  on conflict (user_id, category_group_id, name) do nothing;
end;
$$;

grant execute on function public.bootstrap_default_categories() to authenticated;
