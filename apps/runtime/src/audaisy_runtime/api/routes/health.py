from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from audaisy_runtime.container import ApplicationContainer
from audaisy_runtime.contracts.models import HealthResponse
from audaisy_runtime.api.dependencies import get_container


router = APIRouter()


@router.get("/healthz", response_model=HealthResponse)
def get_health(container: Annotated[ApplicationContainer, Depends(get_container)]) -> HealthResponse:
    return HealthResponse(
        healthy=True,
        contract_version=container.settings.contract_version,
        runtime_version=container.settings.runtime_version,
    )

