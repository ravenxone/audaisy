ALTER TABLE chapters ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE import_warnings ADD COLUMN document_record_id TEXT;

CREATE INDEX IF NOT EXISTS idx_import_warnings_document_record_id ON import_warnings(document_record_id);
