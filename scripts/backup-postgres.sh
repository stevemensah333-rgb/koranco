#!/usr/bin/env bash
#
# backup-postgres.sh
#
# Create a compressed PostgreSQL backup of the authoritative database with a
# rolling retention period. This is the portable recovery tooling fallback; a
# managed PostgreSQL provider's native backup system is the preferred
# production automation (see docs/operations/backup-and-recovery.md and
# ADR-011).
#
# This script is intentionally narrow: it wraps pg_dump and prunes old
# backups. It does NOT embed credentials, does NOT upload to any provider, and
# fails loudly on any error.
#
# Required environment:
#   PGHOST, PGPORT, PGUSER, PGDATABASE  - libpq connection to the source DB
#   PGPASSWORD (or a libpq .pgpass entry) - never passed on a command line
#   KORANCO_BACKUP_DIR                   - existing or creatable destination
#
# Optional environment:
#   KORANCO_BACKUP_RETENTION_DAYS        - rolling retention (default 30)
#   KORANCO_BACKUP_GPG_RECIPIENT         - if set, encrypt each backup with gpg
#                                          to this recipient (armor not used)
#
# Example:
#   PGHOST=localhost PGPORT=5432 PGUSER=koranco PGDATABASE=koranco_prod \
#   PGPASSWORD='...' KORANCO_BACKUP_DIR=/var/backups/koranco \
#   ./scripts/backup-postgres.sh
#
# Credentials are taken from the process environment only and are never echoed.

set -euo pipefail

: "${PGHOST:?backup requires PGHOST}"
: "${PGPORT:?backup requires PGPORT}"
: "${PGUSER:?backup requires PGUSER}"
: "${PGDATABASE:?backup requires PGDATABASE}"
: "${KORANCO_BACKUP_DIR:?backup requires KORANCO_BACKUP_DIR}"

RETENTION_DAYS="${KORANCO_BACKUP_RETENTION_DAYS:-30}"
GPG_RECIPIENT="${KORANCO_BACKUP_GPG_RECIPIENT:-}"

# Fail loudly if pg_dump is not available.
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "backup-postgres: error: pg_dump not found on PATH" >&2
  exit 1
fi

if [[ ! "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || [[ "$RETENTION_DAYS" -lt 1 ]]; then
  echo "backup-postgres: error: KORANCO_BACKUP_RETENTION_DAYS must be a positive integer" >&2
  exit 1
fi

mkdir -p "$KORANCO_BACKUP_DIR"
if [[ ! -d "$KORANCO_BACKUP_DIR" ]]; then
  echo "backup-postgres: error: cannot create KORANCO_BACKUP_DIR=$KORANCO_BACKUP_DIR" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASE="$KORANCO_BACKUP_DIR/koranco-${PGDATABASE}-${STAMP}"
DUMP_FILE="${BASE}.dump"
META_FILE="${BASE}.txt"

echo "backup-postgres: starting pg_dump of database '$PGDATABASE'"

# --format=custom is compressed and enables selective pg_restore and built-in
# checksums. --no-owner/--no-privileges keep the dump portable across restore
# roles (the restore target grants the necessary ownership via the DB owner).
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --file="$DUMP_FILE"

echo "backup-postgres: pg_dump completed ($DUMP_FILE)"

# Record metadata and a checksum next to the dump for verification.
# The .sha256 file is standard `sha256sum -c` format.
sha256sum "$DUMP_FILE" > "${DUMP_FILE}.sha256"
{
  echo "database=$PGDATABASE"
  echo "created_at=$(date -u -Is)"
  echo "pg_dump_version=$(pg_dump --version)"
  echo "sha256=$(awk '{print $1}' "${DUMP_FILE}.sha256")"
} > "$META_FILE"

if [[ -n "$GPG_RECIPIENT" ]]; then
  if ! command -v gpg >/dev/null 2>&1; then
    echo "backup-postgres: error: KORANCO_BACKUP_GPG_RECIPIENT set but gpg is unavailable" >&2
    exit 1
  fi
  gpg --batch --yes --encrypt --recipient "$GPG_RECIPIENT" \
    --output "${BASE}.dump.gpg" "$DUMP_FILE"
  rm -f "$DUMP_FILE" "${DUMP_FILE}.sha256"
  # Checksum the final encrypted artifact.
  sha256sum "${BASE}.dump.gpg" > "${BASE}.dump.gpg.sha256"
  echo "backup-postgres: encrypted backup written (${BASE}.dump.gpg)"
fi

# Prune backups older than the retention window. Only our own koranco-*
# artifacts are considered; we never delete other files.
PRUNE_BEFORE="$(date -u -d "-${RETENTION_DAYS} days" +%Y%m%dT%H%M%SZ)"
find "$KORANCO_BACKUP_DIR" -type f \
  -name "koranco-${PGDATABASE}-*.dump" \
  ! -newermt "$PRUNE_BEFORE" -delete 2>/dev/null || true

echo "backup-postgres: retention ${RETENTION_DAYS} days applied; backup complete"
