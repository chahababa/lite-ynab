-- 跨使用者引用防護 + security advisors 修正
--
-- 背景:2026-06-04 一筆 Hermes 交易修正把 Matt 的交易 (看眼科 740) 的 category_id
-- 指到 QA 帳號的「健康」分類。FK 不驗證 category/payment_method 與交易是否同一個
-- 使用者,而 service_role 寫入時 RLS 完全不生效,所以 RLS policy 也擋不住。
-- 改在資料庫層用 trigger 強制:任何角色(含 service_role)寫入 transactions/budgets
-- 時,引用的 category / payment_method 必須屬於同一個 user_id。

-- 1) transactions:category_id 與 payment_method_id 必須屬於 new.user_id
create or replace function public.enforce_transaction_reference_ownership()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  reference_owner uuid;
begin
  select user_id into reference_owner
  from public.categories
  where id = new.category_id;

  if reference_owner is null or reference_owner <> new.user_id then
    raise exception '分類不屬於這個使用者,無法寫入交易 (category_id=%)', new.category_id
      using errcode = '23503';
  end if;

  select user_id into reference_owner
  from public.payment_methods
  where id = new.payment_method_id;

  if reference_owner is null or reference_owner <> new.user_id then
    raise exception '支付方式不屬於這個使用者,無法寫入交易 (payment_method_id=%)', new.payment_method_id
      using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_transaction_reference_ownership() from public, anon, authenticated;

drop trigger if exists transactions_enforce_reference_ownership on public.transactions;
create trigger transactions_enforce_reference_ownership
  before insert or update of user_id, category_id, payment_method_id
  on public.transactions
  for each row
  execute function public.enforce_transaction_reference_ownership();

-- 2) budgets:category_id 必須屬於 new.user_id
create or replace function public.enforce_budget_reference_ownership()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  reference_owner uuid;
begin
  select user_id into reference_owner
  from public.categories
  where id = new.category_id;

  if reference_owner is null or reference_owner <> new.user_id then
    raise exception '分類不屬於這個使用者,無法寫入預算 (category_id=%)', new.category_id
      using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_budget_reference_ownership() from public, anon, authenticated;

drop trigger if exists budgets_enforce_reference_ownership on public.budgets;
create trigger budgets_enforce_reference_ownership
  before insert or update of user_id, category_id
  on public.budgets
  for each row
  execute function public.enforce_budget_reference_ownership();

-- 3) advisor: function_search_path_mutable — set_updated_at 固定 search_path
alter function public.set_updated_at() set search_path to 'public';

-- 4) advisor: anon 不應能呼叫 SECURITY DEFINER 函式
--    (這些函式會檢查 auth.uid(),anon 呼叫只會噴錯,但照 advisor 建議收掉。
--    預設 EXECUTE 授權給 PUBLIC,必須連 PUBLIC 一起 revoke;authenticated 與
--    service_role 本來就有明確授權,不受影響。)
revoke execute on function public.bootstrap_default_category_groups() from public, anon;
revoke execute on function public.bootstrap_default_categories() from public, anon;
revoke execute on function public.bootstrap_default_payment_methods() from public, anon;
revoke execute on function public.initialize_monthly_budget(text) from public, anon;
