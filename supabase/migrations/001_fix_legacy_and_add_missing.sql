-- ============================================================
-- Migration 001: Fix legacy tables + add missing tables
-- Purpose: Align Supabase schema with RxDB (TEXT PK, TEXT timestamps)
-- RxDB uses string IDs and ISO-8601 text timestamps everywhere.
-- Legacy schema.sql used UUID + TIMESTAMPTZ which causes type mismatches.
-- This migration drops the 7 legacy tables and recreates them,
-- then creates 15 tables that never existed in Supabase.
-- No RLS — single-user app, service_role key access only.
-- ============================================================

BEGIN;

-- ============================================================
-- PART A: Drop 7 legacy tables (UUID/TIMESTAMPTZ → TEXT)
-- ============================================================

-- Drop RLS policies first (they block DROP TABLE)
DROP POLICY IF EXISTS "Users can view their own projects" ON projects;
DROP POLICY IF EXISTS "Users can insert their own projects" ON projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON projects;

DROP POLICY IF EXISTS "Users can view their own sub_tasks" ON sub_tasks;
DROP POLICY IF EXISTS "Users can insert their own sub_tasks" ON sub_tasks;
DROP POLICY IF EXISTS "Users can update their own sub_tasks" ON sub_tasks;
DROP POLICY IF EXISTS "Users can delete their own sub_tasks" ON sub_tasks;

DROP POLICY IF EXISTS "Users can view their own journal" ON daily_journal;
DROP POLICY IF EXISTS "Users can insert their own journal" ON daily_journal;
DROP POLICY IF EXISTS "Users can update their own journal" ON daily_journal;

DROP POLICY IF EXISTS "Users can view their own vision board" ON vision_board;
DROP POLICY IF EXISTS "Users can insert their own vision board" ON vision_board;
DROP POLICY IF EXISTS "Users can update their own vision board" ON vision_board;
DROP POLICY IF EXISTS "Users can delete their own vision board" ON vision_board;

DROP POLICY IF EXISTS "Users can view their own categories" ON categories;
DROP POLICY IF EXISTS "Users can insert their own categories" ON categories;
DROP POLICY IF EXISTS "Users can update their own categories" ON categories;
DROP POLICY IF EXISTS "Users can delete their own categories" ON categories;

DROP POLICY IF EXISTS "Users can manage their own stressors" ON stressors;
DROP POLICY IF EXISTS "Users can manage their own stressor milestones" ON stressor_milestones;

-- Drop tables (CASCADE auto-removes from publications)
DROP TABLE IF EXISTS stressor_milestones CASCADE;
DROP TABLE IF EXISTS stressors CASCADE;
DROP TABLE IF EXISTS sub_tasks CASCADE;
DROP TABLE IF EXISTS vision_board CASCADE;
DROP TABLE IF EXISTS daily_journal CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS categories CASCADE;

-- ============================================================
-- PART B: Recreate 7 legacy tables with TEXT PK + TEXT timestamps
-- ============================================================

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  color_theme TEXT NOT NULL,
  icon TEXT,
  current_progress NUMERIC DEFAULT 0,
  streak_count INTEGER DEFAULT 0,
  last_active_date TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  motivation_payload JSONB DEFAULT '{}'::JSONB,
  metrics JSONB DEFAULT '{}'::JSONB,
  linked_vision_id TEXT,
  category_id TEXT,
  due_date TEXT,
  calendar_event_id TEXT,
  priority TEXT DEFAULT 'medium',
  updated_at TEXT
);

CREATE TABLE sub_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  time_estimate_minutes INTEGER DEFAULT 0,
  time_actual_minutes INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  completed_date TEXT,
  updated_at TEXT
);

