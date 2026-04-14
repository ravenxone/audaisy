from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Response, UploadFile, status

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


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"model": ErrorEnvelope}},
)
def delete_project(
    project_id: str,
    container: Annotated[ApplicationContainer, Depends(get_container)],
) -> Response:
    container.project_service.delete_project(project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
    background_tasks: BackgroundTasks,
    container: Annotated[ApplicationContainer, Depends(get_container)],
    file: UploadFile = File(...),
) -> CreateImportResponse:
    response = await container.import_service.import_file(project_id, file)
    background_tasks.add_task(container.import_service.process_import, project_id, response.import_.id)
    return response
