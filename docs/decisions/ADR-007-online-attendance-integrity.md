# ADR-007: Online attendance integrity and duplicate boundary

- Status: Accepted
- Date: 2026-08-07

## Context

The confirmed first attendance workflow is a Supervisor-led online roster, but Koranco has not confirmed whether one or several legitimately distinct attendance sessions can exist on an operational date. Enforcing one session per date would invent a business rule; allowing unrestricted retries could create duplicate submitted facts.

## Decision

Store a session and its Worker entries as normalized records. Use explicit draft and submitted states, optimistic integer versions, a row lock during submission, and append-only audit events for submission and corrections. Make repeat submission of the same session safe.

For a submitted session, calculate a SHA-256 fingerprint from the sorted stable Worker identifiers. Enforce a partial PostgreSQL unique constraint on date plus fingerprint for submitted sessions. Do not enforce one session per date. Submitted sessions cannot be deleted, and correction happens at entry level with a reason and before/after audit state.

## Consequences

- Retries of one submission do not create another attendance fact.
- Two submitted sessions with the same date and Worker population are rejected even if entry statuses differ; an authorized user must correct the existing fact.
- Distinct Worker populations can be submitted on the same date until Koranco confirms the true business boundary.
- The fingerprint is a domain duplicate guard, not a general transport-idempotency protocol and not the future offline operation identifier.
- A later confirmed site, shift, crew, or operational-day boundary may require a reviewed schema migration and replacement uniqueness rule.

