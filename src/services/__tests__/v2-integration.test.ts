import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAnticipationCycle } from '../intelligence/anticipation-engine';
import { detectAgingSignals } from '../intelligence/aging-detector';
import { detectStreakSignals } from '../intelligence/streak-guardian';
import { detectDeadlineSignals } from '../intelligence/deadline-radar';
import { detectPatternSignals } from '../intelligence/pattern-recognizer';
import { synthesizePriorities, deduplicateSignals } from '../intelligence/priority-synthesizer';
import { detectFinancialSignals } from '../intelligence/financial-sentinel';
import { detectCrossDomainSignals } from '../intelligence/cross-domain-correlator';
import { detectFamilySignals } from '../intelligence/family-awareness';
import { detectContextSwitchSignals } from '../intelligence/context-switch-prep';
import { generateMorningBrief } from '../intelligence/morning-brief';
import { useSignalStore } from '../../store/signalStore';
import type { AnticipationContext, Signal } from '../../types/signals';

// Mock uuid to generate predictable test IDs
vi.mock('uuid', () => ({
  v4: vi.fn(() => `test-${Math.random().toString(36).slice(2, 8)}`)
}));

/**
 * V2 Integration Tests
 *
 * End-to-end integration tests that verify the full V2 data flow.
 * These tests use REAL implementations (not mocks) to verify the entire
 * intelligence pipeline works together.
 */

