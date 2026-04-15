from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from audaisy_runtime.contracts.models import ApiErrorCode
from audaisy_runtime.errors import DomainError
from audaisy_runtime.persistence.chapter_repository import ChapterRepository
from audaisy_runtime.persistence.project_repository import ProjectRepository
from audaisy_runtime.services.app_paths import AppPaths
from audaisy_runtime.services.render_types import RenderBlock


@dataclass(frozen=True, slots=True)
class ChapterRenderInput:
    chapter_id: str
    project_id: str
    revision: int
    blocks: list[RenderBlock]


class ChapterRenderInputService:
    def __init__(
        self,
        project_repository: ProjectRepository,
        chapter_repository: ChapterRepository,
        app_paths: AppPaths,
    ) -> None:
        self._project_repository = project_repository
        self._chapter_repository = chapter_repository
        self._app_paths = app_paths

    def load(self, project_id: str, chapter_id: str) -> ChapterRenderInput:
        project = self._project_repository.get(project_id)
        if project is None:
            raise DomainError(ApiErrorCode.PROJECT_NOT_FOUND, "Project was not found.", 404)

        chapter = self._chapter_repository.get(project_id, chapter_id)
        if chapter is None:
            raise DomainError(ApiErrorCode.CHAPTER_NOT_FOUND, "Chapter was not found.", 404)

        editor_doc = json.loads(self._app_paths.root.joinpath(chapter["editor_doc_path"]).read_text())
        blocks: list[RenderBlock] = []
        for order, node in enumerate(editor_doc.get("content") or [], start=1):
            if not isinstance(node, dict):
                continue

            text = self._collect_text(node).strip()
            if not text:
                continue

            attrs = node.get("attrs") or {}
            block_id = attrs.get("blockId") if isinstance(attrs.get("blockId"), str) else f"{chapter_id}-block-{order}"
            blocks.append(
                RenderBlock(
                    chapter_id=chapter["id"],
                    block_id=block_id,
                    block_type=str(node.get("type") or "paragraph"),
                    text=text,
                    order=order,
                )
            )

        return ChapterRenderInput(
            chapter_id=chapter["id"],
            project_id=project_id,
            revision=chapter["revision"],
            blocks=blocks,
        )

    def _collect_text(self, node: dict[str, Any]) -> str:
        text = node.get("text")
        if isinstance(text, str):
            return text

        parts: list[str] = []
        for child in node.get("content") or []:
            if isinstance(child, dict):
                child_text = self._collect_text(child)
                if child_text:
                    parts.append(child_text)
        return "".join(parts)

