from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from audaisy_runtime import CONTRACT_VERSION, RUNTIME_VERSION
from audaisy_runtime.contracts.models import ImportFormat, ModelTier


@dataclass(frozen=True, slots=True)
class Settings:
    app_data_root: Path
    contract_artifacts_dir: Path
    runtime_version: str = RUNTIME_VERSION
    contract_version: str = CONTRACT_VERSION
    minimum_disk_free_bytes: int = 15 * 1024 * 1024 * 1024
    minimum_memory_for_3b_bytes: int = 16 * 1024 * 1024 * 1024
    default_model_tier: ModelTier = ModelTier.TADA_3B_Q4
    fallback_model_tier: ModelTier = ModelTier.TADA_1B_Q4
    machine_arch_override: str | None = None
    machine_memory_bytes_override: int | None = None
    supported_import_formats: tuple[ImportFormat, ...] = (
        ImportFormat.PDF,
        ImportFormat.TXT,
        ImportFormat.MD,
    )
    allowed_web_origins: tuple[str, ...] = (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "tauri://localhost",
        "https://tauri.localhost",
    )

    @property
    def database_path(self) -> Path:
        return self.app_data_root / "audaisy.sqlite3"
