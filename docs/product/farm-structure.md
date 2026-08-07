# Farm structure register

## Generic FarmUnit

The initial register uses one `FarmUnit` model for the currently approved `field` and `block` concepts. It does not hard-code an unconfirmed Farm → Section → Field → Block hierarchy. Each unit has a stable UUID, explicit unique code, readable name, constrained type, optional parent, and active/inactive status.

Parenthood is optional. A block may be placed beneath a field, but the system does not require that relationship. This keeps current records useful while Koranco confirms official terminology and structure. Maps, geometry, acreage, crop variety, soil, tenure, and ownership are intentionally absent.

## Hierarchy rules

- a unit cannot parent itself;
- a parent must exist;
- parent changes cannot create a cycle;
- an active unit cannot be newly assigned beneath an inactive parent;
- historical parent relationships may remain when a parent is later deactivated.

A small PostgreSQL advisory transaction lock serializes hierarchy changes so concurrent edits cannot create a cycle. No tree library or graph infrastructure is used.

## Lifecycle and history

Managers create, edit, deactivate, and reactivate units. Supervisors are read-only. Records cannot be deleted through the API. Operational audit events preserve creation, updates, and lifecycle changes with responsible application-user attribution.

## Unresolved

Koranco must confirm official field/block terminology, hierarchy requirements, existing codes, migration sources, and whether later workflows genuinely require geometry, acreage, variety, or additional unit types.
