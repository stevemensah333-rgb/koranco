import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError

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
from koranco.workers.models import Worker
from koranco.workers.schemas import (
    WorkerCreateRequest,
    WorkerListResponse,
    WorkerResponse,
    WorkerUpdateRequest,
)
from koranco.workers.service import create_worker, load_worker, set_worker_status, update_worker

router = APIRouter(prefix="/api/v1/workers", tags=["workers"])


def response(worker: Worker) -> WorkerResponse:
    return WorkerResponse.model_validate(worker, from_attributes=True)


@router.get("", response_model=WorkerListResponse)
def list_workers(
    db: DatabaseSession,
    _auth: Annotated[AuthContext, Depends(require_permission(Permission.WORKERS_READ))],
    search: str | None = None,
    status: Annotated[str | None, Query(pattern="^(active|inactive)$")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> WorkerListResponse:
    filters = []
    if search and search.strip():
        term = f"%{search.strip()}%"
        filters.append(or_(Worker.worker_code.ilike(term), Worker.full_name.ilike(term)))
    if status:
        filters.append(Worker.status == status)
    total = db.scalar(select(func.count()).select_from(Worker).where(*filters)) or 0
    workers = db.scalars(
        select(Worker)
        .where(*filters)
        .order_by(Worker.worker_code, Worker.id)
        .limit(limit)
        .offset(offset)
    ).all()
    return WorkerListResponse(
        items=[response(item) for item in workers], total=total, limit=limit, offset=offset
    )


@router.get("/{worker_id}", response_model=WorkerResponse)
def view_worker(
    worker_id: uuid.UUID,
    db: DatabaseSession,
    _auth: Annotated[AuthContext, Depends(require_permission(Permission.WORKERS_READ))],
) -> WorkerResponse:
    return response(load_worker(db, worker_id))


@router.post("", response_model=WorkerResponse, status_code=201)
def add_worker(
    payload: WorkerCreateRequest,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.WORKERS_CREATE))],
) -> WorkerResponse:
    try:
        with db.begin_nested():
            worker = create_worker(
                db, auth.user, payload.worker_code, payload.full_name, request.state.request_id
            )
    except IntegrityError as exc:
        raise HTTPException(
            status_code=409, detail="A worker with this code already exists"
        ) from exc
    return response(worker)


@router.put("/{worker_id}", response_model=WorkerResponse)
def edit_worker(
    worker_id: uuid.UUID,
    payload: WorkerUpdateRequest,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.WORKERS_UPDATE))],
) -> WorkerResponse:
    worker = load_worker(db, worker_id, for_update=True)
    try:
        with db.begin_nested():
            update_worker(
                db,
                auth.user,
                worker,
                payload.worker_code,
                payload.full_name,
                request.state.request_id,
            )
    except IntegrityError as exc:
        raise HTTPException(
            status_code=409, detail="A worker with this code already exists"
        ) from exc
    return response(worker)


class LifecycleRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


def change_status(
    worker_id: uuid.UUID,
    status: str,
    payload: LifecycleRequest,
    request: Request,
    db: DatabaseSession,
    auth: AuthContext,
) -> WorkerResponse:
    worker = load_worker(db, worker_id, for_update=True)
    set_worker_status(db, auth.user, worker, status, request.state.request_id, payload.reason)
    return response(worker)


@router.post("/{worker_id}/deactivate", response_model=WorkerResponse)
def deactivate(
    worker_id: uuid.UUID,
    payload: LifecycleRequest,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.WORKERS_DEACTIVATE))],
) -> WorkerResponse:
    return change_status(worker_id, "inactive", payload, request, db, auth)


@router.post("/{worker_id}/reactivate", response_model=WorkerResponse)
def reactivate(
    worker_id: uuid.UUID,
    payload: LifecycleRequest,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.WORKERS_DEACTIVATE))],
) -> WorkerResponse:
    return change_status(worker_id, "active", payload, request, db, auth)


@router.get("/{worker_id}/audit", response_model=AuditEventListResponse)
def worker_audit(
    worker_id: uuid.UUID,
    db: DatabaseSession,
    _auth: Annotated[AuthContext, Depends(require_permission(Permission.OPERATIONAL_AUDIT_READ))],
) -> AuditEventListResponse:
    load_worker(db, worker_id)
    rows = db.execute(
        select(OperationalAuditEvent, ApplicationUser.display_name)
        .join(ApplicationUser, ApplicationUser.id == OperationalAuditEvent.actor_user_id)
        .where(
            OperationalAuditEvent.entity_type == "worker",
            OperationalAuditEvent.entity_id == worker_id,
        )
        .order_by(OperationalAuditEvent.occurred_at.desc())
    ).all()
    return AuditEventListResponse(
        items=[audit_response(event, display_name) for event, display_name in rows],
        total=len(rows),
    )
