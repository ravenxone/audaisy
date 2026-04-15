from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest


class FakeModelManager:
    def __init__(self, *, ready: bool, weights_dir: Path) -> None:
        from audaisy_runtime.contracts.models import ModelInstallState, ModelInstallStatus, ModelTier

        state = ModelInstallState.INSTALLED if ready else ModelInstallState.NOT_INSTALLED
        resolved_tier = ModelTier.TADA_3B_Q4 if ready else None
        self._status = ModelInstallStatus(
            state=state,
            requested_tier=None,
            resolved_tier=resolved_tier,
            manifest_version="2026-04-13.1" if ready else None,
            checksum_verified=ready,
            bytes_downloaded=1 if ready else None,
            total_bytes=1 if ready else None,
            updated_at=None,
            last_error_code=None,
            last_error_message=None,
        )
        self._weights_dir = weights_dir

    def get_install_status(self):
        return self._status

    def resolve_installed_weights_dir(self) -> Path:
        return self._weights_dir


class FakeModel:
    def __init__(self) -> None:
        self.references: list[tuple[str, str | None]] = []
        self.generations: list[tuple[str, object]] = []

    def load_reference(self, audio_path: str, audio_text: str | None = None) -> object:
        self.references.append((audio_path, audio_text))
        return {"audio_path": audio_path, "audio_text": audio_text}

    def generate(self, text: str, reference: object) -> object:
        self.generations.append((text, reference))
        return SimpleNamespace(audio=b"fake-audio")


class FakeBackend:
    model = FakeModel()

    class TadaForCausalLM:
        @staticmethod
        def from_weights(weights_dir: Path, quantize: int = 4) -> FakeModel:
            assert quantize == 4
            assert Path(weights_dir).name == "weights"
            return FakeBackend.model

    @staticmethod
    def save_wav(audio: object, output_path: str) -> None:
        Path(output_path).write_bytes(b"RIFF-fake")


def test_model_service_blocks_when_model_is_not_ready(tmp_path) -> None:
    from audaisy_runtime.contracts.models import ApiErrorCode
    from audaisy_runtime.errors import RenderPipelineError
    from audaisy_runtime.services.mlx_tada_model_service import MlxTadaModelService

    service = MlxTadaModelService(FakeModelManager(ready=False, weights_dir=tmp_path / "weights"))

    with pytest.raises(RenderPipelineError) as error:
        service.require_ready_weights_dir()

    assert error.value.api_error_code == ApiErrorCode.MODEL_NOT_READY


def test_model_service_loads_model_and_synthesizes_wav(tmp_path, monkeypatch) -> None:
    from audaisy_runtime.services.mlx_tada_model_service import MlxTadaModelService

    weights_dir = tmp_path / "weights"
    weights_dir.mkdir()
    reference_path = tmp_path / "reference.wav"
    reference_path.write_bytes(b"fake")
    output_path = tmp_path / "output.wav"
    service = MlxTadaModelService(FakeModelManager(ready=True, weights_dir=weights_dir))
    monkeypatch.setattr(service, "_load_backend", lambda: FakeBackend)

    result = service.synthesize_to_wav("hello world", reference_path, output_path)

    assert result == output_path
    assert output_path.read_bytes() == b"RIFF-fake"
    assert FakeBackend.model.references == [(str(reference_path), None)]
    assert FakeBackend.model.generations[0][0] == "hello world"


def test_model_service_surfaces_load_failures(tmp_path, monkeypatch) -> None:
    from audaisy_runtime.contracts.models import ApiErrorCode
    from audaisy_runtime.errors import RenderPipelineError
    from audaisy_runtime.services.mlx_tada_model_service import MlxTadaModelService

    class BrokenBackend:
        class TadaForCausalLM:
            @staticmethod
            def from_weights(weights_dir: Path, quantize: int = 4):
                raise RuntimeError("boom")

    weights_dir = tmp_path / "weights"
    weights_dir.mkdir()
    service = MlxTadaModelService(FakeModelManager(ready=True, weights_dir=weights_dir))
    monkeypatch.setattr(service, "_load_backend", lambda: BrokenBackend)

    with pytest.raises(RenderPipelineError) as error:
        service.ensure_model_loaded()

    assert error.value.api_error_code == ApiErrorCode.MODEL_LOAD_FAILED
