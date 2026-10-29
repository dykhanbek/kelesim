-- v1.1: real sanctions lists, official exchange rates, proof files, email notifications

-- Sanctioned organisations imported daily from OpenSanctions (OFAC SDN, EU FSF, UK) by scripts/import-sanctions.mjs
CREATE TABLE sanctions_entities (
  rowid_ref INTEGER PRIMARY KEY,          -- equals the FTS rowid
  id        TEXT NOT NULL,                -- OpenSanctions entity id
  list      TEXT NOT NULL,                -- "OFAC SDN" | "EU" | "UK"
  name      TEXT NOT NULL,
  aliases   TEXT NOT NULL DEFAULT '',     -- ";"-separated
  countries TEXT NOT NULL DEFAULT '',     -- ";"-separated ISO codes
  program   TEXT NOT NULL DEFAULT ''
);
-- Full-text index over name + aliases (contentless; rowid = sanctions_entities.rowid_ref)
CREATE VIRTUAL TABLE sanctions_fts USING fts5(names, content='', tokenize='unicode61 remove_diacritics 2');

CREATE TABLE sanctions_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Official NBRK exchange rates (KZT per 1 unit of currency), cached per date
CREATE TABLE fx_rates (
  date TEXT NOT NULL,                     -- YYYY-MM-DD
  code TEXT NOT NULL,
  kzt  REAL NOT NULL,
  PRIMARY KEY (date, code)
);

-- Files proving that an obligation was fulfilled (bank statement, customs declaration)
CREATE TABLE proof_files (
  id           TEXT PRIMARY KEY,
  deadline_id  TEXT NOT NULL REFERENCES deadlines(id) ON DELETE CASCADE,
  deal_id      TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size         INTEGER NOT NULL,
  storage      TEXT NOT NULL,             -- 'r2' | 'd1'
  r2_key       TEXT,
  data         BLOB,                      -- only when storage = 'd1'
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_proofs_deadline ON proof_files(deadline_id);

-- Email notifications
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN email_reminders INTEGER NOT NULL DEFAULT 1;
UPDATE users SET email = login WHERE login LIKE '%@%';
