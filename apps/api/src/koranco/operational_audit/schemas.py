import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from koranco.operational_audit.models import OperationalAuditEvent


class AuditEventResponse(BaseModel):
    id: uuid.UUID
    actor_user_id: uuid.UUID
    actor_display_name: str
    action: str
    entity_type: str
    entity_id: uuid.UUID
    request_id: str | None
    before_state: dict[str, Any] | None
    after_state: dict[str, Any] | None
    reason: str | None
    occurred_at: datetime


class AuditEventListResponse(BaseModel):
    items: list[AuditEventResponse]
    total: int


def audit_response(event: OperationalAuditEvent, actor_display_name: str) -> AuditEventResponse:
    return AuditEventResponse(
        id=event.id,
        actor_user_id=event.actor_user_id,
        actor_display_name=actor_display_name,
        action=event.action,
        entity_type=event.entity_type,
        entity_id=event.entity_id,
        request_id=event.request_id,
        before_state=event.before_state,
        after_state=event.after_state,
        reason=event.reason,
        occurred_at=event.occurred_at,
    )
