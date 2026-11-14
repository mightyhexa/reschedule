#!/usr/bin/env bash
# Daily PostgreSQL backup. Run from the project folder:  bash deploy/backup.sh
# Cron (every night 02:30):  30 2 * * * cd /opt/reschedule && bash deploy/backup.sh >> backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
f="backups/reschedule-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T db pg_dump -U reschedule -d reschedule --no-owner | gzip > "$f"
[ -s "$f" ] || { echo "backup is empty, something is wrong" >&2; rm -f "$f"; exit 1; }
find backups -name 'reschedule-*.sql.gz' -mtime +14 -delete   # keep 14 days
echo "$(date -Is) saved $f ($(du -h "$f" | cut -f1))"
