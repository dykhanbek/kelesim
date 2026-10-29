-- Brute-force protection: failed logins per account and per IP, password-reset and demo requests per IP.
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,           -- e.g. "login:+77011234567", "login-ip:1.2.3.4", "demo-ip:1.2.3.4"
  count        INTEGER NOT NULL DEFAULT 0, -- hits inside the current window
  window_start INTEGER NOT NULL            -- epoch ms when the window started
);
