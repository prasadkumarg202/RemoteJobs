#!/usr/bin/env bash
# Recreates a local imitation of an AapStack (OwnDatabase) project and applies aapstack/migrations as the
# project's restricted owner role, the way `odb db push` does. Mirrors platform/control-plane/src/lib/provision.ts.
set -euo pipefail
P="psql -h /tmp -p ${PGPORT:-54329} -U postgres -v ON_ERROR_STOP=1 -q"
S=${AAP_SCHEMA:-project_remotejobs}
O="${S}_owner"
cd "$(dirname "$0")/../.."
npx tsx scripts/aapstack/convert-migrations.ts "$S" >/dev/null
$P -c "drop database if exists aap with (force)" -c "create database aap"
$P -d aap <<SQL
do \$\$ begin create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; exception when duplicate_object then null; end \$\$;
do \$\$ begin create role $O login noinherit nosuperuser nocreatedb nocreaterole nobypassrls; exception when duplicate_object then null; end \$\$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), project_id uuid, email varchar(255), phone varchar(50),
  raw_user_meta_data jsonb not null default '{}', raw_app_meta_data jsonb not null default '{}', created_at timestamptz not null default now());
create or replace function auth.uid() returns uuid language plpgsql stable as \$f\$
begin return nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid; exception when others then return null; end \$f\$;
create or replace function auth.role() returns text language plpgsql stable as \$f\$
begin return nullif(current_setting('request.jwt.claims', true)::jsonb->>'role', ''); exception when others then return null; end \$f\$;
create or replace function auth.email() returns text language sql stable as \$f\$ select nullif(current_setting('request.jwt.claims', true)::jsonb->>'email', '') \$f\$;
create extension if not exists pg_trgm;   -- AapStack: extensions live in public
create extension if not exists unaccent;
create extension if not exists vector;
revoke create on schema public from public;
create schema $S authorization $O;
grant usage on schema auth to $O;
grant references, select on auth.users to $O;
grant execute on function auth.uid(), auth.role(), auth.email() to $O;
alter default privileges for role $O in schema $S grant all on tables to anon, authenticated, service_role;
alter default privileges for role $O in schema $S grant all on sequences to anon, authenticated, service_role;
alter default privileges for role $O in schema $S grant execute on functions to anon, authenticated, service_role;
grant usage on schema $S to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant anon, authenticated, service_role to postgres;
SQL
for f in aapstack/migrations/*.sql; do
  { echo "set role $O; set search_path = $S, public;"; cat "$f"; } | $P -d aap -1 -f - || { echo "FAILED: $f"; exit 1; }
done
# PostgREST caches the schema: tell it to reload, and give it a moment.
$P -d aap -qc "notify pgrst, 'reload schema'" && sleep 2
echo "aapstack imitation ready (schema $S)"
