-- Joining a course becomes a request the teacher decides on, rather than something a
-- student does unilaterally.
--
-- The status lives on course_enrollments rather than in a separate requests table, because a
-- request and an enrolment are the same relationship at different stages; splitting them
-- would mean writing every membership check against two tables and keeping them in step.
--
-- Existing rows are APPROVED: they were created when enrolling was immediate, and nobody
-- who already has access should lose it because the rules changed underneath them.
ALTER TABLE course_enrollments
    ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'APPROVED';

ALTER TABLE course_enrollments DROP CONSTRAINT IF EXISTS course_enrollments_status_check;
ALTER TABLE course_enrollments ADD CONSTRAINT course_enrollments_status_check
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'));

-- Who answered the request and when. Null while it is still pending, and the decider is
-- kept as SET NULL so removing a teacher never deletes a student's enrolment.
ALTER TABLE course_enrollments ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
ALTER TABLE course_enrollments ADD COLUMN IF NOT EXISTS decided_by BIGINT;

ALTER TABLE course_enrollments DROP CONSTRAINT IF EXISTS course_enrollments_decided_by_fkey;
ALTER TABLE course_enrollments ADD CONSTRAINT course_enrollments_decided_by_fkey
    FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL;

-- Rows already in the table predate the workflow, so they carry no decision to record.
UPDATE course_enrollments SET decided_at = enrolled_at WHERE status = 'APPROVED' AND decided_at IS NULL;

-- Serves the teacher's pending-request list and the per-course counts, which read one
-- course's rows filtered by status.
CREATE INDEX IF NOT EXISTS idx_enrollments_course_status ON course_enrollments(course_id, status);
