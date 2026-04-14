from __future__ import annotations

from typing import Any
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class ApiErrorCode(StrEnum):
    INVALID_REQUEST = "INVALID_REQUEST"
    PROJECT_NOT_FOUND = "PROJECT_NOT_FOUND"
    CHAPTER_NOT_FOUND = "CHAPTER_NOT_FOUND"
    UNSUPPORTED_IMPORT_TYPE = "UNSUPPORTED_IMPORT_TYPE"
    MALFORMED_IMPORT = "MALFORMED_IMPORT"
    MODEL_HARDWARE_UNSUPPORTED = "MODEL_HARDWARE_UNSUPPORTED"
    MODEL_DISK_SPACE_LOW = "MODEL_DISK_SPACE_LOW"
    MODEL_MANIFEST_FETCH_FAILED = "MODEL_MANIFEST_FETCH_FAILED"
    MODEL_MANIFEST_INVALID = "MODEL_MANIFEST_INVALID"
    MODEL_DOWNLOAD_FAILED = "MODEL_DOWNLOAD_FAILED"
    MODEL_CHECKSUM_MISMATCH = "MODEL_CHECKSUM_MISMATCH"


class RuntimeBlockingIssueCode(StrEnum):
    MODELS_MISSING = "MODELS_MISSING"
    DISK_SPACE_LOW = "DISK_SPACE_LOW"
    UNSUPPORTED_HARDWARE = "UNSUPPORTED_HARDWARE"
    MODEL_MANIFEST_INVALID = "MODEL_MANIFEST_INVALID"
    MODEL_DOWNLOAD_ERROR = "MODEL_DOWNLOAD_ERROR"


class ModelInstallErrorCode(StrEnum):
    UNSUPPORTED_HARDWARE = "UNSUPPORTED_HARDWARE"
    DISK_SPACE_LOW = "DISK_SPACE_LOW"
    MODEL_MANIFEST_FETCH_FAILED = "MODEL_MANIFEST_FETCH_FAILED"
    MODEL_MANIFEST_INVALID = "MODEL_MANIFEST_INVALID"
    MODEL_DOWNLOAD_FAILED = "MODEL_DOWNLOAD_FAILED"
    MODEL_CHECKSUM_MISMATCH = "MODEL_CHECKSUM_MISMATCH"
    INTERRUPTED = "INTERRUPTED"


class ModelTier(StrEnum):
    TADA_3B_Q4 = "tada-3b-q4"


class ModelInstallState(StrEnum):
    NOT_INSTALLED = "not_installed"
    UNAVAILABLE = "unavailable"
    DOWNLOADING = "downloading"
    VERIFYING = "verifying"
    INSTALLED = "installed"
    ERROR = "error"


class StartModelDownloadResult(StrEnum):
    STARTED = "started"
    ALREADY_DOWNLOADING = "already_downloading"
    ALREADY_INSTALLED = "already_installed"


class ImportState(StrEnum):
    STORED = "stored"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ImportFormat(StrEnum):
    TXT = ".txt"
    MD = ".md"


class ApiError(CamelModel):
    code: ApiErrorCode
    message: str


class ErrorEnvelope(CamelModel):
    error: ApiError


class HealthResponse(CamelModel):
    healthy: bool
    contract_version: str
    runtime_version: str


class ProfileResponse(CamelModel):
    id: str
    name: str
    avatar_id: str | None
    has_completed_profile_setup: bool
    created_at: str
    updated_at: str


class PatchProfileRequest(CamelModel):
    name: str | None = None
    avatar_id: str | None = None


class RuntimeBlockingIssue(CamelModel):
    code: RuntimeBlockingIssueCode
    message: str


class ModelInstallStatus(CamelModel):
    state: ModelInstallState
    requested_tier: ModelTier | None
    resolved_tier: ModelTier | None
    manifest_version: str | None
    checksum_verified: bool
    bytes_downloaded: int | None
    total_bytes: int | None
    updated_at: str | None
    last_error_code: ModelInstallErrorCode | None
    last_error_message: str | None


class RuntimeStatusResponse(CamelModel):
    healthy: bool
    contract_version: str
    models_ready: bool
    active_model_tier: ModelTier | None
    default_model_tier: ModelTier
    can_run_3b_quantized: bool = Field(alias="canRun3BQuantized")
    disk_ready: bool
    available_disk_bytes: int
    minimum_disk_free_bytes: int
    blocking_issues: list[RuntimeBlockingIssue]
    model_install: ModelInstallStatus
    supported_import_formats: list[ImportFormat]


class StartModelDownloadRequest(CamelModel):
    requested_tier: ModelTier | None = None


class StartModelDownloadResponse(CamelModel):
    result: StartModelDownloadResult
    model_install: ModelInstallStatus


class ProseMirrorNode(CamelModel):
    type: str
    attrs: dict[str, Any] | None = None
    content: list["ProseMirrorNode"] | None = None
    text: str | None = None


class ImportWarning(CamelModel):
    id: str
    code: str
    severity: str
    message: str
    source_page: int | None = None
    block_id: str | None = None


class ChapterSummary(CamelModel):
    id: str
    title: str
    order: int
    warning_count: int
    source_document_record_id: str | None = None


class ChapterDetailResponse(CamelModel):
    id: str
    project_id: str
    title: str
    order: int
    revision: int
    editor_doc: ProseMirrorNode
    markdown: str
    warnings: list[ImportWarning]
    source_document_record_id: str | None = None
    created_at: str
    updated_at: str


class UpdateChapterRequest(CamelModel):
    editor_doc: ProseMirrorNode


class ProjectCard(CamelModel):
    id: str
    title: str
    chapter_count: int
    last_opened_at: str | None
    active_job_count: int
    created_at: str
    updated_at: str


class ProjectImportSummary(CamelModel):
    id: str
    state: ImportState
    source_file_name: str
    source_mime_type: str
    source_sha256: str
    file_size_bytes: int
    created_at: str
    updated_at: str
    failure_message: str | None


class ProjectDetailResponse(CamelModel):
    id: str
    title: str
    chapters: list[ChapterSummary]
    imports: list[ProjectImportSummary]
    default_voice_preset_id: str | None
    created_at: str
    updated_at: str
    last_opened_at: str | None


class ListProjectsResponse(CamelModel):
    projects: list[ProjectCard]


class CreateProjectRequest(CamelModel):
    title: str


class UpdateProjectRequest(CamelModel):
    title: str | None = None
    default_voice_preset_id: str | None = None


class CreateImportResponse(CamelModel):
    project: ProjectDetailResponse
    import_: ProjectImportSummary = Field(alias="import")


class VoicePresetResponse(CamelModel):
    id: str
    name: str
    language: str
    cached_reference_path: str | None


class ListVoicePresetsResponse(CamelModel):
    presets: list[VoicePresetResponse]


ProseMirrorNode.model_rebuild()
