from __future__ import annotations

from sqlite3 import Row

from audaisy_runtime.persistence.database import Database


class ProfileRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    def get(self, profile_id: str) -> Row | None:
        with self._database.connect() as connection:
            return connection.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,)).fetchone()

    def create_default(self, profile_id: str, created_at: str) -> Row:
        with self._database.connect() as connection:
            connection.execute(
                """
                INSERT INTO profiles (id, name, avatar_id, created_at, updated_at)
                VALUES (?, '', NULL, ?, ?)
                """,
                (profile_id, created_at, created_at),
            )
            connection.commit()
            return connection.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,)).fetchone()

    def update(self, profile_id: str, name: str, avatar_id: str | None, updated_at: str) -> Row:
        with self._database.connect() as connection:
            connection.execute(
                """
                UPDATE profiles
                SET name = ?, avatar_id = ?, updated_at = ?
                WHERE id = ?
                """,
                (name, avatar_id, updated_at, profile_id),
            )
            connection.commit()
            return connection.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,)).fetchone()

