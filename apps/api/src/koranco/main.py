from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from koranco.api import router
from koranco.attendance.routes import router as attendance_router
from koranco.common.errors import install_error_handlers
from koranco.common.logging import configure_logging
from koranco.common.request_id import RequestIdMiddleware
from koranco.config.settings import get_settings
from koranco.farm_structure.routes import router as farm_structure_router
from koranco.harvest.routes import router as harvest_router
from koranco.identity.admin_routes import router as administration_router
from koranco.identity.routes import router as identity_router
from koranco.reports.routes import router as reports_router
from koranco.workers.routes import router as workers_router

settings = get_settings()
configure_logging(settings.log_level)

app = FastAPI(
    title="Koranco Farms API",
    version="0.1.0",
    docs_url="/docs" if settings.expose_api_docs else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.expose_api_docs else None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Accept", "Content-Type", "X-CSRF-Token", "X-Request-ID"],
)
app.add_middleware(RequestIdMiddleware)
install_error_handlers(app)
app.include_router(router)
app.include_router(identity_router)
app.include_router(administration_router)
app.include_router(workers_router)
app.include_router(farm_structure_router)
app.include_router(attendance_router)
app.include_router(harvest_router)
app.include_router(reports_router)
