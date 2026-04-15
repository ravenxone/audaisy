from __future__ import annotations

import importlib
import threading
from pathlib import Path
from types import ModuleType
from typing import Any

from audaisy_runtime.contracts.models import ApiErrorCode, ModelInstallState, RenderFailureCode
from audaisy_runtime.errors import RenderPipelineError
from audaisy_runtime.model_manager.manager import ModelManager


class MlxTadaModelService:
    def __init__(self, model_manager: ModelManager) -> None:
        self._model_manager = model_manager
        self._state_lock = threading.Lock()
        self._loaded_model: Any | None = None
        self._loaded_weights_dir: Path | None = None
        self._backend: ModuleType | None = None

    def require_ready_weights_dir(self) -> Path:
        status = self._model_manager.get_install_status()
        if (
            status.state != ModelInstallState.INSTALLED
            or not status.checksum_verified
            or status.resolved_tier is None
        ):
            raise RenderPipelineError(
                api_error_code=ApiErrorCode.MODEL_NOT_READY,
                failure_code=RenderFailureCode.MODEL_NOT_READY.value,
                message="Installed MLX-TADA weights are not ready for synthesis.",
            )
        try:
            return self._model_manager.resolve_installed_weights_dir()
        except Exception as error:
            raise RenderPipelineError(
                api_error_code=ApiErrorCode.MODEL_NOT_READY,
                failure_code=RenderFailureCode.MODEL_NOT_READY.value,
                message="Installed MLX-TADA weights could not be resolved.",
            ) from error

    def ensure_model_loaded(self) -> Any:
        with self._state_lock:
            weights_dir = self.require_ready_weights_dir()
            if self._loaded_model is not None and self._loaded_weights_dir == weights_dir:
                return self._loaded_model

            backend = self._load_backend()
            try:
                self._loaded_model = backend.TadaForCausalLM.from_weights(weights_dir, quantize=4)
            except Exception as error:
                raise RenderPipelineError(
                    api_error_code=ApiErrorCode.MODEL_LOAD_FAILED,
                    failure_code=RenderFailureCode.MODEL_LOAD_FAILED.value,
                    message=f"Could not load MLX-TADA weights from {weights_dir}.",
                ) from error

            self._backend = backend
            self._loaded_weights_dir = weights_dir
            return self._loaded_model

    def load_reference(self, reference_path: Path, audio_text: str | None = None) -> Any:
        model = self.ensure_model_loaded()
        try:
            return model.load_reference(str(reference_path), audio_text)
        except Exception as error:
            raise RenderPipelineError(
                api_error_code=ApiErrorCode.VOICE_REFERENCE_MISSING,
                failure_code=RenderFailureCode.VOICE_REFERENCE_MISSING.value,
                message=f"Could not load reference audio from {reference_path}.",
            ) from error

    def generate(self, text: str, reference: Any) -> Any:
        model = self.ensure_model_loaded()
        try:
            return model.generate(text, reference)
        except Exception as error:
            raise RenderPipelineError(
                api_error_code=ApiErrorCode.RENDER_GENERATION_FAILED,
                failure_code=RenderFailureCode.RENDER_GENERATION_FAILED.value,
                message="MLX-TADA generation failed.",
            ) from error

    def save_wav(self, audio: Any, output_path: Path) -> None:
        backend = self._backend or self._load_backend()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            backend.save_wav(audio, str(output_path))
        except Exception as error:
            raise RenderPipelineError(
                api_error_code=ApiErrorCode.RENDER_GENERATION_FAILED,
                failure_code=RenderFailureCode.RENDER_GENERATION_FAILED.value,
                message=f"Could not persist generated audio to {output_path}.",
            ) from error

    def synthesize_to_wav(self, text: str, reference_path: Path, output_path: Path, audio_text: str | None = None) -> Path:
        reference = self.load_reference(reference_path, audio_text=audio_text)
        output = self.generate(text, reference)
        self.save_wav(output.audio, output_path)
        if not output_path.is_file() or output_path.stat().st_size <= 0:
            raise RenderPipelineError(
                api_error_code=ApiErrorCode.RENDER_GENERATION_FAILED,
                failure_code=RenderFailureCode.RENDER_GENERATION_FAILED.value,
                message=f"Generated WAV was not written to {output_path}.",
            )
        return output_path

    def _load_backend(self) -> ModuleType:
        if self._backend is not None:
            return self._backend
        try:
            return importlib.import_module("mlx_tada")
        except Exception as error:
            raise RenderPipelineError(
                api_error_code=ApiErrorCode.MODEL_LOAD_FAILED,
                failure_code=RenderFailureCode.MODEL_LOAD_FAILED.value,
                message="Could not import mlx-tada.",
            ) from error

