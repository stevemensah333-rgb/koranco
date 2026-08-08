#!/usr/bin/env bash
#
# restore-postgres.sh
#
# Restore a PostgreSQL backup (custom-format pg_dump) into a separate,
# explicitly selected target database. The default behavior refuses to overwrite
# anything and refuses to restore into the same database the backup came from.
# Operators must deliberately opt into replacing an existing non-empty target.
#
# Prefer restoring into a fresh, separate database/environment first. Never
# casually restore over production.
#
# Usage:
#   ./scripts/restore-postgres.sh <backup-file>
#
# Required environment (libpq, for the target cluster):
#   PGHOST, PGPORT, PGUSER, PGPASSWORD
#   KORANCO_RESTORE_TARGET_DATABASE      - the target database name (required)
#   KORANCO_RESTORE_CONFIRM=yes          - explicit acknowledgement
#
# Optional environment:
#   PGDATABASE                           - source database the backup originated
#                                          from, used for the same-DB guard
#   KORANCO_RESTORE_REPLACE=1            - allow dropping and recreating an
#                                          existing non-empty target database
#   KORANCO_RESTORE_RUN_VERIFY=1         - run a basic post-restore sanity check
#
# The target must not be the source database unless
# KORANCO_RESTORE_SAME_DB_ALLOWED=1 is set (not recommended).

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <backup-file>" >&2
  exit 2
fi

BACKUP_FILE="$1"
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "restore-postgres: error: backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

: "${PGHOST:?restore requires PGHOST}"
: "${PGPORT:?restore requires PGPORT}"
: "${PGUSER:?restore requires PGUSER}"
: "${KORANCO_RESTORE_TARGET_DATABASE:?restore requires KORANCO_RESTORE_TARGET_DATABASE}"

TARGET="${KORANCO_RESTORE_TARGET_DATABASE}"
SOURCE_DB="${PGDATABASE:-}"

if [[ "${KORANCO_RESTORE_CONFIRM:-}" != "yes" ]]; then
  echo "restore-postgres: error: refusing to proceed without KORANCO_RESTORE_CONFIRM=yes" >&2
  exit 1
fi

if [[ -n "$SOURCE_DB" && "$SOURCE_DB" == "$TARGET" && "${KORANCO_RESTORE_SAME_DB_ALLOWED:-}" != "1" ]]; then
  echo "restore-postgres: error: target database '$TARGET' is the same as the source database;" >&2
  echo "  restoring in place is dangerous and is refused by default." >&2
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "restore-postgres: error: pg_restore not found on PATH" >&2
  exit 1
fi

# Confirm the archive is a valid custom-format dump before touching anything.
pg_restore --list "$BACKUP_FILE" >/dev/null \
  || { echo "restore-postgres: error: '$BACKUP_FILE' is not a valid dump archive" >&2; exit 1; }

# Determine whether the target database exists and whether it has any tables.
TARGET_EXISTS="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '$TARGET'")"
TABLE_COUNT=0
if [[ "$TARGET_EXISTS" == "1" ]]; then
  TABLE_COUNT="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$TARGET" -tAc \
    "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")"
fi

if [[ "$TARGET_EXISTS" == "1" && "$TABLE_COUNT" != "0" ]]; then
  if [[ "${KORANCO_RESTORE_REPLACE:-}" != "1" ]]; then
    echo "restore-postgres: error: target database '$TARGET' already contains $TABLE_COUNT table(s)." >&2
    echo "  Refusing to overwrite. Use KORANCO_RESTORE_REPLACE=1 only to drop/recreate it." >&2
    exit 1
  fi
  echo "restore-postgres: replacing existing target database '$TARGET' (KORANCO_RESTORE_REPLACE=1)"
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres \
    -v ON_ERROR_STOP=1 -c "DROP DATABASE \"$TARGET\"" >/dev/null
  TARGET_EXISTS=""
fi

if [[ "$TARGET_EXISTS" != "1" ]]; then
  echo "restore-postgres: creating target database '$TARGET'"
  createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$TARGET"
fi

echo "restore-postgres: restoring '$BACKUP_FILE' into '$TARGET'"
pg_restore \
  --no-owner \
  --no-privileges \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$TARGET" \
  --exit-on-error \
  "$BACKUP_FILE"

if [[ "${KORANCO_RESTORE_RUN_VERIFY:-}" == "1" ]]; then
  TABLE_COUNT_AFTER="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$TARGET" -tAc \
    "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")"
  echo "restore-postgres: verify: target '$TARGET' now has $TABLE_COUNT_AFTER table(s)."
  echo "restore-postgres: verify: run 'alembic current' and application smoke checks to confirm migration head."
fi

echo "restore-postgres: restore complete (target database '$TARGET')"
