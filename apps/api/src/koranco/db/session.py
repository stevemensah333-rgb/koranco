from collections.abc import Generator
from typing import Annotated

from fastapi import Depends
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from koranco.config.settings import get_settings

engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionFactory = sessionmaker(bind=engine, expire_on_commit=False)


def get_db_session() -> Generator[Session]:
    """Provide one transaction boundary per request."""
    with SessionFactory.begin() as session:
        yield session


# Canonical FastAPI dependency alias for the per-request database session.
# Route modules import this from here rather than redefining it.
DatabaseSession = Annotated[Session, Depends(get_db_session)]
