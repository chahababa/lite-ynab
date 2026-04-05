create table if not exists public.category_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, name)
);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, name)
);

alter table public.categories
add column if not exists category_group_id uuid references public.category_groups(id) on delete cascade;

alter table public.transactions
add column if not exists payment_method_id uuid references public.payment_methods(id) on delete restrict;

insert into public.category_groups (user_id, name, sort_order)
select distinct source.user_id, source.name, source.sort_order
from (
  select c.user_id, '個人'::text as name, 10 as sort_order
  from public.categories c
  union
  select c.user_id, '家庭'::text as name, 20 as sort_order
  from public.categories c
  union
  select c.user_id, '其他'::text as name, 30 as sort_order
  from public.categories c
) as source
on conflict (user_id, name) do nothing;

update public.categories c
set category_group_id = cg.id
from public.category_groups cg
where cg.user_id = c.user_id
  and (
    (
      cg.name = '個人'
      and c.name in ('飲食', 'Food', '咖啡', 'Coffee', '健康', 'Health', '娛樂', 'Fun Money')
    )
    or (
      cg.name = '家庭'
      and c.name in ('房租', 'Rent', '日常用品', 'Daily Needs')
    )
    or (
      cg.name = '其他'
      and c.category_group_id is null
    )
  );

update public.categories c
set category_group_id = cg.id
from public.category_groups cg
where cg.user_id = c.user_id
  and cg.name = '其他'
  and c.category_group_id is null;

alter table public.categories
drop constraint if exists categories_user_id_name_key;

alter table public.categories
alter column category_group_id set not null;

alter table public.categories
add constraint categories_user_id_group_name_key
unique (user_id, category_group_id, name);

insert into public.payment_methods (user_id, name, sort_order)
select distinct source.user_id, source.name, source.sort_order
from (
  select c.user_id, '現金'::text as name, 10 as sort_order
  from public.categories c
  union
  select c.user_id, '信用卡 A'::text as name, 20 as sort_order
  from public.categories c
  union
  select c.user_id, '信用卡 B'::text as name, 30 as sort_order
  from public.categories c
) as source
on conflict (user_id, name) do nothing;

update public.transactions t
set payment_method_id = pm.id
from public.payment_methods pm
where pm.user_id = t.user_id
  and pm.name = '現金'
  and t.payment_method_id is null;

alter table public.transactions
alter column payment_method_id set not null;

create index if not exists idx_category_groups_user_id on public.category_groups(user_id);
create index if not exists idx_payment_methods_user_id on public.payment_methods(user_id);
create index if not exists idx_categories_group_id on public.categories(category_group_id);
create index if not exists idx_transactions_payment_method on public.transactions(payment_method_id);

drop trigger if exists set_category_groups_updated_at on public.category_groups;
create trigger set_category_groups_updated_at
before update on public.category_groups
for each row execute function public.set_updated_at();

drop trigger if exists set_payment_methods_updated_at on public.payment_methods;
create trigger set_payment_methods_updated_at
before update on public.payment_methods
for each row execute function public.set_updated_at();

alter table public.category_groups enable row level security;
alter table public.payment_methods enable row level security;

drop policy if exists "category_groups_select_own" on public.category_groups;
create policy "category_groups_select_own"
on public.category_groups for select
using (auth.uid() = user_id);

drop policy if exists "category_groups_insert_own" on public.category_groups;
create policy "category_groups_insert_own"
on public.category_groups for insert
with check (auth.uid() = user_id);

drop policy if exists "category_groups_update_own" on public.category_groups;
create policy "category_groups_update_own"
on public.category_groups for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "category_groups_delete_own" on public.category_groups;
create policy "category_groups_delete_own"
on public.category_groups for delete
using (auth.uid() = user_id);

drop policy if exists "payment_methods_select_own" on public.payment_methods;
create policy "payment_methods_select_own"
on public.payment_methods for select
using (auth.uid() = user_id);

drop policy if exists "payment_methods_insert_own" on public.payment_methods;
create policy "payment_methods_insert_own"
on public.payment_methods for insert
with check (auth.uid() = user_id);

drop policy if exists "payment_methods_update_own" on public.payment_methods;
create policy "payment_methods_update_own"
on public.payment_methods for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "payment_methods_delete_own" on public.payment_methods;
create policy "payment_methods_delete_own"
on public.payment_methods for delete
using (auth.uid() = user_id);

create or replace function public.bootstrap_default_category_groups()
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

  insert into public.category_groups (user_id, name, sort_order)
  values
    (current_user_id, '個人', 10),
    (current_user_id, '家庭', 20),
    (current_user_id, '其他', 30)
  on conflict (user_id, name) do nothing;
end;
$$;

grant execute on function public.bootstrap_default_category_groups() to authenticated;

create or replace function public.bootstrap_default_payment_methods()
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

  insert into public.payment_methods (user_id, name, sort_order)
  values
    (current_user_id, '現金', 10),
    (current_user_id, '信用卡 A', 20),
    (current_user_id, '信用卡 B', 30)
  on conflict (user_id, name) do nothing;
end;
$$;

grant execute on function public.bootstrap_default_payment_methods() to authenticated;

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
begin
  if current_user_id is null then
    raise exception '尚未登入';
  end if;

  perform public.bootstrap_default_category_groups();

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

  perform public.bootstrap_default_category_groups();
  perform public.bootstrap_default_categories();
  perform public.bootstrap_default_payment_methods();

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
