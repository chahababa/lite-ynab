begin;
select plan(17);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reset-owner-a@example.test', crypt('not-a-real-password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reset-owner-b@example.test', crypt('not-a-real-password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.category_groups (id, user_id, name, sort_order)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', 'S4A owner A', 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '22222222-2222-2222-2222-222222222222', 'S4A owner B', 1);

insert into public.categories (id, user_id, category_group_id, name, is_auto, auto_amount, is_quick, sort_order)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'S4A auto A', true, 100, false, 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'S4A auto B', true, 200, false, 1);

insert into public.budgets (user_id, month_id, category_id, allocated)
values
  ('11111111-1111-1111-1111-111111111111', '2099-01', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 1),
  ('22222222-2222-2222-2222-222222222222', '2099-01', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 7);

insert into public.budget_auto_adjustment_stats (
  user_id, month_id, category_id, fixed_amount, latest_allocated, manual_adjustment_count
)
values
  ('11111111-1111-1111-1111-111111111111', '2099-01', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 1, 1, 3),
  ('22222222-2222-2222-2222-222222222222', '2099-01', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 7, 7, 4);

create temp table owner_b_before as
select jsonb_build_object(
  'budget_count', (select count(*) from public.budgets where user_id = '22222222-2222-2222-2222-222222222222'),
  'budgets', coalesce((select jsonb_agg(to_jsonb(b) order by b.id) from public.budgets b where user_id = '22222222-2222-2222-2222-222222222222'), '[]'::jsonb),
  'stats_count', (select count(*) from public.budget_auto_adjustment_stats where user_id = '22222222-2222-2222-2222-222222222222'),
  'stats', coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.budget_auto_adjustment_stats s where user_id = '22222222-2222-2222-2222-222222222222'), '[]'::jsonb)
) as snapshot;

-- The red baseline run proves the old signature exists; after S4A it must be absent.
select hasnt_function('public', 'reset_monthly_auto_budgets', array['text']::name[], 'unsafe text-only signature is absent');
select has_function('public', 'reset_monthly_auto_budgets', array['uuid', 'text']::name[], 'uuid/text signature replaces the unsafe text signature');

select lives_ok(
  $$select public.reset_monthly_auto_budgets('11111111-1111-1111-1111-111111111111'::uuid, '2099-01')$$,
  'owner A reset succeeds with an explicit tenant'
);
select is(
  (select public.reset_monthly_auto_budgets('11111111-1111-1111-1111-111111111111'::uuid, '2099-01')->>'userId'),
  '11111111-1111-1111-1111-111111111111',
  'reset response returns the requested userId'
);
select is(
  (select allocated from public.budgets where user_id = '11111111-1111-1111-1111-111111111111' and month_id = '2099-01'),
  100,
  'owner A budget is reset'
);
select is(
  (select latest_allocated from public.budget_auto_adjustment_stats where user_id = '11111111-1111-1111-1111-111111111111' and month_id = '2099-01'),
  100,
  'owner A adjustment stats are reset'
);
select is(
  (select jsonb_build_object(
    'budget_count', (select count(*) from public.budgets where user_id = '22222222-2222-2222-2222-222222222222'),
    'budgets', coalesce((select jsonb_agg(to_jsonb(b) order by b.id) from public.budgets b where user_id = '22222222-2222-2222-2222-222222222222'), '[]'::jsonb),
    'stats_count', (select count(*) from public.budget_auto_adjustment_stats where user_id = '22222222-2222-2222-2222-222222222222'),
    'stats', coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.budget_auto_adjustment_stats s where user_id = '22222222-2222-2222-2222-222222222222'), '[]'::jsonb)
  )),
  (select snapshot from owner_b_before),
  'owner B rows and counts remain byte-for-byte unchanged'
);

create temp table owner_a_before_invalid as
select jsonb_build_object(
  'budgets', coalesce((select jsonb_agg(to_jsonb(b) order by b.id) from public.budgets b where user_id = '11111111-1111-1111-1111-111111111111'), '[]'::jsonb),
  'stats', coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.budget_auto_adjustment_stats s where user_id = '11111111-1111-1111-1111-111111111111'), '[]'::jsonb)
) as snapshot;

select throws_ok(
  $$select public.reset_monthly_auto_budgets(null::uuid, '2099-02')$$,
  '22004',
  'p_user_id is required',
  'null tenant fails before writes'
);
select throws_ok(
  $$select public.reset_monthly_auto_budgets('11111111-1111-1111-1111-111111111111'::uuid, null::text)$$,
  '22023',
  'month_id must use YYYY-MM format',
  'null month fails before writes'
);
select throws_ok(
  $$select public.reset_monthly_auto_budgets('11111111-1111-1111-1111-111111111111'::uuid, '2099-2')$$,
  '22023',
  'month_id must use YYYY-MM format',
  'malformed month fails before writes'
);
select is(
  (select jsonb_build_object(
    'budgets', coalesce((select jsonb_agg(to_jsonb(b) order by b.id) from public.budgets b where user_id = '11111111-1111-1111-1111-111111111111'), '[]'::jsonb),
    'stats', coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.budget_auto_adjustment_stats s where user_id = '11111111-1111-1111-1111-111111111111'), '[]'::jsonb)
  )),
  (select snapshot from owner_a_before_invalid),
  'invalid arguments leave owner A budgets and stats unchanged'
);

create function public.s4a_test_fail_reset_stats()
returns trigger
language plpgsql
as $$
begin
  if new.month_id = '2099-03' then
    raise exception 'injected S4A stats failure' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger s4a_test_fail_reset_stats
before insert or update on public.budget_auto_adjustment_stats
for each row execute function public.s4a_test_fail_reset_stats();

create temp table owner_a_before_failure as
select jsonb_build_object(
  'budgets', coalesce((select jsonb_agg(to_jsonb(b) order by b.id) from public.budgets b where user_id = '11111111-1111-1111-1111-111111111111'), '[]'::jsonb),
  'stats', coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.budget_auto_adjustment_stats s where user_id = '11111111-1111-1111-1111-111111111111'), '[]'::jsonb)
) as snapshot;

select throws_ok(
  $$select public.reset_monthly_auto_budgets('11111111-1111-1111-1111-111111111111'::uuid, '2099-03')$$,
  'P0001',
  'injected S4A stats failure',
  'injected stats error aborts the reset'
);
select is(
  (select jsonb_build_object(
    'budgets', coalesce((select jsonb_agg(to_jsonb(b) order by b.id) from public.budgets b where user_id = '11111111-1111-1111-1111-111111111111'), '[]'::jsonb),
    'stats', coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.budget_auto_adjustment_stats s where user_id = '11111111-1111-1111-1111-111111111111'), '[]'::jsonb)
  )),
  (select snapshot from owner_a_before_failure),
  'injected failure rolls back owner A budgets and stats together'
);

select ok(
  not has_function_privilege('public', 'public.reset_monthly_auto_budgets(uuid,text)', 'EXECUTE'),
  'PUBLIC has no execute privilege'
);
select ok(
  not has_function_privilege('anon', 'public.reset_monthly_auto_budgets(uuid,text)', 'EXECUTE'),
  'anon has no execute privilege'
);
select ok(
  not has_function_privilege('authenticated', 'public.reset_monthly_auto_budgets(uuid,text)', 'EXECUTE'),
  'authenticated has no execute privilege'
);
select ok(
  has_function_privilege('service_role', 'public.reset_monthly_auto_budgets(uuid,text)', 'EXECUTE'),
  'service_role has execute privilege'
);

select * from finish();
rollback;
