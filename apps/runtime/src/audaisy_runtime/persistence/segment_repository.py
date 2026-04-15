from __future__ import annotations

from sqlite3 import Row

from audaisy_runtime.persistence.database import Database


class SegmentRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    def create_many(self, rows: list[tuple[object, ...]]) -> None:
        if not rows:
            return
        with self._database.connect() as connection:
            connection.executemany(
                """
                INSERT INTO segments (
                  id,
                  render_job_id,
                  chapter_id,
                  text,
                  block_ids_json,
                  segment_order,
                  estimated_duration_sec,
                  status,
                  audio_path,
                  started_at,
                  completed_at,
                  audio_artifact_id,
                  error_code,
                  error_message
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )
            connection.commit()

    def list_by_job(self, render_job_id: str) -> list[Row]:
        with self._database.connect() as connection:
            return connection.execute(
                """
                SELECT *
                FROM segments
                WHERE render_job_id = ?
                ORDER BY segment_order ASC
                """,
                (render_job_id,),
            ).fetchall()

    def mark_running(self, segment_id: str, *, started_at: str) -> Row:
        return self._update_segment(
            segment_id,
            """
            UPDATE segments
            SET status = 'running',
                started_at = COALESCE(started_at, ?),
                error_code = NULL,
                error_message = NULL
            WHERE id = ?
            """,
            (started_at, segment_id),
        )

    def mark_completed(
        self,
        segment_id: str,
        *,
        completed_at: str,
        audio_artifact_id: str,
        audio_path: str,
    ) -> Row:
        return self._update_segment(
            segment_id,
            """
            UPDATE segments
            SET status = 'completed',
                completed_at = ?,
                audio_artifact_id = ?,
                audio_path = ?,
                error_code = NULL,
                error_message = NULL
            WHERE id = ?
            """,
            (completed_at, audio_artifact_id, audio_path, segment_id),
        )

    def mark_failed(self, segment_id: str, *, completed_at: str, error_code: str, error_message: str) -> Row:
        return self._update_segment(
            segment_id,
            """
            UPDATE segments
            SET status = 'failed',
                completed_at = ?,
                error_code = ?,
                error_message = ?
            WHERE id = ?
            """,
            (completed_at, error_code, error_message, segment_id),
        )

    def _update_segment(self, segment_id: str, statement: str, params: tuple[object, ...]) -> Row:
        with self._database.connect() as connection:
            connection.execute(statement, params)
            connection.commit()
            return connection.execute("SELECT * FROM segments WHERE id = ?", (segment_id,)).fetchone()
