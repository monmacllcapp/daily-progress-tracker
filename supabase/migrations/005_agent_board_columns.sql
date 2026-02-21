-- Add agent board and sub-agent tracking columns to tasks table
-- These columns were added in RxDB schema v3/v4 but missing from Supabase

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deliverable text DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS agent_question text DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS agent_board_status text DEFAULT 'new';

-- Sub-agent tracking (v4)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_sub_agent_task boolean DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_agent text DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sub_agent_name text DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sub_agent_reason text DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sub_agent_result text DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sub_agent_spawned_at text DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sub_agent_completed_at text DEFAULT '';
