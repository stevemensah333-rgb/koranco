import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from koranco.farm_structure.models import FarmUnit
from koranco.harvest.models import HarvestRecord
from koranco.harvest.schemas import HarvestRecordResponse, HarvestValues
from koranco.identity.models import ApplicationUser
from koranco.operational_audit.service import record_operational_event


def format_quantity(quantity: Decimal) -> str:
    return str(quantity.quantize(Decimal("0.000")))


def harvest_state(record: HarvestRecord) -> dict[str, Any]:
    return {
        "harvest_date": record.harvest_date.isoformat(),
        "farm_unit_id": str(record.farm_unit_id),
        "quantity": format_quantity(record.quantity),
        "unit": record.unit,
        "notes": record.notes,
        "status": record.status,
        "version": record.version,
    }


def load_record(db: Session, record_id: uuid.UUID, *, for_update: bool = False) -> HarvestRecord:
    statement = (
        select(HarvestRecord)
        .options(
            joinedload(HarvestRecord.farm_unit),
            joinedload(HarvestRecord.creator),
            joinedload(HarvestRecord.submitter),
        )
        .where(HarvestRecord.id == record_id)
    )
    if for_update:
        statement = statement.with_for_update(of=HarvestRecord)
    record = db.scalar(statement)
    if record is None:
        raise HTTPException(status_code=404, detail="Harvest record not found")
    return record


def response(record: HarvestRecord) -> HarvestRecordResponse:
    return HarvestRecordResponse(
        id=record.id,
        harvest_date=record.harvest_date,
        farm_unit_id=record.farm_unit_id,
        farm_unit_code=record.farm_unit.code,
        farm_unit_name=record.farm_unit.name,
        farm_unit_type=record.farm_unit.unit_type,
        farm_unit_active=record.farm_unit.status == "active",
        quantity=record.quantity,
        unit=record.unit,
        notes=record.notes,
        status=record.status,
        version=record.version,
        created_by=record.created_by,
        created_by_name=record.creator.display_name,
        created_at=record.created_at,
        updated_at=record.updated_at,
        submitted_by=record.submitted_by,
        submitted_by_name=record.submitter.display_name if record.submitter else None,
        submitted_at=record.submitted_at,
    )


def require_farm_unit_exists(db: Session, farm_unit_id: uuid.UUID) -> FarmUnit:
    """Return the FarmUnit or reject with 422. Used for draft work, where an
    inactive unit may still be referenced by an existing draft."""
    unit = db.get(FarmUnit, farm_unit_id)
    if unit is None:
        raise HTTPException(status_code=422, detail="The selected FarmUnit is unavailable")
    return unit


def require_operational_farm_unit(db: Session, farm_unit_id: uuid.UUID) -> FarmUnit:
    """Return an active, unambiguous FarmUnit or reject.

    Submission and correction require an active unit. When an active Field has
    active child Blocks, the Field is ambiguous and the user must select a
    Block (see docs/product/harvest.md)."""
    unit = require_farm_unit_exists(db, farm_unit_id)
    if unit.status != "active":
        raise HTTPException(status_code=409, detail="The selected FarmUnit is inactive")
    if unit.unit_type == "field":
        has_active_block = db.scalar(
            select(FarmUnit.id)
            .where(
                FarmUnit.parent_id == unit.id,
                FarmUnit.unit_type == "block",
                FarmUnit.status == "active",
            )
            .limit(1)
        )
        if has_active_block:
            raise HTTPException(
                status_code=409,
                detail="Select an active Block because this Field has active child Blocks",
            )
    return unit


def apply_values(record: HarvestRecord, values: HarvestValues) -> None:
    record.harvest_date = values.harvest_date
    record.farm_unit_id = values.farm_unit_id
    record.quantity = values.quantity
    record.unit = values.unit
    record.notes = values.notes


def create_draft(
    db: Session,
    actor: ApplicationUser,
    values: HarvestValues,
    request_id: str | None,
    record_id: uuid.UUID | None = None,
) -> HarvestRecord:
    require_farm_unit_exists(db, values.farm_unit_id)
    record = HarvestRecord(id=record_id or uuid.uuid4(), created_by=actor.id)
    apply_values(record, values)
    db.add(record)
    db.flush()
    record_operational_event(
        db,
        actor=actor,
        action="created",
        entity_type="harvest_record",
        entity_id=record.id,
        request_id=request_id,
        before=None,
        after=harvest_state(record),
    )
    return record


def update_draft(
    db: Session, record: HarvestRecord, values: HarvestValues, expected_version: int
) -> None:
    if record.status != "draft":
        raise HTTPException(status_code=409, detail="Submitted harvest cannot be edited as a draft")
    if record.version != expected_version:
        raise HTTPException(status_code=409, detail="Harvest draft changed; reload before saving")
    require_farm_unit_exists(db, values.farm_unit_id)
    apply_values(record, values)
    record.version += 1
    db.flush()


def submit_record(
    db: Session, actor: ApplicationUser, record: HarvestRecord, request_id: str | None
) -> None:
    if record.status == "submitted":
        return
    require_operational_farm_unit(db, record.farm_unit_id)
    before = harvest_state(record)
    record.status = "submitted"
    record.submitted_by = actor.id
    record.submitted_at = datetime.now(UTC)
    record.version += 1
    db.flush()
    record_operational_event(
        db,
        actor=actor,
        action="submitted",
        entity_type="harvest_record",
        entity_id=record.id,
        request_id=request_id,
        before=before,
        after=harvest_state(record),
    )


def correct_record(
    db: Session,
    actor: ApplicationUser,
    record: HarvestRecord,
    values: HarvestValues,
    expected_version: int,
    reason: str,
    request_id: str | None,
) -> None:
    if record.status != "submitted":
        raise HTTPException(status_code=409, detail="Only submitted harvest can be corrected")
    if record.version != expected_version:
        raise HTTPException(
            status_code=409, detail="Harvest record changed; reload before correcting"
        )
    require_operational_farm_unit(db, values.farm_unit_id)
    before = harvest_state(record)
    apply_values(record, values)
    record.version += 1
    db.flush()
    record_operational_event(
        db,
        actor=actor,
        action="corrected",
        entity_type="harvest_record",
        entity_id=record.id,
        request_id=request_id,
        before=before,
        after=harvest_state(record),
        reason=reason,
    )
