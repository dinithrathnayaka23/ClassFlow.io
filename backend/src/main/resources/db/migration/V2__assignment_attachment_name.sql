-- Assignment briefs are uploaded files rather than external links, so keep the
-- original filename for display. attachment_url alone holds the stored path,
-- whose basename is prefixed with a UUID and unreadable.
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS attachment_name TEXT;
