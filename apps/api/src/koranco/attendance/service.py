import hashlib
import uuid
from datetime import UTC, date, datetime, time
from typing import Any

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, joinedload, selectinload

from koranco.attendance.models import AttendanceEntry, AttendanceSession
from koranco.attendance.schemas import AttendanceSessionResponse, DraftEntryRequest
from koranco.identity.models import ApplicationUser
from koranco.operational_audit.service import record_operational_event
from koranco.workers.models import Worker


def entry_state(entry: AttendanceEntry) -> dict[str, Any]:
    return {
        "worker_id": str(entry.worker_id),
        "attendance_status": entry.attendance_status,
        "time_in": entry.time_in.isoformat(timespec="minutes") if entry.time_in else None,
        "time_out": entry.time_out.isoformat(timespec="minutes") if entry.time_out else None,
        "version": entry.version,
    }


def load_session(
    db: Session, session_id: uuid.UUID, *, for_update: bool = False
) -> AttendanceSession:
    statement = (
        select(AttendanceSession)
        .options(
            selectinload(AttendanceSession.entries).selectinload(AttendanceEntry.worker),
            joinedload(AttendanceSession.creator),
            joinedload(AttendanceSession.submitter),
        )
        .where(AttendanceSession.id == session_id)
    )
    if for_update:
        statement = statement.with_for_update(of=AttendanceSession)
    attendance = db.scalar(statement)
    if attendance is None:
        raise HTTPException(status_code=404, detail="Attendance session not found")
    return attendance


def session_response(attendance: AttendanceSession) -> AttendanceSessionResponse:
    entries = [
        {
            "id": entry.id,
            "worker_id": entry.worker_id,
            "worker_code": entry.worker.worker_code,
            "worker_name": entry.worker.full_name,
            "worker_active": entry.worker.status == "active",
            "attendance_status": entry.attendance_status,
            "time_in": entry.time_in,
            "time_out": entry.time_out,
            "version": entry.version,
            "corrected_at": entry.corrected_at,
        }
        for entry in attendance.entries
    ]
    return AttendanceSessionResponse(
        id=attendance.id,
        attendance_date=attendance.attendance_date,
        status=attendance.status,
        version=attendance.version,
        created_by=attendance.created_by,
        created_by_name=attendance.creator.display_name,
        created_at=attendance.created_at,
        updated_at=attendance.updated_at,
        submitted_by=attendance.submitted_by,
        submitted_by_name=attendance.submitter.display_name if attendance.submitter else None,
        submitted_at=attendance.submitted_at,
        present_count=sum(item["attendance_status"] == "present" for item in entries),
        absent_count=sum(item["attendance_status"] == "absent" for item in entries),
        unmarked_count=sum(item["attendance_status"] is None for item in entries),
        entries=entries,
    )


def create_draft(
    db: Session,
    actor: ApplicationUser,
    attendance_date: date,
    request_id: str | None,
    attendance_id: uuid.UUID | None = None,
) -> AttendanceSession:
    attendance = AttendanceSession(
        id=attendance_id or uuid.uuid4(),
        attendance_date=attendance_date,
        status="draft",
        version=1,
        created_by=actor.id,
    )
    db.add(attendance)
    db.flush()
    record_operational_event(
        db,
        actor=actor,
        action="created",
        entity_type="attendance_session",
        entity_id=attendance.id,
        request_id=request_id,
        before=None,
        after={"attendance_date": attendance.attendance_date.isoformat(), "status": "draft"},
    )
    return attendance


