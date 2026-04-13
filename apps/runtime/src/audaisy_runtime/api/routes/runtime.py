from __future__ import annotations

from typing import Annotated, NoReturn

from fastapi import APIRouter, Depends, status

from audaisy_runtime.api.dependencies import get_container
from audaisy_runtime.container import ApplicationContainer
from audaisy_runtime.contracts.models import ErrorEnvelope, RuntimeStatusResponse, StartModelDownloadRequest


router = APIRouter(prefix="/runtime", tags=["runtime"])


@router.get("/status", response_model=RuntimeStatusResponse)
def get_runtime_status(container: Annotated[ApplicationContainer, Depends(get_container)]) -> RuntimeStatusResponse:
    return container.runtime_status_service.get_status()


@router.post(
    "/models/download",
    response_model=ErrorEnvelope,
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
    responses={422: {"model": ErrorEnvelope}},
)
def request_model_download(
    payload: StartModelDownloadRequest,
    container: Annotated[ApplicationContainer, Depends(get_container)],
) -> NoReturn:
    container.model_manager.start_install(payload)
