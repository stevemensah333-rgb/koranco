from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from koranco.db.base import Base


class FarmUnit(Base):
    __tablename__ = "farm_units"
    __table_args__ = (
        CheckConstraint("unit_type IN ('field', 'block')", name="ck_farm_units_type"),
        CheckConstraint("status IN ('active', 'inactive')", name="ck_farm_units_status"),
        CheckConstraint(
            "parent_id IS NULL OR parent_id <> id", name="ck_farm_units_not_self_parent"
        ),
        Index("ix_farm_units_status_type", "status", "unit_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    unit_type: Mapped[str] = mapped_column(String(16))
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("farm_units.id", ondelete="RESTRICT"), index=True
    )
    status: Mapped[str] = mapped_column(String(16), default="active")
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("application_users.id", ondelete="RESTRICT")
    )
    updated_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("application_users.id", ondelete="RESTRICT")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    parent: Mapped[FarmUnit | None] = relationship(remote_side=[id])
