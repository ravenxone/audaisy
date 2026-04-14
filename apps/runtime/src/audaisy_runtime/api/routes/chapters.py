from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from audaisy_runtime.api.dependencies import get_container
from audaisy_runtime.container import ApplicationContainer
from audaisy_runtime.contracts.models import ChapterDetailResponse, ErrorEnvelope, UpdateChapterRequest


router = APIRouter(prefix="/projects/{project_id}/chapters", tags=["chapters"])


@router.get("/{chapter_id}", response_model=ChapterDetailResponse, responses={404: {"model": ErrorEnvelope}})
def get_chapter(
    project_id: str,
    chapter_id: str,
    container: Annotated[ApplicationContainer, Depends(get_container)],
) -> ChapterDetailResponse:
    return container.chapter_service.get_chapter(project_id, chapter_id)


@router.patch(
    "/{chapter_id}",
    response_model=ChapterDetailResponse,
    responses={404: {"model": ErrorEnvelope}, 422: {"model": ErrorEnvelope}},
)
def patch_chapter(
    project_id: str,
    chapter_id: str,
    payload: UpdateChapterRequest,
    container: Annotated[ApplicationContainer, Depends(get_container)],
) -> ChapterDetailResponse:
    return container.chapter_service.update_chapter(project_id, chapter_id, payload)
