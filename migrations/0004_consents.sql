-- Personal-data consents (Law of RK No. 94-V "On personal data and their protection").
-- Current state lives on users; every grant / withdrawal is also appended to consent_log
-- (who, what, document version, when, from which IP and browser) as evidence of consent.
ALTER TABLE users ADD COLUMN terms_accepted_at TEXT;        -- user agreement + public offer
ALTER TABLE users ADD COLUMN pd_consent_at TEXT;            -- consent to collection & processing of personal data
ALTER TABLE users ADD COLUMN marketing_consent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN marketing_consent_at TEXT;     -- last change of the marketing consent
ALTER TABLE users ADD COLUMN consent_version TEXT;          -- version of the legal documents accepted

CREATE TABLE IF NOT EXISTS consent_log (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,             -- terms | personal_data | marketing
  granted    INTEGER NOT NULL,          -- 1 granted, 0 withdrawn
  version    TEXT NOT NULL,             -- legal documents version, e.g. 2026-11-09
  ip         TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_consent_user ON consent_log(user_id, created_at);