def update_draft(
    db: Session,
    actor: ApplicationUser,
    attendance: AttendanceSession,
    expected_version: int,
    requested: list[DraftEntryRequest],
) -> None:
    if attendance.status != "draft":
        raise HTTPException(
            status_code=409, detail="Submitted attendance cannot be edited as a draft"
        )
    if attendance.version != expected_version:
        raise HTTPException(
            status_code=409, detail="Attendance draft changed; reload before saving"
        )
    worker_ids = [item.worker_id for item in requested]
    if len(worker_ids) != len(set(worker_ids)):
        raise HTTPException(status_code=422, detail="A Worker may appear only once in a session")
    workers = {
        worker.id: worker
        for worker in db.scalars(select(Worker).where(Worker.id.in_(worker_ids))).all()
    }
    if len(workers) != len(worker_ids):
        raise HTTPException(status_code=422, detail="One or more selected Workers are unavailable")
    existing_ids = {entry.worker_id for entry in attendance.entries}
    if any(
        workers[worker_id].status != "active" and worker_id not in existing_ids
        for worker_id in worker_ids
    ):
        raise HTTPException(status_code=409, detail="An inactive Worker cannot be newly added")
    # Draft saves replace the whole roster: delete all entries and re-insert.
    # This intentionally churns entry UUIDs/versions across saves; only the
    # submitted state is stable (fingerprint + audit). Per-entry upserts would
    # add diffing complexity without protecting submitted data.
    db.execute(
        delete(AttendanceEntry).where(AttendanceEntry.attendance_session_id == attendance.id)
    )
    attendance.entries = []
    for item in requested:
        attendance.entries.append(
            AttendanceEntry(
                worker_id=item.worker_id,
                attendance_status=item.attendance_status,
                time_in=item.time_in,
                time_out=item.time_out,
                version=1,
            )
        )
    attendance.version += 1
    db.flush()


def roster_fingerprint(attendance: AttendanceSession) -> str:
    content = ",".join(sorted(str(entry.worker_id) for entry in attendance.entries))
    return hashlib.sha256(content.encode()).hexdigest()


def submit_session(
    db: Session, actor: ApplicationUser, attendance: AttendanceSession, request_id: str | None
) -> None:
    if attendance.status == "submitted":
        return
    if not attendance.entries:
        raise HTTPException(status_code=422, detail="Attendance roster cannot be empty")
    if any(entry.attendance_status is None for entry in attendance.entries):
        raise HTTPException(
            status_code=422, detail="Every rostered Worker must be marked Present or Absent"
        )
    current_workers = {
        worker.id: worker
        for worker in db.scalars(
            select(Worker).where(Worker.id.in_([entry.worker_id for entry in attendance.entries]))
        ).all()
    }
    if len(current_workers) != len(attendance.entries):
        raise HTTPException(status_code=422, detail="One or more selected Workers are unavailable")
    if any(current_workers[entry.worker_id].status != "active" for entry in attendance.entries):
        raise HTTPException(
            status_code=409,
            detail="A rostered Worker is now inactive; remove them before submission",
        )
    attendance.status = "submitted"
    attendance.submitted_by = actor.id
    attendance.submitted_at = datetime.now(UTC)
    attendance.roster_fingerprint = roster_fingerprint(attendance)
    attendance.version += 1
    record_operational_event(
        db,
        actor=actor,
        action="submitted",
        entity_type="attendance_session",
        entity_id=attendance.id,
        request_id=request_id,
        before={"status": "draft"},
        after={
            "status": "submitted",
            "attendance_date": attendance.attendance_date.isoformat(),
            "roster_fingerprint": attendance.roster_fingerprint,
            "entry_count": len(attendance.entries),
            "present_count": sum(e.attendance_status == "present" for e in attendance.entries),
            "absent_count": sum(e.attendance_status == "absent" for e in attendance.entries),
        },
    )
    db.flush()


def correct_entry(
    db: Session,
    actor: ApplicationUser,
    attendance: AttendanceSession,
    entry_id: uuid.UUID,
    expected_version: int,
    status: str,
    time_in: time | None,
    time_out: time | None,
    reason: str,
    request_id: str | None,
) -> AttendanceEntry:
    if attendance.status != "submitted":
        raise HTTPException(status_code=409, detail="Only submitted attendance can be corrected")
    entry = db.scalar(
        select(AttendanceEntry)
        .where(
            AttendanceEntry.id == entry_id, AttendanceEntry.attendance_session_id == attendance.id
        )
        .with_for_update()
    )
    if entry is None:
        raise HTTPException(status_code=404, detail="Attendance entry not found")
    if entry.version != expected_version:
        raise HTTPException(
            status_code=409, detail="Attendance entry changed; reload before correcting"
        )
    before = entry_state(entry)
    entry.attendance_status = status
    entry.time_in = time_in
    entry.time_out = time_out
    entry.version += 1
    entry.corrected_at = datetime.now(UTC)
    db.flush()
    record_operational_event(
        db,
        actor=actor,
        action="corrected",
        entity_type="attendance_entry",
        entity_id=entry.id,
        request_id=request_id,
        before=before,
        after=entry_state(entry),
        reason=reason,
    )
    return entry
