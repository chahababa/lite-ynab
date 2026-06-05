begin;

with mapping(en_name, zh_name, group_name, is_quick, is_auto, auto_amount, sort_order) as (
  values
    ('Food', '飲食', '個人', true, true, 6000, 10),
    ('Transport', '交通', '其他', true, true, 4000, 20),
    ('Coffee', '咖啡', '個人', true, true, 2000, 30),
    ('Daily Needs', '日常用品', '家庭', true, false, 0, 40),
    ('Fun Money', '娛樂', '個人', true, false, 0, 50),
    ('Health', '健康', '個人', false, false, 0, 60),
    ('Rent', '房租', '家庭', false, true, 12000, 70),
    ('Travel', '旅行', '其他', false, false, 0, 80),
    ('Subscriptions', '訂閱', '其他', false, false, 0, 90),
    ('Emergency Fund', '緊急預備金', '其他', false, false, 0, 100)
)
insert into public.categories (
  user_id,
  category_group_id,
  name,
  is_auto,
  auto_amount,
  is_quick,
  sort_order
)
select distinct
  source.user_id,
  target_group.id,
  mapping.zh_name,
  mapping.is_auto,
  mapping.auto_amount,
  mapping.is_quick,
  mapping.sort_order
from public.categories source
join mapping on mapping.en_name = source.name
join public.category_groups target_group
  on target_group.user_id = source.user_id
 and target_group.name = mapping.group_name
left join public.categories existing
  on existing.user_id = source.user_id
 and existing.category_group_id = target_group.id
 and existing.name = mapping.zh_name
where existing.id is null;

with mapping(en_name, zh_name, group_name, is_quick, is_auto, auto_amount, sort_order) as (
  values
    ('Food', '飲食', '個人', true, true, 6000, 10),
    ('Transport', '交通', '其他', true, true, 4000, 20),
    ('Coffee', '咖啡', '個人', true, true, 2000, 30),
    ('Daily Needs', '日常用品', '家庭', true, false, 0, 40),
    ('Fun Money', '娛樂', '個人', true, false, 0, 50),
    ('Health', '健康', '個人', false, false, 0, 60),
    ('Rent', '房租', '家庭', false, true, 12000, 70),
    ('Travel', '旅行', '其他', false, false, 0, 80),
    ('Subscriptions', '訂閱', '其他', false, false, 0, 90),
    ('Emergency Fund', '緊急預備金', '其他', false, false, 0, 100)
)
update public.categories target
set
  category_group_id = target_group.id,
  is_quick = mapping.is_quick,
  is_auto = mapping.is_auto,
  auto_amount = mapping.auto_amount,
  sort_order = mapping.sort_order
from mapping, public.category_groups target_group
where target.name = mapping.zh_name
  and target_group.user_id = target.user_id
  and target_group.name = mapping.group_name
  and target.user_id = target_group.user_id;

with mapping(en_name, zh_name, group_name) as (
  values
    ('Food', '飲食', '個人'),
    ('Transport', '交通', '其他'),
    ('Coffee', '咖啡', '個人'),
    ('Daily Needs', '日常用品', '家庭'),
    ('Fun Money', '娛樂', '個人'),
    ('Health', '健康', '個人'),
    ('Rent', '房租', '家庭'),
    ('Travel', '旅行', '其他'),
    ('Subscriptions', '訂閱', '其他'),
    ('Emergency Fund', '緊急預備金', '其他')
),
source_target as (
  select
    source.id as source_id,
    source.user_id,
    target.id as target_id
  from public.categories source
  join mapping on mapping.en_name = source.name
  join public.category_groups target_group
    on target_group.user_id = source.user_id
   and target_group.name = mapping.group_name
  join public.categories target
    on target.user_id = source.user_id
   and target.category_group_id = target_group.id
   and target.name = mapping.zh_name
)
insert into public.budgets (user_id, month_id, category_id, allocated)
select
  budget.user_id,
  budget.month_id,
  source_target.target_id,
  budget.allocated
from public.budgets budget
join source_target on source_target.source_id = budget.category_id
on conflict (user_id, month_id, category_id)
do update set allocated = public.budgets.allocated + excluded.allocated;

with mapping(en_name, zh_name, group_name) as (
  values
    ('Food', '飲食', '個人'),
    ('Transport', '交通', '其他'),
    ('Coffee', '咖啡', '個人'),
    ('Daily Needs', '日常用品', '家庭'),
    ('Fun Money', '娛樂', '個人'),
    ('Health', '健康', '個人'),
    ('Rent', '房租', '家庭'),
    ('Travel', '旅行', '其他'),
    ('Subscriptions', '訂閱', '其他'),
    ('Emergency Fund', '緊急預備金', '其他')
),
source_target as (
  select
    source.id as source_id,
    target.id as target_id
  from public.categories source
  join mapping on mapping.en_name = source.name
  join public.category_groups target_group
    on target_group.user_id = source.user_id
   and target_group.name = mapping.group_name
  join public.categories target
    on target.user_id = source.user_id
   and target.category_group_id = target_group.id
   and target.name = mapping.zh_name
)
update public.transactions transaction
set category_id = source_target.target_id
from source_target
where transaction.category_id = source_target.source_id;

delete from public.budgets
where category_id in (
  select id
  from public.categories
  where name in (
    'Food',
    'Transport',
    'Coffee',
    'Daily Needs',
    'Fun Money',
    'Health',
    'Rent',
    'Travel',
    'Subscriptions',
    'Emergency Fund'
  )
);

delete from public.categories category
where category.name in (
  'Food',
  'Transport',
  'Coffee',
  'Daily Needs',
  'Fun Money',
  'Health',
  'Rent',
  'Travel',
  'Subscriptions',
  'Emergency Fund'
)
and not exists (
  select 1 from public.transactions transaction where transaction.category_id = category.id
)
and not exists (
  select 1 from public.budgets budget where budget.category_id = category.id
);

commit;
