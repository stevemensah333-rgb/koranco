# Worker register

## Purpose and identity

A Worker is a stable operational farm entity that later attendance and harvest records can reference. It is not an authenticated `ApplicationUser`, and this phase creates no link or automatic account provisioning between the two concepts.

Each worker has a UUID for database relationships and an explicit human-readable `worker_code`. Codes are trimmed but otherwise preserve meaningful case and format. They are unique and stable; names are not unique. Existing Koranco identifiers should be preserved during migration rather than replaced with generated codes.

## Current data

The register contains only:

- worker code;
- full name;
- active or inactive status;
- creation/update timestamps and responsible application users.

It deliberately excludes address, birth date, national ID, bank/payroll information, phone number, gender, emergency contacts, biometrics, and HR notes.

## Lifecycle and history

Managers create and update workers and explicitly deactivate or reactivate them. Supervisors have read-only access. Records cannot be deleted through the API. Inactive workers remain queryable and available for future historical references, but future roster selection should default to active workers.

Creation, update, deactivation, and reactivation append operational audit events with actor, request ID, timestamp, and meaningful before/after values. Names are never used for automatic duplicate detection, and merge behavior remains deferred.

## Unresolved

Koranco must confirm existing worker-number formats, migration sources, worker categories, expected volumes, and whether any additional personal data is genuinely necessary.
