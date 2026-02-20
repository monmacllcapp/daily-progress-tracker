import { describe, it, expect } from 'vitest';
import { detectStreakSignals, mapCategoryToDomain } from '../streak-guardian';
import type { AnticipationContext } from '../../../types/signals';

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
    ...overrides
  };
}

function makeCategory(overrides: Partial<any> = {}) {
  return {
    id: 'cat-1',
    name: 'Health',
    color_theme: '#ff0000',
    current_progress: 0.5,
    streak_count: 5,
    sort_order: 0,
    last_active_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    ...overrides
  };
}

describe('streak-guardian', () => {
  it('returns empty when no categories', () => {
    const context = makeContext({ categories: [] });
    const signals = detectStreakSignals(context);
    expect(signals).toEqual([]);
  });

  it('returns empty when no streaks active', () => {
    const context = makeContext({
      categories: [makeCategory({ streak_count: 0 })]
    });
    const signals = detectStreakSignals(context);
    expect(signals).toEqual([]);
  });

  it('detects streak at risk when last active yesterday', () => {
    const yesterday = new Date('2026-02-12').toISOString().slice(0, 10);
    const context = makeContext({
      today: '2026-02-13',
      categories: [makeCategory({ streak_count: 5, last_active_date: yesterday })]
    });
    const signals = detectStreakSignals(context);
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('streak_at_risk');
    expect(signals[0].severity).toBe('attention');
    expect(signals[0].title).toContain('5 days');
  });

  it('generates critical when streak possibly broken (2+ days)', () => {
    const twoDaysAgo = new Date('2026-02-11').toISOString().slice(0, 10);
    const context = makeContext({
      today: '2026-02-13',
      categories: [makeCategory({ streak_count: 5, last_active_date: twoDaysAgo })]
    });
    const signals = detectStreakSignals(context);
    expect(signals).toHaveLength(1);
    expect(signals[0].severity).toBe('critical');
    expect(signals[0].context).toContain('broken');
  });

  it('higher severity for longer streaks', () => {
    const yesterday = new Date('2026-02-12').toISOString().slice(0, 10);
    const context = makeContext({
      today: '2026-02-13',
      categories: [
        makeCategory({ id: 'cat-1', streak_count: 10, last_active_date: yesterday }),
        makeCategory({ id: 'cat-2', streak_count: 3, last_active_date: yesterday })
      ]
    });
    const signals = detectStreakSignals(context);
    expect(signals).toHaveLength(2);
    const longStreak = signals.find(s => s.title.includes('10 days'));
    const shortStreak = signals.find(s => s.title.includes('3 days'));
    expect(longStreak?.severity).toBe('urgent');
    expect(shortStreak?.severity).toBe('attention');
  });

  it('maps category names to correct domains', () => {
    expect(mapCategoryToDomain('Health')).toBe('health_fitness');
    expect(mapCategoryToDomain('Fitness')).toBe('health_fitness');
    expect(mapCategoryToDomain('Wealth')).toBe('finance');
    expect(mapCategoryToDomain('Finance')).toBe('finance');
    expect(mapCategoryToDomain('Family')).toBe('family');
    expect(mapCategoryToDomain('Business')).toBe('business_tech');
    expect(mapCategoryToDomain('Creative')).toBe('creative');
    expect(mapCategoryToDomain('Spiritual')).toBe('spiritual');
    expect(mapCategoryToDomain('Random Category')).toBe('personal_growth');
  });
});
