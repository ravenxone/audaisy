from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from audaisy_runtime.api.dependencies import get_container
from audaisy_runtime.container import ApplicationContainer
from audaisy_runtime.contracts.models import ListVoicePresetsResponse


router = APIRouter(tags=["voice-presets"])


@router.get("/voice-presets", response_model=ListVoicePresetsResponse)
def list_voice_presets(
    container: Annotated[ApplicationContainer, Depends(get_container)],
) -> ListVoicePresetsResponse:
    return ListVoicePresetsResponse(presets=container.voice_service.list_presets())
