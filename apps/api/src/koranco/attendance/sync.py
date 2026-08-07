import logging

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from koranco.attendance.models import AttendanceSession, AttendanceSyncOperation
from koranco.attendance.schemas import (
    AttendanceSyncRequest,
    AttendanceSyncResponse,
)
from koranco.attendance.service import (
    create_draft,
    load_session,
    session_response,
    submit_session,
    update_draft,
)
from koranco.identity.models import ApplicationUser

logger = logging.getLogger(__name__)
SUPPORTED_PAYLOAD_VERSION = 1


def _same_snapshot(attendance: AttendanceSession, payload: AttendanceSyncRequest) -> bool:
    if attendance.attendance_date != payload.attendance_date:
        return False
    server = sorted(
        (
            str(entry.worker_id),
            entry.attendance_status,
            entry.time_in.isoformat(timespec="minutes") if entry.time_in else None,
            entry.time_out.isoformat(timespec="minutes") if entry.time_out else None,
        )
        for entry in attendance.entries
    )
    client = sorted(
        (
            str(entry.worker_id),
            entry.attendance_status.value if entry.attendance_status else None,
            entry.time_in.isoformat(timespec="minutes") if entry.time_in else None,
            entry.time_out.isoformat(timespec="minutes") if entry.time_out else None,
        )
        for entry in payload.entries
    )
    return server == client


def _response_from_stored(operation: AttendanceSyncOperation) -> AttendanceSyncResponse:
    return AttendanceSyncResponse.model_validate(operation.result_data)


def _store_result(
    db: Session,
    *,
    payload: AttendanceSyncRequest,
    actor: ApplicationUser,
    request_id: str | None,
    response: AttendanceSyncResponse,
) -> AttendanceSyncResponse:
    db.add(
        AttendanceSyncOperation(
            operation_id=payload.operation_id,
            actor_user_id=actor.id,
            operation_type=payload.operation_type,
            target_session_id=payload.target_session_id,
            payload_version=payload.payload_version,
            result_status=response.result,
            result_data=response.model_dump(mode="json"),
            request_id=request_id,
        )
    )
    db.flush()
    logger.info(
        "attendance_sync_result operation_id=%s actor=%s target=%s type=%s result=%s request_id=%s",
        payload.operation_id,
        actor.id,
        payload.target_session_id,
        payload.operation_type,
        response.result,
        request_id,
    )
    return response


def ingest_sync_operation(
    db: Session,
    *,
    payload: AttendanceSyncRequest,
    actor: ApplicationUser,
    request_id: str | None,
) -> AttendanceSyncResponse:
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:operation_id, 0))"),
        {"operation_id": str(payload.operation_id)},
    )
    stored = db.scalar(
        select(AttendanceSyncOperation).where(
            AttendanceSyncOperation.operation_id == payload.operation_id
        )
    )
    if stored:
        if stored.actor_user_id != actor.id:
            return AttendanceSyncResponse(
                operation_id=payload.operation_id,
                result="rejected",
                message="This pending attendance belongs to another user.",
            )
        replay = _response_from_stored(stored)
        if replay.result == "applied":
            replay.result = "already_applied"
        return replay
    if payload.payload_version != SUPPORTED_PAYLOAD_VERSION:
        return _store_result(
            db,
            payload=payload,
            actor=actor,
            request_id=request_id,
            response=AttendanceSyncResponse(
                operation_id=payload.operation_id,
                result="rejected",
                message="This saved attendance version is not supported. Keep it on this device.",
            ),
        )
    attendance = db.scalar(
        select(AttendanceSession).where(AttendanceSession.id == payload.target_session_id)
    )
    if attendance and attendance.created_by != actor.id:
        result = AttendanceSyncResponse(
            operation_id=payload.operation_id,
            result="conflict",
            message="This attendance session belongs to another user.",
        )
        return _store_result(
            db, payload=payload, actor=actor, request_id=request_id, response=result
        )
    if attendance and attendance.status == "submitted":
        same = _same_snapshot(load_session(db, attendance.id), payload)
        result = AttendanceSyncResponse(
            operation_id=payload.operation_id,
            result="already_applied" if same else "conflict",
            message=(
                "Attendance is already confirmed on the server."
                if same
                else "Server attendance differs from the saved device copy."
            ),
            session=session_response(load_session(db, attendance.id)) if same else None,
        )
        return _store_result(
            db, payload=payload, actor=actor, request_id=request_id, response=result
        )
    if attendance and attendance.version != payload.base_server_version:
        result = AttendanceSyncResponse(
            operation_id=payload.operation_id,
            result="conflict",
            message="The server draft changed while this device was offline.",
        )
        return _store_result(
            db, payload=payload, actor=actor, request_id=request_id, response=result
        )
    audit_request_id = f"{request_id or 'sync'}:{payload.operation_id}"
    try:
        with db.begin_nested():
            if attendance is None:
                attendance = create_draft(
                    db,
                    actor,
                    payload.attendance_date,
                    audit_request_id,
                    payload.target_session_id,
                )
            locked = load_session(db, attendance.id, for_update=True)
            update_draft(db, actor, locked, locked.version, payload.entries)
            submit_session(db, actor, locked, audit_request_id)
    except HTTPException as exc:
        result = AttendanceSyncResponse(
            operation_id=payload.operation_id,
            result="conflict" if exc.status_code == 409 else "rejected",
            message=str(exc.detail),
        )
        return _store_result(
            db, payload=payload, actor=actor, request_id=request_id, response=result
        )
    except IntegrityError:
        result = AttendanceSyncResponse(
            operation_id=payload.operation_id,
            result="conflict",
            message="Equivalent attendance has already been submitted for this date.",
        )
        return _store_result(
            db, payload=payload, actor=actor, request_id=request_id, response=result
        )
    confirmed = session_response(load_session(db, attendance.id))
    result = AttendanceSyncResponse(
        operation_id=payload.operation_id,
        result="applied",
        message="Attendance synchronized and confirmed.",
        session=confirmed,
    )
    return _store_result(db, payload=payload, actor=actor, request_id=request_id, response=result)
