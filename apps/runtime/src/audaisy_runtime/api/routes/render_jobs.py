from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, status
from fastapi.responses import FileResponse

from audaisy_runtime.api.dependencies import get_container
from audaisy_runtime.container import ApplicationContainer
from audaisy_runtime.contracts.models import (
    CreateRenderJobRequest,
    ErrorEnvelope,
    ListRenderJobsResponse,
    RenderJobResponse,
)


router = APIRouter(prefix="/projects/{project_id}/render-jobs", tags=["render-jobs"])


@router.post(
    "",
    response_model=RenderJobResponse,
    status_code=status.HTTP_201_CREATED,
    responses={404: {"model": ErrorEnvelope}, 409: {"model": ErrorEnvelope}, 422: {"model": ErrorEnvelope}},
)
def create_render_job(
    project_id: str,
    payload: CreateRenderJobRequest,
    background_tasks: BackgroundTasks,
    container: Annotated[ApplicationContainer, Depends(get_container)],
) -> RenderJobResponse:
    job = container.render_service.create_job(project_id, payload)
    background_tasks.add_task(container.render_service.run_queued_jobs)
    return job


@router.get("", response_model=ListRenderJobsResponse, responses={404: {"model": ErrorEnvelope}})
def list_render_jobs(
    project_id: str,
    container: Annotated[ApplicationContainer, Depends(get_container)],
) -> ListRenderJobsResponse:
    return container.render_service.list_jobs(project_id)


@router.get("/{job_id}", response_model=RenderJobResponse, responses={404: {"model": ErrorEnvelope}})
def get_render_job(
    project_id: str,
    job_id: str,
    container: Annotated[ApplicationContainer, Depends(get_container)],
) -> RenderJobResponse:
    return container.render_service.get_job(project_id, job_id)


@router.get(
    "/{job_id}/audio",
    response_class=FileResponse,
    responses={
        200: {"content": {"audio/wav": {"schema": {"type": "string", "format": "binary"}}}},
        404: {"model": ErrorEnvelope},
        409: {"model": ErrorEnvelope},
    },
)
def get_render_job_audio(
    project_id: str,
    job_id: str,
    container: Annotated[ApplicationContainer, Depends(get_container)],
) -> FileResponse:
    audio_path = container.render_service.get_job_audio(project_id, job_id)
    return FileResponse(audio_path, media_type="audio/wav", filename=f"{job_id}.wav", content_disposition_type="inline")
