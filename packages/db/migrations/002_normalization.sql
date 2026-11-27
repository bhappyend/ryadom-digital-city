ALTER TABLE import_jobs
  ADD COLUMN normalizer_revision integer NOT NULL DEFAULT 1 CHECK (normalizer_revision >= 1);
ALTER TABLE source_records
  ADD COLUMN normalizer_revision integer NOT NULL DEFAULT 1 CHECK (normalizer_revision >= 1);
