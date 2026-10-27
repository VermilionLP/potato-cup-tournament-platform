#!/usr/bin/env bash
# Back up the tournament database (schema axsuck) with pg_dump.
#
# Usage (on the server, as the admin user):
#   bash scripts/backup-db.sh [label]      # label: daily, pre-deploy, manual (default)
#
# Writes $BACKUP_DIR/db/suck-db-<date>-<label>.dump (pg_dump custom format,
# compressed) and keeps the newest $KEEP dumps of that label.
# deploy.sh runs it before every deploy; for a daily backup add to crontab
# (crontab -e):
#   17 4 * * * bash /home/admin/suck/scripts/backup-db.sh daily >> /home/admin/suck-backups/db/backup.log 2>&1
#
# Restore (stop the service first; replaces everything in schema axsuck):
#   pm2 stop suck-tournament
#   pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" /home/admin/suck-backups/db/<file>.dump
#   pm2 start suck-tournament

set -euo pipefail

TARGET="${TARGET:-/home/admin/suck}"
BACKUP_DIR="${BACKUP_DIR:-/home/admin/suck-backups}"
KEEP="${KEEP:-30}"
LABEL="${1:-manual}"
[[ "$LABEL" =~ ^[a-z0-9-]+$ ]] || { echo "label must be lowercase letters, digits or -"; exit 1; }

command -v pg_dump >/dev/null || {
  echo "FAILED: pg_dump not found (install the PostgreSQL client, e.g. dnf install postgresql)"
  exit 1
}

# DATABASE_URL from the environment, else from apps/api/.env.
if [ -z "${DATABASE_URL:-}" ] && [ -f "$TARGET/apps/api/.env" ]; then
  DATABASE_URL=$(grep -E '^[[:space:]]*DATABASE_URL[[:space:]]*=' "$TARGET/apps/api/.env" | tail -1 \
    | sed -E 's/^[^=]*=[[:space:]]*//; s/^["'\'']//; s/["'\'']$//')
fi
[ -n "${DATABASE_URL:-}" ] || { echo "FAILED: DATABASE_URL is not set and not in $TARGET/apps/api/.env"; exit 1; }

mkdir -p "$BACKUP_DIR/db"
chmod 700 "$BACKUP_DIR/db"
FILE="$BACKUP_DIR/db/suck-db-$(date +%Y%m%d-%H%M%S)-${LABEL}.dump"
TMP="$FILE.part"

# Written to a .part file first so a failed dump never looks like a backup.
if ! pg_dump --format=custom --schema=axsuck --no-owner --file="$TMP" --dbname="$DATABASE_URL"; then
  rm -f "$TMP"
  echo "FAILED: pg_dump did not finish"
  exit 1
fi
mv "$TMP" "$FILE"
chmod 600 "$FILE"
echo "database backup: $FILE ($(du -h "$FILE" | cut -f1))"

# Keep the newest $KEEP backups of this label.
ls -1t "$BACKUP_DIR/db"/suck-db-*-"${LABEL}".dump 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -f "$old"
  echo "removed old backup: $(basename "$old")"
done
