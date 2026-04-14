from __future__ import annotations

from typing import Any
from uuid import uuid4


BLOCK_NODE_TYPES = {"heading", "paragraph"}


def ensure_block_ids(editor_doc: dict[str, Any]) -> dict[str, Any]:
    repaired = _copy_node(editor_doc)
    _repair_node(repaired)
    return repaired


def _copy_node(node: dict[str, Any]) -> dict[str, Any]:
    copied: dict[str, Any] = {}
    for key, value in node.items():
        if key == "content" and isinstance(value, list):
            copied[key] = [_copy_node(item) if isinstance(item, dict) else item for item in value]
            continue
        if key == "attrs" and isinstance(value, dict):
            copied[key] = dict(value)
            continue
        copied[key] = value
    return copied


def _repair_node(node: dict[str, Any]) -> None:
    node_type = node.get("type")
    if node_type in BLOCK_NODE_TYPES:
        attrs = node.get("attrs")
        if not isinstance(attrs, dict):
            attrs = {}
            node["attrs"] = attrs

        block_id = attrs.get("blockId")
        if not isinstance(block_id, str) or not block_id.strip():
            attrs["blockId"] = str(uuid4())

    content = node.get("content")
    if not isinstance(content, list):
        return

    for child in content:
        if isinstance(child, dict):
            _repair_node(child)
