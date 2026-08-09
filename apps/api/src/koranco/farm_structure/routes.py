import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError

from koranco.db.session import DatabaseSession
from koranco.farm_structure.models import FarmUnit
from koranco.farm_structure.schemas import (
    FarmUnitCreateRequest,
    FarmUnitListResponse,
    FarmUnitResponse,
    FarmUnitType,
    FarmUnitUpdateRequest,
    LifecycleRequest,
)
from koranco.farm_structure.service import (
    change_unit_status,
    create_unit,
    load_unit,
    update_unit,
)
from koranco.identity.dependencies import (
    AuthContext,
    require_csrf,
    require_permission,
)
from koranco.identity.models import ApplicationUser
from koranco.identity.permissions import Permission
from koranco.operational_audit.models import OperationalAuditEvent
from koranco.operational_audit.schemas import AuditEventListResponse, audit_response

router = APIRouter(prefix="/api/v1/farm-units", tags=["farm structure"])


def response(unit: FarmUnit) -> FarmUnitResponse:
    return FarmUnitResponse.model_validate(unit, from_attributes=True)


@router.get("", response_model=FarmUnitListResponse)
def list_units(
    db: DatabaseSession,
    _auth: Annotated[AuthContext, Depends(require_permission(Permission.FARM_STRUCTURE_READ))],
    search: str | None = None,
    unit_type: FarmUnitType | None = None,
    status: Annotated[str | None, Query(pattern="^(active|inactive)$")] = None,
    parent_id: uuid.UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> FarmUnitListResponse:
    filters = []
    if search and search.strip():
        term = f"%{search.strip()}%"
        filters.append(or_(FarmUnit.code.ilike(term), FarmUnit.name.ilike(term)))
    if unit_type:
        filters.append(FarmUnit.unit_type == unit_type)
    if status:
        filters.append(FarmUnit.status == status)
    if parent_id:
        filters.append(FarmUnit.parent_id == parent_id)
    total = db.scalar(select(func.count()).select_from(FarmUnit).where(*filters)) or 0
    units = db.scalars(
        select(FarmUnit)
        .where(*filters)
        .order_by(FarmUnit.code, FarmUnit.id)
        .limit(limit)
        .offset(offset)
    ).all()
    return FarmUnitListResponse(
        items=[response(item) for item in units], total=total, limit=limit, offset=offset
    )


@router.get("/{unit_id}", response_model=FarmUnitResponse)
def view_unit(
    unit_id: uuid.UUID,
    db: DatabaseSession,
    _auth: Annotated[AuthContext, Depends(require_permission(Permission.FARM_STRUCTURE_READ))],
) -> FarmUnitResponse:
    return response(load_unit(db, unit_id))


@router.post("", response_model=FarmUnitResponse, status_code=201)
def add_unit(
    payload: FarmUnitCreateRequest,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[
        AuthContext, Depends(require_permission(Permission.FARM_STRUCTURE_CREATE))
    ],
) -> FarmUnitResponse:
    try:
        with db.begin_nested():
            unit = create_unit(
                db,
                auth.user,
                payload.code,
                payload.name,
                payload.unit_type,
                payload.parent_id,
                request.state.request_id,
            )
    except IntegrityError as exc:
        raise HTTPException(
            status_code=409, detail="A farm unit with this code already exists"
        ) from exc
    return response(unit)


@router.put("/{unit_id}", response_model=FarmUnitResponse)
def edit_unit(
    unit_id: uuid.UUID,
    payload: FarmUnitUpdateRequest,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[
        AuthContext, Depends(require_permission(Permission.FARM_STRUCTURE_UPDATE))
    ],
) -> FarmUnitResponse:
    unit = load_unit(db, unit_id, for_update=True)
    try:
        with db.begin_nested():
            update_unit(
                db,
                auth.user,
                unit,
                payload.code,
                payload.name,
                payload.unit_type,
                payload.parent_id,
                request.state.request_id,
            )
    except IntegrityError as exc:
        raise HTTPException(
            status_code=409, detail="A farm unit with this code already exists"
        ) from exc
    return response(unit)


@router.post("/{unit_id}/deactivate", response_model=FarmUnitResponse)
def deactivate(
    unit_id: uuid.UUID,
    payload: LifecycleRequest,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[
        AuthContext, Depends(require_permission(Permission.FARM_STRUCTURE_DEACTIVATE))
    ],
) -> FarmUnitResponse:
    unit = change_unit_status(
        db,
        auth.user,
        unit_id,
        "inactive",
        request.state.request_id,
        payload.reason,
    )
    return response(unit)


@router.post("/{unit_id}/reactivate", response_model=FarmUnitResponse)
def reactivate(
    unit_id: uuid.UUID,
    payload: LifecycleRequest,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[
        AuthContext, Depends(require_permission(Permission.FARM_STRUCTURE_DEACTIVATE))
    ],
) -> FarmUnitResponse:
    unit = change_unit_status(
        db,
        auth.user,
        unit_id,
        "active",
        request.state.request_id,
        payload.reason,
    )
    return response(unit)


@router.get("/{unit_id}/audit", response_model=AuditEventListResponse)
def unit_audit(
    unit_id: uuid.UUID,
    db: DatabaseSession,
    _auth: Annotated[AuthContext, Depends(require_permission(Permission.OPERATIONAL_AUDIT_READ))],
) -> AuditEventListResponse:
    load_unit(db, unit_id)
    rows = db.execute(
        select(OperationalAuditEvent, ApplicationUser.display_name)
        .join(ApplicationUser, ApplicationUser.id == OperationalAuditEvent.actor_user_id)
        .where(
            OperationalAuditEvent.entity_type == "farm_unit",
            OperationalAuditEvent.entity_id == unit_id,
        )
        .order_by(OperationalAuditEvent.occurred_at.desc())
    ).all()
    return AuditEventListResponse(
        items=[audit_response(event, display_name) for event, display_name in rows],
        total=len(rows),
    )
