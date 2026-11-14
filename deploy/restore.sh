#!/usr/bin/env bash
# Restore a backup into the running database. THIS REPLACES CURRENT DATA.
# Usage:  bash deploy/restore.sh backups/reschedule-20261112-023000.sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."
f="${1:?give the backup file}"
read -r -p "This wipes the current database and loads $f. Type YES to continue: " ok
[ "$ok" = "YES" ] || exit 1
docker compose stop api
docker compose exec -T db psql -U reschedule -d postgres -c "DROP DATABASE IF EXISTS reschedule WITH (FORCE);" -c "CREATE DATABASE reschedule OWNER reschedule;"
gunzip -c "$f" | docker compose exec -T db psql -U reschedule -d reschedule -v ON_ERROR_STOP=1
docker compose start api
echo "restored from $f"
