import { describe, it, expect } from 'vitest';
import type {
  Task,
  Category,
  Email,
  CalendarEvent,
  TaskStatus,
  TaskPriority,
  TaskSource,
  EmailTier,
  EmailStatus,
  CalendarEventSource,
} from '../../types/schema';
import type { Signal, SignalType, SignalSeverity, LifeDomain } from '../../types/signals';
import { useSignalStore } from '../../store/signalStore';
import { useMcpStore } from '../../store/mcpStore';
import { WIDGET_REGISTRY } from '../../config/widgetRegistry';

/**
 * V2 Regression Tests
 *
 * Verifies that V2 additions don't break V1 functionality.
 * Tests schema compatibility, type integrity, and store initialization.
 */

describe('V2 Regression Tests', () => {
  it('should maintain V1 task schema compatibility', () => {
    const task: Task = {
      id: 'task-123',
      title: 'Complete project deliverable',
      description: 'Finish the final draft',
      category_id: 'cat-1',
      goal_id: 'goal-1',
      time_estimate_minutes: 120,
      priority: 'high',
      status: 'active',
      source: 'manual',
      created_date: '2026-02-13',
      due_date: '2026-02-15',
      rolled_from_date: '2026-02-12',
      completed_date: undefined,
      defer_reason: undefined,
      sort_order: 1,
      tags: ['relief', 'quick-win'],
      created_at: '2026-02-13T10:00:00Z',
      updated_at: '2026-02-13T10:00:00Z',
    };

    // Verify all V1 task fields are valid
    expect(task.id).toBe('task-123');
    expect(task.title).toBe('Complete project deliverable');
    expect(task.priority).toBe('high');
    expect(task.status).toBe('active');
    expect(task.source).toBe('manual');

    // Verify enums work
    const validStatuses: TaskStatus[] = ['active', 'completed', 'dismissed', 'deferred'];
    const validPriorities: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
    const validSources: TaskSource[] = [
      'morning_flow',
      'brain_dump',
      'rpm_wizard',
      'email',
      'calendar',
      'manual',
    ];

    expect(validStatuses).toContain(task.status);
    expect(validPriorities).toContain(task.priority);
    expect(validSources).toContain(task.source);
  });

  it('should maintain V1 category schema compatibility', () => {
    const category: Category = {
      id: 'cat-123',
      user_id: 'user-1',
      name: 'Health & Fitness',
      color_theme: '#FF5733',
      icon: 'heart',
      current_progress: 0.75,
      streak_count: 14,
      last_active_date: '2026-02-13',
      sort_order: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-02-13T10:00:00Z',
    };

    // Verify all V1 category fields
    expect(category.id).toBe('cat-123');
    expect(category.name).toBe('Health & Fitness');
    expect(category.color_theme).toBe('#FF5733');
    expect(category.icon).toBe('heart');
    expect(category.current_progress).toBe(0.75);
    expect(category.streak_count).toBe(14);
    expect(category.last_active_date).toBe('2026-02-13');
    expect(category.sort_order).toBe(1);
  });

  it('should maintain V1 email schema compatibility', () => {
    const email: Email = {
      id: 'email-123',
      gmail_id: 'gmail-msg-456',
      thread_id: 'thread-789',
      from: 'sender@example.com',
      subject: 'Important project update',
      snippet: 'Please review the attached document...',
      tier: 'to_review',
      tier_override: 'reply_urgent',
      status: 'unread',
      ai_draft: 'Thank you for the update. I will review...',
      received_at: '2026-02-13T08:00:00Z',
      labels: ['INBOX', 'IMPORTANT'],
      score: 85,
      list_id: 'newsletter.example.com',
      unsubscribe_url: 'https://example.com/unsubscribe',
      unsubscribe_mailto: 'unsubscribe@example.com',
      unsubscribe_one_click: true,
      is_newsletter: true,
      snooze_until: '2026-02-14T09:00:00Z',
      snoozed_at: '2026-02-13T08:30:00Z',
      created_at: '2026-02-13T08:00:00Z',
      updated_at: '2026-02-13T08:30:00Z',
    };

    // Verify all V1 email fields
    expect(email.id).toBe('email-123');
    expect(email.gmail_id).toBe('gmail-msg-456');
    expect(email.from).toBe('sender@example.com');
    expect(email.subject).toBe('Important project update');
    expect(email.tier).toBe('to_review');
    expect(email.status).toBe('unread');

    // Verify enums work
    const validTiers: EmailTier[] = ['reply_urgent', 'to_review', 'social', 'unsubscribe'];
    const validStatuses: EmailStatus[] = [
      'unread',
      'read',
      'drafted',
      'replied',
      'archived',
      'snoozed',
    ];

    expect(validTiers).toContain(email.tier);
    expect(validStatuses).toContain(email.status);
  });

  it('should maintain V1 calendar event schema compatibility', () => {
    const event: CalendarEvent = {
      id: 'event-123',
      google_event_id: 'google-event-456',
      summary: 'Team standup',
      description: 'Daily team sync meeting',
      start_time: '2026-02-13T09:00:00Z',
      end_time: '2026-02-13T09:30:00Z',
      all_day: false,
      linked_task_id: 'task-789',
      source: 'google',
      color: '#4285F4',
      is_focus_block: false,
      created_at: '2026-02-01T00:00:00Z',
      updated_at: '2026-02-13T08:00:00Z',
    };

    // Verify all V1 calendar event fields
    expect(event.id).toBe('event-123');
    expect(event.google_event_id).toBe('google-event-456');
    expect(event.summary).toBe('Team standup');
    expect(event.start_time).toBe('2026-02-13T09:00:00Z');
    expect(event.end_time).toBe('2026-02-13T09:30:00Z');
    expect(event.all_day).toBe(false);
    expect(event.source).toBe('google');

    // Verify enum works
    const validSources: CalendarEventSource[] = ['google', 'app'];
    expect(validSources).toContain(event.source);
  });

  it('should support all 14 V2 signal types', () => {
    const signalTypes: SignalType[] = [
      'aging_email',
      'deadline_approaching',
      'streak_at_risk',
      'calendar_conflict',
      'deal_update',
      'portfolio_alert',
      'pattern_insight',
      'family_awareness',
      'health_reminder',
      'weekly_review',
      'financial_update',
      'document_action',
      'follow_up_due',
      'context_switch_prep',
    ];

    // Verify all signal types are valid
    expect(signalTypes).toHaveLength(14);

    // Create a signal with each type
    signalTypes.forEach((type) => {
      const signal: Signal = {
        id: `signal-${type}`,
        type,
        severity: 'info',
        domain: 'business_re',
        source: 'test',
        title: `Test ${type}`,
        context: 'Test context',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: new Date().toISOString(),
      };

      expect(signal.type).toBe(type);
    });
  });

  it('should support all 10 V2 life domains', () => {
    const domains: LifeDomain[] = [
      'business_re',
      'business_trading',
      'business_tech',
      'personal_growth',
      'health_fitness',
      'family',
      'finance',
      'social',
      'creative',
      'spiritual',
    ];

    // Verify all domains are valid
    expect(domains).toHaveLength(10);

    // Create a signal with each domain
    domains.forEach((domain) => {
      const signal: Signal = {
        id: `signal-${domain}`,
        type: 'pattern_insight',
        severity: 'info',
        domain,
        source: 'test',
        title: `Test ${domain}`,
        context: 'Test context',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: new Date().toISOString(),
      };

      expect(signal.domain).toBe(domain);
    });
  });

  it('should initialize signal store with empty signals', () => {
    useSignalStore.getState();

    // Fresh store should be empty
    useSignalStore.setState({ signals: [] });
    const freshStore = useSignalStore.getState();

    expect(freshStore.signals).toEqual([]);
    expect(freshStore.activeSignals()).toEqual([]);
    expect(freshStore.urgentSignals()).toEqual([]);
    expect(freshStore.signalCount()).toEqual({
      total: 0,
      urgent: 0,
      attention: 0,
      info: 0,
    });
  });

  it('should initialize MCP store with empty servers', () => {
    useMcpStore.getState();

    // Fresh store should be empty
    useMcpStore.setState({ servers: {}, isProxyRunning: false });
    const freshStore = useMcpStore.getState();

    expect(freshStore.servers).toEqual({});
    expect(freshStore.isProxyRunning).toBe(false);
    expect(freshStore.getConnectedServers()).toEqual([]);
  });

  it('should maintain all 11 V1 widgets in registry', () => {
    const v1WidgetIds = [
      'task-dashboard',
      'wheel-of-life',
      'vision-board',
      'projects-list',
      'journal-history',
      'daily-agenda',
      'email-dashboard',
      'category-manager',
      'pomodoro',
      'habit-tracker',
      'one-percent-tracker',
    ];

    const registeredIds = WIDGET_REGISTRY.map((w) => w.id);

    // All V1 widgets should still be registered
    v1WidgetIds.forEach((id) => {
      expect(registeredIds).toContain(id);
    });

    // Verify V1 widgets have correct structure
    const taskWidget = WIDGET_REGISTRY.find((w) => w.id === 'task-dashboard');
    expect(taskWidget).toBeDefined();
    expect(taskWidget?.title).toBe('Tasks');
    expect(taskWidget?.type).toBe('interactive');
  });

  it('should include V2 widgets in registry', () => {
    const v2WidgetIds = ['morning-brief', 'signal-feed'];

    const registeredIds = WIDGET_REGISTRY.map((w) => w.id);

    // V2 widgets should be registered
    v2WidgetIds.forEach((id) => {
      expect(registeredIds).toContain(id);
    });

    // Verify V2 widgets have correct structure
    const morningBriefWidget = WIDGET_REGISTRY.find((w) => w.id === 'morning-brief');
    expect(morningBriefWidget).toBeDefined();
    expect(morningBriefWidget?.title).toBe('Morning Brief');
    expect(morningBriefWidget?.type).toBe('interactive');

    const signalFeedWidget = WIDGET_REGISTRY.find((w) => w.id === 'signal-feed');
    expect(signalFeedWidget).toBeDefined();
    expect(signalFeedWidget?.title).toBe('Signal Feed');
    expect(signalFeedWidget?.type).toBe('interactive');
  });

  it('should support all V2 signal severity levels', () => {
    const severities: SignalSeverity[] = ['info', 'attention', 'urgent', 'critical'];

    severities.forEach((severity) => {
      const signal: Signal = {
        id: `signal-${severity}`,
        type: 'aging_email',
        severity,
        domain: 'business_re',
        source: 'test',
        title: `Test ${severity}`,
        context: 'Test context',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: new Date().toISOString(),
      };

      expect(signal.severity).toBe(severity);
    });
  });

  it('should maintain V1 task priority enum values', () => {
    const priorities: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

    priorities.forEach((priority) => {
      const task: Task = {
        id: `task-${priority}`,
        title: `Task with ${priority} priority`,
        priority,
        status: 'active',
        source: 'manual',
        created_date: '2026-02-13',
        sort_order: 1,
      };

      expect(task.priority).toBe(priority);
    });
  });

  it('should maintain V1 email tier enum values', () => {
    const tiers: EmailTier[] = ['reply_urgent', 'to_review', 'social', 'unsubscribe'];

    tiers.forEach((tier) => {
      const email: Email = {
        id: `email-${tier}`,
        gmail_id: `gmail-${tier}`,
        from: 'test@example.com',
        subject: `Test ${tier}`,
        snippet: 'Test snippet',
        tier,
        status: 'unread',
        received_at: new Date().toISOString(),
      };

      expect(email.tier).toBe(tier);
    });
  });

  it('should support signal store filtering by domain', () => {
    useSignalStore.setState({ signals: [] });
    const store = useSignalStore.getState();

    const signals: Signal[] = [
      {
        id: 'signal-1',
        type: 'aging_email',
        severity: 'info',
        domain: 'business_re',
        source: 'test',
        title: 'RE signal',
        context: 'Test',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: new Date().toISOString(),
      },
      {
        id: 'signal-2',
        type: 'portfolio_alert',
        severity: 'info',
        domain: 'business_trading',
        source: 'test',
        title: 'Trading signal',
        context: 'Test',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: new Date().toISOString(),
      },
    ];

    store.addSignals(signals);

    const reSignals = store.signalsByDomain('business_re');
    const tradingSignals = store.signalsByDomain('business_trading');

    expect(reSignals).toHaveLength(1);
    expect(tradingSignals).toHaveLength(1);
    expect(reSignals[0].id).toBe('signal-1');
    expect(tradingSignals[0].id).toBe('signal-2');
  });

  it('should support signal store filtering by type', () => {
    useSignalStore.setState({ signals: [] });
    const store = useSignalStore.getState();

    const signals: Signal[] = [
      {
        id: 'signal-1',
        type: 'aging_email',
        severity: 'info',
        domain: 'business_re',
        source: 'test',
        title: 'Email signal',
        context: 'Test',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: new Date().toISOString(),
      },
      {
        id: 'signal-2',
        type: 'deadline_approaching',
        severity: 'info',
        domain: 'business_re',
        source: 'test',
        title: 'Deadline signal',
        context: 'Test',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: new Date().toISOString(),
      },
    ];

    store.addSignals(signals);

    const emailSignals = store.signalsByType('aging_email');
    const deadlineSignals = store.signalsByType('deadline_approaching');

    expect(emailSignals).toHaveLength(1);
    expect(deadlineSignals).toHaveLength(1);
    expect(emailSignals[0].id).toBe('signal-1');
    expect(deadlineSignals[0].id).toBe('signal-2');
  });

  it('should maintain widget registry layout configuration', () => {
    // Verify all widgets have valid layout configs
    WIDGET_REGISTRY.forEach((widget) => {
      expect(widget.defaultLayout).toBeDefined();
      expect(widget.defaultLayout.x).toBeGreaterThanOrEqual(0);
      expect(widget.defaultLayout.y).toBeGreaterThanOrEqual(0);
      expect(widget.defaultLayout.w).toBeGreaterThan(0);
      expect(widget.defaultLayout.h).toBeGreaterThan(0);
    });
  });

  it('should support MCP server state tracking', () => {
    const store = useMcpStore.getState();

    store.registerServer({
      name: 'alpaca',
      url: 'http://localhost:8020',
      healthCheck: '/health',
      required: false,
      transport: 'sse',
      tools: ['get_portfolio', 'place_order'],
    });

    const serverStatus = store.getServerStatus('alpaca');
    const availableTools = store.getAvailableTools('alpaca');

    expect(serverStatus).toBe('disconnected');
    expect(availableTools).toEqual(['get_portfolio', 'place_order']);

    store.setServerStatus('alpaca', 'connected');
    expect(store.getServerStatus('alpaca')).toBe('connected');
    expect(store.isServerAvailable('alpaca')).toBe(true);
  });
});
