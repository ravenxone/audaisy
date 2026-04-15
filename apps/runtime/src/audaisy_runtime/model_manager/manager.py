from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import threading
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import urlopen

from audaisy_runtime.contracts.models import (
    ApiErrorCode,
    ModelInstallErrorCode,
    ModelInstallState,
    ModelInstallStatus,
    ModelTier,
    StartModelDownloadRequest,
    StartModelDownloadResponse,
    StartModelDownloadResult,
)
from audaisy_runtime.errors import DomainError
from audaisy_runtime.persistence.runtime_settings_repository import RuntimeSettingsRepository
from audaisy_runtime.services.profile_service import utc_now


HF_REPO_ID = "ravenxone/mlx-tada-3b"
HF_REVISION = "eefbd2c57c133cacd5982b38f242fff16d558040"
HF_MANIFEST_PATH = "manifest.json"
EXPECTED_MANIFEST_VERSION = "2026-04-13.1"
INSTALL_STATE_KEY = "model_install"
DOWNLOAD_CHUNK_SIZE = 1024 * 1024
INVALID_LOCAL_MANIFEST_MESSAGE = "Installed model manifest is unreadable or invalid."
INVALID_REMOTE_MANIFEST_MESSAGE = "Pinned model manifest is invalid."
UNSUPPORTED_HARDWARE_MESSAGE = "This machine cannot run the only available tada-3b-q4 model tier."
MANIFEST_FETCH_FAILED_MESSAGE = "Could not fetch the pinned model manifest."
DISK_SPACE_LOW_MESSAGE = "Not enough disk space is available to install the model."
DOWNLOAD_FAILED_MESSAGE = "Model artifact download failed."
CHECKSUM_MISMATCH_MESSAGE = "Downloaded model artifacts failed checksum verification."
INTERRUPTED_MESSAGE = "Model install was interrupted before completion."
INSTALLED_FILES_MISSING_MESSAGE = "Installed model artifacts are missing or incomplete."


class HuggingFaceClientError(Exception):
    pass


class ManifestValidationError(Exception):
    pass


class ChecksumMismatchError(Exception):
    pass


@dataclass(frozen=True, slots=True)
class MachineCapability:
    can_run_3b_quantized: bool
    recommended_tier: ModelTier


@dataclass(frozen=True, slots=True)
class ModelArtifact:
    repo_path: str
    local_path: str
    sha256: str
    size_bytes: int


@dataclass(frozen=True, slots=True)
class PinnedManifest:
    version: str
    default_tier: ModelTier
    files: tuple[ModelArtifact, ...]
    raw_payload: dict[str, Any]

    @property
    def total_bytes(self) -> int:
        return sum(artifact.size_bytes for artifact in self.files)


class HuggingFaceClient:
    def fetch_json(self, *, repo_id: str, revision: str, repo_path: str) -> dict[str, Any]:
        try:
            with urlopen(self._resolve_url(repo_id, revision, repo_path)) as response:
                payload = json.load(response)
        except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as error:
            raise HuggingFaceClientError(str(error)) from error

        if not isinstance(payload, dict):
            raise HuggingFaceClientError("Manifest payload is not a JSON object.")
        return payload

    def iter_file(self, *, repo_id: str, revision: str, repo_path: str):
        try:
            with urlopen(self._resolve_url(repo_id, revision, repo_path)) as response:
                while True:
                    chunk = response.read(DOWNLOAD_CHUNK_SIZE)
                    if not chunk:
                        return
                    yield chunk
        except (HTTPError, URLError, TimeoutError, OSError) as error:
            raise HuggingFaceClientError(str(error)) from error

    @staticmethod
    def _resolve_url(repo_id: str, revision: str, repo_path: str) -> str:
        return f"https://huggingface.co/{repo_id}/resolve/{quote(revision, safe='')}/{quote(repo_path, safe='/')}"


