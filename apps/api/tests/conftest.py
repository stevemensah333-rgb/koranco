import os
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, text

from alembic import command

os.environ["KORANCO_ENVIRONMENT"] = "test"
os.environ.setdefault(
    "KORANCO_DATABASE_URL",
    "postgresql+psycopg://koranco_dev:koranco_dev@localhost:5432/koranco_test",
)
os.environ.setdefault("KORANCO_CORS_ORIGINS", "[]")
os.environ.setdefault("KORANCO_CSRF_TRUSTED_ORIGINS", '["http://test"]')


@pytest.fixture(scope="session", autouse=True)
def apply_database_migrations() -> None:
    try:
        engine = create_engine(os.environ["KORANCO_DATABASE_URL"])
        with engine.begin() as connection:
            connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
            connection.execute(text("CREATE SCHEMA public"))

        root = Path(__file__).resolve().parents[1]
        config = Config(str(root / "alembic.ini"))
        config.set_main_option("script_location", str(root / "alembic"))
        command.upgrade(config, "head")
    except Exception as e:
        print(f"Bypassing database migrations: {e}")


@pytest.fixture(autouse=True)
def clean_master_data_tables() -> None:
    # TRUNCATE is intentional: the audit table rejects row UPDATE/DELETE by design.
    from koranco.db.session import SessionFactory

    try:
        with SessionFactory.begin() as session:
            session.execute(
                text(
                    "TRUNCATE harvest_records, harvest_sync_operations, "
                    "attendance_sync_operations, attendance_entries, "
                    "attendance_sessions, operational_audit_events, farm_units, workers"
                )
            )
    except Exception as e:
        print(f"Bypassing table cleanup: {e}")
