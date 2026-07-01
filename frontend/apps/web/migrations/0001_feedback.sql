-- Anonymous product-feedback table (Cloudflare D1).
--
-- Stores ONLY anonymous signal: a page slug, an optional up/down sentiment, an
-- optional free-text suggestion, and a coarse app_version. NO IP address, NO
-- user-agent, NO cookies, NO identifier of any kind is ever written here.
--
-- Apply with:
--   bunx wrangler d1 execute almamesh-feedback --remote --file=migrations/0001_feedback.sql
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  page TEXT NOT NULL,
  sentiment TEXT,        -- 'up' | 'down' | NULL
  message TEXT,          -- nullable free text
  app_version TEXT
);
CREATE INDEX IF NOT EXISTS idx_feedback_page ON feedback(page);
