-- Chat grows from text-only to images, files and voice notes, and gains the unread
-- bookkeeping behind the message-count badges.
--
-- body stays NOT NULL. An attachment-only message carries an empty body rather than a null,
-- so every read path can treat body as a string without a null check; the CHECK below is
-- what actually guarantees a message says or carries something.

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(10);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment_size BIGINT;
-- The browser needs the real media type to play a recording back; "octet-stream" would
-- leave <audio> with nothing it can decode.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment_content_type TEXT;
-- Voice notes show their length before you play them, the way a phone messenger does.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment_duration_seconds INTEGER;

ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_attachment_type_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_attachment_type_check
    CHECK (attachment_type IS NULL OR attachment_type IN ('IMAGE', 'FILE', 'AUDIO'));

-- The five attachment columns are all-or-nothing: a URL without a type would render as a
-- broken bubble, and a type without a URL as an empty one.
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_attachment_complete;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_attachment_complete
    CHECK ((attachment_url IS NULL AND attachment_type IS NULL AND attachment_name IS NULL)
        OR (attachment_url IS NOT NULL AND attachment_type IS NOT NULL AND attachment_name IS NOT NULL));

ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_content_present;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_content_present
    CHECK (body <> '' OR attachment_url IS NOT NULL);

-- Serves the per-conversation and total unread counts. Partial, because the only rows these
-- counts ever look at are the unread ones, and a read message never becomes unread again.
CREATE INDEX IF NOT EXISTS idx_chat_unread ON chat_messages(recipient_id, sender_id)
    WHERE read_at IS NULL;
