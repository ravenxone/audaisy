from __future__ import annotations

from sqlite3 import Row

from audaisy_runtime.persistence.database import Database


class ChapterRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    def list_summaries(self, project_id: str) -> list[Row]:
        with self._database.connect() as connection:
            return connection.execute(
                """
                SELECT
                  chapters.id,
                  chapters.title,
                  chapters.chapter_order,
                  chapters.document_record_id,
                  COALESCE(warnings.warning_count, 0) AS warning_count
                FROM chapters
                LEFT JOIN (
                  SELECT chapter_id, COUNT(*) AS warning_count
                  FROM import_warnings
                  GROUP BY chapter_id
                ) AS warnings ON warnings.chapter_id = chapters.id
                WHERE chapters.project_id = ?
                ORDER BY chapters.chapter_order ASC
                """,
                (project_id,),
            ).fetchall()

    def next_order(self, project_id: str) -> int:
        with self._database.connect() as connection:
            row = connection.execute(
                "SELECT COALESCE(MAX(chapter_order), 0) AS max_order FROM chapters WHERE project_id = ?",
                (project_id,),
            ).fetchone()
            return row["max_order"] + 1

    def create(
        self,
        *,
        chapter_id: str,
        project_id: str,
        title: str,
        chapter_order: int,
        markdown_path: str,
        editor_doc_path: str,
        document_record_id: str | None,
        revision: int,
        created_at: str,
        updated_at: str,
    ) -> Row:
        with self._database.connect() as connection:
            connection.execute(
                """
                INSERT INTO chapters (
                  id,
                  project_id,
                  title,
                  chapter_order,
                  markdown_path,
                  editor_doc_path,
                  document_record_id,
                  created_at,
                  updated_at,
                  revision
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    chapter_id,
                    project_id,
                    title,
                    chapter_order,
                    markdown_path,
                    editor_doc_path,
                    document_record_id,
                    created_at,
                    updated_at,
                    revision,
                ),
            )
            connection.commit()
            return connection.execute("SELECT * FROM chapters WHERE id = ?", (chapter_id,)).fetchone()

    def get(self, project_id: str, chapter_id: str) -> Row | None:
        with self._database.connect() as connection:
            return connection.execute(
                "SELECT * FROM chapters WHERE project_id = ? AND id = ?",
                (project_id, chapter_id),
            ).fetchone()

    def list_by_document_record(self, document_record_id: str) -> list[Row]:
        with self._database.connect() as connection:
            return connection.execute(
                """
                SELECT *
                FROM chapters
                WHERE document_record_id = ?
                ORDER BY chapter_order ASC
                """,
                (document_record_id,),
            ).fetchall()

    def delete_by_document_record(self, document_record_id: str) -> None:
        with self._database.connect() as connection:
            connection.execute(
                "DELETE FROM chapters WHERE document_record_id = ?",
                (document_record_id,),
            )
            connection.commit()

    def update_content(
        self,
        *,
        project_id: str,
        chapter_id: str,
        markdown_path: str,
        editor_doc_path: str,
        revision: int,
        updated_at: str,
    ) -> Row:
        with self._database.connect() as connection:
            connection.execute(
                """
                UPDATE chapters
                SET markdown_path = ?, editor_doc_path = ?, revision = ?, updated_at = ?
                WHERE project_id = ? AND id = ?
                """,
                (markdown_path, editor_doc_path, revision, updated_at, project_id, chapter_id),
            )
            connection.commit()
            return connection.execute("SELECT * FROM chapters WHERE id = ?", (chapter_id,)).fetchone()
