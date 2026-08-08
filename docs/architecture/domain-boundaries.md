# Domain boundaries

These are conceptual module boundaries, not separate services. Exact entities, fields, workflows, and permissions remain subject to Koranco validation.

## Planned domains

### Identity and authorization

Owns authenticated application identities, centralized permissions, confirmed role mappings, and access decisions. Application users are distinct from workers in the farm register.

### Workers

Owns the operational worker register and its lifecycle. It must not become a speculative HR or payroll model.

### Farm structure

Owns confirmed organizational and physical farm concepts such as fields or blocks and their historical identities. Their exact hierarchy is unresolved.

### Attendance

Owns online attendance sessions and entries, draft/submission state, attendance validation, duplicate protection, correction, and query behavior. It references stable Worker identities but resolves their current display details from the Worker register. It has no FarmUnit, crew, task, or payroll relationship; adding one requires confirmed requirements.

### Harvest

Owns online harvest drafts, submission, quantity/unit validation, FarmUnit specificity, controlled correction, and query behavior. It references one stable FarmUnit and resolves current display identity from Farm Structure. It has no Worker/team, crop-cycle, quality, batch, destination, inventory, sales, or export relationship. Its two allowed units are provisional pending Koranco confirmation.

### Audit

Provides tamper-resistant history for significant actions and corrections across domains. It records facts about domain operations but must not contain their business rules.

### Synchronization

The implemented boundary coordinates durable delivery, owner isolation, idempotency, sync visibility, and conflicts only for attendance capture. Attendance-specific ingestion remains beside the attendance domain and invokes its rules. It is not a universal synchronization framework and does not decide domain conflicts independently.

A future offline Harvest phase is **proposed but not implemented** in [ADR-009](../decisions/ADR-009-harvest-offline-synchronization.md). It would follow this same rule: Harvest ingestion sits beside the Harvest domain with its own processed-operation table and endpoint, sharing only transport primitives (lease, owner isolation, connectivity, outbox state machine, update gate, status surface). Generalizing into a shared synchronization framework is deliberately deferred until a third offline domain demonstrates the need.

### Reporting

Produces approved operational and management views from authoritative domain data. It does not redefine source facts or invent metrics.

### Administration

Coordinates authorized operational configuration and user-facing administrative workflows. It must use, rather than bypass, domain ownership and authorization policies.

## Dependency rules

- Dependencies should follow explicit domain capabilities rather than direct manipulation of another domain's persistence details.
- Attendance references stable Workers. Harvest references one stable FarmUnit; neither module owns its referenced register.
- Audit and synchronization are supporting capabilities invoked by domain operations; they must not absorb domain rules.
- Reporting reads authoritative facts through deliberate query boundaries and must not mutate operational domains.
- Administration orchestrates approved capabilities and does not become a miscellaneous business-logic module.
- Circular module imports or mutual ownership indicate a boundary problem and should be resolved before adding abstractions.
- Cross-domain transactions may remain inside the monolith when correctness requires them; event-driven distribution is not a default.
