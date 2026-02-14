import { createRxDatabase, addRxPlugin } from 'rxdb';
import type { RxDatabase, RxCollection } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { createClient } from '@supabase/supabase-js';
import type { DailyJournal, Task, Project, SubTask, VisionBoard, Category, Stressor, StressorMilestone, CalendarEvent, Email, PomodoroSession, Habit, HabitCompletion, UserProfile, AnalyticsEvent, StaffMember, StaffPayPeriod, StaffExpense, StaffKpiSummary, FinancialAccount, FinancialTransaction, FinancialSubscription, FinancialMonthlySummary } from '../types/schema';
import type { Signal, Deal, PortfolioSnapshot, FamilyEvent, MorningBrief, ProductivityPattern, SignalWeight } from '../types/signals';

// Add migration plugin
addRxPlugin(RxDBMigrationSchemaPlugin);

// -- RxDB Schema Definitions --

const taskSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        title: { type: 'string', maxLength: 500 },
        description: { type: 'string', maxLength: 5000 },
        category_id: { type: 'string' },
        goal_id: { type: 'string' },
        time_estimate_minutes: { type: 'integer' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        status: { type: 'string', enum: ['active', 'completed', 'dismissed', 'deferred'] },
        source: { type: 'string' },   // morning_flow | brain_dump | rpm_wizard | email | calendar | manual
        created_date: { type: 'string' },
        due_date: { type: 'string' },
        rolled_from_date: { type: 'string' },
        completed_date: { type: 'string' },
        defer_reason: { type: 'string' },
        sort_order: { type: 'integer' },
        tags: { type: 'array', items: { type: 'string' } },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'title', 'status', 'source', 'created_date', 'category_id'],
    indexes: ['status', 'created_date', 'category_id']
};

const projectSchema = {
    version: 2,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        title: { type: 'string', maxLength: 500 },
        status: { type: 'string' },
        motivation_payload: { type: 'object' },
        metrics: { type: 'object' },
        linked_vision_id: { type: 'string' },
        category_id: { type: 'string' },
        due_date: { type: 'string' },
        calendar_event_id: { type: 'string' },
        priority: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'title', 'status']
};

const subTaskSchema = {
    version: 1,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        project_id: { type: 'string' },
        title: { type: 'string' },
        time_estimate_minutes: { type: 'integer' },
        time_actual_minutes: { type: 'integer' },
        is_completed: { type: 'boolean' },
        sort_order: { type: 'integer' },
        completed_date: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'project_id', 'title']
};

const dailyJournalSchema = {
    version: 1,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        date: { type: 'string' },
        gratitude: { type: 'array', items: { type: 'string', maxLength: 10000 } },
        non_negotiables: { type: 'array', items: { type: 'string', maxLength: 10000 } },
        stressors: { type: 'array', items: { type: 'string', maxLength: 10000 } },
        habits: { type: 'object' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'date']
};

const visionBoardSchema = {
    version: 1,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        user_id: { type: 'string' },
        declaration: { type: 'string' },
        rpm_purpose: { type: 'string' },
        pain_payload: { type: 'string' },
        pleasure_payload: { type: 'string' },
        visual_anchor: { type: 'string' },
        category_name: { type: 'string' },
        category_id: { type: 'string' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'declaration', 'rpm_purpose']
};

const categoriesSchema = {
    version: 2,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        user_id: { type: 'string' },
        name: { type: 'string', maxLength: 200 },
        color_theme: { type: 'string' },
        icon: { type: 'string' },
        current_progress: { type: 'number' },
        streak_count: { type: 'integer' },
        last_active_date: { type: 'string' },
        sort_order: { type: 'integer' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'name', 'color_theme']
};

const stressorSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        user_id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        time_estimate_minutes: { type: 'number' },
        is_today: { type: 'boolean' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'title', 'time_estimate_minutes']
};

const stressorMilestoneSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        stressor_id: { type: 'string' },
        title: { type: 'string' },
        is_completed: { type: 'boolean' },
        sort_order: { type: 'number' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'stressor_id', 'title']
};

const calendarEventSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        google_event_id: { type: 'string' },
        summary: { type: 'string' },
        description: { type: 'string' },
        start_time: { type: 'string' },
        end_time: { type: 'string' },
        all_day: { type: 'boolean' },
        linked_task_id: { type: 'string' },
        source: { type: 'string' }, // google | app
        color: { type: 'string' },
        is_focus_block: { type: 'boolean' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'summary', 'start_time', 'end_time', 'source', 'linked_task_id', 'google_event_id'],
    indexes: ['start_time', 'linked_task_id', 'google_event_id']
};

const emailSchema = {
    version: 3,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        gmail_id: { type: 'string' },
        thread_id: { type: 'string' },
        from: { type: 'string', maxLength: 500 },
        subject: { type: 'string', maxLength: 500 },
        snippet: { type: 'string', maxLength: 1000 },
        tier: { type: 'string', enum: ['reply_urgent', 'reply_needed', 'to_review', 'important_not_urgent', 'unsure', 'unsubscribe', 'social'] },
        tier_override: { type: 'string', enum: ['reply_urgent', 'reply_needed', 'to_review', 'important_not_urgent', 'unsure', 'unsubscribe', 'social'] },
        status: { type: 'string', enum: ['unread', 'read', 'drafted', 'replied', 'waiting', 'reviewed', 'archived', 'snoozed'] },
        ai_draft: { type: 'string' },
        received_at: { type: 'string' },
        labels: { type: 'array', items: { type: 'string' } },
        score: { type: 'number' },
        list_id: { type: 'string' },
        unsubscribe_url: { type: 'string' },
        unsubscribe_mailto: { type: 'string' },
        unsubscribe_one_click: { type: 'boolean' },
        is_newsletter: { type: 'boolean' },
        snooze_until: { type: 'string' },
        snoozed_at: { type: 'string' },
        reply_checked_at: { type: 'string' },
        unsubscribe_status: { type: 'string' },
        unsubscribe_attempted_at: { type: 'string' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'gmail_id', 'from', 'subject', 'tier', 'status', 'received_at'],
    indexes: ['tier', 'status', 'received_at', 'gmail_id']
};

const pomodoroSessionSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        task_id: { type: 'string' },
        category_id: { type: 'string' },
        type: { type: 'string' },          // focus | short_break | long_break
        duration_minutes: { type: 'integer' },
        started_at: { type: 'string' },
        completed_at: { type: 'string' },
        status: { type: 'string' },        // completed | abandoned
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'type', 'duration_minutes', 'started_at', 'status'],
    indexes: ['started_at', 'status']
};

const habitSchema = {
    version: 1,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        name: { type: 'string' },
        icon: { type: 'string' },
        color: { type: 'string' },
        category_id: { type: 'string' },
        frequency: { type: 'string' },     // daily | weekdays | weekends
        sort_order: { type: 'integer' },
        is_archived: { type: 'boolean' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'name', 'frequency'],
};

const habitCompletionSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        habit_id: { type: 'string' },
        date: { type: 'string' },          // YYYY-MM-DD
        completed_at: { type: 'string' }
    },
    required: ['id', 'habit_id', 'date', 'completed_at'],
    indexes: ['habit_id', 'date']
};

const userProfileSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        xp: { type: 'integer' },
        level: { type: 'integer' },
        gold: { type: 'integer' },
        total_tasks_completed: { type: 'integer' },
        total_habits_checked: { type: 'integer' },
        total_pomodoros_completed: { type: 'integer' },
        longest_streak: { type: 'integer' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'xp', 'level', 'gold']
};

const analyticsEventSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        event_type: { type: 'string' },
        metadata: { type: 'object' },
        timestamp: { type: 'string' }
    },
    required: ['id', 'event_type', 'timestamp'],
    indexes: ['timestamp', 'event_type']
};

// -- V2 Schema Definitions --

const signalSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        type: { type: 'string' },
        severity: { type: 'string' },
        domain: { type: 'string' },
        source: { type: 'string' },
        title: { type: 'string' },
        context: { type: 'string' },
        suggested_action: { type: 'string' },
        auto_actionable: { type: 'boolean' },
        is_dismissed: { type: 'boolean' },
        is_acted_on: { type: 'boolean' },
        related_entity_ids: { type: 'array', items: { type: 'string' } },
        created_at: { type: 'string' },
        expires_at: { type: 'string' },
        updated_at: { type: 'string' },
    },
    required: ['id', 'type', 'severity', 'domain', 'title', 'created_at'],
    indexes: ['type', 'severity', 'domain', 'created_at'],
};

const dealSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        address: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string' },
        zip: { type: 'string' },
        strategy: { type: 'string' },
        status: { type: 'string' },
        purchase_price: { type: 'number' },
        arv: { type: 'number' },
        rehab_cost: { type: 'number' },
        noi: { type: 'number' },
        cap_rate: { type: 'number' },
        dscr: { type: 'number' },
        cash_on_cash: { type: 'number' },
        zestimate: { type: 'number' },
        last_analysis_at: { type: 'string' },
        notes: { type: 'string' },
        linked_email_ids: { type: 'array', items: { type: 'string' } },
        linked_task_ids: { type: 'array', items: { type: 'string' } },
        created_at: { type: 'string' },
        updated_at: { type: 'string' },
    },
    required: ['id', 'address', 'strategy', 'status'],
    indexes: ['status', 'strategy'],
};

const portfolioSnapshotSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        date: { type: 'string' },
        equity: { type: 'number' },
        cash: { type: 'number' },
        buying_power: { type: 'number' },
        positions_count: { type: 'integer' },
        day_pnl: { type: 'number' },
        total_pnl: { type: 'number' },
        positions: { type: 'array', items: { type: 'object' } },
        source: { type: 'string' },
        created_at: { type: 'string' },
    },
    required: ['id', 'date', 'equity', 'source'],
    indexes: ['date'],
};

const familyEventSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        member: { type: 'string' },
        summary: { type: 'string' },
        start_time: { type: 'string' },
        end_time: { type: 'string' },
        source_calendar: { type: 'string' },
        conflict_with: { type: 'string' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' },
    },
    required: ['id', 'member', 'summary', 'start_time', 'end_time'],
    indexes: ['start_time', 'member'],
};

const morningBriefSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        date: { type: 'string' },
        urgent_signals: { type: 'array', items: { type: 'object' } },
        attention_signals: { type: 'array', items: { type: 'object' } },
        portfolio_pulse: { type: 'object' },
        calendar_summary: { type: 'array', items: { type: 'string' } },
        family_summary: { type: 'array', items: { type: 'string' } },
        ai_insight: { type: 'string' },
        generated_at: { type: 'string' },
    },
    required: ['id', 'date', 'generated_at'],
    indexes: ['date'],
};

const productivityPatternSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        pattern_type: { type: 'string' },
        description: { type: 'string' },
        data: { type: 'object' },
        confidence: { type: 'number' },
        week_start: { type: 'string' },
        created_at: { type: 'string' },
    },
    required: ['id', 'pattern_type', 'description', 'week_start'],
    indexes: ['week_start'],
};

const signalWeightSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        signal_type: { type: 'string' },
        domain: { type: 'string' },
        total_generated: { type: 'integer' },
        total_dismissed: { type: 'integer' },
        total_acted_on: { type: 'integer' },
        effectiveness_score: { type: 'number' },
        weight_modifier: { type: 'number' },
        last_updated: { type: 'string' },
        created_at: { type: 'string' },
    },
    required: ['id', 'signal_type', 'domain'],
    indexes: [['signal_type', 'domain']],
};

const staffMemberSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        name: { type: 'string' },
        role: { type: 'string' },
        pay_type: { type: 'string' },
        base_rate: { type: 'number' },
        payment_method: { type: 'string' },
        hubstaff_user_id: { type: 'string' },
        is_active: { type: 'boolean' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'name', 'role', 'pay_type', 'base_rate', 'is_active']
};

const staffPayPeriodSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        staff_id: { type: 'string' },
        period_start: { type: 'string' },
        period_end: { type: 'string' },
        base_pay: { type: 'number' },
        total_pay: { type: 'number' },
        is_paid: { type: 'boolean' },
        notes: { type: 'string' },
        hours_worked: { type: 'number' },
        activity_pct: { type: 'number' },
        bonus: { type: 'number' },
        holiday_pay: { type: 'number' },
        num_leads: { type: 'integer' },
        num_passes: { type: 'integer' },
        cost_per_lead: { type: 'number' },
        lists_added: { type: 'integer' },
        num_recs_added: { type: 'integer' },
        dials: { type: 'integer' },
        convos: { type: 'integer' },
        quality_convos: { type: 'integer' },
        lead_to_acq: { type: 'number' },
        calls_processed: { type: 'integer' },
        underwrote: { type: 'integer' },
        apt_set: { type: 'integer' },
        apt_met: { type: 'integer' },
        offers_made: { type: 'integer' },
        offers_accepted: { type: 'integer' },
        offers_rejected: { type: 'integer' },
        deals_closed: { type: 'integer' },
        deals_fellthrough: { type: 'integer' },
        commission: { type: 'number' },
        hubstaff_synced_at: { type: 'string' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'staff_id', 'period_start', 'period_end', 'base_pay', 'total_pay', 'is_paid'],
    indexes: [['staff_id', 'period_start']]
};

const staffExpenseSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        date: { type: 'string' },
        category: { type: 'string' },
        vendor: { type: 'string' },
        amount: { type: 'number' },
        channel: { type: 'string' },
        leads_generated: { type: 'integer' },
        cost_per_lead: { type: 'number' },
        month: { type: 'string' },
        notes: { type: 'string' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'date', 'category', 'vendor', 'amount', 'month'],
    indexes: [['category', 'month']]
};

const staffKpiSummarySchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        month: { type: 'string' },
        total_staff_cost: { type: 'number' },
        total_platform_cost: { type: 'number' },
        total_marketing_spend: { type: 'number' },
        total_burn: { type: 'number' },
        total_leads: { type: 'integer' },
        avg_cost_per_lead: { type: 'number' },
        staff_breakdown: { type: 'string' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'month']
};

const financialAccountSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        plaid_account_id: { type: 'string' },
        plaid_item_id: { type: 'string' },
        institution_name: { type: 'string' },
        account_name: { type: 'string' },
        account_type: { type: 'string' },
        account_scope: { type: 'string' },
        mask: { type: 'string' },
        current_balance: { type: 'number' },
        available_balance: { type: 'number' },
        currency: { type: 'string' },
        is_active: { type: 'boolean' },
        last_synced_at: { type: 'string' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'institution_name', 'account_name', 'account_type', 'account_scope', 'current_balance', 'currency', 'is_active'],
    indexes: ['account_scope']
};

const financialTransactionSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        account_id: { type: 'string' },
        plaid_transaction_id: { type: 'string' },
        date: { type: 'string' },
        amount: { type: 'number' },
        name: { type: 'string' },
        merchant_name: { type: 'string' },
        category: { type: 'string' },
        plaid_category: { type: 'string' },
        scope: { type: 'string' },
        is_recurring: { type: 'boolean' },
        is_subscription: { type: 'boolean' },
        pending: { type: 'boolean' },
        month: { type: 'string' },
        notes: { type: 'string' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'account_id', 'date', 'amount', 'name', 'category', 'scope', 'is_recurring', 'is_subscription', 'pending', 'month'],
    indexes: ['date', 'account_id', 'category', 'month', 'scope']
};

const financialSubscriptionSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        account_id: { type: 'string' },
        merchant_name: { type: 'string' },
        amount: { type: 'number' },
        frequency: { type: 'string' },
        category: { type: 'string' },
        scope: { type: 'string' },
        is_active: { type: 'boolean' },
        last_charge_date: { type: 'string' },
        last_used_date: { type: 'string' },
        next_expected_date: { type: 'string' },
        flagged_unused: { type: 'boolean' },
        notes: { type: 'string' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'merchant_name', 'amount', 'frequency', 'category', 'scope', 'is_active', 'flagged_unused'],
    indexes: ['scope', 'is_active']
};

const financialMonthlySummarySchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        month: { type: 'string' },
        total_income: { type: 'number' },
        total_expenses: { type: 'number' },
        net_cash_flow: { type: 'number' },
        business_income: { type: 'number' },
        business_expenses: { type: 'number' },
        personal_income: { type: 'number' },
        personal_expenses: { type: 'number' },
        subscription_burn: { type: 'number' },
        top_categories: { type: 'string' },
        ai_insights: { type: 'string' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'month']
};

// -- Database Type Definition --

export type TitanDatabaseCollections = {
    tasks: RxCollection<Task>;
    projects: RxCollection<Project>;
    sub_tasks: RxCollection<SubTask>;
    daily_journal: RxCollection<DailyJournal>;
    vision_board: RxCollection<VisionBoard>;
    categories: RxCollection<Category>;
    stressors: RxCollection<Stressor>;
    stressor_milestones: RxCollection<StressorMilestone>;
    calendar_events: RxCollection<CalendarEvent>;
    emails: RxCollection<Email>;
    pomodoro_sessions: RxCollection<PomodoroSession>;
    habits: RxCollection<Habit>;
    habit_completions: RxCollection<HabitCompletion>;
    user_profile: RxCollection<UserProfile>;
    analytics_events: RxCollection<AnalyticsEvent>;
    // V2 Collections
    signals: RxCollection<Signal>;
    deals: RxCollection<Deal>;
    portfolio_snapshots: RxCollection<PortfolioSnapshot>;
    family_events: RxCollection<FamilyEvent>;
    morning_briefs: RxCollection<MorningBrief>;
    productivity_patterns: RxCollection<ProductivityPattern>;
    signal_weights: RxCollection<SignalWeight>;
    // Staffing + Financial Collections
    staff_members: RxCollection<StaffMember>;
    staff_pay_periods: RxCollection<StaffPayPeriod>;
    staff_expenses: RxCollection<StaffExpense>;
    staff_kpi_summaries: RxCollection<StaffKpiSummary>;
    financial_accounts: RxCollection<FinancialAccount>;
    financial_transactions: RxCollection<FinancialTransaction>;
    financial_subscriptions: RxCollection<FinancialSubscription>;
    financial_monthly_summaries: RxCollection<FinancialMonthlySummary>;
};

export type TitanDatabase = RxDatabase<TitanDatabaseCollections>;

// -- Replication Logic --

async function startReplication(db: TitanDatabase, url: string, key: string) {
    const supabase = createClient(url, key);
    const tables = ['tasks', 'projects', 'sub_tasks', 'daily_journal', 'vision_board', 'categories', 'stressors', 'stressor_milestones', 'calendar_events', 'emails', 'pomodoro_sessions', 'habits', 'habit_completions', 'user_profile', 'analytics_events', 'signals', 'deals', 'portfolio_snapshots', 'family_events', 'morning_briefs', 'productivity_patterns', 'signal_weights', 'staff_members', 'staff_pay_periods', 'staff_expenses', 'staff_kpi_summaries', 'financial_accounts', 'financial_transactions', 'financial_subscriptions', 'financial_monthly_summaries'];

    for (const table of tables) {
        // @ts-expect-error - dynamic access
        const collection = db[table];
        if (!collection) continue;

        try {
            const { replicateRxCollection } = await import('rxdb/plugins/replication');
            await replicateRxCollection({
                collection,
                replicationIdentifier: `sync-${table}`,
                pull: {
                    async handler(checkpointOrNull: unknown, batchSize: number) {
                        const checkpoint = (checkpointOrNull ? checkpointOrNull : { updated_at: new Date(0).toISOString() }) as { updated_at: string };

                        const { data, error } = await supabase
                            .from(table)
                            .select('*')
                            .gt('updated_at', checkpoint.updated_at)
                            .limit(batchSize)
                            .order('updated_at', { ascending: true });

                        if (error) {
                            console.error(`Pull error for ${table}:`, error);
                            throw error;
                        }

                        return {
                            documents: data || [],
                            checkpoint: data && data.length > 0
                                ? { updated_at: data[data.length - 1].updated_at }
                                : checkpoint
                        };
                    }
                },
                push: {
                    async handler(docs: Array<{ newDocumentState: Record<string, unknown> }>) {
                        const rows = docs.map(d => d.newDocumentState);
                        const { error } = await supabase
                            .from(table)
                            .upsert(rows);

                        if (error) {
                            console.error(`Push error for ${table}:`, error);
                            throw error;
                        }
                        return [];
                    }
                }
            });
        } catch (err) {
            console.warn(`Replication setup for ${table} skipped:`, err);
        }
    }
}

