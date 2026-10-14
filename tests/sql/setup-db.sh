#!/usr/bin/env bash
# Recreates the local test database: Supabase stub + all migrations (+ grants Supabase normally provides).
set -euo pipefail
P="psql -h /tmp -p ${PGPORT:-54329} -U postgres -v ON_ERROR_STOP=1 -q"
cd "$(dirname "$0")/../.."
$P -c "drop database if exists mk with (force)" -c "create database mk"
$P -d mk -f tests/sql/supabase-stub.sql
for f in supabase/migrations/*.sql; do $P -d mk -f "$f"; done
$P -d mk -c "grant usage on schema extensions to anon, authenticated, service_role" \
  -c "grant select,insert,update,delete on all tables in schema public to anon, authenticated, service_role" \
  -c "grant usage, select on all sequences in schema public to anon, authenticated, service_role"
echo "database mk ready"
