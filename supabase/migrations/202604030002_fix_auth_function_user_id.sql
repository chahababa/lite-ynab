create or replace function public.bootstrap_default_categories()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception '尚未登入';
  end if;

  insert into public.categories (user_id, name, is_auto, auto_amount, is_quick, sort_order)
  values
    (current_user_id, '飲食', true, 6000, true, 10),
    (current_user_id, '交通', true, 4000, true, 20),
    (current_user_id, '咖啡', true, 2000, true, 30),
    (current_user_id, '日常用品', false, 0, true, 40),
    (current_user_id, '娛樂', false, 0, true, 50),
    (current_user_id, '健康', false, 0, false, 60),
    (current_user_id, '房租', true, 12000, false, 70),
    (current_user_id, '旅行', false, 0, false, 80),
    (current_user_id, '訂閱', false, 0, false, 90),
    (current_user_id, '緊急預備金', false, 0, false, 100)
  on conflict (user_id, name) do nothing;
end;
$$;

grant execute on function public.bootstrap_default_categories() to authenticated;

create or replace function public.initialize_monthly_budget(p_month_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception '尚未登入';
  end if;

  if p_month_id !~ '^\d{4}-\d{2}$' then
    raise exception 'month_id 格式錯誤';
  end if;

  perform public.bootstrap_default_categories();

  insert into public.monthly_incomes (user_id, month_id, amount)
  values (current_user_id, p_month_id, 0)
  on conflict (user_id, month_id) do nothing;

  insert into public.budgets (user_id, month_id, category_id, allocated)
  select
    current_user_id,
    p_month_id,
    c.id,
    case when c.is_auto then c.auto_amount else 0 end
  from public.categories c
  where c.user_id = current_user_id
  on conflict (user_id, month_id, category_id) do nothing;
end;
$$;

grant execute on function public.initialize_monthly_budget(text) to authenticated;
