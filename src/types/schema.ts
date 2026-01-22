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
  linked_vision_id?: UUID;        // FK to VisionBoard
  category_id?: UUID;             // FK to Category
  due_date?: string;              // ISO 8601 datetime
  calendar_event_id?: string;     // Google Calendar event ID
  priority?: 'low' | 'medium' | 'high';
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
  updated_at?: string;
}

// -- 4. Vision Board (The "Why" - RPM Framework) --
export interface VisionBoard {
  id: UUID;
  user_id?: UUID;
  declaration: string;           // "I am a Top 1% Architect"
  rpm_purpose: string;            // The core "Why"
  pain_payload: string;           // Consequence of failure
  pleasure_payload: string;       // Reward of success
  visual_anchor?: string;         // Image URL
  category_name?: string;         // Life category (Health, Wealth, etc.)
  category_id?: UUID;             // Link to Category
  created_at?: string;
  updated_at?: string;
}

// -- 5. Categories (The "Tire Slices" - Atomic Habits) --
export interface Category {
  id: UUID;
  user_id?: UUID;
  name: string;                   // "Health", "Wealth", "Relationships"
  color_theme: string;            // Hex color for radar chart
  current_inflation: number;      // 0.0 to 1.0 (growth score)
  last_1_percent_date?: string;   // Track daily streaks
  created_at?: string;
  updated_at?: string;
}

// -- 6. Today's Stressors (Urgent Tasks) --
export interface Stressor {
  id: UUID;
  user_id?: UUID;
  title: string;
  description?: string;
  time_estimate_minutes: number;
  created_at?: string;
  updated_at?: string;
  is_today: boolean;
}

export interface StressorMilestone {
  id: UUID;
  stressor_id: UUID;
  title: string;
  is_completed: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}