CREATE TABLE daily_journal (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  gratitude JSONB DEFAULT '[]'::JSONB,
  non_negotiables JSONB DEFAULT '[]'::JSONB,
  stressors JSONB DEFAULT '[]'::JSONB,
  habits JSONB DEFAULT '{}'::JSONB,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE vision_board (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  declaration TEXT NOT NULL,
  rpm_purpose TEXT NOT NULL,
  pain_payload TEXT,
  pleasure_payload TEXT,
  visual_anchor TEXT,
  category_name TEXT,
  category_id TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE stressors (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  time_estimate_minutes NUMERIC DEFAULT 30,
  is_today BOOLEAN DEFAULT true,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE stressor_milestones (
  id TEXT PRIMARY KEY,
  stressor_id TEXT NOT NULL,
  title TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  sort_order NUMERIC DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

-- ============================================================
-- PART C: Create 15 tables (drop first if any already exist)
-- ============================================================

DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS emails CASCADE;
DROP TABLE IF EXISTS calendar_events CASCADE;
DROP TABLE IF EXISTS pomodoro_sessions CASCADE;
DROP TABLE IF EXISTS habits CASCADE;
DROP TABLE IF EXISTS habit_completions CASCADE;
DROP TABLE IF EXISTS user_profile CASCADE;
DROP TABLE IF EXISTS analytics_events CASCADE;
DROP TABLE IF EXISTS signals CASCADE;
DROP TABLE IF EXISTS deals CASCADE;
DROP TABLE IF EXISTS portfolio_snapshots CASCADE;
DROP TABLE IF EXISTS family_events CASCADE;
DROP TABLE IF EXISTS morning_briefs CASCADE;
DROP TABLE IF EXISTS productivity_patterns CASCADE;
DROP TABLE IF EXISTS signal_weights CASCADE;

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category_id TEXT NOT NULL,
  goal_id TEXT,
  time_estimate_minutes INTEGER,
  priority TEXT DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL,
  created_date TEXT NOT NULL,
  due_date TEXT,
  rolled_from_date TEXT,
  completed_date TEXT,
  defer_reason TEXT,
  sort_order INTEGER DEFAULT 0,
  tags JSONB DEFAULT '[]'::JSONB,
  assigned_agent TEXT,
  agent_status TEXT,
  agent_notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE emails (
  id TEXT PRIMARY KEY,
  gmail_id TEXT NOT NULL,
  thread_id TEXT,
  "from" TEXT NOT NULL,
  subject TEXT NOT NULL,
  snippet TEXT,
  tier TEXT NOT NULL,
  tier_override TEXT,
  status TEXT NOT NULL DEFAULT 'unread',
  ai_draft TEXT,
  received_at TEXT NOT NULL,
  labels JSONB DEFAULT '[]'::JSONB,
  score NUMERIC,
  list_id TEXT,
  unsubscribe_url TEXT,
  unsubscribe_mailto TEXT,
  unsubscribe_one_click BOOLEAN DEFAULT false,
  is_newsletter BOOLEAN DEFAULT false,
  snooze_until TEXT,
  snoozed_at TEXT,
  reply_checked_at TEXT,
  unsubscribe_status TEXT,
  unsubscribe_attempted_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY,
  google_event_id TEXT,
  summary TEXT NOT NULL,
  description TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  all_day BOOLEAN DEFAULT false,
  linked_task_id TEXT,
  source TEXT NOT NULL,
  color TEXT,
  is_focus_block BOOLEAN DEFAULT false,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE pomodoro_sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  category_id TEXT,
  type TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE habits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  category_id TEXT,
  frequency TEXT NOT NULL DEFAULT 'daily',
  sort_order INTEGER DEFAULT 0,
  is_archived BOOLEAN DEFAULT false,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE habit_completions (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  date TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

CREATE TABLE user_profile (
  id TEXT PRIMARY KEY,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  gold INTEGER NOT NULL DEFAULT 0,
  total_tasks_completed INTEGER DEFAULT 0,
  total_habits_checked INTEGER DEFAULT 0,
  total_pomodoros_completed INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE analytics_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::JSONB,
  timestamp TEXT NOT NULL
);

CREATE TABLE signals (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  domain TEXT NOT NULL,
  source TEXT,
  title TEXT NOT NULL,
  context TEXT,
  suggested_action TEXT,
  auto_actionable BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  is_acted_on BOOLEAN DEFAULT false,
  related_entity_ids JSONB DEFAULT '[]'::JSONB,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  updated_at TEXT
);

CREATE TABLE deals (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  city TEXT,
  state TEXT,
  zip TEXT,
  strategy TEXT NOT NULL,
  status TEXT NOT NULL,
  purchase_price NUMERIC,
  arv NUMERIC,
  rehab_cost NUMERIC,
  noi NUMERIC,
  cap_rate NUMERIC,
  dscr NUMERIC,
  cash_on_cash NUMERIC,
  zestimate NUMERIC,
  last_analysis_at TEXT,
  notes TEXT,
  linked_email_ids JSONB DEFAULT '[]'::JSONB,
  linked_task_ids JSONB DEFAULT '[]'::JSONB,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE portfolio_snapshots (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  equity NUMERIC NOT NULL,
  cash NUMERIC,
  buying_power NUMERIC,
  positions_count INTEGER DEFAULT 0,
  day_pnl NUMERIC,
  total_pnl NUMERIC,
  positions JSONB DEFAULT '[]'::JSONB,
  source TEXT NOT NULL,
  created_at TEXT
);

CREATE TABLE family_events (
  id TEXT PRIMARY KEY,
  member TEXT NOT NULL,
  summary TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  source_calendar TEXT,
  conflict_with TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE morning_briefs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  urgent_signals JSONB DEFAULT '[]'::JSONB,
  attention_signals JSONB DEFAULT '[]'::JSONB,
  portfolio_pulse JSONB DEFAULT '{}'::JSONB,
  calendar_summary JSONB DEFAULT '[]'::JSONB,
  family_summary JSONB DEFAULT '[]'::JSONB,
  ai_insight TEXT,
  generated_at TEXT NOT NULL
);

CREATE TABLE productivity_patterns (
  id TEXT PRIMARY KEY,
  pattern_type TEXT NOT NULL,
  description TEXT NOT NULL,
  data JSONB DEFAULT '{}'::JSONB,
  confidence NUMERIC,
  week_start TEXT NOT NULL,
  created_at TEXT
);

CREATE TABLE signal_weights (
  id TEXT PRIMARY KEY,
  signal_type TEXT NOT NULL,
  domain TEXT NOT NULL,
  total_generated INTEGER DEFAULT 0,
  total_dismissed INTEGER DEFAULT 0,
  total_acted_on INTEGER DEFAULT 0,
  effectiveness_score NUMERIC DEFAULT 0,
  weight_modifier NUMERIC DEFAULT 1.0,
  last_updated TEXT,
  created_at TEXT
);

-- ============================================================
-- PART D: Enable realtime for ALL 22 tables
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE categories;
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
ALTER PUBLICATION supabase_realtime ADD TABLE sub_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE daily_journal;
ALTER PUBLICATION supabase_realtime ADD TABLE vision_board;
ALTER PUBLICATION supabase_realtime ADD TABLE stressors;
ALTER PUBLICATION supabase_realtime ADD TABLE stressor_milestones;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE emails;
ALTER PUBLICATION supabase_realtime ADD TABLE calendar_events;
ALTER PUBLICATION supabase_realtime ADD TABLE pomodoro_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE habits;
ALTER PUBLICATION supabase_realtime ADD TABLE habit_completions;
ALTER PUBLICATION supabase_realtime ADD TABLE user_profile;
ALTER PUBLICATION supabase_realtime ADD TABLE analytics_events;
ALTER PUBLICATION supabase_realtime ADD TABLE signals;
ALTER PUBLICATION supabase_realtime ADD TABLE deals;
ALTER PUBLICATION supabase_realtime ADD TABLE portfolio_snapshots;
ALTER PUBLICATION supabase_realtime ADD TABLE family_events;
ALTER PUBLICATION supabase_realtime ADD TABLE morning_briefs;
ALTER PUBLICATION supabase_realtime ADD TABLE productivity_patterns;
ALTER PUBLICATION supabase_realtime ADD TABLE signal_weights;

COMMIT;
