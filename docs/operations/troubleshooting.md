# Troubleshooting Guide

Symptom → first checks → safe actions → actions to avoid, for the incidents
that recur in operation. For broader incidents (outage, corruption, backups,
sync backlogs) also see [incident-response.md](incident-response.md).

## 1. Frontend 404 on a route

- **Symptoms**: a page returns 404 in production.
- **First checks**: does the route exist in `apps/web/src/app/`? Is the app
  version deployed newer/older than the route you expect? Is the URL a known
  dynamic route (`/attendance/<id>`, `/harvest/<id>`)?
- **Safe actions**: re-deploy the frontend; check the deployed build's route
  table (`next build` output); verify the link target exists.
- **Avoid**: adding a catch-all route to mask missing pages; treating the
  dev-only `/dev/design-system` (404s in production by design) as a bug.

## 2. API cannot start

- **Symptoms**: `uv run uvicorn koranco.main:app ...` exits immediately; Render
  service crashes on boot.
- **First checks**: settings validation — missing `KORANCO_ENVIRONMENT` or
  `KORANCO_DATABASE_URL` fails at startup; `KORANCO_CSRF_TRUSTED_ORIGINS` must
  be non-empty; `KORANCO_COOKIE_SAMESITE=none` requires production. Check the
  start command (`uv run uvicorn koranco.main:app --host 0.0.0.0 --port $PORT`)
  and that `.env` values are valid JSON for list variables.
- **Safe actions**: run the exact settings validators against your env;
  verify `uv sync --locked` completed; check `alembic` head matches models.
- **Avoid**: setting `KORANCO_ENVIRONMENT=production` locally to "fix" SameSite
  validation; committing `.env`.

## 3. Database connection failure

- **Symptoms**: API up but `/api/v1/readiness` = 503; `OperationalError` in logs.
- **First checks**: is PostgreSQL reachable (`docker compose ps` locally;
  Render dashboard for hosted)? Is `KORANCO_DATABASE_URL` correct and using
  `postgresql+psycopg://`? Did credentials change?
- **Safe actions**: test with `psql`; check `SELECT 1`; verify network
  allowlists (Render internal networking); check disk/connection limits.
- **Avoid**: pointing the app at a different database to "see if it works";
  changing the URL to a non-PostgreSQL backend (rejected by validation anyway).

## 4. Migration failure

- **Symptoms**: `alembic upgrade head` errors; CI backend job fails at the
  migration step; `alembic current` is behind head.
- **First checks**: which revision failed and why (duplicate column/table,
  constraint violation on existing rows, lock timeout); is the failure on a
  fresh DB (CI) or existing data?
- **Safe actions**: fix forward with a new corrective migration; verify a
  backup exists before touching a failing production migration; rehearse on a
  copy. See [database-migrations.md](database-migrations.md).
- **Avoid**: rewriting an already-applied migration; blindly running
  `downgrade` in production.

## 5. Login works but the session does not persist

- **Symptoms**: login succeeds, then the next request is 401; user is asked to
  sign in repeatedly.
- **First checks**: are both cookies present (`koranco_session` HTTP-only,
  `koranco_csrf`)? Cookie `Secure`/`SameSite` attributes correct for the
  scheme (`SameSite=none` requires HTTPS + Secure)? Is the CSRF token returned
  in the login response actually being sent in `X-CSRF-Token`?
- **Safe actions**: test in a normal (non-private) browser; check
  `/api/v1/auth/session` returns 200 with the cookie pair; verify session TTL
  (`KORANCO_SESSION_TTL_HOURS`).
- **Avoid**: extending the session TTL to work around cookie issues; storing
  the CSRF token in localStorage.

## 6. CORS error

- **Symptoms**: browser console `Access-Control-Allow-Origin` errors; API
  calls fail from the frontend.
- **First checks**: does `KORANCO_CORS_ORIGINS` exactly match the frontend
  origin (scheme + host + port)? Is the web app calling
  `NEXT_PUBLIC_API_ORIGIN` (not `localhost` when remote, not the Vercel origin
  when calling the API)?
- **Safe actions**: set both `KORANCO_CORS_ORIGINS` and
  `KORANCO_CSRF_TRUSTED_ORIGINS` to the same exact origin list; redeploy the
  API.
- **Avoid**: wildcard origins (rejected); adding `*` to trusted origins.

## 7. CSRF failure

- **Symptoms**: state-changing requests return 403 "CSRF validation failed".
- **First checks**: is the `Origin` header exactly one of
  `KORANCO_CSRF_TRUSTED_ORIGINS`? Is the `X-CSRF-Token` header present and
  matching the `koranco_csrf` cookie? Did the session (and its token digest)
  rotate after login?
- **Safe actions**: verify the login response's `csrf_token` is used for
  subsequent writes; refresh the page to re-run `/api/v1/auth/session`; check
  a proxy isn't rewriting/removing the Origin.
- **Avoid**: disabling CSRF for testing; trusting SameSite alone.

## 8. A user cannot synchronize offline work

- **Symptoms**: "Saved on this device. Waiting to sync." never clears; sync
  errors on the device.
- **First checks**: is the user signed in as the **same** account that created
  the work (owner isolation)? Is the lease valid (12h) and the account active
  with `attendance.record` / `harvest.record`? What does the sync endpoint
  return (look up the operation UUID in `*_sync_operations`)?
- **Safe actions**: ask the user to tap Sync now while connected; check
  `needs_attention` messages; verify reference data was prepared (cached
  Workers/FarmUnits).
- **Avoid**: telling the user to "clear browser data" (destroys the queue);
  manually deleting outbox rows.

## 9. Queued records need attention

- **Symptoms**: combined sync indicator shows items needing attention; drafts
  show a server message.
- **First checks**: read the `lastMessage` on the draft/outbox row — it states
  the reason (inactive FarmUnit, stale version, revoked permission, etc.).
- **Safe actions**: resolve the cause (reactivate the FarmUnit, re-prepare
  reference data, restore permission, sign in as the correct user) and retry.
- **Avoid**: editing a `needs_attention` draft's payload directly in IndexedDB;
  deleting it to "clear the error" without recovering the data.

## 10. Service worker seems stale

- **Symptoms**: field pages open an old version; updates don't take effect.
- **First checks**: activation is **deliberately held** while either domain has
  pending (non-`needs_attention`) work — that is the update gate working, not a
  bug. Is there queued work?
- **Safe actions**: synchronize all pending work, then reload/update. Verify
  the new build is deployed before testing.
- **Avoid**: adding `skipWaiting` to force updates (removes the safety gate).

## 11. Backup fails

- **Symptoms**: `backup-postgres.sh` exits non-zero; no new `.dump` file.
- **First checks**: required env (`PGHOST PGPORT PGUSER PGDATABASE
  KORANCO_BACKUP_DIR`); `pg_dump` on PATH; disk space; gpg configured when
  `KORANCO_BACKUP_GPG_RECIPIENT` is set.
- **Safe actions**: run the script manually with `set -x` to see the failing
  step; confirm a recent known-good backup exists; check retention pruning
  isn't deleting everything.
- **Avoid**: ignoring backup failures ("it will succeed next time"); storing
  credentials in the script or shell history.

## 12. Anything else

Check structured JSON logs (request_id, path, status_code) from
`common/logging.py`; match the request_id against security events and audit
events; then escalate per [incident-response.md](incident-response.md).
