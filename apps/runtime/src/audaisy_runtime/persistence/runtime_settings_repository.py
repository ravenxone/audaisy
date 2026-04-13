from __future__ import annotations

import json
from typing import Any

from audaisy_runtime.persistence.database import Database


class RuntimeSettingsRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    def get_json(self, key: str) -> dict[str, Any] | None:
        with self._database.connect() as connection:
            row = connection.execute("SELECT value_json FROM runtime_settings WHERE key = ?", (key,)).fetchone()
            if row is None:
                return None
            return json.loads(row["value_json"])

    def set_json(self, key: str, value: dict[str, Any]) -> None:
        payload = json.dumps(value, sort_keys=True)
        with self._database.connect() as connection:
            connection.execute(
                """
                INSERT INTO runtime_settings (key, value_json)
                VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
                """,
                (key, payload),
            )
            connection.commit()

