from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from audaisy_runtime.api.dependencies import get_container
from audaisy_runtime.container import ApplicationContainer
from audaisy_runtime.contracts.models import ErrorEnvelope, PatchProfileRequest, ProfileResponse


router = APIRouter(tags=["profile"])


@router.get("/profile", response_model=ProfileResponse)
def get_profile(container: Annotated[ApplicationContainer, Depends(get_container)]) -> ProfileResponse:
    return container.profile_service.get_profile()


@router.patch("/profile", response_model=ProfileResponse, responses={422: {"model": ErrorEnvelope}})
def patch_profile(
    payload: PatchProfileRequest,
    container: Annotated[ApplicationContainer, Depends(get_container)],
) -> ProfileResponse:
    return container.profile_service.update_profile(payload)
