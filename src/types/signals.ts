import type { UUID } from './schema';

// Signal severity levels
export type SignalSeverity = 'info' | 'attention' | 'urgent' | 'critical';

// Signal types from various intelligence services
export type SignalType =
  | 'aging_email'
  | 'deadline_approaching'
  | 'streak_at_risk'
  | 'calendar_conflict'
  | 'deal_update'
  | 'portfolio_alert'
  | 'pattern_insight'
  | 'family_awareness'
  | 'health_reminder'
  | 'weekly_review'
  | 'financial_update'
  | 'document_action'
  | 'follow_up_due'
  | 'context_switch_prep';

// Life domains the system tracks
export type LifeDomain =
  | 'business_re'
  | 'business_trading'
  | 'business_tech'
  | 'personal_growth'
  | 'health_fitness'
  | 'family'
  | 'finance'
  | 'social'
  | 'creative'
  | 'spiritual';

// Core Signal entity — stored in RxDB
export interface Signal {
  id: UUID;
  type: SignalType;
  severity: SignalSeverity;
  domain: LifeDomain;
  source: string;              // MCP server name or service name
  title: string;
  context: string;             // Detailed context/description
  suggested_action?: string;
  auto_actionable: boolean;    // Can be acted on without user confirmation
  is_dismissed: boolean;
  is_acted_on: boolean;
  related_entity_ids: string[];
  created_at: string;          // ISO 8601
  expires_at?: string;         // ISO 8601 — auto-dismiss after this time
  updated_at?: string;
}

// Real estate deal entity
export type DealStrategy = 'flip' | 'brrrr' | 'rental' | 'wholesale';
export type DealStatus = 'prospect' | 'analyzing' | 'offer' | 'under_contract' | 'closed' | 'dead';

export interface Deal {
  id: UUID;
  address: string;
  city: string;
  state: string;
  zip: string;
  strategy: DealStrategy;
  status: DealStatus;
  purchase_price?: number;
  arv?: number;                // After repair value
  rehab_cost?: number;
  noi?: number;                // Net operating income
  cap_rate?: number;
  dscr?: number;               // Debt service coverage ratio
  cash_on_cash?: number;
  zestimate?: number;
  last_analysis_at?: string;
  notes?: string;
  linked_email_ids: string[];
  linked_task_ids: string[];
  created_at: string;
  updated_at?: string;
}

// Portfolio snapshot from Alpaca
export interface PortfolioPosition {
  symbol: string;
  qty: number;
  avg_price: number;
  current_price: number;
  pnl: number;
}

export interface PortfolioSnapshot {
  id: UUID;
  date: string;                // YYYY-MM-DD
  equity: number;
  cash: number;
  buying_power: number;
  positions_count: number;
  day_pnl: number;
  total_pnl: number;
  positions: PortfolioPosition[];
  source: string;              // 'alpaca'
  created_at: string;
}

// Family event from shared calendars
export type FamilyRelationship = 'spouse' | 'child' | 'parent' | 'other';

export interface FamilyMember {
  name: string;
  relationship: FamilyRelationship;
  calendarId: string;          // Google Calendar ID
}

export interface FamilyEvent {
  id: UUID;
  member: string;              // Family member name
  summary: string;
  start_time: string;          // ISO 8601
  end_time: string;            // ISO 8601
  source_calendar: string;     // Google calendar ID
  conflict_with?: string;      // ID of conflicting personal event
  created_at: string;
  updated_at?: string;
}

// Morning brief — daily intelligence synthesis
export interface PortfolioPulse {
  equity: number;
  day_pnl: number;
  day_pnl_pct: number;
  positions_count: number;
  active_deals_count: number;
  total_deal_value: number;
}

export interface MorningBrief {
  id: UUID;
  date: string;                // YYYY-MM-DD
  urgent_signals: Signal[];
  attention_signals: Signal[];
  portfolio_pulse?: PortfolioPulse;
  calendar_summary: string[];
  family_summary: string[];
  ai_insight: string;
  generated_at: string;        // ISO 8601
}

// Productivity pattern from weekly analysis
export type PatternType = 'peak_hours' | 'category_trend' | 'completion_rate' | 'streak_health' | 'day_of_week' | 'deep_work_ratio';

export interface ProductivityPattern {
  id: UUID;
  pattern_type: PatternType;
  description: string;
  data: Record<string, unknown>;  // Varies by pattern type
  confidence: number;          // 0.0 to 1.0
  week_start: string;          // ISO date of the week this covers
  created_at: string;
}

// Anticipation Engine context — assembled before each cycle
export interface AnticipationContext {
  tasks: import('./schema').Task[];
  projects: import('./schema').Project[];
  categories: import('./schema').Category[];
  emails: import('./schema').Email[];
  calendarEvents: import('./schema').CalendarEvent[];
  deals: Deal[];
  signals: Signal[];
  mcpData: {
    alpaca?: { equity: number; positions: PortfolioPosition[]; dayPnl: number };
    zillow?: { comps: unknown[]; trends: unknown[] };
    familyCalendars?: FamilyEvent[];
    recentDocs?: unknown[];
    notionUpdates?: unknown[];
  };
  today: string;               // YYYY-MM-DD
  currentTime: string;         // HH:MM
  dayOfWeek: string;
  historicalPatterns: ProductivityPattern[];
}

// Aging detector configuration
export interface AgingConfig {
  email_attention_hours: number;   // default: 24
  email_urgent_hours: number;      // default: 48
  email_critical_hours: number;    // default: 72
  task_stale_days: number;         // default: 3
  lead_response_hours: number;     // default: 4
}
