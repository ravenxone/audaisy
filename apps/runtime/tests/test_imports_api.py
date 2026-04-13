from __future__ import annotations

from pathlib import Path


VALID_PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"
TEXT_CHUNK_SIZE = 1024 * 1024


def create_project(client) -> dict[str, object]:
    response = client.post("/projects", json={"title": "Upload Target"})
    assert response.status_code == 201
    return response.json()


def test_import_upload_accepts_supported_types(make_client) -> None:
    cases = [
        ("manuscript.txt", b"Chapter one.\n\nThis is plain text.", "text/plain"),
        ("manuscript.md", b"# Chapter one\n\nThis is markdown.", "text/markdown"),
        ("manuscript.pdf", VALID_PDF_BYTES, "application/pdf"),
    ]

    with make_client() as client:
        project = create_project(client)
        for filename, content, content_type in cases:
            response = client.post(
                f"/projects/{project['id']}/imports",
                files={"file": (filename, content, content_type)},
            )

            assert response.status_code == 201
            body = response.json()
            assert set(body.keys()) == {"project", "import"}
            assert body["project"]["id"] == project["id"]
            assert body["import"]["state"] == "stored"
            assert body["import"]["sourceFileName"] == filename
            assert body["import"]["sourceMimeType"] == content_type
            assert body["import"]["sourceSha256"]
            assert body["import"]["fileSizeBytes"] == len(content)
            assert body["import"]["failureMessage"] is None


def test_import_upload_rejects_unsupported_extension(make_client) -> None:
    with make_client() as client:
        project = create_project(client)
        response = client.post(
            f"/projects/{project['id']}/imports",
            files={
                "file": (
                    "manuscript.docx",
                    b"PK\x03\x04not really a docx",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
        )

    assert response.status_code == 415
    assert response.json()["error"]["code"] == "UNSUPPORTED_IMPORT_TYPE"


def test_import_upload_rejects_malformed_pdf_content(make_client) -> None:
    with make_client() as client:
        project = create_project(client)
        response = client.post(
            f"/projects/{project['id']}/imports",
            files={"file": ("bad.pdf", b"not a pdf", "application/pdf")},
        )

    assert response.status_code == 415
    assert response.json()["error"]["code"] == "MALFORMED_IMPORT"


def test_import_upload_rejects_pdf_without_eof_marker(make_client) -> None:
    with make_client() as client:
        project = create_project(client)
        response = client.post(
            f"/projects/{project['id']}/imports",
            files={"file": ("bad.pdf", b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n", "application/pdf")},
        )

    assert response.status_code == 415
    assert response.json()["error"]["code"] == "MALFORMED_IMPORT"


def test_import_upload_rejects_binary_content_disguised_as_text(make_client) -> None:
    with make_client() as client:
        project = create_project(client)
        response = client.post(
            f"/projects/{project['id']}/imports",
            files={"file": ("bad.txt", b"\x00\x01\x02\x03", "text/plain")},
        )

    assert response.status_code == 415
    assert response.json()["error"]["code"] == "MALFORMED_IMPORT"


def test_import_upload_rejects_binary_content_in_later_text_chunks(make_client) -> None:
    with make_client() as client:
        project = create_project(client)
        content = (b"a" * TEXT_CHUNK_SIZE) + b"\x00later-binary-data"
        response = client.post(
            f"/projects/{project['id']}/imports",
            files={"file": ("bad.txt", content, "text/plain")},
        )

    assert response.status_code == 415
    assert response.json()["error"]["code"] == "MALFORMED_IMPORT"


def test_import_upload_requires_multipart_file_field(make_client) -> None:
    with make_client() as client:
        project = create_project(client)
        response = client.post(f"/projects/{project['id']}/imports")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_import_persists_original_file_and_metadata_without_leaking_paths(
    make_client,
    read_db,
    runtime_settings,
) -> None:
    content = b"Chapter one.\n\nSafe storage test."

    with make_client() as client:
        project = create_project(client)
        response = client.post(
            f"/projects/{project['id']}/imports",
            files={"file": ("source.txt", content, "text/plain")},
        )

    assert response.status_code == 201
    import_summary = response.json()["import"]
    rows = read_db(
        """
        SELECT id, source_file_name, source_mime_type, source_sha256, original_file_path, file_size_bytes, state
        FROM document_records
        WHERE id = ?
        """,
        (import_summary["id"],),
    )

    assert len(rows) == 1
    record = rows[0]
    assert record["source_file_name"] == "source.txt"
    assert record["source_mime_type"] == "text/plain"
    assert record["source_sha256"] == import_summary["sourceSha256"]
    assert record["file_size_bytes"] == len(content)
    assert record["state"] == "stored"

    stored_path = Path(record["original_file_path"])
    assert stored_path.is_file()
    assert stored_path.read_bytes() == content
    assert str(runtime_settings.app_data_root) in str(stored_path)
    assert "original_file_path" not in import_summary
    assert "source.txt" not in stored_path.name


def test_import_upload_sanitizes_untrusted_filename_and_prevents_path_traversal(
    make_client,
    read_db,
    runtime_settings,
) -> None:
    with make_client() as client:
        project = create_project(client)
        response = client.post(
            f"/projects/{project['id']}/imports",
            files={"file": ("../../evil.md", b"# Hello\n\nWorld", "text/markdown")},
        )

    assert response.status_code == 201
    import_summary = response.json()["import"]
    assert import_summary["sourceFileName"] == "evil.md"

    rows = read_db(
        "SELECT original_file_path FROM document_records WHERE id = ?",
        (import_summary["id"],),
    )
    stored_path = Path(rows[0]["original_file_path"])
    originals_dir = runtime_settings.app_data_root / "projects" / project["id"] / "originals"
    assert stored_path.parent == originals_dir
    assert not (runtime_settings.app_data_root / "evil.md").exists()
