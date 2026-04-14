from __future__ import annotations

from audaisy_runtime.contracts.models import UpdateChapterRequest
from fastapi.testclient import TestClient


def create_project(client: TestClient) -> dict[str, object]:
    response = client.post("/projects", json={"title": "Book"})
    assert response.status_code == 201
    return response.json()


def create_imported_chapter(client: TestClient, project_id: str) -> tuple[dict[str, object], dict[str, object]]:
    import_response = client.post(
        f"/projects/{project_id}/imports",
        files={"file": ("chapter.md", b"# Chapter One\n\nImported paragraph.", "text/markdown")},
    )
    assert import_response.status_code == 201
    project_detail = client.get(f"/projects/{project_id}").json()
    return import_response.json(), project_detail


def test_get_chapter_returns_persisted_editor_ready_payload(make_client) -> None:
    with make_client() as client:
        project = create_project(client)
        import_response, project_detail = create_imported_chapter(client, project["id"])
        chapter_id = project_detail["chapters"][0]["id"]
        response = client.get(f"/projects/{project['id']}/chapters/{chapter_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == chapter_id
    assert body["projectId"] == project["id"]
    assert body["title"] == "Chapter One"
    assert body["order"] == 1
    assert body["revision"] == 1
    assert body["markdown"] == "# Chapter One\n\nImported paragraph.\n"
    assert body["warnings"] == []
    assert body["sourceDocumentRecordId"] == import_response["import"]["id"]
    assert body["createdAt"]
    assert body["updatedAt"]
    assert body["editorDoc"]["type"] == "doc"
    assert body["editorDoc"]["content"][0]["type"] == "heading"
    assert body["editorDoc"]["content"][0]["attrs"]["level"] == 1
    assert body["editorDoc"]["content"][0]["attrs"]["blockId"]
    assert body["editorDoc"]["content"][0]["content"][0]["text"] == "Chapter One"
    assert body["editorDoc"]["content"][1]["type"] == "paragraph"
    assert body["editorDoc"]["content"][1]["attrs"]["blockId"]
    assert body["editorDoc"]["content"][1]["content"][0]["text"] == "Imported paragraph."


def test_patch_chapter_persists_editor_changes_and_updates_markdown_projection(make_client, read_db, runtime_settings) -> None:
    with make_client() as client:
        project = create_project(client)
        _, project_detail = create_imported_chapter(client, project["id"])
        chapter_id = project_detail["chapters"][0]["id"]
        chapter = client.get(f"/projects/{project['id']}/chapters/{chapter_id}").json()

        response = client.patch(
            f"/projects/{project['id']}/chapters/{chapter_id}",
            json={
                "editorDoc": {
                    "type": "doc",
                    "content": [
                        chapter["editorDoc"]["content"][0],
                        {
                            "type": "paragraph",
                            "attrs": {"blockId": "paragraph-block-2"},
                            "content": [{"type": "text", "text": "Updated paragraph text."}],
                        },
                    ],
                }
            },
        )

    assert response.status_code == 200
    updated = response.json()
    assert updated["revision"] == 2
    assert updated["markdown"] == "# Chapter One\n\nUpdated paragraph text.\n"
    assert updated["editorDoc"]["content"][1]["attrs"]["blockId"] == "paragraph-block-2"
    chapter_row = read_db(
        "SELECT revision, markdown_path, editor_doc_path FROM chapters WHERE id = ?",
        (chapter_id,),
    )[0]
    assert chapter_row["revision"] == 2
    assert (runtime_settings.app_data_root / chapter_row["markdown_path"]).read_text() == "# Chapter One\n\nUpdated paragraph text.\n"
    assert "paragraph-block-2" in (runtime_settings.app_data_root / chapter_row["editor_doc_path"]).read_text()


def test_patch_chapter_repairs_missing_block_ids_before_persisting(make_client, read_db, runtime_settings) -> None:
    with make_client() as client:
        project = create_project(client)
        _, project_detail = create_imported_chapter(client, project["id"])
        chapter_id = project_detail["chapters"][0]["id"]

        response = client.patch(
            f"/projects/{project['id']}/chapters/{chapter_id}",
            json={
                "editorDoc": {
                    "type": "doc",
                    "content": [
                        {
                            "type": "heading",
                            "attrs": {"level": 1},
                            "content": [{"type": "text", "text": "Chapter One"}],
                        },
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": "Updated paragraph text."}],
                        },
                    ],
                }
            },
        )

    assert response.status_code == 200
    updated = response.json()
    assert updated["editorDoc"]["content"][0]["attrs"]["blockId"]
    assert updated["editorDoc"]["content"][1]["attrs"]["blockId"]
    chapter_row = read_db(
        "SELECT editor_doc_path FROM chapters WHERE id = ?",
        (chapter_id,),
    )[0]
    persisted = (runtime_settings.app_data_root / chapter_row["editor_doc_path"]).read_text()
    assert '"blockId"' in persisted


def test_update_chapter_restores_previous_files_if_metadata_update_fails(make_app, runtime_settings) -> None:
    app = make_app

    with TestClient(app) as client:
        project = create_project(client)
        _, project_detail = create_imported_chapter(client, project["id"])
        chapter_id = project_detail["chapters"][0]["id"]

    chapter_row = app.state.container.chapter_service._chapter_repository.get(project["id"], chapter_id)
    editor_doc_path = runtime_settings.app_data_root / chapter_row["editor_doc_path"]
    markdown_path = runtime_settings.app_data_root / chapter_row["markdown_path"]
    previous_editor_doc = editor_doc_path.read_text()
    previous_markdown = markdown_path.read_text()
    app.state.container.chapter_service._chapter_repository.update_content = lambda **_: (_ for _ in ()).throw(
        RuntimeError("metadata update failed")
    )

    try:
        app.state.container.chapter_service.update_chapter(
            project["id"],
            chapter_id,
            UpdateChapterRequest(
                editor_doc={
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "attrs": {"blockId": "paragraph-2"},
                            "content": [{"type": "text", "text": "Changed text"}],
                        }
                    ],
                }
            ),
        )
    except RuntimeError as error:
        assert str(error) == "metadata update failed"
    else:
        raise AssertionError("Expected chapter save to raise when metadata update fails.")

    assert editor_doc_path.read_text() == previous_editor_doc
    assert markdown_path.read_text() == previous_markdown
