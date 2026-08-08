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
    func,
)
from sqlalchemy.dialects.postgresql import UUID
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
