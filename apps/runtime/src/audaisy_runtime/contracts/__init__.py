from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from audaisy_runtime.settings import Settings


def generate_contract_artifacts(settings: "Settings", output_dir: Path) -> None:
    from audaisy_runtime.contracts.generator import generate_contract_artifacts as _generate_contract_artifacts

    _generate_contract_artifacts(settings, output_dir)


__all__ = ["generate_contract_artifacts"]
