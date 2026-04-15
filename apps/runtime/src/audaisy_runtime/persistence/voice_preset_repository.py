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
                SELECT id, name, language, reference_asset_path, cached_reference_path, created_at
                FROM voice_presets
                ORDER BY name ASC
                """
            ).fetchall()

    def get(self, preset_id: str) -> Row | None:
        with self._database.connect() as connection:
            return connection.execute(
                """
                SELECT id, name, language, reference_asset_path, cached_reference_path, created_at
                FROM voice_presets
                WHERE id = ?
                """,
                (preset_id,),
            ).fetchone()

    def upsert(
        self,
        *,
        preset_id: str,
        name: str,
        language: str,
        reference_asset_path: str,
        cached_reference_path: str | None,
        created_at: str,
    ) -> Row:
        with self._database.connect() as connection:
            connection.execute(
                """
                INSERT INTO voice_presets (
                  id,
                  name,
                  language,
                  reference_asset_path,
                  cached_reference_path,
                  created_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  name = excluded.name,
                  language = excluded.language,
                  reference_asset_path = excluded.reference_asset_path,
                  cached_reference_path = excluded.cached_reference_path
                """,
                (preset_id, name, language, reference_asset_path, cached_reference_path, created_at),
            )
            connection.commit()
            return connection.execute(
                """
                SELECT id, name, language, reference_asset_path, cached_reference_path, created_at
                FROM voice_presets
                WHERE id = ?
                """,
                (preset_id,),
            ).fetchone()
