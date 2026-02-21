-- Missions system + Onboarding/Fulfillment agents

BEGIN;

CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  color TEXT,
  assigned_agents JSONB DEFAULT '[]'::JSONB,
  created_at TEXT,
  updated_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS mission_attachments (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  data_base64 TEXT NOT NULL,
  thumbnail_base64 TEXT,
  created_at TEXT
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS mission_id TEXT DEFAULT '';

INSERT INTO agent_status (id, agent_name, status, model, last_activity)
VALUES ('onboarding', 'Onboarding', 'offline', 'kimi-k2.5', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO agent_status (id, agent_name, status, model, last_activity)
VALUES ('fulfillment', 'Fulfillment', 'offline', 'kimi-k2.5', NULL)
ON CONFLICT (id) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE missions;

COMMIT;
