-- Add sub-agent tracking columns to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_sub_agent_task BOOLEAN DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_agent TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sub_agent_name TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sub_agent_reason TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sub_agent_result TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sub_agent_spawned_at TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sub_agent_completed_at TEXT;
