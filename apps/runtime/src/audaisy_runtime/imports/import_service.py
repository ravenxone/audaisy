from __future__ import annotations

import hashlib
import json
import re
import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from audaisy_runtime.contracts.models import ApiErrorCode, CreateImportResponse, ProjectImportSummary
from audaisy_runtime.contracts.models import ImportState
from audaisy_runtime.errors import DomainError
from audaisy_runtime.imports.validation import ImportValidator
from audaisy_runtime.manuscript.normalization import ImportNormalizationService
from audaisy_runtime.persistence.chapter_repository import ChapterRepository
from audaisy_runtime.persistence.document_record_repository import DocumentRecordRepository
from audaisy_runtime.persistence.import_warning_repository import ImportWarningRepository
from audaisy_runtime.persistence.project_repository import ProjectRepository
from audaisy_runtime.services.app_paths import AppPaths
from audaisy_runtime.services.profile_service import utc_now
from audaisy_runtime.services.project_service import ProjectService

CHUNK_SIZE = 1024 * 1024


def sanitize_uploaded_filename(filename: str | None) -> str:
    raw = filename or "upload"
    collapsed = raw.replace("\\", "/").split("/")[-1]
    normalized = re.sub(r"[^A-Za-z0-9._ -]", "_", collapsed).strip(" .")
    return normalized or "upload"


