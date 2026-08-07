# Authentication and authorization

## Identity boundary

An application user is authorized to access Koranco software. A farm worker is represented in operational records. The current schema contains only application users and must not be extended with employment or worker-profile fields.

Application users have a normalized login identifier, display name for UI/audit attribution, Argon2id password hash, active/disabled status, and timestamps. Login identifiers are case-folded and restricted to 3–64 letters, numbers, periods, underscores, or hyphens. Passwords require 12–128 characters without arbitrary composition rules.

## Session lifecycle

Successful login creates independent random session and CSRF tokens. The browser receives:

- `koranco_session`: HTTP-only, SameSite Lax, path `/`, Secure in production;
- `koranco_csrf`: readable only so the frontend can echo it in the CSRF header, SameSite Lax, path `/`, Secure in production.

PostgreSQL stores SHA-256 token digests, not reusable raw values. Sessions expire after 12 hours by default. Logout sets `revoked_at` before clearing cookies. Expired, revoked, malformed, and unknown sessions receive the same authentication-required response. Disabled accounts cannot log in; an existing session is revoked and rejected on its next request.

Expired and revoked rows require periodic operational cleanup after retention requirements are approved. Cleanup must not erase security events or actor records.

## CSRF and CORS

CORS and CSRF are separate controls. CORS permits credentialed browser requests only from configured origins. Every state-changing authentication endpoint requires an `Origin` exactly matching `KORANCO_CSRF_TRUSTED_ORIGINS`. Authenticated state changes also require the CSRF cookie value in `X-CSRF-Token`, matched in constant time and checked against the session's stored digest.

SameSite Lax adds browser protection but is not treated as the sole CSRF defense. Production must use HTTPS so Secure cookies are effective. Deployments behind proxies must preserve the original Origin accurately.

## Authorization

Backend dependencies load the current user and centrally enforce permissions. Koranco's fixed roles are Manager, Supervisor, and Worker; the authoritative mapping is in `identity/permissions.py`. Managers receive approved account, session, security-event, Worker-register, FarmUnit, and operational-audit permissions. Supervisors receive read-only Worker and FarmUnit access. Worker application accounts receive only `system.status.read`. Route handlers depend on permissions rather than role comparisons.

Application users and farm workers remain different entities. Worker accounts are optional and are never created automatically from farm-worker records.

The final active Manager cannot be disabled or demoted. A PostgreSQL advisory transaction lock serializes these changes before verifying another active Manager remains. Manager-sensitive actions require authentication within 15 minutes or re-entry of the current Manager password.

## Account lifecycle and recovery

Managers create accounts with a one-use initial password communicated privately. Only its Argon2id hash is stored and the API never returns it. The new user must select a new password before accessing protected capabilities. There is no public registration, email, SMS, or magic-link recovery.

Manager-assisted reset replaces the credential hash, requires a password change, and revokes all sessions. Another active Manager may reset a Manager. If every Manager loses access, `docs/operations/manager-recovery.md` documents a direct-operator recovery command that records a security event and is not exposed over HTTP.

## Security events and login abuse

Security events record authentication, account creation/status/role changes, password actions, session revocation, bootstrap, and operator recovery. Administrative events distinguish actor and subject. They never contain passwords or session/CSRF tokens and remain distinct from future business-record audit history. The initial retention policy is at least 12 months; no automatic destructive pruning is enabled.

Failed attempts are counted by a SHA-256 digest of the normalized login identifier. Five failures within 15 minutes temporarily block further attempts for that identifier; missing and existing identifiers follow the same process. A successful login removes recent failures. This provides proportionate single-instance protection but does not replace network-level rate limits, monitoring, or distributed attack controls.

## Bootstrap

After migrations, create the first application user interactively:

```sh
cd apps/api
uv run python -m koranco.identity.bootstrap \
  --login <login-identifier> \
  --display-name "<display name>" \
  --confirm-bootstrap
```

The command prompts twice for the password without placing it in shell history, refuses to run without confirmation, and refuses if any application user already exists. It creates the first Manager with approved Manager permissions and records `bootstrap_user_created`. It is not a permanent backdoor.

## Offline implications

Authentication and management require connectivity; passwords are never validated offline. Future Supervisor field workflows may temporarily continue after prior successful online authentication, but duration and authorization reconciliation belong to later sync design. Disabling an offline user cannot reach the device immediately. Legitimately queued work must not simply be deleted when revocation is discovered; later synchronization policy must define review and attribution.
