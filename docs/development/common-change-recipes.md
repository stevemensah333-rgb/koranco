# Common change recipes

Practical step-by-step recipes for the two most frequent domain changes. They
exist so a new engineer does not have to reverse-engineer the repository to
make a normal, safe change. The patterns below are observed from the existing
codebase; follow the most recent example (migration `0009`, a recent report
feature) rather than inventing a parallel structure.

## Add a permission

A permission is enforced in the backend and only presented in the frontend
after the session reports it. Add it in four places:

1. **`apps/api/src/koranco/identity/permissions.py`** — add a member to the
   `Permission` enum, and grant it in `ROLE_PERMISSIONS` where appropriate.
2. **`apps/api/src/koranco/identity/models.py`** — extend the
   `ck_user_permissions_known_permission` check constraint's `permission IN (...)`
   list with the new value.
3. **A new Alembic migration** — rebuild the check constraint and backfill the
   new permission for existing users, exactly like migration `0009`
   (`add_column` there is unrelated; copy its `drop_constraint` /
   `create_check_constraint` / `INSERT ... SELECT ... ON CONFLICT DO NOTHING`
   pattern). See `docs/operations/database-migrations.md` before writing one.
4. **Tests** — extend the relevant authorization matrix test (e.g.
   `apps/api/tests/test_reports.py` for `reports.read`) with allowed and denied
   cases.

The frontend does not need a code change to *enforce* anything: it gates UI on
`user.permissions.includes("...")` and the backend remains authoritative.

## Add a field to a domain

The chain below matches every implemented domain. Example: adding a field to
Harvest touches the same files a Worker or FarmUnit field would.

1. **Model** (`apps/api/src/koranco/<domain>/models.py`) — add the mapped
   column plus any DB-level constraint/invariant.
2. **Migration** — `uv run alembic revision --autogenerate -m "<change>"` in
   `apps/api`, review the generated migration, apply it, and run
   `uv run alembic check` afterwards (see `docs/operations/database-migrations.md`).
3. **API schema** (`apps/api/src/koranco/<domain>/schemas.py`) — add the field
   to the request and/or response models (Pydantic). Request-side validation
   belongs here.
4. **Service** (`apps/api/src/koranco/<domain>/service.py`) — copy the value
   into the model in the create/update functions, and include it in
   `*_state()` snapshots that feed operational audit before/after values.
5. **Route** — only if the field is a filter or a new endpoint; CRUD routes
   usually need no change because they pass the whole request schema through.
6. **Frontend type + API client** (`apps/web/src/modules/<domain>/api.ts`) —
   add the field to the TypeScript types and, if it is a filter, to the
   `URLSearchParams` builder.
7. **Frontend UI** — the register/workspace component that displays/edits the
   field (e.g. `harvest-workspace.tsx`). If the field must also work offline,
   mirror it in the local draft type and the cache/queue helpers in
   `modules/attendance/offline/db.ts` (see the workspace header comments).
8. **Tests** — extend the domain's backend integration test and the frontend
   component test.

### Draft-save caveat (Attendance)

Attendance draft saves replace the whole roster (see
`docs/product/attendance.md`); per-entry fields follow the same replace
semantics and do not need per-entry diffing logic.

## Add a normal migration

Follow `docs/operations/database-migrations.md`: review the migration, back up
before risky changes, apply to test/staging first, run `alembic check` for
drift, and never rewrite an already-applied migration.
