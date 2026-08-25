-- Profile pictures are stored on disk by FileStorage; this holds the served path.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
