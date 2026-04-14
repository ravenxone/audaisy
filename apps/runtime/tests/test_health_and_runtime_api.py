from __future__ import annotations

from dataclasses import replace

from audaisy_runtime import CONTRACT_VERSION


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
        {
            "code": "MODEL_DOWNLOAD_UNAVAILABLE",
            "message": "Model download is not implemented in this runtime slice yet.",
        },
    ]
    assert body["modelInstall"] == {
        "state": "unavailable",
        "requestedTier": None,
        "resolvedTier": None,
        "manifestVersion": None,
        "checksumVerified": False,
        "bytesDownloaded": None,
        "totalBytes": None,
        "updatedAt": None,
        "lastErrorCode": "MODEL_DOWNLOAD_UNAVAILABLE",
        "lastErrorMessage": "Model download is not implemented in this runtime slice yet.",
    }
    assert body["supportedImportFormats"] == [".pdf", ".txt", ".md"]


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
    assert body["blockingIssues"] == [
        {"code": "MODELS_MISSING", "message": "Required model assets are not installed yet."},
        {
            "code": "MODEL_DOWNLOAD_UNAVAILABLE",
            "message": "Model download is not implemented in this runtime slice yet.",
        },
        {
            "code": "UNSUPPORTED_HARDWARE",
            "message": "This machine cannot run the default tada-3b-q4 model tier.",
        },
    ]


def test_model_download_endpoint_honestly_reports_unavailable_workflow(make_client, read_db) -> None:
    with make_client() as client:
        first_response = client.post("/runtime/models/download", json={})
        runtime_status = client.get("/runtime/status")

    assert first_response.status_code == 501
    assert first_response.json() == {
        "error": {
            "code": "MODEL_DOWNLOAD_UNAVAILABLE",
            "message": "Model download is not implemented in this runtime slice yet.",
        }
    }
    assert runtime_status.json()["modelInstall"] == {
        "state": "unavailable",
        "requestedTier": None,
        "resolvedTier": None,
        "manifestVersion": None,
        "checksumVerified": False,
        "bytesDownloaded": None,
        "totalBytes": None,
        "updatedAt": None,
        "lastErrorCode": "MODEL_DOWNLOAD_UNAVAILABLE",
        "lastErrorMessage": "Model download is not implemented in this runtime slice yet.",
    }
    assert read_db("SELECT * FROM runtime_settings") == []


def test_runtime_status_reports_corrupt_manifest_as_error_without_duplicate_blocking_issues(
    runtime_settings,
    make_client,
) -> None:
    manifest_path = runtime_settings.app_data_root / "cache" / "models" / "manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text("{invalid json")

    with make_client() as client:
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
    assert body["modelInstall"]["resolvedTier"] is None
    assert body["modelInstall"]["manifestVersion"] is None
    assert body["modelInstall"]["checksumVerified"] is False
    assert body["modelInstall"]["lastErrorCode"] == "MODEL_MANIFEST_INVALID"
    assert body["modelInstall"]["lastErrorMessage"] == "Installed model manifest is unreadable or invalid."
    assert body["modelInstall"]["updatedAt"] is not None
