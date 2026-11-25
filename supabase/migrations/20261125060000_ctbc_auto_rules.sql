-- 刷卡自動歸類規則：商店名稱包含 pattern、金額不超過 max_amount 的刷卡通知，
-- 由 App 透過既有的 ctbc_act('import') 流程直接補記到指定分類。
-- 這張表只存規則本身，不改動任何既有的 ctbc_* 函式或權限。
create table public.ctbc_auto_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pattern text not null check (length(btrim(pattern)) between 2 and 60),
  category_id uuid not null references public.categories(id) on delete cascade,
  max_amount integer check (max_amount is null or max_amount > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (user_id, pattern)
);

alter table public.ctbc_auto_rules enable row level security;

-- 只能讀寫自己的規則，而且規則指向的分類也必須是自己的。
create policy ctbc_auto_rules_select_own on public.ctbc_auto_rules
  for select using (user_id = (select auth.uid()));
create policy ctbc_auto_rules_insert_own on public.ctbc_auto_rules
  for insert with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.categories c where c.id = category_id and c.user_id = (select auth.uid()))
  );
create policy ctbc_auto_rules_update_own on public.ctbc_auto_rules
  for update using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.categories c where c.id = category_id and c.user_id = (select auth.uid()))
  );
create policy ctbc_auto_rules_delete_own on public.ctbc_auto_rules
  for delete using (user_id = (select auth.uid()));

revoke all on public.ctbc_auto_rules from public, anon;
grant select, insert, update, delete on public.ctbc_auto_rules to authenticated;
grant all on public.ctbc_auto_rules to service_role;
