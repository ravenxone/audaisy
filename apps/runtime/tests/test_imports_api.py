from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

from fastapi.testclient import TestClient


TEXT_CHUNK_SIZE = 1024 * 1024


def create_project(client: TestClient) -> dict[str, object]:
    response = client.post("/projects", json={"title": "Upload Target"})
    assert response.status_code == 201
    return response.json()


def wait_for(assertion, *, timeout_sec: float = 2.0) -> None:
    deadline = time.time() + timeout_sec
    last_error: AssertionError | None = None

    while time.time() < deadline:
        try:
            assertion()
            return
        except AssertionError as error:
            last_error = error
            time.sleep(0.02)

    if last_error is not None:
        raise last_error


def test_import_upload_accepts_supported_types(make_client) -> None:
    cases = [
        ("manuscript.txt", b"Chapter one.\n\nThis is plain text.", "text/plain"),
        ("manuscript.md", b"# Chapter one\n\nThis is markdown.", "text/markdown"),
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


def test_import_upload_rejects_pdf_and_other_unsupported_extensions(make_client) -> None:
    with make_client() as client:
        project = create_project(client)
        pdf_response = client.post(
            f"/projects/{project['id']}/imports",
            files={"file": ("manuscript.pdf", b"%PDF-not-supported", "application/pdf")},
        )
        docx_response = client.post(
            f"/projects/{project['id']}/imports",
            files={
                "file": (
                    "manuscript.docx",
                    b"PK\x03\x04not really a docx",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
        )

    assert pdf_response.status_code == 415
    assert pdf_response.json()["error"]["code"] == "UNSUPPORTED_IMPORT_TYPE"
    assert docx_response.status_code == 415
    assert docx_response.json()["error"]["code"] == "UNSUPPORTED_IMPORT_TYPE"


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


def test_import_persists_original_file_and_metadata_without_leaking_paths(make_app, read_db, runtime_settings) -> None:
    app = make_app
    app.state.container.import_service.process_import = lambda *_: None
    content = b"Chapter one.\n\nSafe storage test."

    with TestClient(app) as client:
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


def test_import_processing_completes_and_persists_editor_ready_chapter(make_app, read_db, runtime_settings) -> None:
    app = make_app
    transitions: list[str] = []
    document_records = app.state.container.import_service._document_record_repository
    original_mark_processing = document_records.mark_processing
    original_mark_completed = document_records.mark_completed

    def mark_processing(record_id: str, updated_at: str):
        transitions.append("processing")
        return original_mark_processing(record_id, updated_at)

    def mark_completed(record_id: str, **kwargs):
        transitions.append("completed")
        return original_mark_completed(record_id, **kwargs)

    document_records.mark_processing = mark_processing
    document_records.mark_completed = mark_completed

    with TestClient(app) as client:
        project = create_project(client)
        response = client.post(
            f"/projects/{project['id']}/imports",
            files={
                "file": (
                    "chapter-one.md",
                    b"# Chapter One\n\nFirst paragraph.\n\n- flattened list item",
                    "text/markdown",
                )
            },
        )
        assert response.status_code == 201
        assert response.json()["import"]["state"] == "stored"

        def assert_completed_state() -> None:
            project_detail = client.get(f"/projects/{project['id']}").json()
            assert project_detail["title"] == "Chapter One"
            assert project_detail["imports"][0]["state"] == "completed"
            assert project_detail["chapters"] == [
                {
                    "id": project_detail["chapters"][0]["id"],
                    "title": "Chapter One",
                    "order": 1,
                    "warningCount": 1,
                    "sourceDocumentRecordId": response.json()["import"]["id"],
                }
            ]

        wait_for(assert_completed_state)

    assert transitions == ["processing", "completed"]

    record = read_db(
        """
        SELECT state, canonical_json_path, markdown_projection_path, confidence
        FROM document_records
        WHERE id = ?
        """,
        (response.json()["import"]["id"],),
    )[0]
    assert record["state"] == "completed"
    assert record["confidence"] == "medium"

    canonical_path = runtime_settings.app_data_root / record["canonical_json_path"]
    markdown_projection_path = runtime_settings.app_data_root / record["markdown_projection_path"]
    assert canonical_path.is_file()
    assert markdown_projection_path.is_file()
    canonical_document = json.loads(canonical_path.read_text())
    assert canonical_document["sourceDocumentRecordId"] == response.json()["import"]["id"]
    assert canonical_document["chapters"][0]["title"] == "Chapter One"

    chapter = read_db(
        """
        SELECT title, chapter_order, markdown_path, editor_doc_path, document_record_id, revision
        FROM chapters
        WHERE project_id = ?
        """,
        (project["id"],),
    )[0]
    assert chapter["title"] == "Chapter One"
    assert chapter["chapter_order"] == 1
    assert chapter["document_record_id"] == response.json()["import"]["id"]
    assert chapter["revision"] == 1
    assert (runtime_settings.app_data_root / chapter["markdown_path"]).read_text().strip() == markdown_projection_path.read_text().strip()
    editor_doc = json.loads((runtime_settings.app_data_root / chapter["editor_doc_path"]).read_text())
    assert editor_doc["type"] == "doc"
    assert editor_doc["content"][0]["type"] == "heading"
    assert editor_doc["content"][0]["attrs"]["blockId"]

    warnings = read_db(
        """
        SELECT code, severity, document_record_id, block_id
        FROM import_warnings
        WHERE chapter_id = (SELECT id FROM chapters WHERE project_id = ?)
        """,
        (project["id"],),
    )
    warning_rows = [dict(row) for row in warnings]
    assert warning_rows == [
        {
            "code": "MARKDOWN_LIST_FLATTENED",
            "severity": "warning",
            "document_record_id": response.json()["import"]["id"],
            "block_id": warning_rows[0]["block_id"],
        }
    ]


def test_import_processing_marks_failed_and_preserves_original_upload(make_app, read_db) -> None:
    app = make_app
    transitions: list[str] = []
    import_service = app.state.container.import_service
    document_records = import_service._document_record_repository
    original_mark_processing = document_records.mark_processing
    original_mark_failed = document_records.mark_failed

    def mark_processing(record_id: str, updated_at: str):
        transitions.append("processing")
        return original_mark_processing(record_id, updated_at)

    def mark_failed(record_id: str, *, failure_message: str, updated_at: str):
        transitions.append("failed")
        return original_mark_failed(record_id, failure_message=failure_message, updated_at=updated_at)

    document_records.mark_processing = mark_processing
    document_records.mark_failed = mark_failed
    import_service._normalization_service.normalize = lambda **_: (_ for _ in ()).throw(ValueError("Normalization failed"))

    with TestClient(app) as client:
        project = create_project(client)
        response = client.post(
            f"/projects/{project['id']}/imports",
            files={"file": ("source.txt", b"Will fail later", "text/plain")},
        )
        assert response.status_code == 201
        assert response.json()["import"]["state"] == "stored"

        def assert_failed_state() -> None:
            import_row = read_db(
                "SELECT state, failure_message, original_file_path FROM document_records WHERE id = ?",
                (response.json()["import"]["id"],),
            )[0]
            assert import_row["state"] == "failed"
            assert import_row["failure_message"] == "Normalization failed"
            assert Path(import_row["original_file_path"]).is_file()

        wait_for(assert_failed_state)

    assert transitions == ["processing", "failed"]
    assert read_db("SELECT * FROM chapters") == []


def test_import_processing_cleans_up_partial_chapter_state_after_late_failure(make_app, read_db, runtime_settings) -> None:
    app = make_app
    document_records = app.state.container.import_service._document_record_repository
    original_mark_completed = document_records.mark_completed

    def fail_mark_completed(record_id: str, **kwargs):
        raise RuntimeError("late completion failure")

    document_records.mark_completed = fail_mark_completed

    with TestClient(app) as client:
        project = create_project(client)
        response = client.post(
            f"/projects/{project['id']}/imports",
            files={"file": ("source.txt", b"Late failure text", "text/plain")},
        )
        assert response.status_code == 201

        def assert_failed_state() -> None:
            import_row = read_db(
                "SELECT state, failure_message FROM document_records WHERE id = ?",
                (response.json()["import"]["id"],),
            )[0]
            assert import_row["state"] == "failed"
            assert import_row["failure_message"] == "late completion failure"

        wait_for(assert_failed_state)

    assert read_db("SELECT * FROM chapters") == []
    assert read_db("SELECT * FROM import_warnings") == []
    assert list((runtime_settings.app_data_root / "projects" / project["id"] / "chapters").glob("*")) == []
    document_records.mark_completed = original_mark_completed


def test_runtime_startup_recovers_incomplete_imports_without_duplicate_chapters(runtime_settings, read_db) -> None:
    from audaisy_runtime.app import create_app

    initial_app = create_app(runtime_settings)
    initial_app.state.container.app_paths.ensure_base_layout()
    initial_app.state.container.database.initialize()
    initial_app.state.container.import_service.process_import = lambda *_: None

    with TestClient(initial_app) as client:
        project = create_project(client)
        first_import = client.post(
            f"/projects/{project['id']}/imports",
            files={"file": ("chapter-one.txt", b"Chapter one body", "text/plain")},
        ).json()["import"]
        second_import = client.post(
            f"/projects/{project['id']}/imports",
            files={"file": ("chapter-two.txt", b"Chapter two body", "text/plain")},
        ).json()["import"]

    project_root = runtime_settings.app_data_root / "projects" / project["id"]
    partial_editor_path = project_root / "chapters" / "partial-chapter.json"
    partial_markdown_path = project_root / "chapters" / "partial-chapter.md"
    partial_editor_path.write_text(
        json.dumps(
            {
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "attrs": {"blockId": "partial-block"},
                        "content": [{"type": "text", "text": "Partial"}],
                    }
                ],
            }
        )
        + "\n"
    )
    partial_markdown_path.write_text("Partial\n")

    initial_app.state.container.import_service._chapter_repository.create(
        chapter_id="11111111-1111-1111-1111-111111111111",
        project_id=project["id"],
        title="Partial",
        chapter_order=1,
        markdown_path=str(partial_markdown_path.relative_to(runtime_settings.app_data_root)),
        editor_doc_path=str(partial_editor_path.relative_to(runtime_settings.app_data_root)),
        document_record_id=first_import["id"],
        revision=1,
        created_at="2026-04-13T12:00:00.000Z",
        updated_at="2026-04-13T12:00:00.000Z",
    )

    connection = sqlite3.connect(runtime_settings.database_path)
    try:
        connection.execute(
            "UPDATE document_records SET state = 'processing' WHERE id = ?",
            (second_import["id"],),
        )
        connection.commit()
    finally:
        connection.close()

    recovery_app = create_app(runtime_settings)
    with TestClient(recovery_app) as client:
        def assert_recovered() -> None:
            project_detail = client.get(f"/projects/{project['id']}").json()
            assert [item["state"] for item in project_detail["imports"]] == ["completed", "completed"]
            assert len(project_detail["chapters"]) == 2
            assert sorted(chapter["sourceDocumentRecordId"] for chapter in project_detail["chapters"]) == sorted(
                [first_import["id"], second_import["id"]]
            )

        wait_for(assert_recovered)

    assert read_db(
        "SELECT COUNT(*) AS count FROM chapters WHERE document_record_id = ?",
        (first_import["id"],),
    )[0]["count"] == 1
    assert not partial_editor_path.exists()
    assert not partial_markdown_path.exists()
