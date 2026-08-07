from __future__ import annotations

import uuid
from datetime import date, datetime, time

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from koranco.db.base import Base
from koranco.identity.models import ApplicationUser
from koranco.workers.models import Worker


class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"
    __table_args__ = (
        CheckConstraint("status IN ('draft', 'submitted')", name="ck_attendance_sessions_status"),
        CheckConstraint(
            "(status = 'draft' AND submitted_by IS NULL AND submitted_at IS NULL "
            "AND roster_fingerprint IS NULL) OR "
            "(status = 'submitted' AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL "
            "AND roster_fingerprint IS NOT NULL)",
            name="ck_attendance_sessions_submission_state",
        ),
        Index("ix_attendance_sessions_date_status", "attendance_date", "status"),
        Index(
            "uq_attendance_submitted_population",
            "attendance_date",
            "roster_fingerprint",
            unique=True,
            postgresql_where=text("status = 'submitted'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    attendance_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), default="draft")
    version: Mapped[int] = mapped_column(Integer, default=1)
    roster_fingerprint: Mapped[str | None] = mapped_column(String(64))
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("application_users.id", ondelete="RESTRICT"), index=True
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
    entries: Mapped[list[AttendanceEntry]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="AttendanceEntry.created_at",
    )
    creator: Mapped[ApplicationUser] = relationship(foreign_keys=[created_by])
    submitter: Mapped[ApplicationUser | None] = relationship(foreign_keys=[submitted_by])


class AttendanceEntry(Base):
    __tablename__ = "attendance_entries"
    __table_args__ = (
        CheckConstraint(
            "attendance_status IS NULL OR attendance_status IN ('present', 'absent')",
            name="ck_attendance_entries_status",
        ),
        CheckConstraint(
            "attendance_status <> 'absent' OR (time_in IS NULL AND time_out IS NULL)",
            name="ck_attendance_absent_has_no_time",
        ),
        CheckConstraint(
            "time_in IS NULL OR time_out IS NULL OR time_out >= time_in",
            name="ck_attendance_time_order",
        ),
        Index("uq_attendance_session_worker", "attendance_session_id", "worker_id", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    attendance_session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendance_sessions.id", ondelete="CASCADE")
    )
    worker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workers.id", ondelete="RESTRICT"), index=True
    )
    attendance_status: Mapped[str | None] = mapped_column(String(16))
    time_in: Mapped[time | None] = mapped_column(Time(timezone=False))
    time_out: Mapped[time | None] = mapped_column(Time(timezone=False))
    version: Mapped[int] = mapped_column(Integer, default=1)
    corrected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    session: Mapped[AttendanceSession] = relationship(back_populates="entries")
    worker: Mapped[Worker] = relationship()


class AttendanceSyncOperation(Base):
    __tablename__ = "attendance_sync_operations"
    __table_args__ = (
        CheckConstraint(
            "operation_type = 'submit_snapshot'", name="ck_attendance_sync_operation_type"
        ),
        CheckConstraint(
            "result_status IN ('applied', 'already_applied', 'conflict', 'rejected')",
            name="ck_attendance_sync_result_status",
        ),
        UniqueConstraint("operation_id", name="uq_attendance_sync_operation_id"),
        Index("ix_attendance_sync_actor_processed", "actor_user_id", "processed_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    operation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    actor_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("application_users.id", ondelete="RESTRICT"), nullable=False
    )
    operation_type: Mapped[str] = mapped_column(String(32), nullable=False)
    target_session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    payload_version: Mapped[int] = mapped_column(Integer, nullable=False)
    result_status: Mapped[str] = mapped_column(String(24), nullable=False)
    result_data: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(128))
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
