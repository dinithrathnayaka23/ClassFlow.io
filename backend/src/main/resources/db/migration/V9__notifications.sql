-- Per-user notifications.
--
-- One row per recipient rather than one row per event with a join table: a notification is
-- read, or dismissed, by one person independently of everyone else, so the read state has to
-- live next to the delivery. Fanning out at write time also keeps reading cheap, which
-- matters because the bell polls.
--
-- `link` holds a workspace section rather than a full path - "assignments", "courses/12" -
-- because the same notification is valid whichever role prefix the reader browses under, and
-- storing /student/... would break if the account were ever promoted.
CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(40) NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT,
    link TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ
);

-- The list query: one user's notifications, newest first.
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

-- The badge count. Partial, because the only rows it ever looks at are the unread ones.
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id)
    WHERE read_at IS NULL;
