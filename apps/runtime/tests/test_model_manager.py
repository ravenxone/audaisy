from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
from pathlib import Path

import pytest


def build_manifest(files: dict[str, bytes]) -> dict[str, object]:
    return {
        "version": "2026-04-13.1",
        "defaultTier": "tada-3b-q4",
        "fallbackTier": None,
        "tiers": {
            "tada-3b-q4": {
                "resolvedTier": "tada-3b-q4",
                "files": [
                    {
                        "repoPath": repo_path,
                        "localPath": f"mlx-tada-3b/{repo_path}",
                        "sha256": sha256(content).hexdigest(),
                        "sizeBytes": len(content),
                    }
                    for repo_path, content in files.items()
                ],
            }
        },
    }


class FakeHfClient:
    def __init__(
        self,
        *,
        manifest_payload: dict[str, object],
        files: dict[str, bytes],
        file_chunks: dict[str, list[bytes]] | None = None,
        manifest_error: Exception | None = None,
        download_errors: dict[str, Exception] | None = None,
    ) -> None:
        self.manifest_payload = manifest_payload
        self.files = files
        self.file_chunks = file_chunks or {}
        self.manifest_error = manifest_error
        self.download_errors = download_errors or {}
        self.fetch_calls: list[tuple[str, str, str]] = []
        self.download_calls: list[tuple[str, str, str]] = []

    def fetch_json(self, *, repo_id: str, revision: str, repo_path: str) -> dict[str, object]:
        self.fetch_calls.append((repo_id, revision, repo_path))
        if self.manifest_error is not None:
            raise self.manifest_error
        return deepcopy(self.manifest_payload)

    def iter_file(self, *, repo_id: str, revision: str, repo_path: str):
        self.download_calls.append((repo_id, revision, repo_path))
        if repo_path in self.download_errors:
            raise self.download_errors[repo_path]
        yield from self.file_chunks.get(repo_path, [self.files[repo_path]])


@pytest.fixture()
def model_files() -> dict[str, bytes]:
    return {
        "model/config.json": b'{"model":"test"}\n',
        "model/weights.safetensors": b"weights-for-runtime-tests",
    }


@pytest.fixture()
def manifest_payload(model_files: dict[str, bytes]) -> dict[str, object]:
    return build_manifest(model_files)


def make_manager(runtime_settings, hf_client: FakeHfClient):
    from audaisy_runtime.model_manager.manager import ModelManager
    from audaisy_runtime.persistence.database import Database
    from audaisy_runtime.persistence.runtime_settings_repository import RuntimeSettingsRepository
    from audaisy_runtime.services.app_paths import AppPaths

    app_paths = AppPaths(root=runtime_settings.app_data_root)
    app_paths.ensure_base_layout()
    database = Database(runtime_settings.database_path)
    database.initialize()
    repository = RuntimeSettingsRepository(database)
    manager = ModelManager(runtime_settings, app_paths.cache_models_dir, repository, hf_client=hf_client)
    return manager, app_paths


def test_fetch_remote_manifest_uses_pinned_hf_source(runtime_settings, manifest_payload, model_files) -> None:
    from audaisy_runtime.contracts.models import ModelTier

    fake_hf = FakeHfClient(manifest_payload=manifest_payload, files=model_files)
    manager, _ = make_manager(runtime_settings, fake_hf)

    manifest = manager.fetch_remote_manifest()

    assert fake_hf.fetch_calls == [
        ("ravenxone/mlx-tada-3b", "eefbd2c57c133cacd5982b38f242fff16d558040", "manifest.json")
    ]
    assert manifest.version == "2026-04-13.1"
    assert manifest.default_tier == ModelTier.TADA_3B_Q4
    assert [artifact.repo_path for artifact in manifest.files] == list(model_files)
    assert manifest.total_bytes == sum(len(content) for content in model_files.values())


