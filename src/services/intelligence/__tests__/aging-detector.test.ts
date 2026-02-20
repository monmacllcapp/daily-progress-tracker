import { describe, it, expect } from 'vitest';
import { detectAgingSignals } from '../aging-detector';
import type { AnticipationContext } from '../../../types/signals';
import type { Email, Task } from '../../../types/schema';

function makeContext(overrides: Partial<AnticipationContext> = {}): AnticipationContext {
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
    currentTime: '09:00',
    dayOfWeek: 'Thursday',
    historicalPatterns: [],
    ...overrides,
  };
}

function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: 'email-1',
    gmail_id: 'g1',
    from: 'test@test.com',
    subject: 'Test Email',
    snippet: 'test',
    tier: 'to_review',
    status: 'unread',
    received_at: new Date(Date.now() - 72 * 3600000).toISOString(),
    ...overrides,
  } as Email;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test task',
    priority: 'medium',
    status: 'active',
    source: 'manual',
    created_date: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10),
    sort_order: 0,
    ...overrides,
  } as Task;
}

describe('aging-detector', () => {
  it('returns empty array when no emails or tasks', () => {
    const context = makeContext();
    const signals = detectAgingSignals(context);

    expect(signals).toEqual([]);
  });

  it('detects critical aging email (72+ hours)', () => {
    const email = makeEmail({
      received_at: new Date(Date.now() - 73 * 3600000).toISOString(),
    });
    const context = makeContext({ emails: [email] });

    const signals = detectAgingSignals(context);

    expect(signals).toHaveLength(1);
    expect(signals[0].severity).toBe('critical');
    expect(signals[0].type).toBe('aging_email');
    expect(signals[0].related_entity_ids).toContain('email-1');
  });

  it('detects urgent aging email (48+ hours)', () => {
    const email = makeEmail({
      received_at: new Date(Date.now() - 49 * 3600000).toISOString(),
    });
    const context = makeContext({ emails: [email] });

    const signals = detectAgingSignals(context);

    expect(signals).toHaveLength(1);
    expect(signals[0].severity).toBe('urgent');
    expect(signals[0].type).toBe('aging_email');
  });

  it('detects attention aging email (24+ hours)', () => {
    const email = makeEmail({
      received_at: new Date(Date.now() - 25 * 3600000).toISOString(),
    });
    const context = makeContext({ emails: [email] });

    const signals = detectAgingSignals(context);

    expect(signals).toHaveLength(1);
    expect(signals[0].severity).toBe('attention');
    expect(signals[0].type).toBe('aging_email');
  });

  it('skips promotions and unsubscribe emails', () => {
    const promotionsEmail = makeEmail({
      tier: 'social',
      received_at: new Date(Date.now() - 73 * 3600000).toISOString(),
    });
    const unsubscribeEmail = makeEmail({
      id: 'email-2',
      tier: 'unsubscribe',
      received_at: new Date(Date.now() - 73 * 3600000).toISOString(),
    });
    const context = makeContext({ emails: [promotionsEmail, unsubscribeEmail] });

    const signals = detectAgingSignals(context);

    expect(signals).toEqual([]);
  });

  it('skips already replied emails', () => {
    const repliedEmail = makeEmail({
      status: 'replied',
      received_at: new Date(Date.now() - 73 * 3600000).toISOString(),
    });
    const archivedEmail = makeEmail({
      id: 'email-2',
      status: 'archived',
      received_at: new Date(Date.now() - 73 * 3600000).toISOString(),
    });
    const context = makeContext({ emails: [repliedEmail, archivedEmail] });

    const signals = detectAgingSignals(context);

    expect(signals).toEqual([]);
  });

  it('detects stale active tasks', () => {
    const task = makeTask({
      created_date: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10),
    });
    const context = makeContext({ tasks: [task] });

    const signals = detectAgingSignals(context);

    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('follow_up_due');
    expect(signals[0].severity).toBe('attention');
    expect(signals[0].related_entity_ids).toContain('task-1');
  });

  it('uses custom config when provided', () => {
    const customConfig = {
      email_attention_hours: 12,
      email_urgent_hours: 24,
      email_critical_hours: 36,
      task_stale_days: 1,
      lead_response_hours: 2,
    };

    const email = makeEmail({
      received_at: new Date(Date.now() - 13 * 3600000).toISOString(),
    });
    const context = makeContext({ emails: [email] });

    const signals = detectAgingSignals(context, customConfig);

    expect(signals).toHaveLength(1);
    expect(signals[0].severity).toBe('attention');
  });
});
