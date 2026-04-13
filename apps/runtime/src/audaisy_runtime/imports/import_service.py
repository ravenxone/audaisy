from __future__ import annotations

import hashlib
import re
import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from audaisy_runtime.contracts.models import ApiErrorCode, CreateImportResponse, ProjectImportSummary
from audaisy_runtime.contracts.models import ImportState
from audaisy_runtime.errors import DomainError
from audaisy_runtime.imports.validation import ImportValidator
from audaisy_runtime.persistence.document_record_repository import DocumentRecordRepository
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
        document_record_repository: DocumentRecordRepository,
        project_service: ProjectService,
        app_paths: AppPaths,
        import_validator: ImportValidator,
    ) -> None:
        self._document_record_repository = document_record_repository
        self._project_service = project_service
        self._app_paths = app_paths
        self._import_validator = import_validator

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
        import_summary = ProjectImportSummary(
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
        return CreateImportResponse(project=project_detail, import_=import_summary)
