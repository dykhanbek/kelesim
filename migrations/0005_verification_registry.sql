-- Contact verification (phone via Telegram contact sharing, email via one-time code)
ALTER TABLE users ADD COLUMN verified_at TEXT;          -- when the login (phone / email) was confirmed

CREATE TABLE IF NOT EXISTS verify_codes (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  channel    TEXT NOT NULL,                 -- email | telegram
  code_hash  TEXT NOT NULL,                 -- SHA-256 of the 6-digit code (email) or of the deep-link token (telegram)
  chat_id    TEXT,                          -- telegram: chat that opened the deep link, waiting for the contact
  attempts   INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verify_chat ON verify_codes(chat_id);

-- Cache of the statistical business register (stat.gov.kz) lookups by BIN/IIN
CREATE TABLE IF NOT EXISTS registry_cache (
  bin        TEXT PRIMARY KEY,
  data       TEXT,                          -- JSON of the parsed company, NULL = not found
  fetched_at TEXT NOT NULL
);
