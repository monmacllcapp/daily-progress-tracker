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
