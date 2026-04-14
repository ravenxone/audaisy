from __future__ import annotations

import shutil
from uuid import uuid4

from audaisy_runtime.contracts.models import (
    ApiErrorCode,
    ChapterSummary,
    CreateProjectRequest,
    ListProjectsResponse,
    ProjectCard,
    ProjectDetailResponse,
    ProjectImportSummary,
    UpdateProjectRequest,
)
from audaisy_runtime.errors import DomainError
from audaisy_runtime.persistence.document_record_repository import DocumentRecordRepository
from audaisy_runtime.persistence.project_repository import ProjectRepository
from audaisy_runtime.services.app_paths import AppPaths
from audaisy_runtime.services.profile_service import utc_now


class ProjectService:
    def __init__(
        self,
        repository: ProjectRepository,
        document_record_repository: DocumentRecordRepository,
        app_paths: AppPaths,
    ) -> None:
        self._repository = repository
        self._document_record_repository = document_record_repository
        self._app_paths = app_paths

    def create_project(self, payload: CreateProjectRequest) -> ProjectDetailResponse:
        project_id = str(uuid4())
        timestamp = utc_now()
        title = payload.title.strip() or "Untitled Book"
        self._repository.create(
            project_id=project_id,
            title=title,
            created_at=timestamp,
            updated_at=timestamp,
            last_opened_at=timestamp,
        )
        self._app_paths.project_paths(project_id).ensure()
        return self._build_project_detail(project_id, touch_last_opened=False)

    def list_projects(self) -> ListProjectsResponse:
        return ListProjectsResponse(
            projects=[
                ProjectCard(
                    id=row["id"],
                    title=row["title"],
                    chapter_count=row["chapter_count"],
                    last_opened_at=row["last_opened_at"],
                    active_job_count=row["active_job_count"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
                for row in self._repository.list_cards()
            ]
        )

    def get_project(self, project_id: str) -> ProjectDetailResponse:
        project = self._repository.get(project_id)
        if project is None:
            raise DomainError(ApiErrorCode.PROJECT_NOT_FOUND, "Project was not found.", 404)
        self._repository.touch_last_opened(project_id, utc_now())
        return self._build_project_detail(project_id, touch_last_opened=False)

    def update_project(self, project_id: str, payload: UpdateProjectRequest) -> ProjectDetailResponse:
        current = self._repository.get(project_id)
        if current is None:
            raise DomainError(ApiErrorCode.PROJECT_NOT_FOUND, "Project was not found.", 404)

        next_title = payload.title.strip() if payload.title is not None else current["title"]
        if not next_title:
            next_title = "Untitled Book"
        next_voice = payload.default_voice_preset_id if payload.default_voice_preset_id is not None else current["default_voice_preset_id"]
        self._repository.update(project_id, next_title, next_voice, utc_now())
        return self._build_project_detail(project_id, touch_last_opened=False)

    def delete_project(self, project_id: str) -> None:
        current = self._repository.get(project_id)
        if current is None:
            raise DomainError(ApiErrorCode.PROJECT_NOT_FOUND, "Project was not found.", 404)

        self._repository.delete(project_id)
        shutil.rmtree(self._app_paths.project_paths(project_id).root, ignore_errors=True)

    def build_project_detail(self, project_id: str) -> ProjectDetailResponse:
        return self._build_project_detail(project_id, touch_last_opened=False)

    def _build_project_detail(self, project_id: str, *, touch_last_opened: bool) -> ProjectDetailResponse:
        project = self._repository.get(project_id)
        if project is None:
            raise DomainError(ApiErrorCode.PROJECT_NOT_FOUND, "Project was not found.", 404)
        if touch_last_opened:
            project = self._repository.touch_last_opened(project_id, utc_now())
        chapters = [
            ChapterSummary(
                id=row["id"],
                title=row["title"],
                order=row["chapter_order"],
                warning_count=row["warning_count"],
            )
            for row in self._repository.list_chapter_summaries(project_id)
        ]
        imports = [
            ProjectImportSummary(
                id=row["id"],
                state=row["state"],
                source_file_name=row["source_file_name"],
                source_mime_type=row["source_mime_type"],
                source_sha256=row["source_sha256"],
                file_size_bytes=row["file_size_bytes"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                failure_message=row["failure_message"],
            )
            for row in self._document_record_repository.list_by_project(project_id)
        ]
        return ProjectDetailResponse(
            id=project["id"],
            title=project["title"],
            chapters=chapters,
            imports=imports,
            default_voice_preset_id=project["default_voice_preset_id"],
            created_at=project["created_at"],
            updated_at=project["updated_at"],
            last_opened_at=project["last_opened_at"],
        )
