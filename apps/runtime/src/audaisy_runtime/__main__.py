from __future__ import annotations

import argparse
from pathlib import Path

import uvicorn

from audaisy_runtime.app import create_app
from audaisy_runtime.settings import Settings


def main() -> None:
    parser = argparse.ArgumentParser(description="Launch the Audaisy local runtime.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--app-data-root", type=Path, required=True)
    parser.add_argument(
        "--contract-artifacts-dir",
        type=Path,
        default=Path(__file__).resolve().parents[4] / "packages" / "contracts",
    )
    args = parser.parse_args()

    settings = Settings(
        app_data_root=args.app_data_root,
        contract_artifacts_dir=args.contract_artifacts_dir,
    )
    uvicorn.run(
        create_app(settings),
        host=args.host,
        port=args.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
