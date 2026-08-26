-- Deleting a user from the admin dashboard has to be possible without leaving
-- orphaned rows behind. V1 created every users(id) reference with the PostgreSQL
-- default of NO ACTION, so a DELETE failed for anyone who had ever posted, sent a
-- message, or authored course content.
--
-- The policy below is "a person's own trail goes with them":
--   * content the user authored is removed with them (CASCADE),
--   * the audit trail survives without them (SET NULL on activity_logs),
--   * a course is never destroyed as a side effect, so courses.teacher_id stays
--     RESTRICT and UserController reports the blocking courses instead.
--
-- V1 declared these inline, so every constraint carries the default
-- <table>_<column>_fkey name. DROP ... IF EXISTS keeps this re-runnable on a
-- database whose constraints were created by hand from db/schema.sql.

ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_created_by_fkey;
ALTER TABLE materials ADD CONSTRAINT materials_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_created_by_fkey;
ALTER TABLE quizzes ADD CONSTRAINT quizzes_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_created_by_fkey;
ALTER TABLE assignments ADD CONSTRAINT assignments_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE forum_topics DROP CONSTRAINT IF EXISTS forum_topics_created_by_fkey;
ALTER TABLE forum_topics ADD CONSTRAINT forum_topics_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE forum_posts DROP CONSTRAINT IF EXISTS forum_posts_created_by_fkey;
ALTER TABLE forum_posts ADD CONSTRAINT forum_posts_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_sender_id_fkey;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_sender_id_fkey
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_recipient_id_fkey;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_recipient_id_fkey
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ai_chat_logs DROP CONSTRAINT IF EXISTS ai_chat_logs_user_id_fkey;
ALTER TABLE ai_chat_logs ADD CONSTRAINT ai_chat_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- activity_logs.user_id is already nullable: the entry stays and renders as
-- "System" once its author is gone, so deleting a user never edits history.
ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_user_id_fkey;
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Stated rather than inherited, so the intent is readable at the schema level.
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_teacher_id_fkey;
ALTER TABLE courses ADD CONSTRAINT courses_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE RESTRICT;
