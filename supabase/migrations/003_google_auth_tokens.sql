-- Store Google OAuth refresh tokens server-side
-- device_id = random UUID stored in browser localStorage, identifies the browser
-- Only accessible via service_role (Edge Functions), not from browser anon key
CREATE TABLE IF NOT EXISTS google_auth_tokens (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  refresh_token TEXT NOT NULL,
  scopes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
