-- One-time tokens behind "forgot password".
--
-- The token is never stored as it is sent. Only its SHA-256 digest is kept, so a stolen
-- database dump does not hand the thief a working reset link for every outstanding request -
-- the same reasoning that stops us storing passwords in the clear.
--
-- Rows are kept after use rather than deleted: `used_at` is what makes a link work exactly
-- once, and a link that quietly disappeared would be indistinguishable from one that had
-- expired. A used or expired row is dead weight, so the issuing code prunes old rows for the
-- account each time a new link is requested.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- 64 hex characters: the SHA-256 of the token that was emailed, never the token itself.
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Redeeming a link looks the token up by its digest, which the UNIQUE constraint above
-- already indexes. This one serves the other access path: finding an account's outstanding
-- links, which happens whenever a new one is issued and whenever a reset invalidates the rest.
CREATE INDEX IF NOT EXISTS idx_password_reset_pending ON password_reset_tokens(user_id)
    WHERE used_at IS NULL;
