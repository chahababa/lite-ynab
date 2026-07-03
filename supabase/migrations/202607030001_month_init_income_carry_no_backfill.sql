-- 讓每月初始化更貼近實際使用：
-- 1. 固定預算（is_auto）只套用在「當月與未來月份」，過去月份一律填 0，
--    避免補建歷史月份（例如 YNAB 匯入）時被自動預算灌水。
-- 2. 新月份的收入自動帶入最近一個有填金額的月份收入，
--    使用者不用每月手動重填；補建過去月份時收入維持 0。
-- （已於 2026-07-03 直接套用至正式 Supabase，版本 20260703112413）

create or replace function public.initialize_monthly_budget(p_month_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_month_id text := to_char(timezone('Asia/Taipei', now()), 'YYYY-MM');
  carried_income integer := 0;
begin
  if current_user_id is null then
    raise exception '尚未登入';
  end if;

  if p_month_id !~ '^\d{4}-\d{2}$' then
    raise exception 'month_id 格式錯誤';
  end if;

  perform public.bootstrap_default_category_groups();
  perform public.bootstrap_default_categories();
  perform public.bootstrap_default_payment_methods();

  if p_month_id >= current_month_id then
    select amount
    into carried_income
    from public.monthly_incomes
    where user_id = current_user_id
      and month_id < p_month_id
      and amount > 0
    order by month_id desc
    limit 1;

    carried_income := coalesce(carried_income, 0);
  end if;

  insert into public.monthly_incomes (user_id, month_id, amount)
  values (current_user_id, p_month_id, carried_income)
  on conflict (user_id, month_id) do nothing;

  insert into public.budgets (user_id, month_id, category_id, allocated)
  select
    current_user_id,
    p_month_id,
    c.id,
    case
      when c.is_auto and p_month_id >= current_month_id then c.auto_amount
      else 0
    end
  from public.categories c
  where c.user_id = current_user_id
  on conflict (user_id, month_id, category_id) do nothing;
end;
$$;

grant execute on function public.initialize_monthly_budget(text) to authenticated;
