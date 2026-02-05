-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Projects ("The Big Rocks")
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL, -- Assumes RLS will use auth.uid()
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed')),
  motivation_payload JSONB DEFAULT '{}'::JSONB, -- { "why": "...", "impact_positive": "...", "impact_negative": "..." }
  metrics JSONB DEFAULT '{}'::JSONB, -- { "total_time_estimated": 0, "total_time_spent": 0, "optimism_ratio": 1.0 }
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. SubTasks ("The Milestones")
CREATE TABLE sub_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  time_estimate_minutes INTEGER DEFAULT 0,
  time_actual_minutes INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Daily Journal ("The Morning Stack")
CREATE TABLE daily_journal (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  date DATE NOT NULL, -- One entry per day per user
  gratitude TEXT[] DEFAULT '{}',
  stressors TEXT[] DEFAULT '{}',
  habits JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Row Level Security (RLS) Policies
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_journal ENABLE ROW LEVEL SECURITY;

-- Projects Policies
CREATE POLICY "Users can view their own projects" ON projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own projects" ON projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects" ON projects
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects" ON projects
  FOR DELETE USING (auth.uid() = user_id);

-- SubTasks Policies
CREATE POLICY "Users can view their own sub_tasks" ON sub_tasks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sub_tasks" ON sub_tasks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sub_tasks" ON sub_tasks
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sub_tasks" ON sub_tasks
  FOR DELETE USING (auth.uid() = user_id);

-- Daily Journal Policies
CREATE POLICY "Users can view their own journal" ON daily_journal
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own journal" ON daily_journal
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own journal" ON daily_journal
  FOR UPDATE USING (auth.uid() = user_id);

-- Realtime replication (Required for RxDB sync logic effectively, or at least helpful)
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table sub_tasks;
alter publication supabase_realtime add table daily_journal;

-- 4. Vision Board (RPM Framework - "The Why")
CREATE TABLE vision_board (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  declaration TEXT NOT NULL,
  rpm_purpose TEXT NOT NULL,
  pain_payload TEXT,
  pleasure_payload TEXT,
  visual_anchor TEXT,
  category_name TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Categories (Atomic Habits - "The Tire Slices")
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color_theme TEXT NOT NULL,
  current_inflation FLOAT DEFAULT 0.0 CHECK (current_inflation >= 0 AND current_inflation <= 1),
  last_1_percent_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Update Projects Table with RPM Links
ALTER TABLE projects ADD COLUMN linked_vision_id UUID REFERENCES vision_board(id);
ALTER TABLE projects ADD COLUMN category_id UUID REFERENCES categories(id);

-- Vision Board RLS
ALTER TABLE vision_board ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own vision board" ON vision_board
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own vision board" ON vision_board
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own vision board" ON vision_board
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own vision board" ON vision_board
  FOR DELETE USING (auth.uid() = user_id);

-- Categories RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own categories" ON categories
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own categories" ON categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own categories" ON categories
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own categories" ON categories
  FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime for new tables
alter publication supabase_realtime add table vision_board;
alter publication supabase_realtime add table categories;


-- 6. Stressors (Today's Urgent Tasks)
CREATE TABLE stressors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  time_estimate_minutes INTEGER NOT NULL DEFAULT 30,
  is_today BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE stressor_milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stressor_id UUID NOT NULL REFERENCES stressors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for stressors
ALTER TABLE stressors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own stressors" ON stressors FOR ALL USING (true);

ALTER TABLE stressor_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own stressor milestones" ON stressor_milestones FOR ALL USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE stressors;
ALTER PUBLICATION supabase_realtime ADD TABLE stressor_milestones;

-- ============================================================
-- Staffing Pipeline Tables (RxDB-synced, no RLS — admin app)
-- ============================================================

-- Staff Members
CREATE TABLE staff_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  pay_type TEXT NOT NULL,
  base_rate NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT,
  hubstaff_user_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TEXT,
  updated_at TEXT
);

-- Staff Pay Periods
CREATE TABLE staff_pay_periods (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  base_pay NUMERIC NOT NULL DEFAULT 0,
  total_pay NUMERIC NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  hours_worked NUMERIC,
  activity_pct NUMERIC,
  bonus NUMERIC,
  holiday_pay NUMERIC,
  num_leads INTEGER,
  num_passes INTEGER,
  cost_per_lead NUMERIC,
  lists_added INTEGER,
  num_recs_added INTEGER,
  dials INTEGER,
  convos INTEGER,
  quality_convos INTEGER,
  lead_to_acq NUMERIC,
  calls_processed INTEGER,
  underwrote INTEGER,
  apt_set INTEGER,
  apt_met INTEGER,
  offers_made INTEGER,
  offers_accepted INTEGER,
  offers_rejected INTEGER,
  deals_closed INTEGER,
  deals_fellthrough INTEGER,
  commission NUMERIC,
  hubstaff_synced_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- Staff Expenses
CREATE TABLE staff_expenses (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  vendor TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  channel TEXT,
  leads_generated INTEGER,
  cost_per_lead NUMERIC,
  month TEXT NOT NULL,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- Staff KPI Summaries
CREATE TABLE staff_kpi_summaries (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  total_staff_cost NUMERIC NOT NULL DEFAULT 0,
  total_platform_cost NUMERIC NOT NULL DEFAULT 0,
  total_marketing_spend NUMERIC NOT NULL DEFAULT 0,
  total_burn NUMERIC NOT NULL DEFAULT 0,
  total_leads INTEGER NOT NULL DEFAULT 0,
  avg_cost_per_lead NUMERIC NOT NULL DEFAULT 0,
  staff_breakdown TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- Enable realtime for staffing tables (RxDB replication)
ALTER PUBLICATION supabase_realtime ADD TABLE staff_members;
ALTER PUBLICATION supabase_realtime ADD TABLE staff_pay_periods;
ALTER PUBLICATION supabase_realtime ADD TABLE staff_expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE staff_kpi_summaries;