class ModelManager:
    MANIFEST_FILE_NAME = HF_MANIFEST_PATH

    def __init__(
        self,
        settings,
        cache_models_dir: Path,
        runtime_settings_repository: RuntimeSettingsRepository,
        hf_client: HuggingFaceClient | None = None,
    ) -> None:
        self._settings = settings
        self._cache_models_dir = cache_models_dir
        self._runtime_settings_repository = runtime_settings_repository
        self._hf_client = hf_client or HuggingFaceClient()
        self._state_lock = threading.Lock()
        self._install_lock = threading.Lock()

    def fetch_remote_manifest(self) -> PinnedManifest:
        payload = self._hf_client.fetch_json(
            repo_id=HF_REPO_ID,
            revision=HF_REVISION,
            repo_path=HF_MANIFEST_PATH,
        )
        return self._parse_manifest(payload, error_message=INVALID_REMOTE_MANIFEST_MESSAGE)

    def get_install_status(self) -> ModelInstallStatus:
        persisted_status = self._load_persisted_status()
        capability = self.get_machine_capability()

        if persisted_status is None:
            if not capability.can_run_3b_quantized:
                return self._status(
                    state=ModelInstallState.UNAVAILABLE,
                    updated_at=None,
                    last_error_code=ModelInstallErrorCode.UNSUPPORTED_HARDWARE,
                    last_error_message=UNSUPPORTED_HARDWARE_MESSAGE,
                )
            return self._status(state=ModelInstallState.NOT_INSTALLED, updated_at=None)

        if not capability.can_run_3b_quantized:
            return self._status_from_existing(
                persisted_status,
                state=ModelInstallState.UNAVAILABLE,
                checksum_verified=False,
                last_error_code=ModelInstallErrorCode.UNSUPPORTED_HARDWARE,
                last_error_message=UNSUPPORTED_HARDWARE_MESSAGE,
            )

        if persisted_status.state != ModelInstallState.INSTALLED:
            return persisted_status

        try:
            manifest = self._load_local_manifest()
        except ManifestValidationError:
            return self._status_from_existing(
                persisted_status,
                state=ModelInstallState.ERROR,
                checksum_verified=False,
                last_error_code=ModelInstallErrorCode.MODEL_MANIFEST_INVALID,
                last_error_message=INVALID_LOCAL_MANIFEST_MESSAGE,
            )

        if not self._all_files_present(manifest):
            return self._status_from_existing(
                persisted_status,
                state=ModelInstallState.ERROR,
                checksum_verified=False,
                bytes_downloaded=self._verified_bytes(manifest),
                total_bytes=manifest.total_bytes,
                manifest_version=manifest.version,
                last_error_code=ModelInstallErrorCode.MODEL_DOWNLOAD_FAILED,
                last_error_message=INSTALLED_FILES_MISSING_MESSAGE,
            )

        verified_bytes = self._verified_bytes(manifest)
        if verified_bytes != manifest.total_bytes:
            return self._status_from_existing(
                persisted_status,
                state=ModelInstallState.ERROR,
                checksum_verified=False,
                bytes_downloaded=verified_bytes,
                total_bytes=manifest.total_bytes,
                manifest_version=manifest.version,
                last_error_code=ModelInstallErrorCode.MODEL_CHECKSUM_MISMATCH,
                last_error_message=CHECKSUM_MISMATCH_MESSAGE,
            )

        return self._status_from_existing(
            persisted_status,
            checksum_verified=True,
            bytes_downloaded=manifest.total_bytes,
            total_bytes=manifest.total_bytes,
            manifest_version=manifest.version,
            last_error_code=None,
            last_error_message=None,
        )

    def resolve_installed_weights_dir(self) -> Path:
        manifest = self._load_local_manifest()
        roots = {PurePosixPath(artifact.local_path).parts[0] for artifact in manifest.files}
        if len(roots) != 1:
            raise ManifestValidationError(INVALID_LOCAL_MANIFEST_MESSAGE)
        return self._cache_models_dir / next(iter(roots))

    def start_install(self, payload: StartModelDownloadRequest) -> StartModelDownloadResponse:
        with self._state_lock:
            current_status = self.get_install_status()
            if current_status.state == ModelInstallState.INSTALLED and current_status.checksum_verified:
                return StartModelDownloadResponse(
                    result=StartModelDownloadResult.ALREADY_INSTALLED,
                    model_install=current_status,
                )
            if current_status.state in {ModelInstallState.DOWNLOADING, ModelInstallState.VERIFYING}:
                return StartModelDownloadResponse(
                    result=StartModelDownloadResult.ALREADY_DOWNLOADING,
                    model_install=current_status,
                )

            capability = self.get_machine_capability()
            if not capability.can_run_3b_quantized:
                status = self._status(
                    state=ModelInstallState.UNAVAILABLE,
                    last_error_code=ModelInstallErrorCode.UNSUPPORTED_HARDWARE,
                    last_error_message=UNSUPPORTED_HARDWARE_MESSAGE,
                )
                self._save_install_status(status)
                raise DomainError(ApiErrorCode.MODEL_HARDWARE_UNSUPPORTED, UNSUPPORTED_HARDWARE_MESSAGE, 409)

            try:
                manifest = self.fetch_remote_manifest()
            except HuggingFaceClientError as error:
                status = self._status(
                    state=ModelInstallState.ERROR,
                    requested_tier=payload.requested_tier,
                    last_error_code=ModelInstallErrorCode.MODEL_MANIFEST_FETCH_FAILED,
                    last_error_message=MANIFEST_FETCH_FAILED_MESSAGE,
                )
                self._save_install_status(status)
                raise DomainError(ApiErrorCode.MODEL_MANIFEST_FETCH_FAILED, MANIFEST_FETCH_FAILED_MESSAGE, 502) from error
            except ManifestValidationError as error:
                status = self._status(
                    state=ModelInstallState.ERROR,
                    requested_tier=payload.requested_tier,
                    last_error_code=ModelInstallErrorCode.MODEL_MANIFEST_INVALID,
                    last_error_message=str(error),
                )
                self._save_install_status(status)
                raise DomainError(ApiErrorCode.MODEL_MANIFEST_INVALID, str(error), 502) from error

            resolved_tier = payload.requested_tier or manifest.default_tier
            verified_bytes = self._verified_bytes(manifest)
            remaining_bytes = manifest.total_bytes - verified_bytes
            if self._available_disk_bytes() - remaining_bytes < self._settings.minimum_disk_free_bytes:
                status = self._status(
                    state=ModelInstallState.ERROR,
                    requested_tier=payload.requested_tier,
                    resolved_tier=resolved_tier,
                    manifest_version=manifest.version,
                    checksum_verified=False,
                    bytes_downloaded=verified_bytes,
                    total_bytes=manifest.total_bytes,
                    last_error_code=ModelInstallErrorCode.DISK_SPACE_LOW,
                    last_error_message=DISK_SPACE_LOW_MESSAGE,
                )
                self._save_install_status(status)
                raise DomainError(ApiErrorCode.MODEL_DISK_SPACE_LOW, DISK_SPACE_LOW_MESSAGE, 507)

            self._write_local_manifest(manifest.raw_payload)
            install_status = self._status(
                state=ModelInstallState.DOWNLOADING,
                requested_tier=payload.requested_tier,
                resolved_tier=resolved_tier,
                manifest_version=manifest.version,
                checksum_verified=False,
                bytes_downloaded=verified_bytes,
                total_bytes=manifest.total_bytes,
            )
            self._save_install_status(install_status)
            return StartModelDownloadResponse(
                result=StartModelDownloadResult.STARTED,
                model_install=install_status,
            )

    def run_install(self) -> None:
        if not self._install_lock.acquire(blocking=False):
            return

        try:
            persisted_status = self._load_persisted_status()
            if persisted_status is None or persisted_status.state != ModelInstallState.DOWNLOADING:
                return

            manifest = self._load_local_manifest()
            completed_bytes = self._verified_bytes(manifest)
            for artifact in manifest.files:
                if self._verify_artifact(artifact):
                    continue

                def handle_download_progress(bytes_written: int, *, prior_completed: int = completed_bytes) -> None:
                    self._save_install_status(
                        self._status_from_existing(
                            persisted_status,
                            state=ModelInstallState.DOWNLOADING,
                            manifest_version=manifest.version,
                            total_bytes=manifest.total_bytes,
                            bytes_downloaded=prior_completed + bytes_written,
                            checksum_verified=False,
                            last_error_code=None,
                            last_error_message=None,
                        )
                    )

                self._download_artifact(artifact, on_progress=handle_download_progress)
                completed_bytes += artifact.size_bytes
                self._save_install_status(
                    self._status_from_existing(
                        persisted_status,
                        state=ModelInstallState.DOWNLOADING,
                        manifest_version=manifest.version,
                        total_bytes=manifest.total_bytes,
                        bytes_downloaded=completed_bytes,
                        checksum_verified=False,
                        last_error_code=None,
                        last_error_message=None,
                    )
                )

            verifying_status = self._status_from_existing(
                persisted_status,
                state=ModelInstallState.VERIFYING,
                manifest_version=manifest.version,
                total_bytes=manifest.total_bytes,
                bytes_downloaded=manifest.total_bytes,
                checksum_verified=False,
                last_error_code=None,
                last_error_message=None,
            )
            self._save_install_status(verifying_status)

            for artifact in manifest.files:
                if not self._verify_artifact(artifact):
                    raise ChecksumMismatchError(artifact.local_path)

            self._save_install_status(
                self._status_from_existing(
                    persisted_status,
                    state=ModelInstallState.INSTALLED,
                    manifest_version=manifest.version,
                    total_bytes=manifest.total_bytes,
                    bytes_downloaded=manifest.total_bytes,
                    checksum_verified=True,
                    last_error_code=None,
                    last_error_message=None,
                )
            )
        except ManifestValidationError:
            self._save_install_status(
                self._status(
                    state=ModelInstallState.ERROR,
                    last_error_code=ModelInstallErrorCode.MODEL_MANIFEST_INVALID,
                    last_error_message=INVALID_LOCAL_MANIFEST_MESSAGE,
                )
            )
        except ChecksumMismatchError as error:
            self._save_install_status(
                self._error_status(
                    ModelInstallErrorCode.MODEL_CHECKSUM_MISMATCH,
                    f"{CHECKSUM_MISMATCH_MESSAGE} ({error})",
                )
            )
        except HuggingFaceClientError as error:
            self._save_install_status(
                self._error_status(
                    ModelInstallErrorCode.MODEL_DOWNLOAD_FAILED,
                    f"{DOWNLOAD_FAILED_MESSAGE} ({error})",
                )
            )
        except OSError as error:
            self._save_install_status(
                self._error_status(
                    ModelInstallErrorCode.MODEL_DOWNLOAD_FAILED,
                    f"{DOWNLOAD_FAILED_MESSAGE} ({error})",
                )
            )
        finally:
            self._install_lock.release()

    def reconcile_install_state(self) -> None:
        persisted_status = self._load_persisted_status()
        if persisted_status is None:
            return

        if persisted_status.state in {ModelInstallState.DOWNLOADING, ModelInstallState.VERIFYING}:
            manifest = self._try_load_local_manifest()
            bytes_downloaded = self._verified_bytes(manifest) if manifest is not None else persisted_status.bytes_downloaded
            total_bytes = manifest.total_bytes if manifest is not None else persisted_status.total_bytes
            manifest_version = manifest.version if manifest is not None else persisted_status.manifest_version
            self._save_install_status(
                self._status_from_existing(
                    persisted_status,
                    state=ModelInstallState.ERROR,
                    bytes_downloaded=bytes_downloaded,
                    total_bytes=total_bytes,
                    manifest_version=manifest_version,
                    checksum_verified=False,
                    last_error_code=ModelInstallErrorCode.INTERRUPTED,
                    last_error_message=INTERRUPTED_MESSAGE,
                )
            )
            return

        if persisted_status.state == ModelInstallState.INSTALLED:
            resolved_status = self.get_install_status()
            if resolved_status.state != ModelInstallState.INSTALLED:
                self._save_install_status(resolved_status)

    def get_machine_capability(self) -> MachineCapability:
        arch = self._settings.machine_arch_override or platform.machine().lower()
        memory_bytes = self._settings.machine_memory_bytes_override or self._detect_memory_bytes()
        can_run_3b_quantized = arch in {"arm64", "aarch64"} and memory_bytes >= self._settings.minimum_memory_for_3b_bytes
        return MachineCapability(
            can_run_3b_quantized=can_run_3b_quantized,
            recommended_tier=self._settings.default_model_tier,
        )

    def _available_disk_bytes(self) -> int:
        target = self._cache_models_dir if self._cache_models_dir.exists() else self._cache_models_dir.parent
        return shutil.disk_usage(target).free

    @staticmethod
    def _detect_memory_bytes() -> int:
        try:
            page_size = os.sysconf("SC_PAGE_SIZE")
            phys_pages = os.sysconf("SC_PHYS_PAGES")
            return page_size * phys_pages
        except (ValueError, OSError, AttributeError):
            return 0

    def _load_persisted_status(self) -> ModelInstallStatus | None:
        payload = self._runtime_settings_repository.get_json(INSTALL_STATE_KEY)
        if payload is None:
            return None
        return ModelInstallStatus.model_validate(payload)

    def _save_install_status(self, status: ModelInstallStatus) -> None:
        self._runtime_settings_repository.set_json(INSTALL_STATE_KEY, status.model_dump(mode="json"))

    def _write_local_manifest(self, payload: dict[str, Any]) -> None:
        manifest_path = self._manifest_path()
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")

    def _load_local_manifest(self) -> PinnedManifest:
        manifest_path = self._manifest_path()
        if not manifest_path.exists():
            raise ManifestValidationError(INVALID_LOCAL_MANIFEST_MESSAGE)
        try:
            payload = json.loads(manifest_path.read_text())
        except json.JSONDecodeError as error:
            raise ManifestValidationError(INVALID_LOCAL_MANIFEST_MESSAGE) from error
        return self._parse_manifest(payload, error_message=INVALID_LOCAL_MANIFEST_MESSAGE)

    def _try_load_local_manifest(self) -> PinnedManifest | None:
        try:
            return self._load_local_manifest()
        except ManifestValidationError:
            return None

    def _parse_manifest(self, payload: dict[str, Any], *, error_message: str) -> PinnedManifest:
        if payload.get("version") != EXPECTED_MANIFEST_VERSION:
            raise ManifestValidationError(error_message)
        if payload.get("defaultTier") != ModelTier.TADA_3B_Q4.value:
            raise ManifestValidationError(error_message)
        if payload.get("fallbackTier") is not None:
            raise ManifestValidationError(error_message)

        tiers = payload.get("tiers")
        if not isinstance(tiers, dict):
            raise ManifestValidationError(error_message)
        tier_payload = tiers.get(ModelTier.TADA_3B_Q4.value)
        if not isinstance(tier_payload, dict):
            raise ManifestValidationError(error_message)
        if tier_payload.get("resolvedTier") != ModelTier.TADA_3B_Q4.value:
            raise ManifestValidationError(error_message)

        files_payload = tier_payload.get("files")
        if not isinstance(files_payload, list) or not files_payload:
            raise ManifestValidationError(error_message)

        artifacts: list[ModelArtifact] = []
        for item in files_payload:
            if not isinstance(item, dict):
                raise ManifestValidationError(error_message)

            repo_path = self._validated_relative_path(item.get("repoPath"))
            local_path = self._validated_relative_path(item.get("localPath"))
            sha256 = item.get("sha256")
            size_bytes = item.get("sizeBytes")
            if not isinstance(sha256, str) or len(sha256) != 64:
                raise ManifestValidationError(error_message)
            if not isinstance(size_bytes, int) or size_bytes <= 0:
                raise ManifestValidationError(error_message)

            artifacts.append(
                ModelArtifact(
                    repo_path=repo_path,
                    local_path=local_path,
                    sha256=sha256,
                    size_bytes=size_bytes,
                )
            )

        return PinnedManifest(
            version=EXPECTED_MANIFEST_VERSION,
            default_tier=ModelTier.TADA_3B_Q4,
            files=tuple(artifacts),
            raw_payload=payload,
        )

    @staticmethod
    def _validated_relative_path(value: object) -> str:
        if not isinstance(value, str) or not value:
            raise ManifestValidationError(INVALID_REMOTE_MANIFEST_MESSAGE)
        path = PurePosixPath(value)
        if path.is_absolute() or ".." in path.parts or "." in path.parts:
            raise ManifestValidationError(INVALID_REMOTE_MANIFEST_MESSAGE)
        return value

    def _verified_bytes(self, manifest: PinnedManifest) -> int:
        return sum(artifact.size_bytes for artifact in manifest.files if self._verify_artifact(artifact))

    def _all_files_present(self, manifest: PinnedManifest) -> bool:
        for artifact in manifest.files:
            artifact_path = self._artifact_path(artifact.local_path)
            if not artifact_path.is_file():
                return False
            if artifact_path.stat().st_size != artifact.size_bytes:
                return False
        return True

    def _verify_artifact(self, artifact: ModelArtifact) -> bool:
        artifact_path = self._artifact_path(artifact.local_path)
        if not artifact_path.is_file():
            return False
        if artifact_path.stat().st_size != artifact.size_bytes:
            return False

        digest = hashlib.sha256()
        with artifact_path.open("rb") as file_handle:
            while True:
                chunk = file_handle.read(DOWNLOAD_CHUNK_SIZE)
                if not chunk:
                    break
                digest.update(chunk)
        return digest.hexdigest() == artifact.sha256

    def _download_artifact(
        self,
        artifact: ModelArtifact,
        *,
        on_progress: Callable[[int], None] | None = None,
    ) -> None:
        artifact_path = self._artifact_path(artifact.local_path)
        artifact_path.parent.mkdir(parents=True, exist_ok=True)
        partial_path = artifact_path.with_suffix(f"{artifact_path.suffix}.part")
        if partial_path.exists():
            partial_path.unlink()

        digest = hashlib.sha256()
        bytes_written = 0
        try:
            with partial_path.open("wb") as file_handle:
                for chunk in self._hf_client.iter_file(
                    repo_id=HF_REPO_ID,
                    revision=HF_REVISION,
                    repo_path=artifact.repo_path,
                ):
                    digest.update(chunk)
                    bytes_written += len(chunk)
                    file_handle.write(chunk)
                    if on_progress is not None:
                        on_progress(bytes_written)
        except Exception:
            if partial_path.exists():
                partial_path.unlink()
            raise

        if bytes_written != artifact.size_bytes or digest.hexdigest() != artifact.sha256:
            partial_path.unlink(missing_ok=True)
            raise ChecksumMismatchError(artifact.local_path)

        os.replace(partial_path, artifact_path)

    def _artifact_path(self, local_path: str) -> Path:
        return self._cache_models_dir / Path(local_path)

    def _manifest_path(self) -> Path:
        return self._cache_models_dir / self.MANIFEST_FILE_NAME

    def _error_status(self, error_code: ModelInstallErrorCode, message: str) -> ModelInstallStatus:
        existing = self._load_persisted_status()
        if existing is None:
            return self._status(
                state=ModelInstallState.ERROR,
                last_error_code=error_code,
                last_error_message=message,
            )
        return self._status_from_existing(
            existing,
            state=ModelInstallState.ERROR,
            checksum_verified=False,
            last_error_code=error_code,
            last_error_message=message,
        )

    def _status_from_existing(
        self,
        existing: ModelInstallStatus,
        *,
        state: ModelInstallState | None = None,
        requested_tier: ModelTier | None | object = ...,
        resolved_tier: ModelTier | None | object = ...,
        manifest_version: str | None | object = ...,
        checksum_verified: bool | object = ...,
        bytes_downloaded: int | None | object = ...,
        total_bytes: int | None | object = ...,
        last_error_code: ModelInstallErrorCode | None | object = ...,
        last_error_message: str | None | object = ...,
    ) -> ModelInstallStatus:
        return self._status(
            state=state or existing.state,
            requested_tier=existing.requested_tier if requested_tier is ... else requested_tier,
            resolved_tier=existing.resolved_tier if resolved_tier is ... else resolved_tier,
            manifest_version=existing.manifest_version if manifest_version is ... else manifest_version,
            checksum_verified=existing.checksum_verified if checksum_verified is ... else checksum_verified,
            bytes_downloaded=existing.bytes_downloaded if bytes_downloaded is ... else bytes_downloaded,
            total_bytes=existing.total_bytes if total_bytes is ... else total_bytes,
            last_error_code=existing.last_error_code if last_error_code is ... else last_error_code,
            last_error_message=existing.last_error_message if last_error_message is ... else last_error_message,
        )

    @staticmethod
    def _status(
        *,
        state: ModelInstallState,
        requested_tier: ModelTier | None = None,
        resolved_tier: ModelTier | None = None,
        manifest_version: str | None = None,
        checksum_verified: bool = False,
        bytes_downloaded: int | None = None,
        total_bytes: int | None = None,
        last_error_code: ModelInstallErrorCode | None = None,
        last_error_message: str | None = None,
        updated_at: str | None | object = ...,
    ) -> ModelInstallStatus:
        return ModelInstallStatus(
            state=state,
            requested_tier=requested_tier,
            resolved_tier=resolved_tier,
            manifest_version=manifest_version,
            checksum_verified=checksum_verified,
            bytes_downloaded=bytes_downloaded,
            total_bytes=total_bytes,
            updated_at=utc_now() if updated_at is ... else updated_at,
            last_error_code=last_error_code,
            last_error_message=last_error_message,
        )
