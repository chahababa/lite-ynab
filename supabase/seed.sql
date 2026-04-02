do $$
declare
  target_user uuid;
begin
  select id
  into target_user
  from auth.users
  order by created_at asc
  limit 1;

  if target_user is null then
    raise notice 'No auth user found. Create a user first, then rerun seed.sql.';
    return;
  end if;

  insert into public.categories (user_id, name, is_auto, auto_amount, is_quick, sort_order)
  values
    (target_user, '個人飲食', true, 6000, true, 10),
    (target_user, '家庭飲食', true, 4000, true, 20),
    (target_user, '交通', true, 2000, true, 30),
    (target_user, '日用品', false, 0, true, 40),
    (target_user, '娛樂', false, 0, true, 50),
    (target_user, '醫療', false, 0, false, 60),
    (target_user, '房租', true, 12000, false, 70),
    (target_user, '水電瓦斯', false, 0, false, 80),
    (target_user, '人情雜支', false, 0, false, 90),
    (target_user, '旅遊基金', false, 0, false, 100)
  on conflict (user_id, name) do nothing;

  insert into public.monthly_incomes (user_id, month_id, amount)
  values (target_user, to_char(timezone('Asia/Taipei', now()), 'YYYY-MM'), 52000)
  on conflict (user_id, month_id) do nothing;

  insert into public.budgets (user_id, month_id, category_id, allocated)
  select
    target_user,
    to_char(timezone('Asia/Taipei', now()), 'YYYY-MM'),
    c.id,
    case when c.is_auto then c.auto_amount else 0 end
  from public.categories c
  where c.user_id = target_user
  on conflict (user_id, month_id, category_id) do nothing;
end $$;
