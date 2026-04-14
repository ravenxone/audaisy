# Audaisy

Audaisy makes high-quality audio creation local.

For a long time, turning writing into natural, publishable audio meant slow studio workflows, expensive production, or cloud tools that took your work out of your hands. Audaisy changes that. It brings high-quality local audio generation to the desktop so writers, publishers, podcasters, educators, and creators can turn text into finished audio with speed, privacy, and control.

Create audiobooks, podcasts, voiceovers, spoken essays, and narrated drafts from the same local workflow.

**Mission:** Give every piece of writing a voice, and every voice an audience.

Website: [audaisy.com](https://audaisy.com)

## Why Audaisy

- Local-first audio generation for private, long-form work
- High-quality voice output for books, podcasts, and voiceover production
- A desktop workflow built for creators who want professional results without a studio-sized process
- One product for turning manuscripts, scripts, articles, and notes into polished audio

## Using Audaisy

The easiest way to use Audaisy is through [audaisy.com](https://audaisy.com).

If you want to build or contribute from source, this repository contains the full local app stack.

## Repository Overview

- `apps/desktop` contains the macOS desktop app built with Tauri, React, and TypeScript.
- `apps/runtime` contains the local Python runtime that manages imports, workspace data, and local processing.
- `packages/contracts` contains the shared API contracts used by the desktop app and runtime.

## Run From Source

### Prerequisites

- Apple Silicon Mac
- Node.js
- Python 3.12 or newer
- Rust toolchain for Tauri builds

### Install Dependencies

```bash
npm install
python3 -m venv apps/runtime/.venv
source apps/runtime/.venv/bin/activate
pip install -e 'apps/runtime[dev]'
```

### Start Audaisy

```bash
npm run tauri:dev --workspace apps/desktop
```

The desktop app launches the local runtime automatically from `apps/runtime/.venv`, so you do not need to start a separate API process for normal development.

## Common Commands

```bash
npm run build
npm run lint
npm run test
npm run tauri:build --workspace apps/desktop
```

## Contributing

Issues, bug fixes, and product-minded improvements are welcome. Keep changes focused on making local audio creation faster, higher quality, and easier to use.
