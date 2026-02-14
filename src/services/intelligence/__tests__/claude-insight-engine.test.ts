import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseClaudeInsights, insightsToSignals, buildWeeklyDigest } from '../claude-insight-engine';
import type { ProductivityPattern } from '../../../types/signals';

describe('claude-insight-engine', () => {
  describe('parseClaudeInsights', () => {
    it('returns empty for null input', () => {
      const result = parseClaudeInsights(null);
      expect(result).toEqual([]);
    });

    it('returns empty for non-array input', () => {
      const result = parseClaudeInsights({ foo: 'bar' });
      expect(result).toEqual([]);
    });

    it('parses valid insights correctly', () => {
      const raw = [
        {
          title: 'Test Insight',
          context: 'This is context',
          suggested_action: 'Do something',
          severity: 'attention',
          domain: 'personal_growth',
        },
      ];

      const result = parseClaudeInsights(raw);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Insight');
      expect(result[0].context).toBe('This is context');
      expect(result[0].suggested_action).toBe('Do something');
      expect(result[0].severity).toBe('attention');
      expect(result[0].domain).toBe('personal_growth');
    });

    it('caps at 3 insights', () => {
      const raw = [
        { title: 'Insight 1', context: 'Context 1', severity: 'info', domain: 'personal_growth' },
        { title: 'Insight 2', context: 'Context 2', severity: 'info', domain: 'personal_growth' },
        { title: 'Insight 3', context: 'Context 3', severity: 'info', domain: 'personal_growth' },
        { title: 'Insight 4', context: 'Context 4', severity: 'info', domain: 'personal_growth' },
        { title: 'Insight 5', context: 'Context 5', severity: 'info', domain: 'personal_growth' },
      ];

      const result = parseClaudeInsights(raw);

      expect(result).toHaveLength(3);
    });

    it('handles malformed items (missing fields)', () => {
      const raw = [
        { title: 'Valid', context: 'Valid context' },
        { title: 'No context' }, // Missing context
        { context: 'No title' }, // Missing title
        { foo: 'bar' }, // Invalid shape
      ];

      const result = parseClaudeInsights(raw);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Valid');
    });

    it('defaults invalid severity to info', () => {
      const raw = [
        { title: 'Test', context: 'Context', severity: 'invalid_severity', domain: 'personal_growth' },
      ];

      const result = parseClaudeInsights(raw);

      expect(result[0].severity).toBe('info');
    });

    it('defaults invalid domain to personal_growth', () => {
      const raw = [
        { title: 'Test', context: 'Context', severity: 'info', domain: 'invalid_domain' },
      ];

      const result = parseClaudeInsights(raw);

      expect(result[0].domain).toBe('personal_growth');
    });
  });

  describe('insightsToSignals', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-13T10:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('maps to correct Signal shape', () => {
      const insights = [
        {
          title: 'Test Insight',
          context: 'Context',
          suggested_action: 'Action',
          severity: 'attention' as const,
          domain: 'personal_growth',
        },
      ];

      const signals = insightsToSignals(insights);

      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('learned_suggestion');
      expect(signals[0].source).toBe('claude-insight-engine');
      expect(signals[0].title).toBe('Test Insight');
      expect(signals[0].auto_actionable).toBe(false);
      expect(signals[0].is_dismissed).toBe(false);
      expect(signals[0].is_acted_on).toBe(false);
    });

    it('sets expires_at to 24h from now', () => {
      const insights = [
        {
          title: 'Test',
          context: 'Context',
          suggested_action: 'Action',
          severity: 'info' as const,
          domain: 'personal_growth',
        },
      ];

      const signals = insightsToSignals(insights);

      const expectedExpiry = new Date('2026-02-14T10:00:00Z').toISOString();
      expect(signals[0].expires_at).toBe(expectedExpiry);
      expect(signals[0].created_at).toBe('2026-02-13T10:00:00.000Z');
    });
  });

  describe('buildWeeklyDigest', () => {
    it('returns not-enough-data message for empty patterns', () => {
      const result = buildWeeklyDigest([]);
      expect(result).toBe('Not enough data yet to generate a weekly digest.');
    });

    it('includes pattern descriptions for confident patterns', () => {
      const patterns: ProductivityPattern[] = [
        {
          id: '1',
          pattern_type: 'peak_hours',
          description: 'Most productive between 9-11am',
          data: {},
          confidence: 0.8,
          week_start: '2026-02-10',
          created_at: '2026-02-13T10:00:00Z',
        },
        {
          id: '2',
          pattern_type: 'completion_rate',
          description: 'Task completion rate increased by 15%',
          data: {},
          confidence: 0.5,
          week_start: '2026-02-10',
          created_at: '2026-02-13T10:00:00Z',
        },
        {
          id: '3',
          pattern_type: 'streak_health',
          description: 'Low confidence pattern',
          data: {},
          confidence: 0.2,
          week_start: '2026-02-10',
          created_at: '2026-02-13T10:00:00Z',
        },
      ];

      const result = buildWeeklyDigest(patterns);

      expect(result).toContain('Most productive between 9-11am');
      expect(result).toContain('Task completion rate increased by 15%');
      expect(result).not.toContain('Low confidence pattern');
    });
  });
});
