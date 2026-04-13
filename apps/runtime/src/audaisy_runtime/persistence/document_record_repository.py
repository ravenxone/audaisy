from __future__ import annotations

from sqlite3 import Row

from audaisy_runtime.persistence.database import Database


class DocumentRecordRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    def create(
        self,
        *,
        record_id: str,
        project_id: str,
        source_file_name: str,
        source_mime_type: str,
        source_sha256: str,
        created_at: str,
        updated_at: str,
        state: str,
        original_file_path: str,
        file_size_bytes: int,
        failure_message: str | None,
    ) -> Row:
        with self._database.connect() as connection:
            connection.execute(
                """
                INSERT INTO document_records (
                  id,
                  project_id,
                  source_file_name,
                  source_mime_type,
                  source_sha256,
                  canonical_json_path,
                  markdown_projection_path,
                  confidence,
                  created_at,
                  updated_at,
                  state,
                  original_file_path,
                  file_size_bytes,
                  failure_message
                )
                VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    project_id,
                    source_file_name,
                    source_mime_type,
                    source_sha256,
                    created_at,
                    updated_at,
                    state,
                    original_file_path,
                    file_size_bytes,
                    failure_message,
                ),
            )
            connection.commit()
            return connection.execute("SELECT * FROM document_records WHERE id = ?", (record_id,)).fetchone()

    def list_by_project(self, project_id: str) -> list[Row]:
        with self._database.connect() as connection:
            return connection.execute(
                """
                SELECT
                  id,
                  state,
                  source_file_name,
                  source_mime_type,
                  source_sha256,
                  file_size_bytes,
                  created_at,
                  updated_at,
                  failure_message
                FROM document_records
                WHERE project_id = ?
                ORDER BY created_at DESC
                """,
                (project_id,),
            ).fetchall()

