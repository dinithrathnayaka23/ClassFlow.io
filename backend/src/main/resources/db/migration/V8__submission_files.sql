-- A submission becomes a set of files rather than exactly one.
--
-- Coursework is often handed in as several parts - a report plus its appendix, a scan split
-- across pages - and the single file_url column forced a student to zip them or pick one.
-- assignment_submissions stays the per-student record that carries status, mark and
-- feedback; the files hang off it.

CREATE TABLE IF NOT EXISTS assignment_submission_files (
    id BIGSERIAL PRIMARY KEY,
    submission_id BIGINT NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    content_type TEXT,
    size_bytes BIGINT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submission_files ON assignment_submission_files(submission_id);

-- Carry every existing submission's single file across, so nothing already handed in is
-- lost. Guarded so the migration stays re-runnable against a partially migrated database.
INSERT INTO assignment_submission_files (submission_id, file_url, file_name, uploaded_at)
SELECT s.id, s.file_url, s.file_name, s.submitted_at
FROM assignment_submissions s
WHERE s.file_url IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM assignment_submission_files f WHERE f.submission_id = s.id
  );

-- The originals are now duplicates. Dropping them removes any chance of the two disagreeing
-- about which file is current, which is exactly the drift the child table exists to avoid.
ALTER TABLE assignment_submissions DROP COLUMN IF EXISTS file_url;
ALTER TABLE assignment_submissions DROP COLUMN IF EXISTS file_name;
