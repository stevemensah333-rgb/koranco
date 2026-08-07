# ADR-005: Fixed Koranco roles mapped to centralized permissions

- Status: Accepted
- Date: 2026-08-07

## Context

Koranco has approved three application roles: Manager, Supervisor, and Worker. Application users remain separate from farm-worker records. The system needs understandable administration and immediate revocation without a generic enterprise RBAC engine.

## Decision

Store one constrained role per application user and define the role-to-permission mapping in `identity/permissions.py`. Backend permission dependencies remain the enforcement mechanism. Managers administer accounts and security access. Operational modules add permissions only when their workflows are approved; the Worker and FarmUnit registers later grant Supervisors read-only access while Worker application accounts retain only system status.

Manager-created accounts use an explicit temporary password supplied through the operational form. Only its Argon2id hash is stored, it is never returned, and the user must replace it after first login. Manager-assisted resets use the same reset-required state and revoke all existing sessions.

An application-level PostgreSQL advisory transaction lock serializes Manager demotion and disabling. The protected transaction verifies that another active Manager remains. This prevents concurrent administrative operations from leaving the system with no active Manager.

## Consequences

- Role names and permissions change only through reviewed code and migrations.
- Promoting, demoting, disabling, or resetting a Manager requires authentication within the preceding 15 minutes or password re-entry.
- Sessions have a 12-hour absolute lifetime and concurrent sessions are permitted.
- Worker accounts are optional; no farm-worker record or automatic application account is created.
- Security events are retained for at least 12 months initially; automatic pruning is not enabled.