describe('V2 Integration Tests', () => {
  beforeEach(() => {
    // Reset signal store between tests
    useSignalStore.setState({ signals: [] });
  });

  /**
   * Helper: Create a complete AnticipationContext for testing
   */
  function makeFullContext(overrides: Partial<AnticipationContext> = {}): AnticipationContext {
    return {
      tasks: [],
      projects: [],
      categories: [],
      emails: [],
      calendarEvents: [],
      deals: [],
      signals: [],
      mcpData: {},
      today: '2026-02-13',
      currentTime: '10:00',
      dayOfWeek: 'Thursday',
      historicalPatterns: [],
      ...overrides,
    };
  }

  it('should run anticipation engine and push signals to store', async () => {
    const context = makeFullContext({
      emails: [
        {
          id: 'email-1',
          gmail_id: 'gmail-123',
          from: 'client@example.com',
          subject: 'Urgent: Property analysis needed',
          snippet: 'Please review the attached property analysis',
          tier: 'reply_urgent',
          status: 'unread',
          received_at: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(), // 50 hours ago
          labels: [],
        },
      ],
      tasks: [
        {
          id: 'task-1',
          title: 'Finish project deliverable',
          priority: 'urgent',
          status: 'active',
          source: 'manual',
          created_date: '2026-02-10',
          due_date: '2026-02-14', // Tomorrow
          sort_order: 1,
        },
      ],
    });

    // Run anticipation cycle
    const result = await runAnticipationCycle(context);

    // Verify signals were generated
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.prioritizedSignals.length).toBeGreaterThan(0);
    expect(result.servicesRun.length).toBeGreaterThan(0);

    // Push signals to store
    const store = useSignalStore.getState();
    store.addSignals(result.prioritizedSignals);

    // Verify store has signals
    const activeSignals = store.activeSignals();
    expect(activeSignals.length).toBeGreaterThan(0);
  });

  it('should handle signal lifecycle: add → dismiss → act', () => {
    // Reset store first
    useSignalStore.setState({ signals: [] });
    const store = useSignalStore.getState();

    const testSignal: Signal = {
      id: 'signal-1',
      type: 'aging_email',
      severity: 'attention',
      domain: 'business_re',
      source: 'aging-detector',
      title: 'Email aging',
      context: 'Test email',
      auto_actionable: false,
      is_dismissed: false,
      is_acted_on: false,
      related_entity_ids: ['email-1'],
      created_at: new Date().toISOString(),
    };

    // Add signal
    store.addSignal(testSignal);
    expect(store.activeSignals()).toHaveLength(1);

    // Dismiss signal
    store.dismissSignal('signal-1');
    expect(store.activeSignals()).toHaveLength(0); // Dismissed signals filtered out

    // Re-add for act test
    store.addSignal({ ...testSignal, id: 'signal-2', is_dismissed: false });
    expect(store.activeSignals()).toHaveLength(1);

    // Act on signal - get fresh store state
    store.actOnSignal('signal-2');
    const freshStore = useSignalStore.getState();
    const actedSignal = freshStore.signals.find(s => s.id === 'signal-2');
    expect(actedSignal?.is_acted_on).toBe(true);
  });

  it('should synthesize and prioritize signals correctly', () => {
    const context = makeFullContext({
      tasks: [
        {
          id: 'task-1',
          title: 'Urgent task',
          priority: 'urgent',
          status: 'active',
          source: 'manual',
          created_date: '2026-02-10',
          due_date: '2026-02-13', // Today
          sort_order: 1,
        },
      ],
    });

    const signals: Signal[] = [
      {
        id: 'signal-1',
        type: 'deadline_approaching',
        severity: 'info',
        domain: 'personal_growth',
        source: 'deadline-radar',
        title: 'Low priority signal',
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
        severity: 'critical',
        domain: 'business_re',
        source: 'deadline-radar',
        title: 'High priority signal',
        context: 'Test',
        auto_actionable: true,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: ['task-1'],
        created_at: new Date().toISOString(),
      },
      {
        id: 'signal-3',
        type: 'aging_email',
        severity: 'urgent',
        domain: 'business_re',
        source: 'aging-detector',
        title: 'Medium priority signal',
        context: 'Test',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: new Date().toISOString(),
      },
    ];

    const prioritized = synthesizePriorities(signals, context);

    // Critical should be first
    expect(prioritized[0].severity).toBe('critical');
    // Info should be last
    expect(prioritized[prioritized.length - 1].severity).toBe('info');
  });

  it('should generate complete morning brief with all sections', () => {
    const context = makeFullContext({
      calendarEvents: [
        {
          id: 'event-1',
          summary: 'Team standup',
          start_time: '2026-02-13T09:00:00Z',
          end_time: '2026-02-13T09:30:00Z',
          all_day: false,
          source: 'google',
        },
      ],
      mcpData: {
        alpaca: {
          equity: 100000,
          positions: [
            { symbol: 'AAPL', qty: 10, avg_price: 150, current_price: 155, pnl: 50 },
          ],
          dayPnl: 250,
        },
        familyCalendars: [
          {
            id: 'family-1',
            member: 'Spouse',
            summary: 'Parent-teacher conference',
            start_time: '2026-02-13T14:00:00Z',
            end_time: '2026-02-13T15:00:00Z',
            source_calendar: 'family-cal-1',
            created_at: new Date().toISOString(),
          },
        ],
      },
      deals: [
        {
          id: 'deal-1',
          address: '123 Main St',
          city: 'Atlanta',
          state: 'GA',
          zip: '30301',
          strategy: 'brrrr',
          status: 'analyzing',
          purchase_price: 150000,
          linked_email_ids: [],
          linked_task_ids: [],
          created_at: new Date().toISOString(),
        },
      ],
    });

    const signals: Signal[] = [
      {
        id: 'signal-1',
        type: 'deadline_approaching',
        severity: 'urgent',
        domain: 'business_re',
        source: 'test',
        title: 'Urgent item',
        context: 'Test urgent',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: new Date().toISOString(),
      },
      {
        id: 'signal-2',
        type: 'aging_email',
        severity: 'attention',
        domain: 'business_re',
        source: 'test',
        title: 'Attention item',
        context: 'Test attention',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: new Date().toISOString(),
      },
    ];

    const brief = generateMorningBrief(context, signals);

    // Verify all sections populated
    expect(brief.date).toBe('2026-02-13');
    expect(brief.urgent_signals).toHaveLength(1);
    expect(brief.attention_signals).toHaveLength(1);
    expect(brief.portfolio_pulse).toBeDefined();
    expect(brief.portfolio_pulse?.equity).toBe(100000);
    expect(brief.portfolio_pulse?.active_deals_count).toBe(1);
    expect(brief.calendar_summary).toHaveLength(1);
    expect(brief.family_summary).toHaveLength(1);
    expect(brief.ai_insight).toBeTruthy();
  });

  it('should detect neglected categories with pattern recognizer', async () => {
    const context = makeFullContext({
      categories: [
        {
          id: 'cat-1',
          name: 'Health',
          color_theme: '#ff0000',
          current_progress: 0.5,
          streak_count: 5, // Non-zero so it's considered active
          last_active_date: '2026-02-01', // 12 days ago
          sort_order: 1,
        },
        {
          id: 'cat-2',
          name: 'Wealth',
          color_theme: '#00ff00',
          current_progress: 0.8,
          streak_count: 5,
          last_active_date: '2026-02-12', // Yesterday
          sort_order: 2,
        },
      ],
    });

    const signals = await detectPatternSignals(context);

    // Should detect neglected Health category (mapped to health_fitness domain)
    const neglectedSignal = signals.find(s => s.type === 'pattern_insight');
    expect(neglectedSignal).toBeDefined();
    expect(neglectedSignal?.domain).toBe('health_fitness'); // Health category maps to health_fitness domain
  });

  it('should detect financial signals from portfolio and deals', () => {
    // Calculate a date 29 days ago from today
    const twentyNineDaysAgo = new Date();
    twentyNineDaysAgo.setDate(twentyNineDaysAgo.getDate() - 29);
    const lastAnalysisDate = twentyNineDaysAgo.toISOString();

    const context = makeFullContext({
      mcpData: {
        alpaca: {
          equity: 95000,
          positions: [
            { symbol: 'TSLA', qty: 5, avg_price: 200, current_price: 180, pnl: -100 },
          ],
          dayPnl: -5500, // 5.8% loss (> -500 threshold for critical)
        },
      },
      deals: [
        {
          id: 'deal-1',
          address: '456 Oak St',
          city: 'Atlanta',
          state: 'GA',
          zip: '30302',
          strategy: 'flip',
          status: 'analyzing',
          purchase_price: 200000,
          last_analysis_at: lastAnalysisDate, // 29 days ago (> 7 days threshold)
          linked_email_ids: [],
          linked_task_ids: [],
          created_at: new Date().toISOString(),
        },
      ],
    });

    const signals = detectFinancialSignals(context);

    // Should detect both portfolio loss and stale deal
    expect(signals.length).toBeGreaterThanOrEqual(2);
    const portfolioSignal = signals.find(s => s.type === 'portfolio_alert');
    const dealSignal = signals.find(s => s.type === 'deal_update');
    expect(portfolioSignal).toBeDefined();
    expect(portfolioSignal?.domain).toBe('finance'); // Portfolio alerts use 'finance' domain
    expect(dealSignal).toBeDefined();
    expect(dealSignal?.domain).toBe('business_re'); // Deal alerts use 'business_re' domain
    expect(dealSignal?.related_entity_ids).toContain('deal-1');
  });

  it('should detect cross-domain meta-signals', async () => {
    const context = makeFullContext();

    const signals: Signal[] = [
      {
        id: 'signal-1',
        type: 'deadline_approaching',
        severity: 'urgent',
        domain: 'business_re',
        source: 'deadline-radar',
        title: 'RE deadline',
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
        severity: 'urgent',
        domain: 'business_trading',
        source: 'financial-sentinel',
        title: 'Trading alert',
        context: 'Test',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: new Date().toISOString(),
      },
      {
        id: 'signal-3',
        type: 'family_awareness',
        severity: 'attention',
        domain: 'family',
        source: 'family-awareness',
        title: 'Family event',
        context: 'Test',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: new Date().toISOString(),
      },
    ];

    context.signals = signals;
    const metaSignals = await detectCrossDomainSignals(context);

    // Should generate meta-signal about multiple urgent business items
    expect(metaSignals.length).toBeGreaterThan(0);
  });

  it('should correctly handle aging thresholds at boundaries', () => {
    const now = Date.now();
    const context = makeFullContext({
      emails: [
        {
          id: 'email-25h',
          gmail_id: 'gmail-1',
          from: 'test@example.com',
          subject: 'Test 25h',
          snippet: 'Test',
          tier: 'to_review',
          status: 'unread',
          received_at: new Date(now - 25 * 60 * 60 * 1000).toISOString(), // Just over 24h
          labels: [],
        },
        {
          id: 'email-49h',
          gmail_id: 'gmail-2',
          from: 'test@example.com',
          subject: 'Test 49h',
          snippet: 'Test',
          tier: 'to_review',
          status: 'unread',
          received_at: new Date(now - 49 * 60 * 60 * 1000).toISOString(), // Just over 48h
          labels: [],
        },
        {
          id: 'email-73h',
          gmail_id: 'gmail-3',
          from: 'test@example.com',
          subject: 'Test 73h',
          snippet: 'Test',
          tier: 'to_review',
          status: 'unread',
          received_at: new Date(now - 73 * 60 * 60 * 1000).toISOString(), // Just over 72h
          labels: [],
        },
      ],
    });

    const signals = detectAgingSignals(context);

    // All three should generate signals with correct severity
    expect(signals.length).toBeGreaterThanOrEqual(3);
    const signal25h = signals.find(s => s.related_entity_ids.includes('email-25h'));
    const signal49h = signals.find(s => s.related_entity_ids.includes('email-49h'));
    const signal73h = signals.find(s => s.related_entity_ids.includes('email-73h'));

    expect(signal25h?.severity).toBe('attention');
    expect(signal49h?.severity).toBe('urgent');
    expect(signal73h?.severity).toBe('critical');
  });

  it('should detect mixed deadline types', () => {
    const context = makeFullContext({
      today: '2026-02-13',
      currentTime: '13:45', // 1:45 PM
      tasks: [
        {
          id: 'task-overdue',
          title: 'Overdue task',
          priority: 'high',
          status: 'active',
          source: 'manual',
          created_date: '2026-02-01',
          due_date: '2026-02-12', // Yesterday
          sort_order: 1,
        },
      ],
      projects: [
        {
          id: 'project-upcoming',
          title: 'Upcoming project',
          status: 'active',
          motivation_payload: {
            why: 'Test',
            impact_positive: 'Good',
            impact_negative: 'Bad',
          },
          metrics: {
            total_time_estimated: 0,
            total_time_spent: 0,
            optimism_ratio: 1,
          },
          due_date: '2026-02-15T10:00:00Z', // 2 days from now
        },
      ],
    });

    const signals = detectDeadlineSignals(context);

    // Should detect overdue task and upcoming project (calendar event check removed - deadline-radar only checks events within 30min)
    expect(signals.length).toBeGreaterThanOrEqual(2);
    const overdueSignal = signals.find(s => s.related_entity_ids.includes('task-overdue'));
    const upcomingSignal = signals.find(s => s.related_entity_ids.includes('project-upcoming'));

    expect(overdueSignal).toBeDefined();
    expect(overdueSignal?.severity).toBe('critical');
    expect(upcomingSignal).toBeDefined();
  });

  it('should deduplicate signals keeping highest severity', () => {
    const signals: Signal[] = [
      {
        id: 'signal-1',
        type: 'aging_email',
        severity: 'attention',
        domain: 'business_re',
        source: 'test',
        title: 'Email 1',
        context: 'Test',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: ['email-1'],
        created_at: new Date().toISOString(),
      },
      {
        id: 'signal-2',
        type: 'aging_email',
        severity: 'urgent',
        domain: 'business_re',
        source: 'test',
        title: 'Email 1 urgent',
        context: 'Test',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: ['email-1'],
        created_at: new Date().toISOString(),
      },
    ];

    const deduplicated = deduplicateSignals(signals);

    // Should keep only the urgent one
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0].severity).toBe('urgent');
  });

  it('should clear expired signals but preserve urgent ones', () => {
    // Reset store first
    useSignalStore.setState({ signals: [] });
    const store = useSignalStore.getState();
    const pastTime = new Date(Date.now() - 1000).toISOString();
    const futureTime = new Date(Date.now() + 10000).toISOString();

    store.addSignals([
      {
        id: 'signal-expired-info',
        type: 'aging_email',
        severity: 'info',
        domain: 'business_re',
        source: 'test',
        title: 'Expired info',
        context: 'Test',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: new Date().toISOString(),
        expires_at: pastTime,
      },
      {
        id: 'signal-expired-urgent',
        type: 'deadline_approaching',
        severity: 'urgent',
        domain: 'business_re',
        source: 'test',
        title: 'Expired urgent',
        context: 'Test',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: new Date().toISOString(),
        expires_at: pastTime,
      },
      {
        id: 'signal-active',
        type: 'aging_email',
        severity: 'info',
        domain: 'business_re',
        source: 'test',
        title: 'Active',
        context: 'Test',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: new Date().toISOString(),
        expires_at: futureTime,
      },
    ]);

    store.clearExpired();

    const freshStore = useSignalStore.getState();
    const remaining = freshStore.signals;
    expect(remaining).toHaveLength(2); // Urgent + active, expired info removed
    expect(remaining.find(s => s.id === 'signal-expired-info')).toBeUndefined();
    expect(remaining.find(s => s.id === 'signal-expired-urgent')).toBeDefined();
    expect(remaining.find(s => s.id === 'signal-active')).toBeDefined();
  });

  it('should handle empty context gracefully', async () => {
    const context = makeFullContext();

    const result = await runAnticipationCycle(context);

    // Should complete without errors
    expect(result.signals).toEqual([]);
    expect(result.prioritizedSignals).toEqual([]);
    expect(result.servicesRun.length).toBeGreaterThan(0);
  });

  it('should detect context switch signals with correct severity', () => {
    const context = makeFullContext({
      calendarEvents: [
        {
          id: 'event-urgent',
          summary: 'Meeting in 4 minutes',
          start_time: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
          end_time: new Date(Date.now() + 34 * 60 * 1000).toISOString(),
          all_day: false,
          source: 'google',
        },
        {
          id: 'event-attention',
          summary: 'Meeting in 12 minutes',
          start_time: new Date(Date.now() + 12 * 60 * 1000).toISOString(),
          end_time: new Date(Date.now() + 42 * 60 * 1000).toISOString(),
          all_day: false,
          source: 'google',
        },
        {
          id: 'event-info',
          summary: 'Meeting in 28 minutes',
          start_time: new Date(Date.now() + 28 * 60 * 1000).toISOString(),
          end_time: new Date(Date.now() + 58 * 60 * 1000).toISOString(),
          all_day: false,
          source: 'google',
        },
      ],
    });

    const signals = detectContextSwitchSignals(context);

    // Should generate signals for all three (all within 30 min window)
    expect(signals.length).toBeGreaterThanOrEqual(3);
    const urgentSignal = signals.find(s => s.related_entity_ids.includes('event-urgent'));
    const attentionSignal = signals.find(s => s.related_entity_ids.includes('event-attention'));
    const infoSignal = signals.find(s => s.related_entity_ids.includes('event-info'));

    expect(urgentSignal?.severity).toBe('urgent'); // <= 5 min
    expect(attentionSignal?.severity).toBe('attention'); // <= 15 min
    expect(infoSignal?.severity).toBe('info'); // <= 30 min
  });

  it('should detect family conflicts with personal events', () => {
    // Use a future time to avoid past event filtering
    const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
    const futureTimeStr = futureTime.toISOString();
    const futureEndStr = new Date(futureTime.getTime() + 60 * 60 * 1000).toISOString();
    const overlapStartStr = new Date(futureTime.getTime() + 30 * 60 * 1000).toISOString();
    const overlapEndStr = new Date(futureTime.getTime() + 90 * 60 * 1000).toISOString();

    const context = makeFullContext({
      calendarEvents: [
        {
          id: 'personal-1',
          summary: 'Personal meeting',
          start_time: futureTimeStr,
          end_time: futureEndStr,
          all_day: false,
          source: 'google',
        },
      ],
      mcpData: {
        familyCalendars: [
          {
            id: 'family-1',
            member: 'Spouse',
            summary: 'School pickup',
            start_time: overlapStartStr, // Overlaps with personal meeting
            end_time: overlapEndStr,
            source_calendar: 'family-cal-1',
            created_at: new Date().toISOString(),
          },
        ],
      },
    });

    const signals = detectFamilySignals(context);

    // Should detect conflict (critical severity)
    const conflictSignal = signals.find(s => s.severity === 'critical' && s.type === 'family_awareness');
    expect(conflictSignal).toBeDefined();
    expect(conflictSignal?.context).toContain('overlap');
  });

  it('should detect streak at risk at exact threshold', async () => {
    const context = makeFullContext({
      categories: [
        {
          id: 'cat-1',
          name: 'Fitness',
          color_theme: '#ff0000',
          current_progress: 0.7,
          streak_count: 7,
          last_active_date: '2026-02-12', // Yesterday
          sort_order: 1,
        },
      ],
      tasks: [],
    });

    const signals = await detectStreakSignals(context);

    // Should detect streak at risk (7+ days, no tasks today)
    const streakSignal = signals.find(s => s.type === 'streak_at_risk');
    expect(streakSignal).toBeDefined();
    expect(streakSignal?.related_entity_ids).toContain('cat-1');
  });
});
