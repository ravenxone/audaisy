# ADR-002: Choose Tiptap as the Editor Framework

- Status: Accepted
- Date: 2026-04-12

## Context

Audaisy edits imported manuscripts and binds text selections to downstream TTS generation. The editor is not just a text box. It is the control plane for:

- Chapter-scoped long-form editing
- Stable block identities used by segmentation and regeneration
- Source-provenance metadata from imports
- Selection-based render actions
- Deterministic markdown import/export
- Future annotations such as pronunciation hints and voice overrides

The options considered were `Tiptap` and `BlockNote`.

## Decision

Use `Tiptap` on top of `ProseMirror` as the only supported editor framework for Audaisy v1.

`BlockNote` is explicitly rejected for v1.

## Rationale

### Why Tiptap

- `Tiptap` provides direct access to `ProseMirror` schemas, node attributes, transactions, and plugins.
- Audaisy needs stable `blockId` attributes on block-level nodes so edited manuscript content can stay bound to renderable audio segments over time.
- The editor must carry sidecar metadata such as source provenance, import confidence, and future voice/pronunciation hints without relying on markdown-only hacks.
- The import and export pipeline must be deterministic. `Tiptap` is better suited to a canonical document model that projects to markdown rather than treating markdown as the only source of truth.
- The UI can still look notebook-like and block-oriented even though the underlying model is not a Notion-style opinionated block editor.

### Why Not BlockNote

- `BlockNote` is optimized for fast block-based authoring, but Audaisy needs lower-level schema control than BlockNote is designed to expose cleanly.
- The product requires more than page-level block editing. It needs stable identities, custom metadata, and exact selection/range semantics for TTS actions.
- A long-form manuscript editor with chapter semantics and provenance mapping is closer to a custom `ProseMirror` application than a generic block-note editor.

## Consequences

- The editor document model is `ProseMirror JSON`, not plain markdown and not a BlockNote document.
- Markdown remains a projection format for import/export and chapter persistence, but all interactive editing behavior is defined at the `Tiptap` layer.
- Frontend engineers can build a notebook-style UX, but they must not introduce a second canonical content model inside the editor stack.

## Rejected Alternative

### BlockNote

Rejected because it hides too much of the underlying editor control surface for Audaisy's metadata and regeneration requirements.
