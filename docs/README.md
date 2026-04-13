# Audaisy Technical Requirements

This package defines the v1 architecture for Audaisy as a macOS-first local audiobook creation app.

## Locked Decisions

- Desktop shell: `Tauri 2`
- Frontend: `React + TypeScript + Vite`
- Editor: `Tiptap` on top of `ProseMirror`
- Runtime: local `FastAPI` sidecar with `SQLite` and `MLX-TADA`
- Target hardware baseline: Apple Silicon MacBook with `16 GB` unified memory

## Document Set

- [ADR-001 Desktop Shell Decision](./adr/ADR-001-desktop-shell-tauri.md)
- [ADR-002 Editor Decision](./adr/ADR-002-editor-tiptap.md)
- [Frontend TRD](./trd/frontend.md)
- [Backend TRD](./trd/backend.md)
- [Integration TRD](./trd/integration.md)

## Reading Order

1. Read the ADRs to understand the non-negotiable stack decisions.
2. Read the frontend and backend TRDs to understand subsystem responsibilities.
3. Read the integration TRD last to implement contracts, lifecycle, and cross-boundary behavior.

## Implementation Handoff

- Frontend agents own everything in the Frontend TRD and must not invent new runtime APIs.
- Backend agents own everything in the Backend TRD and must not invent new UI-facing behaviors outside the shared contracts.
- Integration agents own Tauri bootstrapping, shared schemas, HTTP/SSE contracts, and restart/recovery rules.
- Changes to locked decisions require a new ADR, not an ad hoc implementation change.
