from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from koranco.db.session import DatabaseSession

router = APIRouter(prefix="/api/v1")


class StatusResponse(BaseModel):
    status: Literal["ok", "ready"]


@router.get("/health", response_model=StatusResponse)
def health() -> StatusResponse:
    return StatusResponse(status="ok")


@router.get("/readiness", response_model=StatusResponse)
def readiness(session: DatabaseSession) -> StatusResponse:
    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Database is unavailable") from exc
    return StatusResponse(status="ready")
