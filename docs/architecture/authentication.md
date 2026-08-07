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

Backend dependencies load the current user and centrally enforce permissions. The only approved foundation permission is `system.status.read`, proving deny-by-default enforcement for the protected system-status endpoint. It is not a Koranco role. Adding permissions requires a reviewed code and database migration; role groupings await Koranco validation.

## Security events and login abuse

Security events currently record successful/failed login, temporary throttling, logout, disabled-account session revocation, and bootstrap creation. Events contain event type, optional known user, request identifier, and server timestamp—never passwords or session/CSRF tokens. They are distinct from future business-record audit history.

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

The command prompts twice for the password without placing it in shell history, refuses to run without confirmation, and refuses if any application user already exists. It grants only `system.status.read` and records `bootstrap_user_created`. It is not a permanent backdoor or a confirmed administrator role.

Account provisioning, recovery, role assignment, and account enable/disable interfaces remain unresolved and are not publicly exposed.

## Offline implications

Offline authentication is not implemented. Koranco must decide shared-device behavior, permitted offline duration, how disabled accounts affect disconnected devices, what local data is purged on logout, and how the responsible identity is retained on queued mutations. Until then, successful online authentication must not be interpreted as authorization to continue indefinitely offline.
