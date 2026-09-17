#!/usr/bin/env bash
# Local-only regression harness for S8's fail-closed migration behavior.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

readonly migration_version="20260917050000"
readonly pre_s8_version="20260917040000"
readonly db_container="supabase_db_lite-ynab-local"
readonly failure_message="duplicate transaction source identities exist; aborting constraint creation"

if ! docker inspect "$db_container" >/dev/null 2>&1; then
  printf 'Local Supabase database container %s is not running. Run supabase start first.\n' "$db_container" >&2
  exit 1
fi

psql_local() {
  docker exec -i "$db_container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}

reset_to() {
  local version="$1"
  local attempt

  for attempt in 1 2 3; do
    if [[ -n "$version" ]]; then
      supabase_args=(db reset --local --version "$version" --no-seed)
    else
      supabase_args=(db reset --local --no-seed)
    fi
    if supabase "${supabase_args[@]}"; then
      return 0
    fi
    if [[ "$attempt" -lt 3 ]]; then
      printf 'Local stack is still restarting; retrying reset (%s/3).\n' "$attempt" >&2
      sleep 15
    fi
  done

  return 1
}

reset_clean() {
  reset_to ""
}

cleanup() {
  local status=$?
  if ! reset_clean >/dev/null 2>&1; then
    printf 'WARNING: unable to restore the local database to the clean S8 state.\n' >&2
    status=1
  fi
  exit "$status"
}
trap cleanup EXIT

# This is intentionally the deployment-equivalent local executor: reset to the
# predecessor, then migration up applies only the exact S8 file under test.
reset_to "$pre_s8_version"

psql_local <<'SQL'
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '83000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 's8-migration-harness@example.test',
  crypt('not-a-real-password', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into public.category_groups (id, user_id, name, sort_order)
values ('83000000-0000-0000-0000-000000000011', '83000000-0000-0000-0000-000000000001', 'S8 harness', 1);

insert into public.categories (id, user_id, category_group_id, name, is_auto, auto_amount, is_quick, sort_order)
values ('83000000-0000-0000-0000-000000000021', '83000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000011', 'S8 harness category', false, 0, false, 1);

insert into public.payment_methods (id, user_id, name, sort_order)
values ('83000000-0000-0000-0000-000000000031', '83000000-0000-0000-0000-000000000001', 'S8 harness payment method', 1);

insert into public.transactions (user_id, date, amount, category_id, payment_method_id, source, source_id)
values
  ('83000000-0000-0000-0000-000000000001', '2099-02-01', 201, '83000000-0000-0000-0000-000000000021', '83000000-0000-0000-0000-000000000031', 'hermes', 'duplicate-preflight'),
  ('83000000-0000-0000-0000-000000000001', '2099-02-02', 202, '83000000-0000-0000-0000-000000000021', '83000000-0000-0000-0000-000000000031', 'hermes', 'duplicate-preflight');
SQL

migration_output="$(mktemp)"
if supabase migration up --local >"$migration_output" 2>&1; then
  cat "$migration_output" >&2
  printf 'Expected S8 migration to fail for duplicate non-NULL source identities.\n' >&2
  exit 1
fi
if ! grep -Fq "$failure_message" "$migration_output"; then
  cat "$migration_output" >&2
  printf 'S8 migration failed without the expected fail-closed error.\n' >&2
  exit 1
fi

psql_local <<'SQL'
do $$
begin
  if (
    select count(*)
    from public.transactions
    where (user_id, date, amount, category_id, payment_method_id, source, source_id) in (
      ('83000000-0000-0000-0000-000000000001'::uuid, '2099-02-01'::date, 201, '83000000-0000-0000-0000-000000000021'::uuid, '83000000-0000-0000-0000-000000000031'::uuid, 'hermes', 'duplicate-preflight'),
      ('83000000-0000-0000-0000-000000000001'::uuid, '2099-02-02'::date, 202, '83000000-0000-0000-0000-000000000021'::uuid, '83000000-0000-0000-0000-000000000031'::uuid, 'hermes', 'duplicate-preflight')
    )
  ) <> 2 then
    raise exception 'duplicate fixture rows were changed during failed migration';
  end if;

  if to_regclass('public.idx_transactions_user_source_source_id') is null then
    raise exception 'legacy source identity index was removed during failed migration';
  end if;

  if exists (select 1 from pg_constraint where conname = 'transactions_user_source_source_id_key') then
    raise exception 'new source identity constraint exists after failed migration';
  end if;

  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260917050000') then
    raise exception 'failed S8 migration was recorded in migration history';
  end if;
end
$$;
SQL

rm -f "$migration_output"
printf 'PASS: S8 duplicate preflight fails closed without repair or catalog/history changes.\n'
