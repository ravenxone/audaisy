from __future__ import annotations

from sqlite3 import Row

from audaisy_runtime.persistence.database import Database


class VoicePresetRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    def list_all(self) -> list[Row]:
        with self._database.connect() as connection:
            return connection.execute(
                """
                SELECT id, name, language, cached_reference_path
                FROM voice_presets
                ORDER BY name ASC
                """
            ).fetchall()

