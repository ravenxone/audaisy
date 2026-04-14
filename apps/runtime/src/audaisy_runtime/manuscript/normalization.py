from __future__ import annotations

import re
from dataclasses import dataclass
from uuid import uuid4

from audaisy_runtime.manuscript.projection import project_markdown_from_editor_doc


ATX_HEADING_PATTERN = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")
LIST_ITEM_PATTERN = re.compile(r"^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$")
HORIZONTAL_RULE_PATTERN = re.compile(r"^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$")
FENCE_PATTERN = re.compile(r"^\s*(```|~~~)")


@dataclass(frozen=True, slots=True)
class ImportWarningDraft:
    code: str
    severity: str
    message: str
    block_id: str | None = None


@dataclass(frozen=True, slots=True)
class NormalizedImportResult:
    chapter_title: str
    editor_doc: dict[str, object]
    markdown: str
    canonical_document: dict[str, object]
    warnings: list[ImportWarningDraft]
    confidence: str


class ImportNormalizationService:
    def normalize(self, *, source_text: str, source_format: str, title_fallback: str, document_record_id: str) -> NormalizedImportResult:
        if source_format == ".txt":
            blocks = self._normalize_text(source_text)
            warnings: list[ImportWarningDraft] = []
        else:
            blocks, warnings = self._normalize_markdown(source_text)

        chapter_title = next(
            (block["text"] for block in blocks if block["type"] == "heading" and isinstance(block.get("text"), str)),
            title_fallback,
        )
        editor_doc = {
            "type": "doc",
            "content": [self._editor_node_from_block(block) for block in blocks],
        }
        markdown = project_markdown_from_editor_doc(editor_doc)
        canonical_document = {
            "sourceDocumentRecordId": document_record_id,
            "chapters": [
                {
                    "title": chapter_title,
                    "order": 1,
                    "blocks": blocks,
                }
            ],
        }
        return NormalizedImportResult(
            chapter_title=chapter_title,
            editor_doc=editor_doc,
            markdown=markdown,
            canonical_document=canonical_document,
            warnings=warnings,
            confidence="medium" if warnings else "high",
        )

    def _normalize_text(self, source_text: str) -> list[dict[str, object]]:
        blocks: list[dict[str, object]] = []
        for paragraph in self._split_paragraphs(source_text):
            blocks.append(self._make_block("paragraph", paragraph))
        return blocks

    def _normalize_markdown(self, source_text: str) -> tuple[list[dict[str, object]], list[ImportWarningDraft]]:
        blocks: list[dict[str, object]] = []
        warnings: list[ImportWarningDraft] = []
        lines = source_text.splitlines()
        paragraph_lines: list[str] = []
        index = 0

        def flush_paragraph() -> None:
            if not paragraph_lines:
                return
            paragraph = " ".join(part.strip() for part in paragraph_lines if part.strip()).strip()
            paragraph_lines.clear()
            if paragraph:
                blocks.append(self._make_block("paragraph", paragraph))

        while index < len(lines):
            line = lines[index]
            stripped = line.strip()

            if not stripped:
                flush_paragraph()
                index += 1
                continue

            heading_match = ATX_HEADING_PATTERN.match(line)
            if heading_match:
                flush_paragraph()
                blocks.append(
                    self._make_block(
                        "heading",
                        heading_match.group(2).strip(),
                        level=len(heading_match.group(1)),
                    )
                )
                index += 1
                continue

            if FENCE_PATTERN.match(line):
                flush_paragraph()
                fence = line.strip()[:3]
                code_lines: list[str] = []
                index += 1
                while index < len(lines) and not lines[index].strip().startswith(fence):
                    code_lines.append(lines[index].rstrip())
                    index += 1
                if index < len(lines):
                    index += 1
                block = self._make_block("paragraph", " ".join(part.strip() for part in code_lines if part.strip()).strip())
                if block["text"]:
                    blocks.append(block)
                warnings.append(
                    ImportWarningDraft(
                        code="MARKDOWN_FENCE_FLATTENED",
                        severity="warning",
                        message="Flattened a fenced code block into plain paragraph text.",
                        block_id=block["blockId"] if block["text"] else None,
                    )
                )
                continue

            list_match = LIST_ITEM_PATTERN.match(line)
            if list_match:
                flush_paragraph()
                block = self._make_block("paragraph", list_match.group(1).strip())
                blocks.append(block)
                warnings.append(
                    ImportWarningDraft(
                        code="MARKDOWN_LIST_FLATTENED",
                        severity="warning",
                        message="Flattened a markdown list item into a plain paragraph.",
                        block_id=block["blockId"],
                    )
                )
                index += 1
                continue

            if line.lstrip().startswith(">"):
                flush_paragraph()
                block = self._make_block("paragraph", line.lstrip()[1:].strip())
                if block["text"]:
                    blocks.append(block)
                warnings.append(
                    ImportWarningDraft(
                        code="MARKDOWN_BLOCKQUOTE_FLATTENED",
                        severity="warning",
                        message="Flattened a markdown blockquote into plain paragraph text.",
                        block_id=block["blockId"] if block["text"] else None,
                    )
                )
                index += 1
                continue

            if HORIZONTAL_RULE_PATTERN.match(line):
                flush_paragraph()
                warnings.append(
                    ImportWarningDraft(
                        code="MARKDOWN_RULE_DROPPED",
                        severity="warning",
                        message="Dropped a markdown horizontal rule during normalization.",
                    )
                )
                index += 1
                continue

            paragraph_lines.append(line)
            index += 1

        flush_paragraph()
        return blocks, warnings

    def _editor_node_from_block(self, block: dict[str, object]) -> dict[str, object]:
        attrs = {"blockId": block["blockId"]}
        if block["type"] == "heading":
            attrs["level"] = block.get("level", 1)

        return {
            "type": block["type"],
            "attrs": attrs,
            "content": [{"type": "text", "text": block["text"]}],
        }

    def _make_block(self, block_type: str, text: str, *, level: int | None = None) -> dict[str, object]:
        block = {
            "type": block_type,
            "text": text,
            "blockId": str(uuid4()),
        }
        if level is not None:
            block["level"] = level
        return block

    def _split_paragraphs(self, source_text: str) -> list[str]:
        return [paragraph.strip().replace("\n", " ") for paragraph in re.split(r"\n\s*\n+", source_text) if paragraph.strip()]
