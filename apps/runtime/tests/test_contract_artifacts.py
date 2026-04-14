from __future__ import annotations

import json
from pathlib import Path


def test_generated_contract_artifacts_match_repo_contract_package(runtime_settings, tmp_path: Path) -> None:
    from audaisy_runtime.contracts import generate_contract_artifacts

    output_dir = tmp_path / "contracts"
    generate_contract_artifacts(runtime_settings, output_dir)

    generated_openapi = json.loads((output_dir / "openapi.json").read_text())
    generated_types = (output_dir / "index.d.ts").read_text()
    generated_version = (output_dir / "version.txt").read_text().strip()

    repo_openapi = json.loads((runtime_settings.contract_artifacts_dir / "openapi.json").read_text())
    repo_types = (runtime_settings.contract_artifacts_dir / "index.d.ts").read_text()
    repo_version = (runtime_settings.contract_artifacts_dir / "version.txt").read_text().strip()

    assert generated_openapi == repo_openapi
    assert generated_types == repo_types
    assert generated_version == repo_version
    assert (
        generated_openapi["components"]["schemas"]["RuntimeStatusResponse"]["properties"]["blockingIssues"]["items"]["$ref"]
        == "#/components/schemas/RuntimeBlockingIssue"
    )
    runtime_download_responses = generated_openapi["paths"]["/runtime/models/download"]["post"]["responses"]
    assert set(runtime_download_responses) == {"501", "422"}
    assert runtime_download_responses["501"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorEnvelope"
    assert runtime_download_responses["422"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorEnvelope"
    runtime_status_properties = generated_openapi["components"]["schemas"]["RuntimeStatusResponse"]["properties"]
    assert runtime_status_properties["supportedImportFormats"]["items"]["$ref"] == "#/components/schemas/ImportFormat"
    for path, method in [
        ("/profile", "patch"),
        ("/projects", "post"),
        ("/projects/{project_id}", "patch"),
        ("/projects/{project_id}/imports", "post"),
        ("/runtime/models/download", "post"),
    ]:
        assert (
            generated_openapi["paths"][path][method]["responses"]["422"]["content"]["application/json"]["schema"]["$ref"]
            == "#/components/schemas/ErrorEnvelope"
        )
    assert "StartModelDownloadResponse" not in generated_openapi["components"]["schemas"]
    assert "ImportFormat" in generated_openapi["components"]["schemas"]
    assert "export type RuntimeBlockingIssue =" in repo_types
    assert "export type ImportFormat =" in repo_types
    assert "export type CreateImportResponse =" in repo_types
    assert "supportedImportFormats: ImportFormat[];" in repo_types
    assert "export type StartModelDownloadResponse =" not in repo_types
