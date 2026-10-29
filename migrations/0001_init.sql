-- Kelisim MVP schema (Cloudflare D1 / SQLite)

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  login         TEXT NOT NULL UNIQUE,          -- normalized email or phone (+7XXXXXXXXXX)
  password_hash TEXT NOT NULL,                 -- PBKDF2-SHA256, base64
  password_salt TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  lang          TEXT NOT NULL DEFAULT 'ru',    -- interface language: ru | en
  plan          TEXT NOT NULL DEFAULT 'free',  -- free | basic | pro
  onboarding_step INTEGER NOT NULL DEFAULT 1,  -- 1 company, 2 bank, 3 telegram, 4 done
  telegram_chat_id  TEXT,
  telegram_link_code TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

-- One company profile per user in the MVP (B2B multi-company is a future version)
CREATE TABLE companies (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bin          TEXT NOT NULL DEFAULT '',
  legal_form   TEXT NOT NULL DEFAULT '',       -- ИП | ТОО
  name_ru      TEXT NOT NULL DEFAULT '',
  name_en      TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  address      TEXT NOT NULL DEFAULT '',
  signatory    TEXT NOT NULL DEFAULT '',
  signatory_basis TEXT NOT NULL DEFAULT '',
  bank_name    TEXT NOT NULL DEFAULT '',
  bik          TEXT NOT NULL DEFAULT '',
  iban         TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE counterparties (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  name_local  TEXT NOT NULL DEFAULT '',        -- name in Chinese / Turkish
  country     TEXT NOT NULL,                   -- ISO-3166 alpha-2
  address     TEXT NOT NULL DEFAULT '',
  bank_details TEXT NOT NULL DEFAULT '',
  check_status TEXT,                           -- green | yellow | red
  check_json   TEXT,                           -- full screening result
  checked_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_cp_user ON counterparties(user_id);

CREATE TABLE deals (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number        TEXT NOT NULL,                 -- KLS-001
  counterparty_id TEXT REFERENCES counterparties(id),
  status        TEXT NOT NULL DEFAULT 'draft', -- draft | checked | active | closed
  risk          TEXT,                          -- green | yellow | red
  data_json     TEXT NOT NULL,                 -- full wizard payload (DealInput)
  check_json    TEXT,                          -- compliance result
  ucn           TEXT NOT NULL DEFAULT '',      -- contract registration number from the bank
  amount        REAL NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'USD',
  docs_generated_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_deals_user ON deals(user_id);

CREATE TABLE deadlines (
  id         TEXT PRIMARY KEY,
  deal_id    TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                    -- ucn | payment | delivery | repatriation
  due_date   TEXT NOT NULL,                    -- YYYY-MM-DD
  done_at    TEXT,
  proof_note TEXT NOT NULL DEFAULT '',
  snoozed_until TEXT,
  last_notified TEXT
);
CREATE INDEX idx_deadlines_user ON deadlines(user_id, due_date);

CREATE TABLE deal_events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id  TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  ts       TEXT NOT NULL DEFAULT (datetime('now')),
  kind     TEXT NOT NULL,                      -- created | checked | docs | deadline_done | ucn | closed ...
  detail   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_events_deal ON deal_events(deal_id);

-- Counts generated document packages per month (Free plan limit)
CREATE TABLE usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month   TEXT NOT NULL,                       -- YYYY-MM
  packages INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);
