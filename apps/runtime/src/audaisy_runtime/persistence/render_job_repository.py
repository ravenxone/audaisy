from __future__ import annotations

from sqlite3 import Row

from audaisy_runtime.persistence.database import Database


class RenderJobRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    def create(
        self,
        *,
        job_id: str,
        project_id: str,
        chapter_id: str,
        voice_preset_id: str,
        model_tier: str,
        source_chapter_revision: int,
        created_at: str,
        updated_at: str,
    ) -> Row:
        with self._database.connect() as connection:
            connection.execute(
                """
                INSERT INTO render_jobs (
                  id,
                  project_id,
                  chapter_id,
                  scope,
                  status,
                  voice_preset_id,
                  model_tier,
                  target_export_kind,
                  error_code,
                  error_message,
                  created_at,
                  updated_at,
                  source_chapter_revision,
                  output_audio_artifact_id,
                  output_audio_path,
                  started_at,
                  completed_at
                )
                VALUES (?, ?, ?, 'chapter', 'queued', ?, ?, NULL, NULL, NULL, ?, ?, ?, NULL, NULL, NULL, NULL)
                """,
                (
                    job_id,
                    project_id,
                    chapter_id,
                    voice_preset_id,
                    model_tier,
                    created_at,
                    updated_at,
                    source_chapter_revision,
                ),
            )
            connection.commit()
            return connection.execute("SELECT * FROM render_jobs WHERE id = ?", (job_id,)).fetchone()

    def get(self, job_id: str) -> Row | None:
        with self._database.connect() as connection:
            return connection.execute("SELECT * FROM render_jobs WHERE id = ?", (job_id,)).fetchone()

    def list_by_project(self, project_id: str) -> list[Row]:
        with self._database.connect() as connection:
            return connection.execute(
                """
                SELECT *
                FROM render_jobs
                WHERE project_id = ?
                ORDER BY created_at DESC
                """,
                (project_id,),
            ).fetchall()

    def list_by_statuses(self, statuses: tuple[str, ...]) -> list[Row]:
        if not statuses:
            return []
        placeholders = ", ".join("?" for _ in statuses)
        with self._database.connect() as connection:
            return connection.execute(
                f"""
                SELECT *
                FROM render_jobs
                WHERE status IN ({placeholders})
                ORDER BY created_at ASC
                """,
                statuses,
            ).fetchall()

    def next_queued(self) -> Row | None:
        with self._database.connect() as connection:
            return connection.execute(
                """
                SELECT *
                FROM render_jobs
                WHERE status = 'queued'
                ORDER BY created_at ASC
                LIMIT 1
                """
            ).fetchone()

    def mark_running(self, job_id: str, *, updated_at: str, started_at: str) -> Row:
        return self._update_job(
            job_id,
            """
            UPDATE render_jobs
            SET status = 'running',
                updated_at = ?,
                started_at = COALESCE(started_at, ?),
                error_code = NULL,
                error_message = NULL
            WHERE id = ?
            """,
            (updated_at, started_at, job_id),
        )

    def mark_assembling(self, job_id: str, *, updated_at: str) -> Row:
        return self._update_job(
            job_id,
            """
            UPDATE render_jobs
            SET status = 'assembling',
                updated_at = ?,
                error_code = NULL,
                error_message = NULL
            WHERE id = ?
            """,
            (updated_at, job_id),
        )

    def mark_completed(
        self,
        job_id: str,
        *,
        updated_at: str,
        completed_at: str,
        output_audio_artifact_id: str,
        output_audio_path: str,
    ) -> Row:
        return self._update_job(
            job_id,
            """
            UPDATE render_jobs
            SET status = 'completed',
                updated_at = ?,
                completed_at = ?,
                output_audio_artifact_id = ?,
                output_audio_path = ?,
                error_code = NULL,
                error_message = NULL
            WHERE id = ?
            """,
            (updated_at, completed_at, output_audio_artifact_id, output_audio_path, job_id),
        )

    def mark_failed(
        self,
        job_id: str,
        *,
        updated_at: str,
        completed_at: str,
        error_code: str,
        error_message: str,
    ) -> Row:
        return self._update_job(
            job_id,
            """
            UPDATE render_jobs
            SET status = 'failed',
                updated_at = ?,
                completed_at = ?,
                error_code = ?,
                error_message = ?
            WHERE id = ?
            """,
            (updated_at, completed_at, error_code, error_message, job_id),
        )

    def _update_job(self, job_id: str, statement: str, params: tuple[object, ...]) -> Row:
        with self._database.connect() as connection:
            connection.execute(statement, params)
            connection.commit()
            return connection.execute("SELECT * FROM render_jobs WHERE id = ?", (job_id,)).fetchone()
