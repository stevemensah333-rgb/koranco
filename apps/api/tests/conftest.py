import os

import pytest
from sqlalchemy import text

os.environ.setdefault("KORANCO_ENVIRONMENT", "test")
os.environ.setdefault(
    "KORANCO_DATABASE_URL",
    "postgresql+psycopg://koranco_dev:koranco_dev@localhost:5432/koranco_test",
)
os.environ.setdefault("KORANCO_CORS_ORIGINS", "[]")
os.environ.setdefault("KORANCO_CSRF_TRUSTED_ORIGINS", '["http://test"]')


@pytest.fixture(autouse=True)
def clean_master_data_tables() -> None:
    # TRUNCATE is intentional: the audit table rejects row UPDATE/DELETE by design.
    from koranco.db.session import SessionFactory

    with SessionFactory.begin() as session:
        session.execute(
            text(
                "TRUNCATE attendance_sync_operations, attendance_entries, attendance_sessions, "
                "operational_audit_events, farm_units, workers"
            )
        )