// -- Initialization --

let dbPromise: Promise<TitanDatabase> | null = null;

async function initDatabase(): Promise<TitanDatabase> {
    // ?resetdb in URL → wipe IndexedDB then hard reload
    if (typeof window !== 'undefined' && window.location.search.includes('resetdb')) {
        console.warn('[DB] resetdb flag detected — deleting IndexedDB...');
        const dbs = await window.indexedDB.databases();
        for (const dbInfo of dbs) {
            if (dbInfo.name) {
                await new Promise<void>((resolve) => {
                    const req = window.indexedDB.deleteDatabase(dbInfo.name!);
                    req.onsuccess = () => resolve();
                    req.onerror = () => resolve();
                    req.onblocked = () => resolve();
                });
            }
        }
        // Hard reload without ?resetdb to start completely fresh
        window.location.replace(window.location.pathname);
        // Return a never-resolving promise — page is reloading
        return new Promise(() => {});
    }

    const db = await createRxDatabase<TitanDatabaseCollections>({
        name: 'titanplannerdb',
        storage: getRxStorageDexie(),
    });

    try {
        await db.addCollections({
            tasks: { schema: taskSchema },
            projects: {
                schema: projectSchema,
                migrationStrategies: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RxDB migration doc
                    1: function (oldDoc: any) {
                        oldDoc.linked_vision_id = oldDoc.linked_vision_id || undefined;
                        oldDoc.category_id = oldDoc.category_id || undefined;
                        return oldDoc;
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RxDB migration doc
                    2: function (oldDoc: any) {
                        oldDoc.due_date = oldDoc.due_date || undefined;
                        oldDoc.calendar_event_id = oldDoc.calendar_event_id || undefined;
                        oldDoc.priority = oldDoc.priority || 'medium';
                        return oldDoc;
                    }
                }
            },
            sub_tasks: {
                schema: subTaskSchema,
                migrationStrategies: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RxDB migration doc
                    1: function (oldDoc: any) {
                        oldDoc.completed_date = oldDoc.completed_date || undefined;
                        return oldDoc;
                    }
                }
            },
            daily_journal: {
                schema: dailyJournalSchema,
                migrationStrategies: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RxDB migration doc
                    1: function (oldDoc: any) {
                        oldDoc.non_negotiables = oldDoc.non_negotiables || [];
                        oldDoc.created_at = oldDoc.created_at || undefined;
                        return oldDoc;
                    }
                }
            },
            vision_board: {
                schema: visionBoardSchema,
                migrationStrategies: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RxDB migration doc
                    1: function (oldDoc: any) { return oldDoc; }
                }
            },
            categories: {
                schema: categoriesSchema,
                migrationStrategies: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RxDB migration doc
                    1: function (oldDoc: any) {
                        oldDoc.current_progress = oldDoc.current_inflation ?? oldDoc.current_progress ?? 0;
                        oldDoc.streak_count = oldDoc.streak_count ?? 0;
                        oldDoc.last_active_date = oldDoc.last_active_date || oldDoc.last_1_percent_date || undefined;
                        oldDoc.sort_order = oldDoc.sort_order ?? 0;
                        // Remove old fields
                        delete oldDoc.current_inflation;
                        delete oldDoc.last_1_percent_date;
                        return oldDoc;
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RxDB migration doc
                    2: function (oldDoc: any) {
                        oldDoc.icon = oldDoc.icon || undefined;
                        return oldDoc;
                    }
                }
            },
            stressors: { schema: stressorSchema },
            stressor_milestones: { schema: stressorMilestoneSchema },
            calendar_events: { schema: calendarEventSchema },
            emails: {
                schema: emailSchema,
                migrationStrategies: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RxDB migration doc
                    1: function (oldDoc: any) {
                        oldDoc.score = undefined;
                        oldDoc.list_id = undefined;
                        oldDoc.unsubscribe_url = undefined;
                        oldDoc.unsubscribe_mailto = undefined;
                        oldDoc.is_newsletter = false;
                        oldDoc.snooze_until = undefined;
                        oldDoc.snoozed_at = undefined;
                        return oldDoc;
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RxDB migration doc
                    2: function (oldDoc: any) {
                        oldDoc.unsubscribe_one_click = false;
                        return oldDoc;
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RxDB migration doc
                    3: function (oldDoc: any) {
                        // Map old 4-tier system to new 7-tier pipeline
                        const tierMap: Record<string, string> = {
                            urgent: 'reply_urgent',
                            important: 'to_review',
                            promotions: 'social',
                            unsubscribe: 'unsubscribe',
                        };
                        oldDoc.tier = tierMap[oldDoc.tier] || oldDoc.tier;
                        if (oldDoc.tier_override) {
                            oldDoc.tier_override = tierMap[oldDoc.tier_override] || oldDoc.tier_override;
                        }
                        oldDoc.reply_checked_at = undefined;
                        oldDoc.unsubscribe_status = undefined;
                        oldDoc.unsubscribe_attempted_at = undefined;
                        return oldDoc;
                    }
                }
            },
            pomodoro_sessions: { schema: pomodoroSessionSchema },
            habits: {
                schema: habitSchema,
                migrationStrategies: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RxDB migration doc
                    1: function (oldDoc: any) { return oldDoc; }
                }
            },
            habit_completions: { schema: habitCompletionSchema },
            user_profile: { schema: userProfileSchema },
            analytics_events: { schema: analyticsEventSchema },
            // V2 Collections
            signals: { schema: signalSchema },
            deals: { schema: dealSchema },
            portfolio_snapshots: { schema: portfolioSnapshotSchema },
            family_events: { schema: familyEventSchema },
            morning_briefs: { schema: morningBriefSchema },
            productivity_patterns: { schema: productivityPatternSchema },
            signal_weights: { schema: signalWeightSchema },
            // Staffing + Financial Collections
            staff_members: { schema: staffMemberSchema },
            staff_pay_periods: { schema: staffPayPeriodSchema },
            staff_expenses: { schema: staffExpenseSchema },
            staff_kpi_summaries: { schema: staffKpiSummarySchema },
            financial_accounts: { schema: financialAccountSchema },
            financial_transactions: { schema: financialTransactionSchema },
            financial_subscriptions: { schema: financialSubscriptionSchema },
            financial_monthly_summaries: { schema: financialMonthlySummarySchema },
        });

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (supabaseUrl && supabaseKey) {
            console.log('Starting Supabase replication...');
            await startReplication(db, supabaseUrl, supabaseKey);
        } else {
            console.warn('Supabase credentials not found, running in offline-local-only mode.');
        }

        return db;
    } catch (err) {
        const code = (err as { code?: string })?.code;
        // COL23 = collection already exists (Vite HMR re-init) — db is usable as-is
        if (code === 'COL23') {
            return db;
        }
        // DB6 = schema mismatch, DXE1 = Dexie index error — nuke and retry
        if (code === 'DB6' || code === 'DXE1') {
            console.warn(`[DB] Schema conflict (${code}), clearing database and retrying...`);
            await db.remove();
            dbPromise = null;
            return initDatabase();
        }
        throw err;
    }
}

export const createDatabase = async (): Promise<TitanDatabase> => {
    if (dbPromise) return dbPromise;
    dbPromise = initDatabase();
    return dbPromise;
};
