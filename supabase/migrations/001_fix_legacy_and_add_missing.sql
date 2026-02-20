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
-- Order matters: drop dependents first, then parents.
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

-- Remove from realtime publication before dropping
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS stressor_milestones;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS stressors;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS vision_board;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS categories;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS sub_tasks;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS daily_journal;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS projects;

-- Drop tables (dependents first)
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

-- Categories (must come before projects/vision_board which reference it)
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

-- Projects
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

-- Sub Tasks
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

-- Daily Journal
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

-- Vision Board
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

-- Stressors
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

-- Stressor Milestones
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
-- PART C: Create 15 missing tables (never existed in Supabase)
-- ============================================================

-- Tasks (central entity — was RxDB-only)
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

-- Emails
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

-- Calendar Events
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

-- Pomodoro Sessions
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

-- Habits
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

-- Habit Completions
CREATE TABLE habit_completions (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  date TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

-- User Profile (gamification)
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

-- Analytics Events
CREATE TABLE analytics_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::JSONB,
  timestamp TEXT NOT NULL
);

-- Signals (V2 intelligence)
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

-- Deals (real estate)
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

-- Portfolio Snapshots (trading)
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

-- Family Events
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

-- Morning Briefs
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

-- Productivity Patterns
CREATE TABLE productivity_patterns (
  id TEXT PRIMARY KEY,
  pattern_type TEXT NOT NULL,
  description TEXT NOT NULL,
  data JSONB DEFAULT '{}'::JSONB,
  confidence NUMERIC,
  week_start TEXT NOT NULL,
  created_at TEXT
);

-- Signal Weights (feedback loop)
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
-- PART D: Enable realtime for ALL 30 tables
-- ============================================================

-- Recreated legacy tables
ALTER PUBLICATION supabase_realtime ADD TABLE categories;
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
ALTER PUBLICATION supabase_realtime ADD TABLE sub_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE daily_journal;
ALTER PUBLICATION supabase_realtime ADD TABLE vision_board;
ALTER PUBLICATION supabase_realtime ADD TABLE stressors;
ALTER PUBLICATION supabase_realtime ADD TABLE stressor_milestones;

-- New tables (never had realtime)
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

-- Existing tables from schema.sql that already have realtime:
-- staff_members, staff_pay_periods, staff_expenses, staff_kpi_summaries
-- financial_accounts, financial_transactions, financial_subscriptions, financial_monthly_summaries
-- agent_status

COMMIT;
