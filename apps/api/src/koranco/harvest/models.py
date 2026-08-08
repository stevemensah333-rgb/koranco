from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from koranco.db.base import Base
from koranco.farm_structure.models import FarmUnit
from koranco.identity.models import ApplicationUser


class HarvestRecord(Base):
    __tablename__ = "harvest_records"
    __table_args__ = (
        CheckConstraint("status IN ('draft', 'submitted')", name="ck_harvest_records_status"),
        CheckConstraint("unit IN ('fruit_count', 'kilograms')", name="ck_harvest_records_unit"),
        CheckConstraint("quantity > 0", name="ck_harvest_records_positive_quantity"),
        CheckConstraint(
            "unit <> 'fruit_count' OR quantity = trunc(quantity)",
            name="ck_harvest_records_whole_fruit_count",
        ),
        CheckConstraint(
            "(status = 'draft' AND submitted_by IS NULL AND submitted_at IS NULL) OR "
            "(status = 'submitted' AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL)",
            name="ck_harvest_records_submission_state",
        ),
        Index("ix_harvest_records_date_status", "harvest_date", "status"),
        Index("ix_harvest_records_farm_unit_date", "farm_unit_id", "harvest_date"),
        Index("ix_harvest_records_unit_date", "unit", "harvest_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    harvest_date: Mapped[date] = mapped_column(Date, nullable=False)
    farm_unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("farm_units.id", ondelete="RESTRICT"), nullable=False
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    unit: Mapped[str] = mapped_column(String(24), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(16), default="draft", nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("application_users.id", ondelete="RESTRICT"), nullable=False
    )
    submitted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("application_users.id", ondelete="RESTRICT")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    farm_unit: Mapped[FarmUnit] = relationship()
    creator: Mapped[ApplicationUser] = relationship(foreign_keys=[created_by])
    submitter: Mapped[ApplicationUser | None] = relationship(foreign_keys=[submitted_by])


class HarvestSyncOperation(Base):
    __tablename__ = "harvest_sync_operations"
    __table_args__ = (
        CheckConstraint(
            "operation_type = 'submit_harvest_snapshot'", name="ck_harvest_sync_operation_type"
        ),
        CheckConstraint(
            "result_status IN ('applied', 'already_applied', 'conflict', 'rejected')",
            name="ck_harvest_sync_result_status",
        ),
        UniqueConstraint("operation_id", name="uq_harvest_sync_operation_id"),
        Index("ix_harvest_sync_actor_processed", "actor_user_id", "processed_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    operation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    actor_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("application_users.id", ondelete="RESTRICT"), nullable=False
    )
    operation_type: Mapped[str] = mapped_column(String(48), nullable=False)
    harvest_record_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    payload_version: Mapped[int] = mapped_column(Integer, nullable=False)
    result_status: Mapped[str] = mapped_column(String(24), nullable=False)
    result_data: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(128))
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
