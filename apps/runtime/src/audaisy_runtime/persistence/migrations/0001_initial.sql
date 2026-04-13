CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  default_voice_preset_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  chapter_order INTEGER NOT NULL,
  markdown_path TEXT NOT NULL,
  editor_doc_path TEXT NOT NULL,
  document_record_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS document_records (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_file_name TEXT NOT NULL,
  source_mime_type TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  canonical_json_path TEXT,
  markdown_projection_path TEXT,
  confidence TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  state TEXT NOT NULL,
  original_file_path TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  failure_message TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS import_warnings (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  code TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  source_page INTEGER,
  block_id TEXT,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS voice_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  reference_asset_path TEXT NOT NULL,
  cached_reference_path TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS render_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chapter_id TEXT,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  voice_preset_id TEXT NOT NULL,
  model_tier TEXT NOT NULL,
  target_export_kind TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY,
  render_job_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  text TEXT NOT NULL,
  block_ids_json TEXT NOT NULL,
  segment_order INTEGER NOT NULL,
  estimated_duration_sec REAL,
  status TEXT NOT NULL,
  audio_path TEXT,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (render_job_id) REFERENCES render_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS runtime_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chapters_project_order ON chapters(project_id, chapter_order);
CREATE INDEX IF NOT EXISTS idx_render_jobs_project_created_at ON render_jobs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_segments_render_job_order ON segments(render_job_id, segment_order);
CREATE INDEX IF NOT EXISTS idx_import_warnings_chapter_id ON import_warnings(chapter_id);
CREATE INDEX IF NOT EXISTS idx_document_records_project_created_at ON document_records(project_id, created_at DESC);

