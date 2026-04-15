from __future__ import annotations

import os
import subprocess
import sys

import pytest


@pytest.mark.skipif(
    os.environ.get("AUDAISY_RUN_REAL_MLX_SMOKE") != "1",
    reason="Real MLX smoke verification is opt-in.",
)
def test_real_mlx_smoke_path(tmp_path) -> None:
    from audaisy_runtime.app import default_settings

    settings = default_settings()
    if not settings.app_data_root.joinpath("cache", "models", "manifest.json").is_file():
        pytest.skip("Installed local MLX-TADA weights were not found.")

    output_path = tmp_path / "smoke.wav"
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "audaisy_runtime.smoke",
            "--app-data-root",
            str(settings.app_data_root),
            "--output",
            str(output_path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr or result.stdout
    assert output_path.is_file()
    assert output_path.stat().st_size > 0
