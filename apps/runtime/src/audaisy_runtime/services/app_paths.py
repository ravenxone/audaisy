from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from audaisy_runtime.contracts.models import ApiErrorCode
from audaisy_runtime.errors import DomainError


SAFE_IDENTIFIER_PATTERN = re.compile(r"^[a-f0-9-]{8,64}$")


def validate_runtime_identifier(value: str) -> str:
    if not SAFE_IDENTIFIER_PATTERN.fullmatch(value):
        raise DomainError(ApiErrorCode.PROJECT_NOT_FOUND, "Project was not found.", 404)
    return value


@dataclass(frozen=True, slots=True)
class ProjectPaths:
    root: Path
    originals_dir: Path
    normalized_dir: Path
    chapters_dir: Path
    audio_segments_dir: Path
    audio_books_dir: Path
    exports_dir: Path

    def ensure(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        self.originals_dir.mkdir(parents=True, exist_ok=True)
        self.normalized_dir.mkdir(parents=True, exist_ok=True)
        self.chapters_dir.mkdir(parents=True, exist_ok=True)
        self.audio_segments_dir.mkdir(parents=True, exist_ok=True)
        self.audio_books_dir.mkdir(parents=True, exist_ok=True)
        self.exports_dir.mkdir(parents=True, exist_ok=True)


@dataclass(frozen=True, slots=True)
class AppPaths:
    root: Path

    @property
    def logs_dir(self) -> Path:
        return self.root / "logs"

    @property
    def cache_models_dir(self) -> Path:
        return self.root / "cache" / "models"

    @property
    def cache_voices_dir(self) -> Path:
        return self.root / "cache" / "voices"

    @property
    def projects_dir(self) -> Path:
        return self.root / "projects"

    def ensure_base_layout(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.cache_models_dir.mkdir(parents=True, exist_ok=True)
        self.cache_voices_dir.mkdir(parents=True, exist_ok=True)
        self.projects_dir.mkdir(parents=True, exist_ok=True)

    def project_paths(self, project_id: str) -> ProjectPaths:
        safe_project_id = validate_runtime_identifier(project_id)
        project_root = self.projects_dir / safe_project_id
        return ProjectPaths(
            root=project_root,
            originals_dir=project_root / "originals",
            normalized_dir=project_root / "normalized",
            chapters_dir=project_root / "chapters",
            audio_segments_dir=project_root / "audio" / "segments",
            audio_books_dir=project_root / "audio" / "books",
            exports_dir=project_root / "exports",
        )
