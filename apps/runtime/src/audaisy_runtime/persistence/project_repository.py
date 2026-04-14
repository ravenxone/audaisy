from __future__ import annotations

from sqlite3 import Row

from audaisy_runtime.persistence.database import Database


class ProjectRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    def create(
        self,
        project_id: str,
        title: str,
        created_at: str,
        updated_at: str,
        last_opened_at: str,
    ) -> Row:
        with self._database.connect() as connection:
            connection.execute(
                """
                INSERT INTO projects (id, title, default_voice_preset_id, created_at, updated_at, last_opened_at)
                VALUES (?, ?, NULL, ?, ?, ?)
                """,
                (project_id, title, created_at, updated_at, last_opened_at),
            )
            connection.commit()
            return connection.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()

    def get(self, project_id: str) -> Row | None:
        with self._database.connect() as connection:
            return connection.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()

    def list_cards(self) -> list[Row]:
        with self._database.connect() as connection:
            return connection.execute(
                """
                SELECT
                  projects.id,
                  projects.title,
                  projects.created_at,
                  projects.updated_at,
                  projects.last_opened_at,
                  COALESCE(chapter_counts.chapter_count, 0) AS chapter_count,
                  COALESCE(active_jobs.active_job_count, 0) AS active_job_count
                FROM projects
                LEFT JOIN (
                  SELECT project_id, COUNT(*) AS chapter_count
                  FROM chapters
                  GROUP BY project_id
                ) AS chapter_counts ON chapter_counts.project_id = projects.id
                LEFT JOIN (
                  SELECT project_id, COUNT(*) AS active_job_count
                  FROM render_jobs
                  WHERE status IN ('queued', 'running', 'assembling')
                  GROUP BY project_id
                ) AS active_jobs ON active_jobs.project_id = projects.id
                ORDER BY
                  CASE WHEN projects.last_opened_at IS NULL THEN 1 ELSE 0 END,
                  projects.last_opened_at DESC,
                  projects.updated_at DESC
                """
            ).fetchall()

    def update(
        self,
        project_id: str,
        title: str,
        default_voice_preset_id: str | None,
        updated_at: str,
    ) -> Row:
        with self._database.connect() as connection:
            connection.execute(
                """
                UPDATE projects
                SET title = ?, default_voice_preset_id = ?, updated_at = ?
                WHERE id = ?
                """,
                (title, default_voice_preset_id, updated_at, project_id),
            )
            connection.commit()
            return connection.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()

    def delete(self, project_id: str) -> None:
        with self._database.connect() as connection:
            connection.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            connection.commit()

    def touch_last_opened(self, project_id: str, timestamp: str) -> Row:
        with self._database.connect() as connection:
            connection.execute(
                """
                UPDATE projects
                SET last_opened_at = ?, updated_at = updated_at
                WHERE id = ?
                """,
                (timestamp, project_id),
            )
            connection.commit()
            return connection.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()

    def list_chapter_summaries(self, project_id: str) -> list[Row]:
        with self._database.connect() as connection:
            return connection.execute(
                """
                SELECT
                  chapters.id,
                  chapters.title,
                  chapters.chapter_order,
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
