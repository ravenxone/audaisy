from __future__ import annotations

from datetime import UTC, datetime

from audaisy_runtime.contracts.models import PatchProfileRequest, ProfileResponse
from audaisy_runtime.persistence.profile_repository import ProfileRepository


def utc_now() -> str:
    return datetime.now(tz=UTC).isoformat().replace("+00:00", "Z")


class ProfileService:
    def __init__(self, repository: ProfileRepository) -> None:
        self._repository = repository

    def get_profile(self) -> ProfileResponse:
        row = self._repository.get("local")
        if row is None:
            row = self._repository.create_default("local", utc_now())
        return self._to_response(row)

    def update_profile(self, payload: PatchProfileRequest) -> ProfileResponse:
        current = self._repository.get("local")
        if current is None:
            current = self._repository.create_default("local", utc_now())

        next_name = payload.name if payload.name is not None else current["name"]
        next_avatar_id = payload.avatar_id if payload.avatar_id is not None else current["avatar_id"]
        updated = self._repository.update("local", next_name, next_avatar_id, utc_now())
        return self._to_response(updated)

    @staticmethod
    def _to_response(row) -> ProfileResponse:
        name = row["name"]
        avatar_id = row["avatar_id"]
        return ProfileResponse(
            id=row["id"],
            name=name,
            avatar_id=avatar_id,
            has_completed_profile_setup=bool(name.strip() and avatar_id),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

