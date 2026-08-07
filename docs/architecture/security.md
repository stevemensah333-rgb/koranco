# Security principles

## Trust boundaries

Browsers, devices, networks, imported files, and all request data are untrusted. The backend is the enforcement boundary for authentication, authorization, validation, and business rules. PostgreSQL is authoritative, but database access and migrations also require controlled credentials and review.

Authentication is application-managed with PostgreSQL-backed sessions as decided in [ADR-004](../decisions/ADR-004-application-managed-authentication.md). Detailed credential, session, CSRF, bootstrap, and permission behavior is documented in [authentication and authorization](authentication.md). Koranco's organizational roles and account-administration ownership remain unresolved.

## Authorization

- Enforce least privilege on every protected backend operation, including reads, corrections, exports, audit access, and administration.
- Treat frontend visibility as usability only, never authorization.
- Define permissions centrally and map only confirmed Koranco roles to them.
- Scope data queries as required; checking permission after loading or returning data is too late.
- Record security-sensitive administrative actions appropriately.

## Data handling

- Collect only worker personal data justified by an approved operational need.
- Classify sensitive data and restrict its use in screens, exports, logs, audit events, support artifacts, and non-production environments.
- Validate untrusted input server-side and encode output appropriately for its destination.
- Keep secrets out of source control, frontend bundles, logs, error responses, and audit records.
- Separate production from development and testing. Do not casually copy production data into lower environments.
- Encrypt data in transit and use suitable at-rest protections provided by the selected infrastructure.

## Audit records and logs

Audit history establishes who performed significant business or administrative actions and what changed. Operational logs support diagnosis and monitoring. Neither substitutes for the other. They require separate access, content, retention, and integrity decisions, and neither should contain passwords, tokens, or unnecessary personal data.

## Legal and governance consideration

The project must consider Ghana's Data Protection Act, 2012 (Act 843), particularly when defining worker-data collection, access, retention, exports, backups, and incident procedures. This document does not claim that a legal or compliance assessment has been completed. Koranco should identify the responsible adviser or decision owner before personal-data behavior is finalized.
