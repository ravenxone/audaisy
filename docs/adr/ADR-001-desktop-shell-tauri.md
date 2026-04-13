# ADR-001: Choose Tauri 2 as the Desktop Shell

- Status: Accepted
- Date: 2026-04-12

## Context

Audaisy is a local-first macOS app for importing manuscripts, editing long-form text, and rendering audiobook audio with `MLX-TADA` on Apple Silicon hardware. The target baseline is a `16 GB` unified-memory MacBook, which makes process overhead part of the core product design rather than a secondary concern.

The desktop shell must support:

- A web-based editor and notebook-style workspace
- Local file dialogs and filesystem access
- Long-lived supervision of a Python sidecar
- Secure local IPC between UI and runtime
- Packaging, signing, and updating for macOS

The options considered were `Tauri 2`, `Electron`, and `SwiftUI`.

## Decision

Use `Tauri 2` as the only supported desktop shell for Audaisy v1.

`Electron` and `SwiftUI` are explicitly rejected for v1.

## Rationale

### Why Tauri

- `Tauri` keeps the desktop shell thin, which matters on a `16 GB` unified-memory machine where the UI and local TTS inference compete for the same memory pool.
- The app UI remains a standard React application, which preserves a future web path without committing to a second frontend stack today.
- `Tauri` sidecars are a clean operational fit for a long-lived Python runtime that exposes HTTP and `SSE`.
- The security model is narrower than Electron's default model because native capabilities are surfaced through explicit commands and plugins rather than a bundled Chromium + Node runtime.
- Packaging and updates are sufficient for a macOS-first open-source desktop app without the memory and bundle-size cost of Electron.

### Why Not Electron

- Electron bundles Chromium and Node into the shipping app, increasing idle RAM and disk footprint.
- That overhead is not abstract. It reduces the memory headroom available to `mlx-tada-3b-q4`, audio assembly, and import pipelines on the same machine.
- Audaisy does not require Electron-only capabilities such as deep browser-runtime APIs, multi-window embedded web content, or a large plugin ecosystem.
- Contributor familiarity with Electron is useful but not strong enough to justify the runtime cost for this product.

### Why Not SwiftUI

- SwiftUI would optimize for a native macOS shell, but it would force a separate UI stack and sharply reduce reuse of the editor, player, and workspace code in any future browser-hosted version.
- Audaisy's core editing surface and playback controls are well served by a web UI, so the benefit of a native-first UI stack is smaller than the cost of reduced portability and contributor breadth.
- The product constraint is local AI runtime reliability, not advanced native document chrome or AppKit-only text behavior.

## Consequences

- All desktop-specific integration requirements target Tauri APIs only.
- The codebase should isolate Tauri bindings from shared React code so the desktop shell stays thin and replaceable in the future, but no second shell is implemented or documented in v1.
- The Python sidecar is a first-class part of the architecture and is launched, supervised, and shut down by Tauri.

## Rejected Alternatives

### Electron

Rejected because its steady-state resource cost conflicts with the primary system constraint: running high-quality local TTS inference on constrained Apple Silicon hardware.

### SwiftUI

Rejected because it solves the wrong optimization problem for v1. Audaisy needs a portable web UI with strong editor extensibility more than it needs a native macOS UI stack.