class ImportService:
    def __init__(
        self,
        *,
        project_repository: ProjectRepository,
        chapter_repository: ChapterRepository,
        document_record_repository: DocumentRecordRepository,
        import_warning_repository: ImportWarningRepository,
        project_service: ProjectService,
        app_paths: AppPaths,
        import_validator: ImportValidator,
        normalization_service: ImportNormalizationService,
    ) -> None:
        self._project_repository = project_repository
        self._chapter_repository = chapter_repository
        self._document_record_repository = document_record_repository
        self._import_warning_repository = import_warning_repository
        self._project_service = project_service
        self._app_paths = app_paths
        self._import_validator = import_validator
        self._normalization_service = normalization_service

    async def import_file(self, project_id: str, upload: UploadFile) -> CreateImportResponse:
        project = self._project_service.build_project_detail(project_id)
        sanitized_name = sanitize_uploaded_filename(upload.filename)
        suffix = Path(sanitized_name).suffix.lower()
        validation_session = self._import_validator.create_session(suffix)

        project_paths = self._app_paths.project_paths(project_id)
        project_paths.ensure()
        record_id = str(uuid4())
        final_path = project_paths.originals_dir / f"{record_id}{suffix}"

        hasher = hashlib.sha256()
        file_size = 0
        temp_path: Path | None = None

        try:
            with tempfile.NamedTemporaryFile(
                dir=project_paths.originals_dir,
                delete=False,
                prefix=f"{record_id}-",
                suffix=".upload",
            ) as handle:
                temp_path = Path(handle.name)
                is_first_chunk = True
                while chunk := await upload.read(CHUNK_SIZE):
                    validation_session.validate_chunk(chunk, is_first_chunk=is_first_chunk)
                    handle.write(chunk)
                    hasher.update(chunk)
                    file_size += len(chunk)
                    is_first_chunk = False

                if file_size == 0:
                    raise DomainError(ApiErrorCode.MALFORMED_IMPORT, "Uploaded file is empty.", 415)
                detected_mime_type = validation_session.finalize()

            temp_path.replace(final_path)
            timestamp = utc_now()
            row = self._document_record_repository.create(
                record_id=record_id,
                project_id=project.id,
                source_file_name=sanitized_name,
                source_mime_type=detected_mime_type,
                source_sha256=hasher.hexdigest(),
                created_at=timestamp,
                updated_at=timestamp,
                state=ImportState.STORED,
                original_file_path=str(final_path),
                file_size_bytes=file_size,
                failure_message=None,
            )
        finally:
            await upload.close()
            if temp_path is not None and temp_path.exists():
                temp_path.unlink(missing_ok=True)

        project_detail = self._project_service.build_project_detail(project_id)
        return CreateImportResponse(project=project_detail, import_=self._to_import_summary(row))

    def process_import(self, project_id: str, record_id: str) -> None:
        record = self._document_record_repository.get(record_id)
        if record is None or record["project_id"] != project_id:
            return

        self._cleanup_partial_chapters(record_id)
        timestamp = utc_now()
        self._document_record_repository.mark_processing(record_id, timestamp)

        chapter_id: str | None = None
        chapter_editor_doc_path: Path | None = None
        chapter_markdown_path: Path | None = None
        try:
            record = self._document_record_repository.get(record_id)
            if record is None:
                return

            if self._project_repository.get(project_id) is None:
                raise DomainError(ApiErrorCode.PROJECT_NOT_FOUND, "Project was not found.", 404)

            project_paths = self._app_paths.project_paths(project_id)
            project_paths.ensure()
            source_path = Path(record["original_file_path"])
            title_fallback = (
                Path(record["source_file_name"]).stem.replace("_", " ").replace("-", " ").strip() or "Untitled Chapter"
            )
            normalized = self._normalization_service.normalize(
                source_text=source_path.read_text(encoding="utf-8"),
                source_format=source_path.suffix.lower(),
                title_fallback=title_fallback,
                document_record_id=record_id,
            )

            normalized_dir = project_paths.normalized_dir / record_id
            normalized_dir.mkdir(parents=True, exist_ok=True)
            canonical_path = normalized_dir / "canonical.json"
            canonical_path.write_text(json.dumps(normalized.canonical_document, indent=2) + "\n")
            normalized_markdown_path = normalized_dir / "manuscript.md"
            normalized_markdown_path.write_text(f"{normalized.markdown}\n" if normalized.markdown else "")

            chapter_id = str(uuid4())
            chapter_order = self._chapter_repository.next_order(project_id)
            chapter_editor_doc_path = project_paths.chapters_dir / f"{chapter_id}.json"
            chapter_editor_doc_path.write_text(json.dumps(normalized.editor_doc, indent=2) + "\n")
            chapter_markdown_path = project_paths.chapters_dir / f"{chapter_id}.md"
            chapter_markdown_path.write_text(f"{normalized.markdown}\n" if normalized.markdown else "")

            created_at = utc_now()
            self._chapter_repository.create(
                chapter_id=chapter_id,
                project_id=project_id,
                title=normalized.chapter_title,
                chapter_order=chapter_order,
                markdown_path=self._relative_path(chapter_markdown_path),
                editor_doc_path=self._relative_path(chapter_editor_doc_path),
                document_record_id=record_id,
                revision=1,
                created_at=created_at,
                updated_at=created_at,
            )
            self._import_warning_repository.create_many(
                [
                    (
                        str(uuid4()),
                        chapter_id,
                        record_id,
                        warning.code,
                        warning.severity,
                        warning.message,
                        None,
                        warning.block_id,
                    )
                    for warning in normalized.warnings
                ]
            )
            self._document_record_repository.mark_completed(
                record_id,
                canonical_json_path=self._relative_path(canonical_path),
                markdown_projection_path=self._relative_path(normalized_markdown_path),
                confidence=normalized.confidence,
                updated_at=utc_now(),
            )
        except Exception as error:
            if chapter_id is not None:
                self._cleanup_partial_chapters(record_id)
            if chapter_editor_doc_path is not None:
                chapter_editor_doc_path.unlink(missing_ok=True)
            if chapter_markdown_path is not None:
                chapter_markdown_path.unlink(missing_ok=True)
            failure_message = str(error).strip() or "Import processing failed."
            self._document_record_repository.mark_failed(record_id, failure_message=failure_message, updated_at=utc_now())

    def resume_incomplete_imports(self) -> None:
        for record in self._document_record_repository.list_incomplete():
            self.process_import(record["project_id"], record["id"])

    def _to_import_summary(self, row) -> ProjectImportSummary:
        return ProjectImportSummary(
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

    def _relative_path(self, path: Path) -> str:
        return str(path.relative_to(self._app_paths.root))

    def _cleanup_partial_chapters(self, document_record_id: str) -> None:
        for chapter in self._chapter_repository.list_by_document_record(document_record_id):
            self._app_paths.root.joinpath(chapter["editor_doc_path"]).unlink(missing_ok=True)
            self._app_paths.root.joinpath(chapter["markdown_path"]).unlink(missing_ok=True)
        self._chapter_repository.delete_by_document_record(document_record_id)
