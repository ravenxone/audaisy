from __future__ import annotations

from dataclasses import replace
from hashlib import sha256

from fastapi.testclient import TestClient

from audaisy_runtime.app import create_app
from audaisy_runtime import CONTRACT_VERSION


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
    def __init__(self, files: dict[str, bytes]) -> None:
        self.files = files
        self.manifest_payload = build_manifest(files)

    def fetch_json(self, *, repo_id: str, revision: str, repo_path: str) -> dict[str, object]:
        return self.manifest_payload

    def iter_file(self, *, repo_id: str, revision: str, repo_path: str):
        yield self.files[repo_path]


def test_healthz_returns_liveness(make_client) -> None:
    with make_client() as client:
        response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {
        "healthy": True,
        "contractVersion": CONTRACT_VERSION,
        "runtimeVersion": "0.1.0",
    }


def test_runtime_allows_desktop_dev_origin_for_cors(make_client) -> None:
    with make_client() as client:
        response = client.get(
            "/runtime/status",
            headers={
                "Origin": "http://localhost:5173",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_profile_preflight_allows_desktop_dev_origin_for_patch(make_client) -> None:
    with make_client() as client:
        response = client.options(
            "/profile",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "PATCH",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "PATCH" in response.headers["access-control-allow-methods"]


def test_project_delete_preflight_allows_local_dev_origins_on_non_default_ports(make_client) -> None:
    with make_client() as client:
        response = client.options(
            "/projects/test-project",
            headers={
                "Origin": "http://127.0.0.1:1420",
                "Access-Control-Request-Method": "DELETE",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:1420"
    assert "DELETE" in response.headers["access-control-allow-methods"]


def test_runtime_status_reports_no_model_installed_state(make_client) -> None:
    with make_client() as client:
        response = client.get("/runtime/status")

    assert response.status_code == 200
    body = response.json()
    assert body["healthy"] is True
    assert body["contractVersion"] == CONTRACT_VERSION
    assert body["modelsReady"] is False
    assert body["activeModelTier"] is None
    assert body["defaultModelTier"] == "tada-3b-q4"
    assert body["canRun3BQuantized"] is True
    assert body["diskReady"] is True
    assert body["availableDiskBytes"] >= body["minimumDiskFreeBytes"]
    assert body["blockingIssues"] == [
        {"code": "MODELS_MISSING", "message": "Required model assets are not installed yet."},
    ]
    assert body["modelInstall"] == {
        "state": "not_installed",
        "requestedTier": None,
        "resolvedTier": None,
        "manifestVersion": None,
        "checksumVerified": False,
        "bytesDownloaded": None,
        "totalBytes": None,
        "updatedAt": None,
        "lastErrorCode": None,
        "lastErrorMessage": None,
    }
    assert body["supportedImportFormats"] == [".txt", ".md"]


def test_runtime_status_surfaces_unsupported_hardware_before_any_download_request(
    runtime_settings,
    make_client_for_settings,
) -> None:
    with make_client_for_settings(
        replace(
            runtime_settings,
            machine_arch_override="x86_64",
            machine_memory_bytes_override=8 * 1024 * 1024 * 1024,
        )
    ) as client:
        response = client.get("/runtime/status")

    assert response.status_code == 200
    body = response.json()
    assert body["canRun3BQuantized"] is False
    assert body["modelInstall"]["state"] == "unavailable"
    assert body["modelInstall"]["lastErrorCode"] == "UNSUPPORTED_HARDWARE"
    assert body["blockingIssues"] == [
        {"code": "MODELS_MISSING", "message": "Required model assets are not installed yet."},
        {
            "code": "UNSUPPORTED_HARDWARE",
            "message": "This machine cannot run the default tada-3b-q4 model tier.",
        },
    ]


def test_model_download_endpoint_starts_real_work_and_persists_downloading_state(make_app, read_db) -> None:
    app = make_app
    app.state.container.model_manager._hf_client = FakeHfClient(
        {
            "model/config.json": b'{"model":"test"}\n',
            "model/weights.safetensors": b"route-test-weights",
        }
    )
    app.state.container.model_manager.run_install = lambda: None

    with TestClient(app) as client:
        response = client.post("/runtime/models/download", json={})
        runtime_status = client.get("/runtime/status")

    assert response.status_code == 202
    assert response.json()["result"] == "started"
    assert response.json()["modelInstall"]["state"] == "downloading"
    assert runtime_status.json()["modelInstall"]["state"] == "downloading"
    rows = read_db("SELECT value_json FROM runtime_settings WHERE key = ?", ("model_install",))
    assert len(rows) == 1


def test_model_download_endpoint_is_idempotent_while_download_is_in_progress(make_app) -> None:
    app = make_app
    app.state.container.model_manager._hf_client = FakeHfClient(
        {
            "model/config.json": b'{"model":"test"}\n',
            "model/weights.safetensors": b"route-test-weights",
        }
    )
    app.state.container.model_manager.run_install = lambda: None

    with TestClient(app) as client:
        first_response = client.post("/runtime/models/download", json={})
        second_response = client.post("/runtime/models/download", json={})

    assert first_response.status_code == 202
    assert second_response.status_code == 200
    assert second_response.json()["result"] == "already_downloading"


def test_model_download_endpoint_reports_already_installed_when_files_are_ready(make_app) -> None:
    from audaisy_runtime.contracts.models import StartModelDownloadRequest

    app = make_app
    app.state.container.model_manager._hf_client = FakeHfClient(
        {
            "model/config.json": b'{"model":"test"}\n',
            "model/weights.safetensors": b"route-test-weights",
        }
    )

    with TestClient(app) as client:
        app.state.container.model_manager.start_install(StartModelDownloadRequest())
        app.state.container.model_manager.run_install()
        response = client.post("/runtime/models/download", json={})

    assert response.status_code == 200
    assert response.json()["result"] == "already_installed"
    assert response.json()["modelInstall"]["state"] == "installed"


def test_model_download_endpoint_rejects_unsupported_hardware(runtime_settings, make_client_for_settings) -> None:
    with make_client_for_settings(
        replace(
            runtime_settings,
            machine_arch_override="x86_64",
            machine_memory_bytes_override=8 * 1024 * 1024 * 1024,
        )
    ) as client:
        response = client.post("/runtime/models/download", json={})
        runtime_status = client.get("/runtime/status")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "MODEL_HARDWARE_UNSUPPORTED"
    assert runtime_status.json()["modelInstall"]["state"] == "unavailable"
    assert runtime_status.json()["modelInstall"]["lastErrorCode"] == "UNSUPPORTED_HARDWARE"


def test_model_download_endpoint_rejects_low_disk_after_manifest_preflight(make_app) -> None:
    app = make_app
    app.state.container.model_manager._hf_client = FakeHfClient(
        {
            "model/config.json": b'{"model":"test"}\n',
            "model/weights.safetensors": b"route-test-weights",
        }
    )
    app.state.container.model_manager._available_disk_bytes = lambda: 0

    with TestClient(app) as client:
        response = client.post("/runtime/models/download", json={})
        runtime_status = client.get("/runtime/status")

    assert response.status_code == 507
    assert response.json()["error"]["code"] == "MODEL_DISK_SPACE_LOW"
    assert runtime_status.json()["modelInstall"]["state"] == "error"
    assert runtime_status.json()["modelInstall"]["lastErrorCode"] == "DISK_SPACE_LOW"


def test_runtime_status_reports_corrupt_manifest_as_error_without_duplicate_blocking_issues(
    make_app,
) -> None:
    from audaisy_runtime.contracts.models import StartModelDownloadRequest

    app = make_app
    app.state.container.model_manager._hf_client = FakeHfClient(
        {
            "model/config.json": b'{"model":"test"}\n',
            "model/weights.safetensors": b"route-test-weights",
        }
    )

    with TestClient(app) as client:
        app.state.container.model_manager.start_install(StartModelDownloadRequest())
        app.state.container.model_manager.run_install()
        manifest_path = app.state.container.app_paths.cache_models_dir / "manifest.json"
        manifest_path.write_text("{invalid json")
        response = client.get("/runtime/status")

    assert response.status_code == 200
    body = response.json()
    assert body["modelsReady"] is False
    assert body["activeModelTier"] is None
    assert body["blockingIssues"] == [
        {
            "code": "MODEL_MANIFEST_INVALID",
            "message": "Installed model manifest is unreadable or invalid.",
        }
    ]
    assert body["modelInstall"]["state"] == "error"
    assert body["modelInstall"]["requestedTier"] is None
    assert body["modelInstall"]["resolvedTier"] == "tada-3b-q4"
    assert body["modelInstall"]["manifestVersion"] == "2026-04-13.1"
    assert body["modelInstall"]["checksumVerified"] is False
    assert body["modelInstall"]["lastErrorCode"] == "MODEL_MANIFEST_INVALID"
    assert body["modelInstall"]["lastErrorMessage"] == "Installed model manifest is unreadable or invalid."
    assert body["modelInstall"]["updatedAt"] is not None


def test_runtime_status_recovers_interrupted_install_on_restart(runtime_settings) -> None:
    app = create_app(runtime_settings)
    app.state.container.model_manager._hf_client = FakeHfClient(
        {
            "model/config.json": b'{"model":"test"}\n',
            "model/weights.safetensors": b"route-test-weights",
        }
    )
    app.state.container.model_manager.run_install = lambda: None

    with TestClient(app) as client:
        response = client.post("/runtime/models/download", json={})

    assert response.status_code == 202

    restarted_app = create_app(runtime_settings)
    with TestClient(restarted_app) as client:
        runtime_status = client.get("/runtime/status")

    assert runtime_status.status_code == 200
    assert runtime_status.json()["modelInstall"]["state"] == "error"
    assert runtime_status.json()["modelInstall"]["lastErrorCode"] == "INTERRUPTED"


def test_runtime_status_reports_unavailable_if_installed_files_exist_on_unsupported_hardware(runtime_settings) -> None:
    supported_app = create_app(runtime_settings)
    supported_app.state.container.model_manager._hf_client = FakeHfClient(
        {
            "model/config.json": b'{"model":"test"}\n',
            "model/weights.safetensors": b"route-test-weights",
        }
    )

    with TestClient(supported_app) as client:
        assert client.post("/runtime/models/download", json={}).status_code == 202

    unsupported_settings = replace(
        runtime_settings,
        machine_arch_override="x86_64",
        machine_memory_bytes_override=8 * 1024 * 1024 * 1024,
    )
    unsupported_app = create_app(unsupported_settings)
    with TestClient(unsupported_app) as client:
        runtime_status = client.get("/runtime/status")

    assert runtime_status.status_code == 200
    body = runtime_status.json()
    assert body["modelsReady"] is False
    assert body["activeModelTier"] is None
    assert body["modelInstall"]["state"] == "unavailable"
    assert body["modelInstall"]["lastErrorCode"] == "UNSUPPORTED_HARDWARE"
    assert {"code": "UNSUPPORTED_HARDWARE", "message": "This machine cannot run the default tada-3b-q4 model tier."} in body[
        "blockingIssues"
    ]
