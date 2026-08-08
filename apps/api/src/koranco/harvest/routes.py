import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from koranco.harvest.models import HarvestRecord
from koranco.harvest.schemas import (
    CorrectHarvestRequest,
    CreateHarvestRequest,
    HarvestRecordListResponse,
    HarvestRecordResponse,
    HarvestSyncRequest,
    HarvestSyncResponse,
    HarvestUnit,
    UpdateHarvestDraftRequest,
)
from koranco.harvest.service import (
    correct_record,
    create_draft,
    harvest_state,
    load_record,
    response,
    submit_record,
    update_draft,
)
from koranco.harvest.sync import ingest_sync_operation
from koranco.identity.dependencies import (
    AuthContext,
    DatabaseSession,
    require_csrf,
    require_permission,
)
from koranco.identity.models import ApplicationUser
from koranco.identity.permissions import Permission
from koranco.operational_audit.models import OperationalAuditEvent
from koranco.operational_audit.schemas import AuditEventListResponse, audit_response
from koranco.operational_audit.service import record_operational_event

router = APIRouter(prefix="/api/v1/harvest-records", tags=["harvest"])


@router.get("", response_model=HarvestRecordListResponse)
def list_records(
    db: DatabaseSession,
    _auth: Annotated[AuthContext, Depends(require_permission(Permission.HARVEST_READ))],
    status: Annotated[str | None, Query(pattern="^(draft|submitted)$")] = None,
    unit: HarvestUnit | None = None,
    farm_unit_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> HarvestRecordListResponse:
    if date_from and date_to and date_to < date_from:
        raise HTTPException(status_code=422, detail="date_to cannot precede date_from")
    filters = []
    if status:
        filters.append(HarvestRecord.status == status)
    if unit:
        filters.append(HarvestRecord.unit == unit)
    if farm_unit_id:
        filters.append(HarvestRecord.farm_unit_id == farm_unit_id)
    if date_from:
        filters.append(HarvestRecord.harvest_date >= date_from)
    if date_to:
        filters.append(HarvestRecord.harvest_date <= date_to)
    total = db.scalar(select(func.count()).select_from(HarvestRecord).where(*filters)) or 0
    records = db.scalars(
        select(HarvestRecord)
        .options(
            joinedload(HarvestRecord.farm_unit),
            joinedload(HarvestRecord.creator),
            joinedload(HarvestRecord.submitter),
        )
        .where(*filters)
        .order_by(HarvestRecord.harvest_date.desc(), HarvestRecord.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return HarvestRecordListResponse(
        items=[response(record) for record in records], total=total, limit=limit, offset=offset
    )


@router.get("/{record_id}", response_model=HarvestRecordResponse)
def view_record(
    record_id: uuid.UUID,
    db: DatabaseSession,
    _auth: Annotated[AuthContext, Depends(require_permission(Permission.HARVEST_READ))],
) -> HarvestRecordResponse:
    return response(load_record(db, record_id))


@router.post("", response_model=HarvestRecordResponse, status_code=201)
def add_record(
    payload: CreateHarvestRequest,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.HARVEST_RECORD))],
) -> HarvestRecordResponse:
    record = create_draft(db, auth.user, payload, request.state.request_id, payload.id)
    return response(load_record(db, record.id))


@router.put("/{record_id}/draft", response_model=HarvestRecordResponse)
def save_draft(
    record_id: uuid.UUID,
    payload: UpdateHarvestDraftRequest,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.HARVEST_RECORD))],
) -> HarvestRecordResponse:
    record = load_record(db, record_id, for_update=True)
    update_draft(db, record, payload, payload.expected_version)
    db.expire(record)
    return response(load_record(db, record_id))


@router.post("/{record_id}/submit", response_model=HarvestRecordResponse)
def submit(
    record_id: uuid.UUID,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.HARVEST_RECORD))],
) -> HarvestRecordResponse:
    record = load_record(db, record_id, for_update=True)
    submit_record(db, auth.user, record, request.state.request_id)
    db.expire(record)
    return response(load_record(db, record_id))


@router.post("/{record_id}/correct", response_model=HarvestRecordResponse)
def correct(
    record_id: uuid.UUID,
    payload: CorrectHarvestRequest,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.HARVEST_CORRECT))],
) -> HarvestRecordResponse:
    record = load_record(db, record_id, for_update=True)
    correct_record(
        db,
        auth.user,
        record,
        payload,
        payload.expected_version,
        payload.reason,
        request.state.request_id,
    )
    db.expire(record)
    return response(load_record(db, record_id))


@router.post("/{record_id}/discard", status_code=204)
def discard(
    record_id: uuid.UUID,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.HARVEST_RECORD))],
) -> None:
    record = load_record(db, record_id, for_update=True)
    if record.status != "draft":
        raise HTTPException(status_code=409, detail="Submitted harvest cannot be discarded")
    record_operational_event(
        db,
        actor=auth.user,
        action="discarded",
        entity_type="harvest_record",
        entity_id=record.id,
        request_id=request.state.request_id,
        before=harvest_state(record),
        after=None,
    )
    db.delete(record)


@router.get("/{record_id}/audit", response_model=AuditEventListResponse)
def record_audit(
    record_id: uuid.UUID,
    db: DatabaseSession,
    _auth: Annotated[AuthContext, Depends(require_permission(Permission.HARVEST_READ))],
) -> AuditEventListResponse:
    load_record(db, record_id)
    rows = db.execute(
        select(OperationalAuditEvent, ApplicationUser.display_name)
        .join(ApplicationUser, ApplicationUser.id == OperationalAuditEvent.actor_user_id)
        .where(
            OperationalAuditEvent.entity_type == "harvest_record",
            OperationalAuditEvent.entity_id == record_id,
        )
        .order_by(OperationalAuditEvent.occurred_at.desc())
    ).all()
    return AuditEventListResponse(
        items=[audit_response(event, name) for event, name in rows], total=len(rows)
    )


@router.post("/sync", response_model=HarvestSyncResponse)
def sync_harvest(
    payload: HarvestSyncRequest,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.HARVEST_RECORD))],
) -> HarvestSyncResponse:
    return ingest_sync_operation(
        db,
        payload=payload,
        actor=auth.user,
        request_id=request.state.request_id,
    )
