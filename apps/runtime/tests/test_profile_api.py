from __future__ import annotations


def test_get_profile_creates_default_local_profile(make_client) -> None:
    with make_client() as client:
        response = client.get("/profile")

    assert response.status_code == 200
    assert response.json() == {
        "id": "local",
        "name": "",
        "avatarId": None,
        "hasCompletedProfileSetup": False,
        "createdAt": response.json()["createdAt"],
        "updatedAt": response.json()["updatedAt"],
    }


def test_profile_update_and_reload_are_restart_safe(make_client) -> None:
    with make_client() as first_client:
        update_response = first_client.patch(
            "/profile",
            json={
                "name": "Raven",
                "avatarId": "sunrise-fox",
            },
        )

    with make_client() as second_client:
        get_response = second_client.get("/profile")

    assert update_response.status_code == 200
    assert get_response.status_code == 200
    assert get_response.json() == {
        "id": "local",
        "name": "Raven",
        "avatarId": "sunrise-fox",
        "hasCompletedProfileSetup": True,
        "createdAt": update_response.json()["createdAt"],
        "updatedAt": update_response.json()["updatedAt"],
    }


def test_profile_completion_requires_both_name_and_avatar(make_client) -> None:
    with make_client() as client:
        name_only = client.patch("/profile", json={"name": "Raven"})
        avatar_then_name = client.patch("/profile", json={"avatarId": "sunrise-fox"})

    assert name_only.status_code == 200
    assert avatar_then_name.status_code == 200
    assert name_only.json()["hasCompletedProfileSetup"] is False
    assert avatar_then_name.json()["hasCompletedProfileSetup"] is True

