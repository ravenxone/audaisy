from __future__ import annotations

from fastapi.testclient import TestClient


def test_chapter_render_input_service_extracts_ordered_blocks(make_app) -> None:
    app = make_app

    with TestClient(app) as client:
        project = client.post("/projects", json={"title": "Book"}).json()
        import_response = client.post(
            f"/projects/{project['id']}/imports",
            files={
                "file": (
                    "chapter.md",
                    b"# Chapter One\n\nFirst paragraph.\n\nSecond paragraph.\n\n",
                    "text/markdown",
                )
            },
        )
        assert import_response.status_code == 201
        chapter_id = client.get(f"/projects/{project['id']}").json()["chapters"][0]["id"]

    render_input = app.state.container.render_service._chapter_render_input_service.load(project["id"], chapter_id)

    assert render_input.chapter_id == chapter_id
    assert render_input.revision == 1
    assert [block.block_type for block in render_input.blocks] == ["heading", "paragraph", "paragraph"]
    assert [block.text for block in render_input.blocks] == ["Chapter One", "First paragraph.", "Second paragraph."]
    assert [block.order for block in render_input.blocks] == [1, 2, 3]
    assert all(block.block_id for block in render_input.blocks)
