from __future__ import annotations

from typing import Any


def _collect_text(node: dict[str, Any]) -> str:
    text = node.get("text")
    if isinstance(text, str):
        return text

    parts: list[str] = []
    for child in node.get("content") or []:
        if isinstance(child, dict):
            child_text = _collect_text(child)
            if child_text:
                parts.append(child_text)
    return "".join(parts)


def project_markdown_from_editor_doc(editor_doc: dict[str, Any]) -> str:
    blocks: list[str] = []
    for node in editor_doc.get("content") or []:
        if not isinstance(node, dict):
            continue

        node_type = node.get("type")
        text = _collect_text(node).strip()
        if not text:
            continue

        if node_type == "heading":
            level = node.get("attrs", {}).get("level", 1)
            blocks.append(f"{'#' * max(1, min(int(level), 6))} {text}")
            continue

        blocks.append(text)

    return "\n\n".join(blocks)
