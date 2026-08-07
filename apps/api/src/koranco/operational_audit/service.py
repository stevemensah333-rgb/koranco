import uuid
from typing import Any

from sqlalchemy.orm import Session

from koranco.identity.models import ApplicationUser
from koranco.operational_audit.models import OperationalAuditEvent


def record_operational_event(
    session: Session,
    *,
    actor: ApplicationUser,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    request_id: str | None,
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
    reason: str | None = None,
) -> None:
    session.add(
        OperationalAuditEvent(
            actor_user_id=actor.id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            request_id=request_id,
            before_state=before,
            after_state=after,
            reason=reason.strip() if reason else None,
        )
    )
