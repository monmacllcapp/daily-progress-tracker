export type UUID = string;

// -- 1. Morning Stack --
export interface DailyJournal {
  id: UUID;
  date: string; // ISO 8601 date string (YYYY-MM-DD)
  gratitude: string[]; // Limit 3
  non_negotiables: string[]; // "3 things that if done = big win"
  stressors: string[]; // "Things that if knocked off, you'd feel relief"
  habits: Record<string, boolean>; // Checklist (hydration, meditation, movement, deep work)
  created_at?: string;
  updated_at?: string;
}

// -- 2. Task (Central Entity — Persistent Task List) --
export type TaskStatus = 'active' | 'completed' | 'dismissed' | 'deferred';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskSource = 'morning_flow' | 'brain_dump' | 'rpm_wizard' | 'email' | 'calendar' | 'manual';

export interface Task {
  id: UUID;
  title: string;
  description?: string;
  category_id?: UUID;             // FK to Category (life bucket)
  goal_id?: UUID;                 // FK to Project (RPM goal)
  time_estimate_minutes?: number;
  priority: TaskPriority;
  status: TaskStatus;
  source: TaskSource;
  created_date: string;           // ISO 8601 date
  due_date?: string;              // ISO 8601 date
  rolled_from_date?: string;      // Date this was rolled from (auto-rollover tracking)
  completed_date?: string;        // When completed/dismissed
  defer_reason?: string;          // Why deferred
  sort_order: number;
  tags?: string[];                // e.g. ['relief', 'quick-win']
  created_at?: string;
  updated_at?: string;
}

// -- 3. Projects ("The Big Rocks" — RPM Results) --
export type ProjectStatus = 'active' | 'completed';

export interface ProjectMotivation {
  why: string;
  impact_positive: string;
  impact_negative: string;
}

