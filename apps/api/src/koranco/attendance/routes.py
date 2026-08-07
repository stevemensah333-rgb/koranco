import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload, selectinload

from koranco.attendance.models import AttendanceSession
from koranco.attendance.schemas import (
    AttendanceSessionListItem,
    AttendanceSessionListResponse,
    AttendanceSessionResponse,
    AttendanceSyncRequest,
    AttendanceSyncResponse,
    CorrectEntryRequest,
    CreateAttendanceRequest,
    UpdateDraftRequest,
)
from koranco.attendance.service import (
    correct_entry,
    create_draft,
    load_session,
    session_response,
    submit_session,
    update_draft,
)
from koranco.attendance.sync import ingest_sync_operation
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

router = APIRouter(prefix="/api/v1/attendance-sessions", tags=["attendance"])


@router.post("/sync", response_model=AttendanceSyncResponse)
def sync_attendance(
    payload: AttendanceSyncRequest,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.ATTENDANCE_RECORD))],
) -> AttendanceSyncResponse:
    return ingest_sync_operation(
        db,
        payload=payload,
        actor=auth.user,
        request_id=request.state.request_id,
    )


@router.get("", response_model=AttendanceSessionListResponse)
def list_sessions(
    db: DatabaseSession,
    _auth: Annotated[AuthContext, Depends(require_permission(Permission.ATTENDANCE_READ))],
    status: Annotated[str | None, Query(pattern="^(draft|submitted)$")] = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AttendanceSessionListResponse:
    filters = []
    if status:
        filters.append(AttendanceSession.status == status)
    if date_from:
        filters.append(AttendanceSession.attendance_date >= date_from)
    if date_to:
        filters.append(AttendanceSession.attendance_date <= date_to)
    if date_from and date_to and date_to < date_from:
        raise HTTPException(status_code=422, detail="date_to cannot precede date_from")
    total = db.scalar(select(func.count()).select_from(AttendanceSession).where(*filters)) or 0
    sessions = db.scalars(
        select(AttendanceSession)
        .options(
            joinedload(AttendanceSession.creator),
            joinedload(AttendanceSession.submitter),
            selectinload(AttendanceSession.entries),
        )
        .where(*filters)
        .order_by(AttendanceSession.attendance_date.desc(), AttendanceSession.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return AttendanceSessionListResponse(
        items=[
            AttendanceSessionListItem(
                id=item.id,
                attendance_date=item.attendance_date,
                status=item.status,
                created_by_name=item.creator.display_name,
                submitted_by_name=item.submitter.display_name if item.submitter else None,
                submitted_at=item.submitted_at,
                entry_count=len(item.entries),
            )
            for item in sessions
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{session_id}", response_model=AttendanceSessionResponse)
def view_session(
    session_id: uuid.UUID,
    db: DatabaseSession,
    _auth: Annotated[AuthContext, Depends(require_permission(Permission.ATTENDANCE_READ))],
) -> AttendanceSessionResponse:
    return session_response(load_session(db, session_id))


@router.post("", response_model=AttendanceSessionResponse, status_code=201)
def start_session(
    payload: CreateAttendanceRequest,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.ATTENDANCE_RECORD))],
) -> AttendanceSessionResponse:
    attendance = create_draft(db, auth.user, payload.attendance_date, request.state.request_id)
    db.flush()
    return session_response(load_session(db, attendance.id))


@router.put("/{session_id}/draft", response_model=AttendanceSessionResponse)
def save_draft(
    session_id: uuid.UUID,
    payload: UpdateDraftRequest,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.ATTENDANCE_RECORD))],
) -> AttendanceSessionResponse:
    attendance = load_session(db, session_id, for_update=True)
    update_draft(db, auth.user, attendance, payload.expected_version, payload.entries)
    db.flush()
    db.expire(attendance, ["entries"])
    return session_response(load_session(db, session_id))


@router.post("/{session_id}/submit", response_model=AttendanceSessionResponse)
def submit(
    session_id: uuid.UUID,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.ATTENDANCE_RECORD))],
) -> AttendanceSessionResponse:
    attendance = load_session(db, session_id, for_update=True)
    if attendance.status == "submitted":
        return session_response(attendance)
    try:
        with db.begin_nested():
            submit_session(db, auth.user, attendance, request.state.request_id)
    except IntegrityError as exc:
        raise HTTPException(
            status_code=409,
            detail="Attendance for this date and Worker population has already been submitted",
        ) from exc
    db.expire(attendance)
    return session_response(load_session(db, session_id))


@router.post("/{session_id}/entries/{entry_id}/correct", response_model=AttendanceSessionResponse)
def correct(
    session_id: uuid.UUID,
    entry_id: uuid.UUID,
    payload: CorrectEntryRequest,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.ATTENDANCE_CORRECT))],
) -> AttendanceSessionResponse:
    attendance = load_session(db, session_id, for_update=True)
    correct_entry(
        db,
        auth.user,
        attendance,
        entry_id,
        payload.expected_version,
        payload.attendance_status,
        payload.time_in,
        payload.time_out,
        payload.reason,
        request.state.request_id,
    )
    db.expire(attendance, ["entries"])
    return session_response(load_session(db, session_id))


@router.post("/{session_id}/discard", status_code=204)
def discard(
    session_id: uuid.UUID,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.ATTENDANCE_RECORD))],
) -> None:
    attendance = load_session(db, session_id, for_update=True)
    if attendance.status != "draft":
        raise HTTPException(status_code=409, detail="Submitted attendance cannot be discarded")
    record_operational_event(
        db,
        actor=auth.user,
        action="discarded",
        entity_type="attendance_session",
        entity_id=attendance.id,
        request_id=request.state.request_id,
        before={"status": "draft", "entry_count": len(attendance.entries)},
        after=None,
    )
    db.delete(attendance)


@router.get("/{session_id}/audit", response_model=AuditEventListResponse)
def attendance_audit(
    session_id: uuid.UUID,
    db: DatabaseSession,
    _auth: Annotated[AuthContext, Depends(require_permission(Permission.ATTENDANCE_READ))],
) -> AuditEventListResponse:
    attendance = load_session(db, session_id)
    entry_ids = [entry.id for entry in attendance.entries]
    rows = db.execute(
        select(OperationalAuditEvent, ApplicationUser.display_name)
        .join(ApplicationUser, ApplicationUser.id == OperationalAuditEvent.actor_user_id)
        .where(
            or_(
                (OperationalAuditEvent.entity_type == "attendance_session")
                & (OperationalAuditEvent.entity_id == session_id),
                (OperationalAuditEvent.entity_type == "attendance_entry")
                & (OperationalAuditEvent.entity_id.in_(entry_ids)),
            )
        )
        .order_by(OperationalAuditEvent.occurred_at.desc())
    ).all()
    return AuditEventListResponse(
        items=[audit_response(event, name) for event, name in rows], total=len(rows)
    )
