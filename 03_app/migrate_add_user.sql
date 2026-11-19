-- Run once on a database made before user accounts: every search now belongs to one account
-- (npm run db:user:remote). Older searches have no user and are not shown to anyone.
ALTER TABLE searches ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_searches_user ON searches (user_id, created_at);
