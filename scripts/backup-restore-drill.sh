#!/usr/bin/env bash
#
# backup-restore-drill.sh
#
# Reproducible restoration drill for development/test. It proves a
# pg_dump -> pg_restore round trip against synthetic data:
#
#   1. create/reset a source database and apply migrations
#   2. seed representative application data
#   3. create a backup
#   4. create a fresh empty restore database
#   5. restore the backup into it
#   6. verify migration head and representative records/invariants
#
# Requires the API dependencies (uv or an equivalent Python environment with
# the koranco package) and a reachable PostgreSQL with pg_dump/pg_restore.
#
# Required environment (libpq, for the cluster):
#   PGHOST, PGPORT, PGUSER, PGPASSWORD
#   KORANCO_DRILL_SOURCE_DATABASE   (default koranco_drill_source)
#   KORANCO_DRILL_RESTORE_DATABASE (default koranco_drill_restore)
#
# Optional:
#   PY_CMD          - command to run a python script with the API deps
#                     (default "uv run python")
#   ALEMBIC_CMD     - command to run alembic (default "uv run alembic")
#   KORANCO_API_DIR - path to the API directory (default ./apps/api)
#
# Never point this at production. The seed refuses to touch real data; the
# source database is created fresh here.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="${KORANCO_API_DIR:-$ROOT_DIR/apps/api}"
PY_CMD="${PY_CMD:-uv run python}"
ALEMBIC_CMD="${ALEMBIC_CMD:-uv run alembic}"

: "${PGHOST:?drill requires PGHOST}"
: "${PGPORT:?drill requires PGPORT}"
: "${PGUSER:?drill requires PGUSER}"

SOURCE="${KORANCO_DRILL_SOURCE_DATABASE:-koranco_drill_source}"
RESTORE="${KORANCO_DRILL_RESTORE_DATABASE:-koranco_drill_restore}"
BACKUP_DIR="${KORANCO_BACKUP_DIR:-$ROOT_DIR/.drill-backups}"

for tool in psql createdb dropdb; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "drill: error: '$tool' not found on PATH" >&2
    exit 1
  fi
done

# Safety guard: never let the drill drop/recreate anything that looks like a
# real (production) database.
for db in "$SOURCE" "$RESTORE"; do
  case "$db" in
    *prod* | *production* | *koranco_main*)
      echo "drill: error: refusing to run against database '$db' (looks like a production database)" >&2
      exit 1
      ;;
  esac
done

if [[ ! -d "$API_DIR" ]]; then
  echo "drill: error: API directory not found: $API_DIR" >&2
  exit 1
fi

# The drill runs in test mode and only touches fresh synthetic databases.
export KORANCO_ENVIRONMENT="${KORANCO_ENVIRONMENT:-test}"
export KORANCO_CSRF_TRUSTED_ORIGINS='["http://drill"]'
export KORANCO_CORS_ORIGINS='[]'

cd "$API_DIR"

echo "drill: source=$SOURCE restore=$RESTORE"

# Build SQLAlchemy URLs. PGHOST may be a Unix socket directory (leading '/')
# or a TCP host; psycopg accepts either as query parameters for a socket.
if [[ "$PGHOST" == /* ]]; then
  SOURCE_URL="postgresql+psycopg://${PGUSER}@/${SOURCE}?host=${PGHOST}&port=${PGPORT}"
  RESTORE_URL="postgresql+psycopg://${PGUSER}@/${RESTORE}?host=${PGHOST}&port=${PGPORT}"
else
  SOURCE_URL="postgresql+psycopg://${PGUSER}@${PGHOST}:${PGPORT}/${SOURCE}"
  RESTORE_URL="postgresql+psycopg://${PGUSER}@${PGHOST}:${PGPORT}/${RESTORE}"
fi

# 1. Reset and create the source database, then apply migrations.
dropdb --if-exists --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" "$SOURCE"
createdb --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" "$SOURCE"
export KORANCO_DATABASE_URL="$SOURCE_URL"
$ALEMBIC_CMD upgrade head

# 2. Seed representative data.
PYTHONPATH="$API_DIR/src" $PY_CMD "$SCRIPT_DIR/backup_drill.py" seed --url "$SOURCE_URL"

# 3. Create a backup.
KORANCO_BACKUP_DIR="$BACKUP_DIR" \
  PGDATABASE="$SOURCE" \
  "$SCRIPT_DIR/backup-postgres.sh"

LATEST_BACKUP="$(find "$BACKUP_DIR" -type f -name "koranco-${SOURCE}-*.dump" -print0 \
  | xargs -0 ls -t | head -1)"
if [[ -z "$LATEST_BACKUP" ]]; then
  echo "drill: error: no backup produced" >&2
  exit 1
fi
echo "drill: backup created: $LATEST_BACKUP"

# 4 + 5. Create a fresh restore database and restore the backup.
dropdb --if-exists --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" "$RESTORE"
createdb --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" "$RESTORE"
KORANCO_RESTORE_TARGET_DATABASE="$RESTORE" \
  KORANCO_RESTORE_CONFIRM=yes \
  PGDATABASE="$SOURCE" \
  "$SCRIPT_DIR/restore-postgres.sh" "$LATEST_BACKUP"

# 6. Verify migration head on the restored database.
HEAD_BEFORE="$(cd "$API_DIR" && KORANCO_DATABASE_URL="$SOURCE_URL" $ALEMBIC_CMD heads | awk '{print $1}')"
HEAD_AFTER="$(cd "$API_DIR" && KORANCO_DATABASE_URL="$RESTORE_URL" $ALEMBIC_CMD current | awk '{print $1}')"
echo "drill: migration head before=$HEAD_BEFORE after=$HEAD_AFTER"
if [[ "$HEAD_BEFORE" != "$HEAD_AFTER" ]]; then
  echo "drill: error: restored migration head '$HEAD_AFTER' != source head '$HEAD_BEFORE'" >&2
  exit 1
fi

# Verify representative data and invariants survive.
PYTHONPATH="$API_DIR/src" $PY_CMD "$SCRIPT_DIR/backup_drill.py" verify --url "$RESTORE_URL"

echo "drill: SUCCESS - backup/restore round trip verified on '$RESTORE'"
