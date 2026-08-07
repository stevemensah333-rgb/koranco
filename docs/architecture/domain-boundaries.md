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

Owns confirmed attendance capture, validation, correction, and query behavior. It refers to workers and may refer to farm structure after those relationships are validated.

### Harvest

Owns confirmed harvest capture, validation, correction, and query behavior. Its units, aggregation boundary, and relationships remain unresolved.

### Audit

Provides tamper-resistant history for significant actions and corrections across domains. It records facts about domain operations but must not contain their business rules.

### Synchronization

Coordinates durable delivery, idempotency, sync visibility, and conflict handling for explicitly offline-capable domain operations. It does not decide domain conflicts independently; the owning domain defines their meaning.

### Reporting

Produces approved operational and management views from authoritative domain data. It does not redefine source facts or invent metrics.

### Administration

Coordinates authorized operational configuration and user-facing administrative workflows. It must use, rather than bypass, domain ownership and authorization policies.

## Dependency rules

- Dependencies should follow explicit domain capabilities rather than direct manipulation of another domain's persistence details.
- Attendance and harvest may reference stable identities from workers and farm structure, but those reference requirements must be confirmed.
- Audit and synchronization are supporting capabilities invoked by domain operations; they must not absorb domain rules.
- Reporting reads authoritative facts through deliberate query boundaries and must not mutate operational domains.
- Administration orchestrates approved capabilities and does not become a miscellaneous business-logic module.
- Circular module imports or mutual ownership indicate a boundary problem and should be resolved before adding abstractions.
- Cross-domain transactions may remain inside the monolith when correctness requires them; event-driven distribution is not a default.

