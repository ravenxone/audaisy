from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from importlib import resources
from pathlib import Path
from typing import Iterator


class Database:
    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path

    def initialize(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            current_version = connection.execute("PRAGMA user_version").fetchone()[0]
            migration_files = sorted(
                file
                for file in resources.files("audaisy_runtime.persistence.migrations").iterdir()
                if file.name.endswith(".sql")
            )

            for migration_file in migration_files:
                version = int(migration_file.name.split("_", 1)[0])
                if version <= current_version:
                    continue
                connection.executescript(migration_file.read_text())
                connection.execute(f"PRAGMA user_version = {version}")

            connection.commit()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self._db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
        finally:
            connection.close()