export interface ProjectMetrics {
  total_time_estimated: number; // minutes
  total_time_spent: number; // minutes
  optimism_ratio: number; // Estimate / Actual
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

// -- 4. SubTasks ("The Milestones" — RPM Massive Actions) --
export interface SubTask {
  id: UUID;
  project_id: UUID;
  title: string;
  time_estimate_minutes: number;
  time_actual_minutes: number; // Tracked via timer
  is_completed: boolean;
  sort_order: number;
  completed_date?: string;
  updated_at?: string;
}

// -- 5. Vision Board (The "Why" - RPM Framework) --
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

// -- 6. Categories (User-defined life buckets) --
export interface Category {
  id: UUID;
  user_id?: UUID;
  name: string;                   // "Health", "Wealth", "Relationships"
  color_theme: string;            // Hex color for radar chart
  icon?: string;                  // Lucide icon name (e.g. 'heart', 'dollar-sign')
  current_progress: number;       // 0.0 to 1.0 (growth score)
  streak_count: number;           // Consecutive days of activity
  last_active_date?: string;      // Last day a task was completed in this category
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

// -- 7. Calendar Events (Google Calendar + local time blocks) --
export type CalendarEventSource = 'google' | 'app';

export interface CalendarEvent {
  id: UUID;
  google_event_id?: string;       // Google Calendar event ID (for synced events)
  summary: string;
  description?: string;
  start_time: string;              // ISO 8601 datetime
  end_time: string;                // ISO 8601 datetime
  all_day: boolean;
  linked_task_id?: UUID;           // FK to Task (if this is a task time block)
  source: CalendarEventSource;
  color?: string;                  // Hex color or Google color ID
  is_focus_block?: boolean;        // Deep work designation
  created_at?: string;
  updated_at?: string;
}

// -- 8. Email (Gmail integration) --
export type EmailTier = 'urgent' | 'important' | 'promotions' | 'unsubscribe';
export type EmailStatus = 'unread' | 'read' | 'drafted' | 'replied' | 'archived' | 'snoozed';

export interface Email {
  id: UUID;
  gmail_id: string;                // Gmail message ID
  thread_id?: string;              // Gmail thread ID
  from: string;
  subject: string;
  snippet: string;                 // Preview text
  tier: EmailTier;                 // AI-classified tier
  tier_override?: EmailTier;       // User reclassification
  status: EmailStatus;
  ai_draft?: string;               // AI-drafted response
  received_at: string;             // ISO 8601 datetime
  labels?: string[];               // Gmail labels
  score?: number;                  // AI-computed priority score 0-100
  list_id?: string;                // List-ID header (newsletter identifier)
  unsubscribe_url?: string;        // Parsed <https://...> from List-Unsubscribe
  unsubscribe_mailto?: string;     // Parsed <mailto:...> from List-Unsubscribe
  unsubscribe_one_click?: boolean; // True if List-Unsubscribe-Post header present (RFC 8058)
  is_newsletter?: boolean;         // True if List-ID or unsubscribe headers present
  snooze_until?: string;           // ISO 8601 datetime — when to resurface
  snoozed_at?: string;             // ISO 8601 datetime — when snoozed
  created_at?: string;
  updated_at?: string;
}

// -- 9. Today's Stressors (Legacy — migrating into Task system) --
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

// -- 10. Pomodoro Timer --
export type PomodoroType = 'focus' | 'short_break' | 'long_break';
export type PomodoroStatus = 'completed' | 'abandoned';

export interface PomodoroSession {
  id: UUID;
  task_id?: UUID;
  category_id?: UUID;
  type: PomodoroType;
  duration_minutes: number;
  started_at: string;
  completed_at?: string;
  status: PomodoroStatus;
  created_at?: string;
  updated_at?: string;
}

// -- 11. Habits --
export type HabitFrequency = 'daily' | 'weekdays' | 'weekends';

export interface Habit {
  id: UUID;
  name: string;
  icon?: string;
  color?: string;
  category_id?: UUID;
  frequency: HabitFrequency;
  sort_order: number;
  is_archived: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface HabitCompletion {
  id: UUID;
  habit_id: UUID;
  date: string;
  completed_at: string;
}

// -- 12. User Profile (Gamification) --
export interface UserProfile {
  id: UUID;
  xp: number;
  level: number;
  gold: number;
  total_tasks_completed: number;
  total_habits_checked: number;
  total_pomodoros_completed: number;
  longest_streak: number;
  created_at?: string;
  updated_at?: string;
}

// -- 13. Analytics Events (Privacy-First Local Telemetry) --
export type EventType =
  | 'app_open'
  | 'morning_flow_complete'
  | 'task_complete'
  | 'email_triage'
  | 'pomodoro_complete'
  | 'habit_check'
  | 'calendar_schedule';

export interface AnalyticsEvent {
  id: UUID;
  event_type: EventType;
  metadata: Record<string, string | number | boolean>;
  timestamp: string; // ISO 8601 datetime
}

// -- V2 Re-exports --
export type { Signal, SignalType, SignalSeverity, LifeDomain, Deal, DealStrategy, DealStatus, PortfolioSnapshot, PortfolioPosition, FamilyEvent, FamilyMember, FamilyRelationship, MorningBrief, PortfolioPulse, ProductivityPattern, PatternType, AnticipationContext, AgingConfig } from './signals';
export type { McpServerConfig, McpTransport, McpConnectionStatus, McpServerState, McpToolCall, McpToolResult, McpSseEvent, McpProxyConfig, ClaudeMessage, ClaudeRequest, ClaudeResponse } from './mcp-types';

// Extend EventType for V2
export type V2EventType =
  | EventType
  | 'signal_generated'
  | 'signal_dismissed'
  | 'signal_acted_on'
  | 'deal_created'
  | 'deal_analyzed'
  | 'mcp_connected'
  | 'mcp_disconnected'
  | 'morning_brief_generated'
  | 'anticipation_cycle_complete';
