-- Supplier contract reviews and paid service orders.
CREATE TABLE IF NOT EXISTS contract_reviews (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deal_id     TEXT REFERENCES deals(id) ON DELETE SET NULL,
  filename    TEXT NOT NULL DEFAULT '',
  text        TEXT NOT NULL,
  score       INTEGER NOT NULL,
  risk        TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON contract_reviews(user_id, created_at);

CREATE TABLE IF NOT EXISTS orders (
  id               TEXT PRIMARY KEY,
  number           TEXT NOT NULL UNIQUE,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service          TEXT NOT NULL,
  status           TEXT NOT NULL,
  price            INTEGER,                       -- tenge; NULL = quoted individually
  deal_id          TEXT REFERENCES deals(id) ON DELETE SET NULL,
  review_id        TEXT REFERENCES contract_reviews(id) ON DELETE SET NULL,
  details_json     TEXT NOT NULL DEFAULT '{}',
  contact          TEXT NOT NULL DEFAULT '',
  result_text      TEXT NOT NULL DEFAULT '',
  result_url       TEXT NOT NULL DEFAULT '',
  admin_note       TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  paid_reported_at TEXT,
  done_at          TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);

CREATE TABLE IF NOT EXISTS order_events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ts       TEXT NOT NULL DEFAULT (datetime('now')),
  status   TEXT NOT NULL,
  note     TEXT NOT NULL DEFAULT ''
);