@pytest.mark.parametrize(
    "mutator",
    [
        lambda payload: payload.update(version="bad-version"),
        lambda payload: payload.update(fallbackTier="tada-1b-q4"),
        lambda payload: payload["tiers"].pop("tada-3b-q4"),
        lambda payload: payload["tiers"]["tada-3b-q4"].update(files=[{"repoPath": "bad"}]),
    ],
)
def test_fetch_remote_manifest_rejects_invalid_payload(
    runtime_settings,
    manifest_payload,
    model_files,
    mutator,
) -> None:
    from audaisy_runtime.model_manager.manager import ManifestValidationError

    broken_manifest = deepcopy(manifest_payload)
    mutator(broken_manifest)
    manager, _ = make_manager(
        runtime_settings,
        FakeHfClient(manifest_payload=broken_manifest, files=model_files),
    )

    with pytest.raises(ManifestValidationError):
        manager.fetch_remote_manifest()


def test_run_install_transitions_to_installed_and_skips_verified_files(
    runtime_settings,
    manifest_payload,
    model_files,
) -> None:
    from audaisy_runtime.contracts.models import ModelInstallState, StartModelDownloadRequest

    fake_hf = FakeHfClient(manifest_payload=manifest_payload, files=model_files)
    manager, app_paths = make_manager(runtime_settings, fake_hf)
    first_repo_path = next(iter(model_files))
    (app_paths.cache_models_dir / f"mlx-tada-3b/{first_repo_path}").parent.mkdir(parents=True, exist_ok=True)
    (app_paths.cache_models_dir / f"mlx-tada-3b/{first_repo_path}").write_bytes(model_files[first_repo_path])

    transitions: list[ModelInstallState] = []
    original_save = manager._save_install_status

    def record_save(status):
        transitions.append(status.state)
        return original_save(status)

    manager._save_install_status = record_save  # type: ignore[method-assign]

    manager.start_install(StartModelDownloadRequest())
    manager.run_install()

    status = manager.get_install_status()
    assert status.state == ModelInstallState.INSTALLED
    assert status.checksum_verified is True
    assert status.bytes_downloaded == status.total_bytes
    assert transitions[0] == ModelInstallState.DOWNLOADING
    assert ModelInstallState.VERIFYING in transitions
    assert transitions[-1] == ModelInstallState.INSTALLED
    assert fake_hf.download_calls == [
        (
            "ravenxone/mlx-tada-3b",
            "eefbd2c57c133cacd5982b38f242fff16d558040",
            "model/weights.safetensors",
        )
    ]


def test_run_install_marks_checksum_mismatch_as_error(
    runtime_settings,
    manifest_payload,
    model_files,
) -> None:
    from audaisy_runtime.contracts.models import ModelInstallErrorCode, ModelInstallState, StartModelDownloadRequest

    broken_files = dict(model_files)
    broken_files["model/weights.safetensors"] = b"corrupt-weights"
    manager, _ = make_manager(
        runtime_settings,
        FakeHfClient(manifest_payload=manifest_payload, files=broken_files),
    )

    manager.start_install(StartModelDownloadRequest())
    manager.run_install()

    status = manager.get_install_status()
    assert status.state == ModelInstallState.ERROR
    assert status.last_error_code == ModelInstallErrorCode.MODEL_CHECKSUM_MISMATCH


def test_run_install_persists_incremental_bytes_during_active_download(runtime_settings) -> None:
    from audaisy_runtime.contracts.models import ModelInstallState, StartModelDownloadRequest

    files = {"model/weights.safetensors": b"abcdef"}
    fake_hf = FakeHfClient(
        manifest_payload=build_manifest(files),
        files=files,
        file_chunks={"model/weights.safetensors": [b"ab", b"cd", b"ef"]},
    )
    manager, _ = make_manager(runtime_settings, fake_hf)

    saved_progress: list[int | None] = []
    original_save = manager._save_install_status

    def record_save(status):
        if status.state == ModelInstallState.DOWNLOADING:
            saved_progress.append(status.bytes_downloaded)
        return original_save(status)

    manager._save_install_status = record_save  # type: ignore[method-assign]

    manager.start_install(StartModelDownloadRequest())
    manager.run_install()

    assert saved_progress[0] == 0
    assert 2 in saved_progress
    assert 4 in saved_progress
    assert saved_progress[-1] == 6


