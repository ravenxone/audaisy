ALTER TABLE render_jobs ADD COLUMN source_chapter_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE render_jobs ADD COLUMN output_audio_artifact_id TEXT;
ALTER TABLE render_jobs ADD COLUMN output_audio_path TEXT;
ALTER TABLE render_jobs ADD COLUMN started_at TEXT;
ALTER TABLE render_jobs ADD COLUMN completed_at TEXT;

ALTER TABLE segments ADD COLUMN audio_artifact_id TEXT;
ALTER TABLE segments ADD COLUMN error_code TEXT;
ALTER TABLE segments ADD COLUMN error_message TEXT;
