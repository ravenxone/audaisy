from __future__ import annotations

from dataclasses import replace

import pytest


def test_runtime_voice_service_seeds_default_preset(runtime_settings) -> None:
    from audaisy_runtime.container import build_container
    from audaisy_runtime.services.runtime_voice_service import (
        DEFAULT_CACHED_REFERENCE_PATH,
        DEFAULT_REFERENCE_TRANSCRIPT,
        DEFAULT_VOICE_PRESET_ID,
    )

    container = build_container(runtime_settings)
    container.app_paths.ensure_base_layout()
    container.database.initialize()

    row = container.voice_service.ensure_default_preset()

    assert row["id"] == DEFAULT_VOICE_PRESET_ID
    assert (runtime_settings.app_data_root / DEFAULT_CACHED_REFERENCE_PATH).is_file()
    presets = container.voice_service.list_presets()
    assert len(presets) == 1
    assert presets[0].id == DEFAULT_VOICE_PRESET_ID
    assert presets[0].name == "Default Local Reference"
    assert presets[0].language == "en"
    assert presets[0].has_reference is True

    reference = container.voice_service.resolve_reference(None)
    assert reference.preset["id"] == DEFAULT_VOICE_PRESET_ID
    assert reference.path == runtime_settings.app_data_root / DEFAULT_CACHED_REFERENCE_PATH
    assert reference.transcript == DEFAULT_REFERENCE_TRANSCRIPT


def test_runtime_voice_service_fails_when_bundled_reference_is_missing(runtime_settings, tmp_path) -> None:
    from audaisy_runtime.container import build_container
    from audaisy_runtime.contracts.models import ApiErrorCode
    from audaisy_runtime.errors import RenderPipelineError

    settings = replace(runtime_settings, bundled_default_reference_asset_path_override=tmp_path / "missing.wav")
    container = build_container(settings)
    container.app_paths.ensure_base_layout()
    container.database.initialize()

    with pytest.raises(RenderPipelineError) as error:
        container.voice_service.ensure_default_preset()

    assert error.value.api_error_code == ApiErrorCode.VOICE_REFERENCE_MISSING
