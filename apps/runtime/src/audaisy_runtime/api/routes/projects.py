from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile, status

from audaisy_runtime.api.dependencies import get_container
from audaisy_runtime.container import ApplicationContainer
from audaisy_runtime.contracts.models import (
    CreateImportResponse,
    CreateProjectRequest,
    ErrorEnvelope,
    ListProjectsResponse,
    ProjectDetailResponse,
    UpdateProjectRequest,
)


router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=ListProjectsResponse)
def list_projects(container: Annotated[ApplicationContainer, Depends(get_container)]) -> ListProjectsResponse:
    return container.project_service.list_projects()


@router.post(
    "",
    response_model=ProjectDetailResponse,
    status_code=status.HTTP_201_CREATED,
    responses={422: {"model": ErrorEnvelope}},
)
def create_project(
    payload: CreateProjectRequest,
    container: Annotated[ApplicationContainer, Depends(get_container)],
) -> ProjectDetailResponse:
    return container.project_service.create_project(payload)


@router.get("/{project_id}", response_model=ProjectDetailResponse, responses={404: {"model": ErrorEnvelope}})
def get_project(
    project_id: str,
    container: Annotated[ApplicationContainer, Depends(get_container)],
) -> ProjectDetailResponse:
    return container.project_service.get_project(project_id)


@router.patch(
    "/{project_id}",
    response_model=ProjectDetailResponse,
    responses={404: {"model": ErrorEnvelope}, 422: {"model": ErrorEnvelope}},
)
def patch_project(
    project_id: str,
    payload: UpdateProjectRequest,
    container: Annotated[ApplicationContainer, Depends(get_container)],
) -> ProjectDetailResponse:
    return container.project_service.update_project(project_id, payload)


@router.post(
    "/{project_id}/imports",
    response_model=CreateImportResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"model": ErrorEnvelope},
        415: {"model": ErrorEnvelope},
        422: {"model": ErrorEnvelope},
    },
)
async def import_project_file(
    project_id: str,
    container: Annotated[ApplicationContainer, Depends(get_container)],
    file: UploadFile = File(...),
) -> CreateImportResponse:
    return await container.import_service.import_file(project_id, file)
