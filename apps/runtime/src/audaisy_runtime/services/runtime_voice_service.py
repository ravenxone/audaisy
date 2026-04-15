from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path
from sqlite3 import Row

import soundfile as sf

from audaisy_runtime.contracts.models import ApiErrorCode, VoicePresetResponse
from audaisy_runtime.errors import RenderPipelineError
from audaisy_runtime.persistence.voice_preset_repository import VoicePresetRepository
from audaisy_runtime.services.app_paths import AppPaths
from audaisy_runtime.services.profile_service import utc_now
from audaisy_runtime.settings import Settings


DEFAULT_VOICE_PRESET_ID = "default-local-reference"
DEFAULT_VOICE_PRESET_NAME = "Default Local Reference"
DEFAULT_VOICE_PRESET_LANGUAGE = "en"
DEFAULT_CACHED_REFERENCE_PATH = "cache/voices/default-reference.wav"
DEFAULT_REFERENCE_ASSET_KEY = "default-reference.wav"
DEFAULT_REFERENCE_TRANSCRIPT = (
    "The examination and testimony of the experts, enabled the commission to conclude "
    "that five shots may have been fired."
)


@dataclass(frozen=True, slots=True)
class ResolvedVoiceReference:
    preset: Row
    path: Path
    transcript: str | None


class RuntimeVoiceService:
    def __init__(self, repository: VoicePresetRepository, app_paths: AppPaths, settings: Settings) -> None:
        self._repository = repository
        self._app_paths = app_paths
        self._settings = settings

    def list_presets(self) -> list[VoicePresetResponse]:
        self.ensure_default_preset()
        return [
            VoicePresetResponse(
                id=row["id"],
                name=row["name"],
                language=row["language"],
                has_reference=self._has_reference(row),
            )
            for row in self._repository.list_all()
        ]

    def ensure_default_preset(self) -> Row:
        source_path = self._settings.bundled_default_reference_asset_path
        if not source_path.is_file():
            raise RenderPipelineError(
                api_error_code=ApiErrorCode.VOICE_REFERENCE_MISSING,
                failure_code="VOICE_REFERENCE_MISSING",
                message=f"Bundled default reference clip is missing: {source_path}",
            )

        target_path = self._app_paths.root / DEFAULT_CACHED_REFERENCE_PATH
        target_path.parent.mkdir(parents=True, exist_ok=True)
        if not target_path.exists():
            shutil.copyfile(source_path, target_path)

        self._validate_reference_file(target_path)
        existing = self._repository.get(DEFAULT_VOICE_PRESET_ID)
        created_at = existing["created_at"] if existing is not None else utc_now()
        return self._repository.upsert(
            preset_id=DEFAULT_VOICE_PRESET_ID,
            name=DEFAULT_VOICE_PRESET_NAME,
            language=DEFAULT_VOICE_PRESET_LANGUAGE,
            reference_asset_path=DEFAULT_REFERENCE_ASSET_KEY,
            cached_reference_path=DEFAULT_CACHED_REFERENCE_PATH,
            created_at=created_at,
        )

    def resolve_reference(
        self,
        voice_preset_id: str | None,
        *,
        project_default_voice_preset_id: str | None = None,
    ) -> ResolvedVoiceReference:
        self.ensure_default_preset()
        effective_id = voice_preset_id or project_default_voice_preset_id or DEFAULT_VOICE_PRESET_ID
        row = self._repository.get(effective_id)
        if row is None:
            raise RenderPipelineError(
                api_error_code=ApiErrorCode.VOICE_PRESET_NOT_FOUND,
                failure_code="VOICE_PRESET_NOT_FOUND",
                message=f"Voice preset {effective_id} was not found.",
            )

        cached_reference_path = row["cached_reference_path"]
        if not cached_reference_path:
            raise RenderPipelineError(
                api_error_code=ApiErrorCode.VOICE_REFERENCE_MISSING,
                failure_code="VOICE_REFERENCE_MISSING",
                message=f"Voice preset {effective_id} has no usable reference clip.",
            )

        absolute_path = self._resolve_runtime_path(cached_reference_path)
        if not absolute_path.is_file():
            raise RenderPipelineError(
                api_error_code=ApiErrorCode.VOICE_REFERENCE_MISSING,
                failure_code="VOICE_REFERENCE_MISSING",
                message=f"Voice preset {effective_id} reference clip is missing on disk.",
            )

        self._validate_reference_file(absolute_path)
        transcript = DEFAULT_REFERENCE_TRANSCRIPT if row["id"] == DEFAULT_VOICE_PRESET_ID else None
        return ResolvedVoiceReference(preset=row, path=absolute_path, transcript=transcript)

    def _resolve_runtime_path(self, value: str) -> Path:
        path = Path(value)
        if path.is_absolute():
            return path
        return self._app_paths.root / path

    def _validate_reference_file(self, path: Path) -> None:
        try:
            info = sf.info(path)
        except Exception as error:
            raise RenderPipelineError(
                api_error_code=ApiErrorCode.VOICE_REFERENCE_MISSING,
                failure_code="VOICE_REFERENCE_MISSING",
                message=f"Reference clip is unreadable: {path}",
            ) from error

        if info.frames <= 0:
            raise RenderPipelineError(
                api_error_code=ApiErrorCode.VOICE_REFERENCE_MISSING,
                failure_code="VOICE_REFERENCE_MISSING",
                message=f"Reference clip is empty: {path}",
            )

    @staticmethod
    def _has_reference(row: Row) -> bool:
        return bool(row["cached_reference_path"])
