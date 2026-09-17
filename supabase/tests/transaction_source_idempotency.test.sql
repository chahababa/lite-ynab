begin;
select plan(6);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('81000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's8-owner-a@example.test', crypt('not-a-real-password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('82000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's8-owner-b@example.test', crypt('not-a-real-password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.category_groups (id, user_id, name, sort_order)
values
  ('81000000-0000-0000-0000-000000000011', '81000000-0000-0000-0000-000000000001', 'S8 owner A', 1),
  ('82000000-0000-0000-0000-000000000012', '82000000-0000-0000-0000-000000000002', 'S8 owner B', 1);

insert into public.categories (id, user_id, category_group_id, name, is_auto, auto_amount, is_quick, sort_order)
values
  ('81000000-0000-0000-0000-000000000021', '81000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000011', 'S8 category A', false, 0, false, 1),
  ('82000000-0000-0000-0000-000000000022', '82000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000012', 'S8 category B', false, 0, false, 1);

insert into public.payment_methods (id, user_id, name, sort_order)
values
  ('81000000-0000-0000-0000-000000000031', '81000000-0000-0000-0000-000000000001', 'S8 method A', 1),
  ('82000000-0000-0000-0000-000000000032', '82000000-0000-0000-0000-000000000002', 'S8 method B', 1);

select hasnt_index(
  'public',
  'transactions',
  'idx_transactions_user_source_source_id',
  'legacy non-unique source identity index is removed'
);
select ok(
  exists (
    select 1
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = 'transactions'
      and c.conname = 'transactions_user_source_source_id_key'
      and c.contype = 'u'
  ),
  'named source identity uniqueness constraint exists'
);

insert into public.transactions (user_id, date, amount, category_id, payment_method_id, source, source_id)
values ('81000000-0000-0000-0000-000000000001', '2099-01-01', 100, '81000000-0000-0000-0000-000000000021', '81000000-0000-0000-0000-000000000031', 'hermes', 'same-owner-source');

select throws_ok(
  $$insert into public.transactions (user_id, date, amount, category_id, payment_method_id, source, source_id)
    values ('81000000-0000-0000-0000-000000000001', '2099-01-02', 101, '81000000-0000-0000-0000-000000000021', '81000000-0000-0000-0000-000000000031', 'hermes', 'same-owner-source')$$,
  '23505',
  null,
  'duplicate same user, source, and source_id is rejected'
);

select lives_ok(
  $$insert into public.transactions (user_id, date, amount, category_id, payment_method_id, source, source_id)
    values ('82000000-0000-0000-0000-000000000002', '2099-01-02', 102, '82000000-0000-0000-0000-000000000022', '82000000-0000-0000-0000-000000000032', 'hermes', 'same-owner-source')$$,
  'same source_id for a different user is allowed'
);

select lives_ok(
  $$insert into public.transactions (user_id, date, amount, category_id, payment_method_id, source, source_id)
    values ('81000000-0000-0000-0000-000000000001', '2099-01-03', 103, '81000000-0000-0000-0000-000000000021', '81000000-0000-0000-0000-000000000031', 'ynab_import', 'same-owner-source')$$,
  'same source_id for a different source is allowed'
);

select lives_ok(
  $$insert into public.transactions (user_id, date, amount, category_id, payment_method_id, source, source_id)
    values
      ('81000000-0000-0000-0000-000000000001', '2099-01-04', 104, '81000000-0000-0000-0000-000000000021', '81000000-0000-0000-0000-000000000031', 'manual', null),
      ('81000000-0000-0000-0000-000000000001', '2099-01-05', 105, '81000000-0000-0000-0000-000000000021', '81000000-0000-0000-0000-000000000031', 'manual', null)$$,
  'multiple null source_id rows are allowed'
);

select * from finish();
rollback;