def test_reconcile_install_state_marks_interrupted_download_and_recovers_bytes(
    runtime_settings,
    manifest_payload,
    model_files,
) -> None:
    from audaisy_runtime.contracts.models import ModelInstallErrorCode, ModelInstallState, StartModelDownloadRequest

    fake_hf = FakeHfClient(manifest_payload=manifest_payload, files=model_files)
    manager, app_paths = make_manager(runtime_settings, fake_hf)
    manager.start_install(StartModelDownloadRequest())

    first_repo_path = next(iter(model_files))
    recovered_file = app_paths.cache_models_dir / f"mlx-tada-3b/{first_repo_path}"
    recovered_file.parent.mkdir(parents=True, exist_ok=True)
    recovered_file.write_bytes(model_files[first_repo_path])

    manager.reconcile_install_state()

    status = manager.get_install_status()
    assert status.state == ModelInstallState.ERROR
    assert status.last_error_code == ModelInstallErrorCode.INTERRUPTED
    assert status.bytes_downloaded == len(model_files[first_repo_path])
    assert status.total_bytes == sum(len(content) for content in model_files.values())


def test_reconcile_installed_state_downgrades_when_required_files_are_missing(
    runtime_settings,
    manifest_payload,
    model_files,
) -> None:
    from audaisy_runtime.contracts.models import ModelInstallErrorCode, ModelInstallState, StartModelDownloadRequest

    manager, app_paths = make_manager(
        runtime_settings,
        FakeHfClient(manifest_payload=manifest_payload, files=model_files),
    )

    manager.start_install(StartModelDownloadRequest())
    manager.run_install()
    (app_paths.cache_models_dir / "mlx-tada-3b/model/weights.safetensors").unlink()

    manager.reconcile_install_state()

    status = manager.get_install_status()
    assert status.state == ModelInstallState.ERROR
    assert status.last_error_code == ModelInstallErrorCode.MODEL_DOWNLOAD_FAILED


def test_get_install_status_rejects_same_size_corruption_and_allows_repair(
    runtime_settings,
    manifest_payload,
    model_files,
) -> None:
    from audaisy_runtime.contracts.models import ModelInstallErrorCode, ModelInstallState, StartModelDownloadRequest

    manager, app_paths = make_manager(
        runtime_settings,
        FakeHfClient(manifest_payload=manifest_payload, files=model_files),
    )

    manager.start_install(StartModelDownloadRequest())
    manager.run_install()
    weights_path = app_paths.cache_models_dir / "mlx-tada-3b/model/weights.safetensors"
    weights_path.write_bytes(b"x" * len(model_files["model/weights.safetensors"]))

    status = manager.get_install_status()
    response = manager.start_install(StartModelDownloadRequest())

    assert status.state == ModelInstallState.ERROR
    assert status.last_error_code == ModelInstallErrorCode.MODEL_CHECKSUM_MISMATCH
    assert response.result == "started"


def test_start_install_persists_manifest_fetch_failure(runtime_settings, manifest_payload, model_files) -> None:
    from audaisy_runtime.model_manager.manager import HuggingFaceClientError
    from audaisy_runtime.contracts.models import ModelInstallErrorCode, StartModelDownloadRequest
    from audaisy_runtime.errors import DomainError

    manager, _ = make_manager(
        runtime_settings,
        FakeHfClient(
            manifest_payload=manifest_payload,
            files=model_files,
            manifest_error=HuggingFaceClientError("boom"),
        ),
    )

    with pytest.raises(DomainError) as error:
        manager.start_install(StartModelDownloadRequest())

    assert error.value.code == "MODEL_MANIFEST_FETCH_FAILED"
    assert manager.get_install_status().last_error_code == ModelInstallErrorCode.MODEL_MANIFEST_FETCH_FAILED


def test_run_install_persists_download_failure(runtime_settings, manifest_payload, model_files) -> None:
    from audaisy_runtime.model_manager.manager import HuggingFaceClientError
    from audaisy_runtime.contracts.models import ModelInstallErrorCode, ModelInstallState, StartModelDownloadRequest

    manager, _ = make_manager(
        runtime_settings,
        FakeHfClient(
            manifest_payload=manifest_payload,
            files=model_files,
            download_errors={"model/weights.safetensors": HuggingFaceClientError("boom")},
        ),
    )

    manager.start_install(StartModelDownloadRequest())
    manager.run_install()

    status = manager.get_install_status()
    assert status.state == ModelInstallState.ERROR
    assert status.last_error_code == ModelInstallErrorCode.MODEL_DOWNLOAD_FAILED
