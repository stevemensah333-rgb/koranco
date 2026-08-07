# ADR-004: Application-managed authentication with PostgreSQL sessions

- Status: Accepted
- Date: 2026-08-07

## Context

Koranco's initial deployment is an internal operational system with a controlled user population. It needs attributable application identities, backend authorization, deliberate account disabling, and sessions that can be invalidated centrally. No confirmed requirement currently needs social identity, federation, public registration, or a separately operated identity platform.

Application users are people authorized to access the software. They are not farm workers, and identity tables must not become worker or employment records.

## Decision

Manage application-user credentials in the FastAPI/PostgreSQL application. Hash passwords with Argon2id through `argon2-cffi`. Use cryptographically random server-managed session tokens in secure HTTP-only cookies and store only SHA-256 token digests in PostgreSQL. Enforce permissions in backend dependencies. Do not issue browser-stored JWT access tokens.

State-changing cookie-authenticated requests require both an explicitly trusted `Origin` and a CSRF token supplied from a separate SameSite cookie. PostgreSQL also stores login-attempt throttling data and security events.

## Alternatives considered

- External identity services would reduce local credential handling but introduce vendor, connectivity, configuration, account-ownership, and handover dependencies before Koranco's identity environment is known.
- Self-hosted identity platforms add a separate security-critical service and operational burden disproportionate to current needs.
- Browser JWTs complicate revocation and risk reusable-token exposure through browser storage.

## Consequences

- Koranco must operate credential provisioning, password recovery, session cleanup, monitoring, and database protection.
- No public registration or email recovery exists. The first user is created through an intentional one-time command.
- Account status is checked on every authenticated request; a disabled account's existing sessions are rejected and revoked when next used.
- Permission definitions are centralized, but Koranco roles remain unresolved.
- Future offline field behavior cannot assume an online session indefinitely and requires a separate approved policy.

## Reconsideration conditions

Reconsider an external identity provider if Koranco adopts a supported organizational identity system, requires federation or MFA at scale, needs centrally managed lifecycle automation, or demonstrates that operating credentials internally creates unacceptable risk or support burden. Migration must preserve stable actor attribution and session revocation semantics.
