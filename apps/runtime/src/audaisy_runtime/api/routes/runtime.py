from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Response, status

from audaisy_runtime.api.dependencies import get_container
from audaisy_runtime.container import ApplicationContainer
from audaisy_runtime.contracts.models import (
    ErrorEnvelope,
    RuntimeStatusResponse,
    StartModelDownloadRequest,
    StartModelDownloadResponse,
    StartModelDownloadResult,
)


router = APIRouter(prefix="/runtime", tags=["runtime"])


@router.get("/status", response_model=RuntimeStatusResponse)
def get_runtime_status(container: Annotated[ApplicationContainer, Depends(get_container)]) -> RuntimeStatusResponse:
    return container.runtime_status_service.get_status()


@router.post(
    "/models/download",
    response_model=StartModelDownloadResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        200: {"model": StartModelDownloadResponse},
        409: {"model": ErrorEnvelope},
        422: {"model": ErrorEnvelope},
        502: {"model": ErrorEnvelope},
        507: {"model": ErrorEnvelope},
    },
)
def request_model_download(
    payload: StartModelDownloadRequest,
    background_tasks: BackgroundTasks,
    response: Response,
    container: Annotated[ApplicationContainer, Depends(get_container)],
) -> StartModelDownloadResponse:
    install_response = container.model_manager.start_install(payload)
    if install_response.result == StartModelDownloadResult.STARTED:
        background_tasks.add_task(container.model_manager.run_install)
    else:
        response.status_code = status.HTTP_200_OK
    return install_response
