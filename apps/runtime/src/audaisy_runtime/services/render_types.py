from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class RenderBlock:
    chapter_id: str
    block_id: str
    block_type: str
    text: str
    order: int


@dataclass(frozen=True, slots=True)
class GenerationUnit:
    chapter_id: str
    order: int
    text: str
    block_ids: tuple[str, ...]

