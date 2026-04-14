from __future__ import annotations


def test_create_project_uses_safe_defaults_and_lists_project(make_client) -> None:
    with make_client() as client:
        create_response = client.post("/projects", json={"title": "   "})
        list_response = client.get("/projects")

    assert create_response.status_code == 201
    project = create_response.json()
    assert project["title"] == "Untitled Book"
    assert project["chapters"] == []
    assert project["defaultVoicePresetId"] is None
    assert project["lastOpenedAt"] is not None

    assert list_response.status_code == 200
    assert list_response.json() == {
        "projects": [
            {
                "id": project["id"],
                "title": "Untitled Book",
                "chapterCount": 0,
                "lastOpenedAt": project["lastOpenedAt"],
                "activeJobCount": 0,
                "createdAt": project["createdAt"],
                "updatedAt": project["updatedAt"],
            }
        ]
    }


def test_get_project_by_id_returns_detail_payload(make_client) -> None:
    with make_client() as client:
        created_project = client.post("/projects", json={"title": "The Bell Jar"}).json()
        project_response = client.get(f"/projects/{created_project['id']}")

    assert project_response.status_code == 200
    assert project_response.json() == {
        "id": created_project["id"],
        "title": "The Bell Jar",
        "chapters": [],
        "imports": [],
        "defaultVoicePresetId": None,
        "createdAt": created_project["createdAt"],
        "updatedAt": project_response.json()["updatedAt"],
        "lastOpenedAt": project_response.json()["lastOpenedAt"],
    }


def test_patch_project_renames_project_without_losing_state(make_client) -> None:
    with make_client() as client:
        created_project = client.post("/projects", json={"title": "Draft Title"}).json()
        patch_response = client.patch(
            f"/projects/{created_project['id']}",
            json={"title": "Final Title"},
        )
        get_response = client.get(f"/projects/{created_project['id']}")

    assert patch_response.status_code == 200
    assert patch_response.json()["title"] == "Final Title"
    assert get_response.json()["title"] == "Final Title"


def test_projects_are_persisted_across_runtime_restart(make_client) -> None:
    with make_client() as first_client:
        created_project = first_client.post("/projects", json={"title": "Restart Safe Book"}).json()

    with make_client() as second_client:
        list_response = second_client.get("/projects")
        get_response = second_client.get(f"/projects/{created_project['id']}")

    assert list_response.status_code == 200
    assert [project["id"] for project in list_response.json()["projects"]] == [created_project["id"]]
    assert get_response.status_code == 200
    assert get_response.json()["title"] == "Restart Safe Book"


def test_delete_project_removes_it_from_database_and_disk(make_client, runtime_settings) -> None:
    with make_client() as client:
        created_project = client.post("/projects", json={"title": "Delete Me"}).json()
        delete_response = client.delete(f"/projects/{created_project['id']}")
        list_response = client.get("/projects")
        get_response = client.get(f"/projects/{created_project['id']}")

    assert delete_response.status_code == 204
    assert list_response.status_code == 200
    assert list_response.json() == {"projects": []}
    assert get_response.status_code == 404
    assert not (runtime_settings.app_data_root / "projects" / created_project["id"]).exists()
