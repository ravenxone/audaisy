from __future__ import annotations

import sqlite3
import sys
from dataclasses import replace
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
RUNTIME_SRC = REPO_ROOT / "apps" / "runtime" / "src"

if str(RUNTIME_SRC) not in sys.path:
    sys.path.insert(0, str(RUNTIME_SRC))


@pytest.fixture()
def runtime_settings(tmp_path: Path):
    from audaisy_runtime.settings import Settings

    return Settings(
        app_data_root=tmp_path / "app-data",
        contract_artifacts_dir=REPO_ROOT / "packages" / "contracts",
        minimum_disk_free_bytes=1,
        machine_arch_override="arm64",
        machine_memory_bytes_override=18 * 1024 * 1024 * 1024,
    )


@pytest.fixture()
def make_client(runtime_settings) -> Callable[[], Iterator["TestClient"]]:
    from fastapi.testclient import TestClient
    from audaisy_runtime.app import create_app

    @contextmanager
    def _make_client() -> Iterator[TestClient]:
        app = create_app(runtime_settings)
        with TestClient(app) as client:
            yield client

    return _make_client


@pytest.fixture()
def make_app(runtime_settings):
    from audaisy_runtime.app import create_app

    return create_app(runtime_settings)


@pytest.fixture()
def make_client_for_settings() -> Callable[[object], Iterator["TestClient"]]:
    from fastapi.testclient import TestClient
    from audaisy_runtime.app import create_app

    @contextmanager
    def _make_client(custom_settings) -> Iterator[TestClient]:
        app = create_app(custom_settings)
        with TestClient(app) as client:
            yield client

    return _make_client


@pytest.fixture()
def database_path(runtime_settings) -> Path:
    return runtime_settings.app_data_root / "audaisy.sqlite3"


@pytest.fixture()
def read_db(database_path: Path) -> Callable[[str, tuple[object, ...] | None], list[sqlite3.Row]]:
    def _read_db(query: str, params: tuple[object, ...] | None = None) -> list[sqlite3.Row]:
        connection = sqlite3.connect(database_path)
        connection.row_factory = sqlite3.Row
        try:
            cursor = connection.execute(query, params or ())
            return cursor.fetchall()
        finally:
            connection.close()

    return _read_db
