from __future__ import annotations

import argparse
from dataclasses import replace
from pathlib import Path

from audaisy_runtime.app import default_settings
from audaisy_runtime.container import build_container
from audaisy_runtime.errors import DomainError, RenderPipelineError


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a real local MLX-TADA smoke synthesis.")
    parser.add_argument(
        "--app-data-root",
        type=Path,
        default=default_settings().app_data_root,
    )
    parser.add_argument(
        "--text",
        default="Hello, this is a smoke test of Audaisy local speech synthesis.",
    )
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    settings = replace(default_settings(), app_data_root=args.app_data_root)
    container = build_container(settings)
    container.app_paths.ensure_base_layout()
    container.database.initialize()
    container.model_manager.reconcile_install_state()
    output_path = args.output or settings.app_data_root / "cache" / "voices" / "smoke-output.wav"
    try:
        voice_reference = container.voice_service.resolve_reference(None)
        result = container.model_service.synthesize_to_wav(
            args.text,
            voice_reference.path,
            output_path,
            audio_text=voice_reference.transcript,
        )
    except (DomainError, RenderPipelineError) as error:
        raise SystemExit(str(error)) from error

    print(result)


if __name__ == "__main__":
    main()
