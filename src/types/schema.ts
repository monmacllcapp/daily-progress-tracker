export type UUID = string;

// -- 1. Morning Stack --
export interface DailyJournal {
  id: UUID;
  date: string; // ISO 8601 string
  gratitude: string[]; // Limit 3
  stressors: string[]; // "Quick Wins"
  habits: Record<string, boolean>; // JSONB in DB ("Non-Negotiables" checklist)
}

// -- 2. Projects ("The Big Rocks") --
export type ProjectStatus = 'active' | 'completed';

export interface ProjectMotivation {
  why: string;
  impact_positive: string;
  impact_negative: string;
}

export interface ProjectMetrics {
  total_time_estimated: number; // minutes
  total_time_spent: number; // minutes
  optimism_ratio: number; // float (spent / estimated? or estimated / spent? Logic in engine)
}

export interface Project {
  id: UUID;
  title: string;
  status: ProjectStatus;
  motivation_payload: ProjectMotivation;
  metrics: ProjectMetrics;
  created_at?: string;
  updated_at?: string;
}

// -- 3. SubTasks ("The Milestones") --
export interface SubTask {
  id: UUID;
  project_id: UUID;
  title: string;
  time_estimate_minutes: number;
  time_actual_minutes: number; // Tracked via timer
  is_completed: boolean;
  sort_order: number;
}
