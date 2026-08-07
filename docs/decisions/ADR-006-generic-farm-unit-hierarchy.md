# ADR-006: Minimal generic FarmUnit hierarchy

- Status: Accepted
- Date: 2026-08-07

## Context

Koranco needs stable field/block references before its exact land hierarchy and terminology are confirmed. Hard-coding a deeper hierarchy would turn assumptions into schema constraints and make later correction costly.

## Decision

Represent current fields and blocks as one `FarmUnit` entity with constrained `field` or `block` type and an optional self-referencing parent. Do not require a block parent. Reject missing parents, self-parenting, cycles, and new active relationships beneath inactive parents. Serialize hierarchy mutations with one transaction-scoped PostgreSQL advisory lock and perform understandable ancestor traversal in the application.

## Consequences

- Current field/block records have stable identifiers without pretending the final hierarchy is known.
- Codes remain globally unique across both types.
- Historical relationships survive deactivation.
- Adding a confirmed new type or stronger hierarchy rule requires a reviewed migration and documentation update.
- Geometry, acreage, crop, soil, ownership, and mapping remain outside this decision.
