-- One row per search. Run with: npm run db:local (on your laptop) and npm run db:remote (online)
CREATE TABLE IF NOT EXISTS searches (
  id             TEXT PRIMARY KEY,   -- a random id (crypto.randomUUID)
  created_at     TEXT NOT NULL,      -- ISO date and time, UTC
  file_name      TEXT,               -- the name of the uploaded file
  image_key      TEXT NOT NULL,      -- where the uploaded plan is stored in R2
  result_key     TEXT NOT NULL,      -- where the full answer of the model server is stored in R2 (JSON)
  best_id        TEXT NOT NULL,      -- the most similar CubiCasa5K plan, e.g. high_quality_architectural/1191
  best_distance  REAL NOT NULL,      -- its distance to the uploaded plan (smaller = more similar)
  match_ids      TEXT NOT NULL,      -- the five matches, most similar first, as a JSON list
  atlas_x        REAL,               -- where the uploaded plan lands on the atlas of the 5,000 plans (0-1)
  atlas_y        REAL,
  model          TEXT,               -- which network answered: v1, v2 or v3
  embedding      TEXT,               -- the 128 numbers of the uploaded plan, as JSON text (the worker compares them)
  user_id        TEXT                -- the account that made the search (accounts.sql); every query filters on it
);

CREATE INDEX IF NOT EXISTS idx_searches_user ON searches (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_searches_created_at ON searches (created_at);
