from __future__ import annotations

import json
import os
import platform
from dataclasses import dataclass
from pathlib import Path
from typing import NoReturn

from audaisy_runtime.contracts.models import (
    ApiErrorCode,
    ModelInstallErrorCode,
    ModelInstallState,
    ModelInstallStatus,
    ModelTier,
    StartModelDownloadRequest,
)
from audaisy_runtime.errors import DomainError
from audaisy_runtime.services.profile_service import utc_now


MODEL_DOWNLOAD_UNAVAILABLE_MESSAGE = "Model download is not implemented in this runtime slice yet."
INVALID_MANIFEST_MESSAGE = "Installed model manifest is unreadable or invalid."


@dataclass(frozen=True, slots=True)
class MachineCapability:
    can_run_3b_quantized: bool
    recommended_tier: ModelTier


@dataclass(frozen=True, slots=True)
class ManifestReadResult:
    exists: bool
    valid: bool
    payload: dict[str, object] | None


class ModelManager:
    MANIFEST_FILE_NAME = "manifest.json"

    def __init__(
        self,
        settings,
        cache_models_dir: Path,
    ) -> None:
        self._settings = settings
        self._cache_models_dir = cache_models_dir

    def get_install_status(self) -> ModelInstallStatus:
        manifest = self._read_manifest()

        if manifest.exists and not manifest.valid:
            return ModelInstallStatus(
                state=ModelInstallState.ERROR,
                requested_tier=None,
                resolved_tier=None,
                manifest_version=None,
                checksum_verified=False,
                bytes_downloaded=None,
                total_bytes=None,
                updated_at=utc_now(),
                last_error_code=ModelInstallErrorCode.MODEL_MANIFEST_INVALID,
                last_error_message=INVALID_MANIFEST_MESSAGE,
            )

        if manifest.payload is not None:
            return ModelInstallStatus(
                state=ModelInstallState.INSTALLED,
                requested_tier=manifest.payload.get("tier"),
                resolved_tier=manifest.payload.get("tier"),
                manifest_version=manifest.payload.get("version"),
                checksum_verified=bool(manifest.payload.get("checksumVerified")),
                bytes_downloaded=manifest.payload.get("bytesDownloaded"),
                total_bytes=manifest.payload.get("totalBytes"),
                updated_at=manifest.payload.get("updatedAt"),
                last_error_code=None,
                last_error_message=None,
            )

        return ModelInstallStatus(
            state=ModelInstallState.UNAVAILABLE,
            requested_tier=None,
            resolved_tier=None,
            manifest_version=None,
            checksum_verified=False,
            bytes_downloaded=None,
            total_bytes=None,
            updated_at=None,
            last_error_code=ModelInstallErrorCode.MODEL_DOWNLOAD_UNAVAILABLE,
            last_error_message=MODEL_DOWNLOAD_UNAVAILABLE_MESSAGE,
        )

    def start_install(self, payload: StartModelDownloadRequest) -> NoReturn:
        del payload
        raise DomainError(
            ApiErrorCode.MODEL_DOWNLOAD_UNAVAILABLE,
            MODEL_DOWNLOAD_UNAVAILABLE_MESSAGE,
            501,
        )

    def get_machine_capability(self) -> MachineCapability:
        arch = self._settings.machine_arch_override or platform.machine().lower()
        memory_bytes = self._settings.machine_memory_bytes_override or self._detect_memory_bytes()
        can_run_3b_quantized = arch in {"arm64", "aarch64"} and memory_bytes >= self._settings.minimum_memory_for_3b_bytes
        return MachineCapability(
            can_run_3b_quantized=can_run_3b_quantized,
            recommended_tier=self._settings.default_model_tier if can_run_3b_quantized else self._settings.fallback_model_tier,
        )

    @staticmethod
    def _detect_memory_bytes() -> int:
        try:
            page_size = os.sysconf("SC_PAGE_SIZE")
            phys_pages = os.sysconf("SC_PHYS_PAGES")
            return page_size * phys_pages
        except (ValueError, OSError, AttributeError):
            return 0

    def _read_manifest(self) -> ManifestReadResult:
        manifest_path = self._cache_models_dir / self.MANIFEST_FILE_NAME
        if not manifest_path.exists():
            return ManifestReadResult(exists=False, valid=True, payload=None)
        try:
            return ManifestReadResult(exists=True, valid=True, payload=json.loads(manifest_path.read_text()))
        except json.JSONDecodeError:
            return ManifestReadResult(exists=True, valid=False, payload=None)
