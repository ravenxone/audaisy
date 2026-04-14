from __future__ import annotations

import json
import tempfile
from pathlib import Path

from audaisy_runtime.contracts.models import (
    ApiErrorCode,
    ChapterDetailResponse,
    ImportWarning,
    UpdateChapterRequest,
)
from audaisy_runtime.manuscript.block_ids import ensure_block_ids
from audaisy_runtime.errors import DomainError
from audaisy_runtime.manuscript.projection import project_markdown_from_editor_doc
from audaisy_runtime.persistence.chapter_repository import ChapterRepository
from audaisy_runtime.persistence.import_warning_repository import ImportWarningRepository
from audaisy_runtime.persistence.project_repository import ProjectRepository
from audaisy_runtime.services.app_paths import AppPaths
from audaisy_runtime.services.profile_service import utc_now


class ChapterService:
    def __init__(
        self,
        project_repository: ProjectRepository,
        chapter_repository: ChapterRepository,
        import_warning_repository: ImportWarningRepository,
        app_paths: AppPaths,
    ) -> None:
        self._project_repository = project_repository
        self._chapter_repository = chapter_repository
        self._import_warning_repository = import_warning_repository
        self._app_paths = app_paths

    def get_chapter(self, project_id: str, chapter_id: str) -> ChapterDetailResponse:
        chapter = self._get_chapter_row(project_id, chapter_id)
        return self._build_detail(chapter)

    def update_chapter(self, project_id: str, chapter_id: str, payload: UpdateChapterRequest) -> ChapterDetailResponse:
        chapter = self._get_chapter_row(project_id, chapter_id)
        editor_doc = ensure_block_ids(payload.editor_doc.model_dump(by_alias=True, exclude_none=True))
        markdown = project_markdown_from_editor_doc(editor_doc)

        editor_doc_path = self._app_paths.root.joinpath(chapter["editor_doc_path"])
        markdown_path = self._app_paths.root.joinpath(chapter["markdown_path"])
        previous_editor_doc = editor_doc_path.read_text()
        previous_markdown = markdown_path.read_text()

        self._replace_file(editor_doc_path, json.dumps(editor_doc, indent=2) + "\n")
        self._replace_file(markdown_path, f"{markdown}\n" if markdown else "")

        try:
            updated_row = self._chapter_repository.update_content(
                project_id=project_id,
                chapter_id=chapter_id,
                markdown_path=chapter["markdown_path"],
                editor_doc_path=chapter["editor_doc_path"],
                revision=chapter["revision"] + 1,
                updated_at=utc_now(),
            )
        except Exception:
            editor_doc_path.write_text(previous_editor_doc)
            markdown_path.write_text(previous_markdown)
            raise

        return self._build_detail(updated_row)

    def _get_chapter_row(self, project_id: str, chapter_id: str):
        project = self._project_repository.get(project_id)
        if project is None:
            raise DomainError(ApiErrorCode.PROJECT_NOT_FOUND, "Project was not found.", 404)

        chapter = self._chapter_repository.get(project_id, chapter_id)
        if chapter is None:
            raise DomainError(ApiErrorCode.CHAPTER_NOT_FOUND, "Chapter was not found.", 404)
        return chapter

    def _build_detail(self, chapter) -> ChapterDetailResponse:
        editor_doc = json.loads(self._read_file(chapter["editor_doc_path"]))
        markdown = self._read_file(chapter["markdown_path"])
        warnings = [
            ImportWarning(
                id=row["id"],
                code=row["code"],
                severity=row["severity"],
                message=row["message"],
                source_page=row["source_page"],
                block_id=row["block_id"],
            )
            for row in self._import_warning_repository.list_by_chapter(chapter["id"])
        ]
        return ChapterDetailResponse(
            id=chapter["id"],
            project_id=chapter["project_id"],
            title=chapter["title"],
            order=chapter["chapter_order"],
            revision=chapter["revision"],
            editor_doc=editor_doc,
            markdown=markdown,
            warnings=warnings,
            source_document_record_id=chapter["document_record_id"],
            created_at=chapter["created_at"],
            updated_at=chapter["updated_at"],
        )

    def _read_file(self, path: str) -> str:
        return self._app_paths.root.joinpath(path).read_text()

    def _replace_file(self, target: Path, contents: str) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        temp_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile("w", dir=target.parent, delete=False, encoding="utf-8") as handle:
                handle.write(contents)
                temp_path = Path(handle.name)
            temp_path.replace(target)
        finally:
            if temp_path is not None and temp_path.exists():
                temp_path.unlink(missing_ok=True)
