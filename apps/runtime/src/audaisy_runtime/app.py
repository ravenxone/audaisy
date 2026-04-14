from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from audaisy_runtime.api.router import create_api_router
from audaisy_runtime.container import build_container
from audaisy_runtime.contracts.models import ApiError, ApiErrorCode, ErrorEnvelope
from audaisy_runtime.errors import DomainError
from audaisy_runtime.settings import Settings


def default_settings() -> Settings:
    return Settings(
        app_data_root=Path.home() / "Library" / "Application Support" / "Audaisy",
        contract_artifacts_dir=Path(__file__).resolve().parents[4] / "packages" / "contracts",
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or default_settings()
    container = build_container(resolved_settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        container.app_paths.ensure_base_layout()
        container.database.initialize()
        container.model_manager.reconcile_install_state()
        recovery_task = asyncio.create_task(_resume_incomplete_imports())
        try:
            yield
        finally:
            recovery_task.cancel()
            with suppress(asyncio.CancelledError):
                await recovery_task

    async def _resume_incomplete_imports() -> None:
        try:
            await asyncio.to_thread(container.import_service.resume_incomplete_imports)
        except Exception:
            return

    app = FastAPI(title="Audaisy Runtime", version=resolved_settings.runtime_version, lifespan=lifespan)
    app.state.container = container
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(resolved_settings.allowed_web_origins),
        allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    @app.exception_handler(DomainError)
    async def handle_domain_error(_: Request, error: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=error.status_code,
            content=ErrorEnvelope(error=ApiError(code=error.code, message=error.message)).model_dump(by_alias=True),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, error: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=ErrorEnvelope(
                error=ApiError(
                    code=ApiErrorCode.INVALID_REQUEST,
                    message=str(error.errors()[0]["msg"]) if error.errors() else "Invalid request.",
                )
            ).model_dump(by_alias=True),
        )

    app.include_router(create_api_router())
    return app
