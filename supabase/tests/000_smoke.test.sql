begin;
select plan(2);

select has_table('public', 'transactions', 'transactions table exists');
select has_function('public', 'enforce_transaction_reference_ownership', array[]::name[], 'ownership trigger function exists');

select * from finish();
rollback;
