from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context
from koranco.attendance import models as attendance_models  # noqa: F401
from koranco.config.settings import get_settings
from koranco.db.base import Base
from koranco.farm_structure import models as farm_structure_models  # noqa: F401
from koranco.harvest import models as harvest_models  # noqa: F401
from koranco.identity import models as identity_models  # noqa: F401
from koranco.operational_audit import models as operational_audit_models  # noqa: F401
from koranco.workers import models as worker_models  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", get_settings().database_url)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
