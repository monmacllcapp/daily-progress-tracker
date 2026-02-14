import { describe, it, expect } from 'vitest';
import {
  aggregateSignalFeedback,
  computeEffectivenessScore,
  computeWeightModifier,
  applyFeedbackWeights,
} from '../feedback-loop';
import type { Signal, SignalWeight } from '../../../types/signals';

/**
 * Helper to create a valid Signal with defaults.
 */
function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 'sig-001',
    type: 'aging_email',
    severity: 'attention',
    domain: 'business_re',
    source: 'aging-detector',
    title: 'Test Signal',
    context: 'Test context',
    auto_actionable: false,
    is_dismissed: false,
    is_acted_on: false,
    related_entity_ids: [],
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('feedback-loop', () => {
  describe('aggregateSignalFeedback', () => {
    it('returns empty map for empty array', () => {
      const result = aggregateSignalFeedback([]);
      expect(result.size).toBe(0);
    });

    it('groups by type:domain correctly', () => {
      const signals = [
        makeSignal({ type: 'aging_email', domain: 'business_re' }),
        makeSignal({ type: 'aging_email', domain: 'business_re' }),
        makeSignal({ type: 'deadline_approaching', domain: 'personal_growth' }),
      ];

      const result = aggregateSignalFeedback(signals);
      expect(result.size).toBe(2);
      expect(result.has('aging_email:business_re')).toBe(true);
      expect(result.has('deadline_approaching:personal_growth')).toBe(true);
    });

    it('counts dismissed and acted on accurately', () => {
      const signals = [
        makeSignal({ type: 'aging_email', domain: 'business_re', is_dismissed: false, is_acted_on: true }),
        makeSignal({ type: 'aging_email', domain: 'business_re', is_dismissed: true, is_acted_on: false }),
        makeSignal({ type: 'aging_email', domain: 'business_re', is_dismissed: false, is_acted_on: false }),
      ];

      const result = aggregateSignalFeedback(signals);
      const stats = result.get('aging_email:business_re')!;

      expect(stats.totalGenerated).toBe(3);
      expect(stats.totalDismissed).toBe(1);
      expect(stats.totalActedOn).toBe(1);
    });
  });

  describe('computeEffectivenessScore', () => {
    it('returns 0.5 for < 5 interactions (below threshold)', () => {
      const stats = {
        signalType: 'aging_email' as const,
        domain: 'business_re' as const,
        totalGenerated: 10,
        totalDismissed: 2,
        totalActedOn: 2,
      };

      const score = computeEffectivenessScore(stats);
      expect(score).toBe(0.5);
    });

    it('returns 1.0 for fully acted-on signals (10 acted, 0 dismissed)', () => {
      const stats = {
        signalType: 'aging_email' as const,
        domain: 'business_re' as const,
        totalGenerated: 10,
        totalDismissed: 0,
        totalActedOn: 10,
      };

      const score = computeEffectivenessScore(stats);
      expect(score).toBe(1.0);
    });

    it('returns 0.0 for fully dismissed signals (0 acted, 10 dismissed)', () => {
      const stats = {
        signalType: 'aging_email' as const,
        domain: 'business_re' as const,
        totalGenerated: 10,
        totalDismissed: 10,
        totalActedOn: 0,
      };

      const score = computeEffectivenessScore(stats);
      expect(score).toBe(0.0);
    });

    it('returns 0.5 for evenly split (5 acted, 5 dismissed)', () => {
      const stats = {
        signalType: 'aging_email' as const,
        domain: 'business_re' as const,
        totalGenerated: 10,
        totalDismissed: 5,
        totalActedOn: 5,
      };

      const score = computeEffectivenessScore(stats);
      expect(score).toBe(0.5);
    });
  });

  describe('computeWeightModifier', () => {
    it('returns 0.3 for 0.0 effectiveness', () => {
      const modifier = computeWeightModifier(0.0);
      expect(modifier).toBe(0.3);
    });

    it('returns 2.0 for 1.0 effectiveness', () => {
      const modifier = computeWeightModifier(1.0);
      expect(modifier).toBe(2.0);
    });
  });

  describe('applyFeedbackWeights', () => {
    it('multiplies score by weight_modifier when match found', () => {
      const signal = makeSignal({ type: 'aging_email', domain: 'business_re' });
      const weights: SignalWeight[] = [
        {
          id: 'w-001',
          signal_type: 'aging_email',
          domain: 'business_re',
          total_generated: 10,
          total_dismissed: 0,
          total_acted_on: 10,
          effectiveness_score: 1.0,
          weight_modifier: 2.0,
          last_updated: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ];

      const result = applyFeedbackWeights(50, signal, weights);
      expect(result).toBe(100);
    });

    it('returns original score when no matching weight', () => {
      const signal = makeSignal({ type: 'aging_email', domain: 'business_re' });
      const weights: SignalWeight[] = [
        {
          id: 'w-001',
          signal_type: 'deadline_approaching',
          domain: 'personal_growth',
          total_generated: 10,
          total_dismissed: 0,
          total_acted_on: 10,
          effectiveness_score: 1.0,
          weight_modifier: 2.0,
          last_updated: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ];

      const result = applyFeedbackWeights(50, signal, weights);
      expect(result).toBe(50);
    });
  });
});
