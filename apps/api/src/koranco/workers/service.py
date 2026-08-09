import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from koranco.identity.models import ApplicationUser
from koranco.operational_audit.service import record_operational_event
from koranco.workers.models import Worker


def worker_state(worker: Worker) -> dict[str, Any]:
    return {
        "worker_code": worker.worker_code,
        "full_name": worker.full_name,
        "status": worker.status,
    }


def load_worker(session: Session, worker_id: uuid.UUID, *, for_update: bool = False) -> Worker:
    statement = select(Worker).where(Worker.id == worker_id)
    if for_update:
        statement = statement.with_for_update()
    worker = session.scalar(statement)
    if worker is None:
        raise HTTPException(status_code=404, detail="Worker not found")
    return worker


def create_worker(
    session: Session, actor: ApplicationUser, code: str, name: str, request_id: str | None
) -> Worker:
    worker = Worker(
        worker_code=code, full_name=name, status="active", created_by=actor.id, updated_by=actor.id
    )
    session.add(worker)
    session.flush()
    record_operational_event(
        session,
        actor=actor,
        action="created",
        entity_type="worker",
        entity_id=worker.id,
        request_id=request_id,
        before=None,
        after=worker_state(worker),
    )
    return worker


def update_worker(
    session: Session,
    actor: ApplicationUser,
    worker: Worker,
    code: str,
    name: str,
    request_id: str | None,
) -> None:
    before = worker_state(worker)
    worker.worker_code = code
    worker.full_name = name
    worker.updated_by = actor.id
    session.flush()
    record_operational_event(
        session,
        actor=actor,
        action="updated",
        entity_type="worker",
        entity_id=worker.id,
        request_id=request_id,
        before=before,
        after=worker_state(worker),
    )


def set_worker_status(
    session: Session,
    actor: ApplicationUser,
    worker: Worker,
    status: str,
    request_id: str | None,
    reason: str | None,
) -> None:
    if worker.status == status:
        return
    before = worker_state(worker)
    worker.status = status
    worker.updated_by = actor.id
    session.flush()
    action = "deactivated" if status == "inactive" else "reactivated"
    record_operational_event(
        session,
        actor=actor,
        action=action,
        entity_type="worker",
        entity_id=worker.id,
        request_id=request_id,
        before=before,
        after=worker_state(worker),
        reason=reason,
    )


def change_worker_status(
    session: Session,
    actor: ApplicationUser,
    worker_id: uuid.UUID,
    status: str,
    request_id: str | None,
    reason: str | None,
) -> Worker:
    """Load, change, and return a Worker's status in one HTTP-request unit."""
    worker = load_worker(session, worker_id, for_update=True)
    set_worker_status(session, actor, worker, status, request_id, reason)
    return worker
