create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  is_auto boolean not null default false,
  auto_amount integer not null default 0 check (auto_amount >= 0),
  is_quick boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, name)
);

create table if not exists public.monthly_incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month_id text not null check (month_id ~ '^\d{4}-\d{2}$'),
  amount integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, month_id)
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month_id text not null check (month_id ~ '^\d{4}-\d{2}$'),
  category_id uuid not null references public.categories(id) on delete cascade,
  allocated integer not null default 0 check (allocated >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, month_id, category_id)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  amount integer not null check (amount > 0),
  category_id uuid not null references public.categories(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_categories_user_id on public.categories(user_id);
create index if not exists idx_monthly_incomes_user_month on public.monthly_incomes(user_id, month_id);
create index if not exists idx_budgets_user_month on public.budgets(user_id, month_id);
create index if not exists idx_transactions_user_date on public.transactions(user_id, date desc);
create index if not exists idx_transactions_category on public.transactions(category_id);

drop trigger if exists set_categories_updated_at on public.categories;
create trigger set_categories_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

drop trigger if exists set_monthly_incomes_updated_at on public.monthly_incomes;
create trigger set_monthly_incomes_updated_at
before update on public.monthly_incomes
for each row execute function public.set_updated_at();

drop trigger if exists set_budgets_updated_at on public.budgets;
create trigger set_budgets_updated_at
before update on public.budgets
for each row execute function public.set_updated_at();

drop trigger if exists set_transactions_updated_at on public.transactions;
create trigger set_transactions_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.monthly_incomes enable row level security;
alter table public.budgets enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "categories_select_own" on public.categories;
create policy "categories_select_own"
on public.categories for select
using (auth.uid() = user_id);

drop policy if exists "categories_insert_own" on public.categories;
create policy "categories_insert_own"
on public.categories for insert
with check (auth.uid() = user_id);

drop policy if exists "categories_update_own" on public.categories;
create policy "categories_update_own"
on public.categories for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "categories_delete_own" on public.categories;
create policy "categories_delete_own"
on public.categories for delete
using (auth.uid() = user_id);

drop policy if exists "monthly_incomes_select_own" on public.monthly_incomes;
create policy "monthly_incomes_select_own"
on public.monthly_incomes for select
using (auth.uid() = user_id);

drop policy if exists "monthly_incomes_insert_own" on public.monthly_incomes;
create policy "monthly_incomes_insert_own"
on public.monthly_incomes for insert
with check (auth.uid() = user_id);

drop policy if exists "monthly_incomes_update_own" on public.monthly_incomes;
create policy "monthly_incomes_update_own"
on public.monthly_incomes for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "monthly_incomes_delete_own" on public.monthly_incomes;
create policy "monthly_incomes_delete_own"
on public.monthly_incomes for delete
using (auth.uid() = user_id);

drop policy if exists "budgets_select_own" on public.budgets;
create policy "budgets_select_own"
on public.budgets for select
using (auth.uid() = user_id);

drop policy if exists "budgets_insert_own" on public.budgets;
create policy "budgets_insert_own"
on public.budgets for insert
with check (auth.uid() = user_id);

drop policy if exists "budgets_update_own" on public.budgets;
create policy "budgets_update_own"
on public.budgets for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "budgets_delete_own" on public.budgets;
create policy "budgets_delete_own"
on public.budgets for delete
using (auth.uid() = user_id);

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own"
on public.transactions for select
using (auth.uid() = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own"
on public.transactions for insert
with check (auth.uid() = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own"
on public.transactions for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own"
on public.transactions for delete
using (auth.uid() = user_id);

create or replace function public.bootstrap_default_categories()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user uuid := auth.uid();
begin
  if current_user is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.categories (user_id, name, is_auto, auto_amount, is_quick, sort_order)
  values
    (current_user, '個人飲食', true, 6000, true, 10),
    (current_user, '家庭飲食', true, 4000, true, 20),
    (current_user, '交通', true, 2000, true, 30),
    (current_user, '日用品', false, 0, true, 40),
    (current_user, '娛樂', false, 0, true, 50),
    (current_user, '醫療', false, 0, false, 60),
    (current_user, '房租', true, 12000, false, 70),
    (current_user, '水電瓦斯', false, 0, false, 80),
    (current_user, '人情雜支', false, 0, false, 90),
    (current_user, '旅遊基金', false, 0, false, 100)
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
  current_user uuid := auth.uid();
begin
  if current_user is null then
    raise exception 'Not authenticated';
  end if;

  if p_month_id !~ '^\d{4}-\d{2}$' then
    raise exception 'Invalid month_id';
  end if;

  perform public.bootstrap_default_categories();

  insert into public.monthly_incomes (user_id, month_id, amount)
  values (current_user, p_month_id, 0)
  on conflict (user_id, month_id) do nothing;

  insert into public.budgets (user_id, month_id, category_id, allocated)
  select
    current_user,
    p_month_id,
    c.id,
    case when c.is_auto then c.auto_amount else 0 end
  from public.categories c
  where c.user_id = current_user
  on conflict (user_id, month_id, category_id) do nothing;
end;
$$;

grant execute on function public.initialize_monthly_budget(text) to authenticated;
