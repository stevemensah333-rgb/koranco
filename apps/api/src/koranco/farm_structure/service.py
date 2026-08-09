import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from koranco.farm_structure.models import FarmUnit
from koranco.identity.models import ApplicationUser
from koranco.operational_audit.service import record_operational_event

# Arbitrary unique key serializing FarmUnit hierarchy mutations so parent/cycle
# validation cannot race with concurrent re-parenting (ADR-006).
HIERARCHY_LOCK = 7_120_041


def unit_state(unit: FarmUnit) -> dict[str, Any]:
    return {
        "code": unit.code,
        "name": unit.name,
        "unit_type": unit.unit_type,
        "parent_id": str(unit.parent_id) if unit.parent_id else None,
        "status": unit.status,
    }


def load_unit(session: Session, unit_id: uuid.UUID, *, for_update: bool = False) -> FarmUnit:
    statement = select(FarmUnit).where(FarmUnit.id == unit_id)
    if for_update:
        statement = statement.with_for_update()
    unit = session.scalar(statement)
    if unit is None:
        raise HTTPException(status_code=404, detail="Farm unit not found")
    return unit


def validate_parent(
    session: Session,
    unit_id: uuid.UUID | None,
    parent_id: uuid.UUID | None,
    require_active_parent: bool,
) -> None:
    session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": HIERARCHY_LOCK})
    if parent_id is None:
        return
    if parent_id == unit_id:
        raise HTTPException(status_code=422, detail="A farm unit cannot be its own parent")
    parent = session.get(FarmUnit, parent_id)
    if parent is None:
        raise HTTPException(status_code=422, detail="The selected parent unit is unavailable")
    if require_active_parent and parent.status != "active":
        raise HTTPException(
            status_code=422,
            detail="An active farm unit cannot be assigned beneath an inactive parent",
        )
    visited: set[uuid.UUID] = set()
    cursor: FarmUnit | None = parent
    while cursor is not None:
        if cursor.id == unit_id:
            raise HTTPException(status_code=422, detail="The selected parent would create a cycle")
        if cursor.id in visited:
            raise HTTPException(status_code=409, detail="Existing farm hierarchy contains a cycle")
        visited.add(cursor.id)
        cursor = session.get(FarmUnit, cursor.parent_id) if cursor.parent_id else None


def create_unit(
    session: Session,
    actor: ApplicationUser,
    code: str,
    name: str,
    unit_type: str,
    parent_id: uuid.UUID | None,
    request_id: str | None,
) -> FarmUnit:
    validate_parent(session, None, parent_id, True)
    unit = FarmUnit(
        code=code,
        name=name,
        unit_type=unit_type,
        parent_id=parent_id,
        status="active",
        created_by=actor.id,
        updated_by=actor.id,
    )
    session.add(unit)
    session.flush()
    record_operational_event(
        session,
        actor=actor,
        action="created",
        entity_type="farm_unit",
        entity_id=unit.id,
        request_id=request_id,
        before=None,
        after=unit_state(unit),
    )
    return unit


def update_unit(
    session: Session,
    actor: ApplicationUser,
    unit: FarmUnit,
    code: str,
    name: str,
    unit_type: str,
    parent_id: uuid.UUID | None,
    request_id: str | None,
) -> None:
    validate_parent(
        session,
        unit.id,
        parent_id,
        unit.status == "active" and parent_id != unit.parent_id,
    )
    before = unit_state(unit)
    unit.code = code
    unit.name = name
    unit.unit_type = unit_type
    unit.parent_id = parent_id
    unit.updated_by = actor.id
    session.flush()
    record_operational_event(
        session,
        actor=actor,
        action="updated",
        entity_type="farm_unit",
        entity_id=unit.id,
        request_id=request_id,
        before=before,
        after=unit_state(unit),
    )


def set_unit_status(
    session: Session,
    actor: ApplicationUser,
    unit: FarmUnit,
    status: str,
    request_id: str | None,
    reason: str | None,
) -> None:
    if unit.status == status:
        return
    if status == "active":
        validate_parent(session, unit.id, unit.parent_id, True)
    before = unit_state(unit)
    unit.status = status
    unit.updated_by = actor.id
    session.flush()
    action = "deactivated" if status == "inactive" else "reactivated"
    record_operational_event(
        session,
        actor=actor,
        action=action,
        entity_type="farm_unit",
        entity_id=unit.id,
        request_id=request_id,
        before=before,
        after=unit_state(unit),
        reason=reason,
    )


def change_unit_status(
    session: Session,
    actor: ApplicationUser,
    unit_id: uuid.UUID,
    status: str,
    request_id: str | None,
    reason: str | None,
) -> FarmUnit:
    """Load, change, and return a FarmUnit's status in one HTTP-request unit."""
    unit = load_unit(session, unit_id, for_update=True)
    set_unit_status(session, actor, unit, status, request_id, reason)
    return unit
