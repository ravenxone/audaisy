from __future__ import annotations

from sqlite3 import Row

from audaisy_runtime.persistence.database import Database


class ImportWarningRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    def create_many(self, rows: list[tuple[str, str, str, str, str, str, int | None, str | None]]) -> None:
        if not rows:
            return

        with self._database.connect() as connection:
            connection.executemany(
                """
                INSERT INTO import_warnings (
                  id,
                  chapter_id,
                  document_record_id,
                  code,
                  severity,
                  message,
                  source_page,
                  block_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )
            connection.commit()

    def list_by_chapter(self, chapter_id: str) -> list[Row]:
        with self._database.connect() as connection:
            return connection.execute(
                """
                SELECT id, code, severity, message, source_page, block_id
                FROM import_warnings
                WHERE chapter_id = ?
                ORDER BY rowid ASC
                """,
                (chapter_id,),
            ).fetchall()
