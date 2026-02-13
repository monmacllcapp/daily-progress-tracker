import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectCrossDomainSignals } from '../cross-domain-correlator';
import type { AnticipationContext, Signal } from '../../../types/signals';

// Mock uuid to return predictable values
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-' + Math.random().toString(36).substring(7),
}));

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

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 'signal-' + Math.random().toString(36).substring(7),
    type: 'aging_email',
    severity: 'attention',
    domain: 'business_tech',
    source: 'test-source',
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

describe('cross-domain-correlator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when no existing signals', () => {
    const context = makeContext({ signals: [] });
    const signals = detectCrossDomainSignals(context);
    expect(signals).toEqual([]);
  });

  describe('domain overload detection', () => {
    it('detects domain overload (3+ signals in one domain)', () => {
      const signals = [
        makeSignal({ id: 's1', domain: 'business_re', severity: 'attention' }),
        makeSignal({ id: 's2', domain: 'business_re', severity: 'urgent' }),
        makeSignal({ id: 's3', domain: 'business_re', severity: 'critical' }),
      ];

      const context = makeContext({ signals });
      const result = detectCrossDomainSignals(context);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'pattern_insight',
        severity: 'attention',
        domain: 'business_re',
        source: 'cross-domain-correlator',
        title: 'Domain Overload: business_re',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
      });
      expect(result[0].context).toContain('3 signals detected in business_re');
      expect(result[0].context).toContain('attention, urgent, critical');
      expect(result[0].suggested_action).toContain('Block time');
      expect(result[0].related_entity_ids).toEqual(['s1', 's2', 's3']);
    });

    it('does not alert on domains with < 3 signals', () => {
      const signals = [
        makeSignal({ domain: 'personal_growth', severity: 'attention' }),
        makeSignal({ domain: 'personal_growth', severity: 'urgent' }),
        makeSignal({ domain: 'health_fitness', severity: 'attention' }),
      ];

      const context = makeContext({ signals });
      const result = detectCrossDomainSignals(context);

      expect(result).toEqual([]);
    });

    it('detects multiple domain overloads', () => {
      const signals = [
        makeSignal({ id: 's1', domain: 'business_re', severity: 'attention' }),
        makeSignal({ id: 's2', domain: 'business_re', severity: 'urgent' }),
        makeSignal({ id: 's3', domain: 'business_re', severity: 'critical' }),
        makeSignal({ id: 's4', domain: 'finance', severity: 'attention' }),
        makeSignal({ id: 's5', domain: 'finance', severity: 'urgent' }),
        makeSignal({ id: 's6', domain: 'finance', severity: 'attention' }),
      ];

      const context = makeContext({ signals });
      const result = detectCrossDomainSignals(context);

      expect(result.length).toBeGreaterThanOrEqual(2);
      const reDomainOverload = result.find(s => s.title.includes('business_re'));
      const financeDomainOverload = result.find(s => s.title.includes('finance'));

      expect(reDomainOverload).toBeDefined();
      expect(financeDomainOverload).toBeDefined();
    });
  });

  describe('business_re + finance cross-correlation', () => {
    it('detects business_re + finance cross-correlation', () => {
      const signals = [
        makeSignal({ id: 'sre1', domain: 'business_re', type: 'deal_update' }),
        makeSignal({ id: 'sf1', domain: 'finance', type: 'portfolio_alert' }),
      ];

      const context = makeContext({ signals });
      const result = detectCrossDomainSignals(context);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'financial_update',
        severity: 'attention',
        domain: 'business_re',
        source: 'cross-domain-correlator',
        title: 'Real Estate + Finance Activity Detected',
      });
      expect(result[0].context).toContain('1 real estate signal(s)');
      expect(result[0].context).toContain('1 finance signal(s)');
      expect(result[0].suggested_action).toContain('cash flow availability');
      expect(result[0].related_entity_ids).toContain('sre1');
      expect(result[0].related_entity_ids).toContain('sf1');
    });

    it('handles multiple RE and finance signals', () => {
      const signals = [
        makeSignal({ id: 'sre1', domain: 'business_re' }),
        makeSignal({ id: 'sre2', domain: 'business_re' }),
        makeSignal({ id: 'sf1', domain: 'finance' }),
        makeSignal({ id: 'sf2', domain: 'finance' }),
      ];

      const context = makeContext({ signals });
      const result = detectCrossDomainSignals(context);

      // Should have domain overloads (can't be more specific about count due to test variance)
      // but definitely should have the financial_update correlation
      const financialUpdate = result.find(s => s.type === 'financial_update');
      expect(financialUpdate).toBeDefined();
      expect(financialUpdate?.context).toContain('2 real estate signal(s)');
      expect(financialUpdate?.context).toContain('2 finance signal(s)');
      expect(financialUpdate?.related_entity_ids).toHaveLength(4);
    });

    it('does not alert when only business_re signals exist', () => {
      const signals = [
        makeSignal({ domain: 'business_re' }),
        makeSignal({ domain: 'business_tech' }),
      ];

      const context = makeContext({ signals });
      const result = detectCrossDomainSignals(context);

      expect(result.find(s => s.type === 'financial_update')).toBeUndefined();
    });

    it('does not alert when only finance signals exist', () => {
      const signals = [
        makeSignal({ domain: 'finance' }),
        makeSignal({ domain: 'personal_growth' }),
      ];

      const context = makeContext({ signals });
      const result = detectCrossDomainSignals(context);

      expect(result.find(s => s.type === 'financial_update')).toBeUndefined();
    });
  });

  describe('family + business work-life balance', () => {
    it('detects family + business_re work-life balance signal', () => {
      const signals = [
        makeSignal({ id: 'sf1', domain: 'family', type: 'family_awareness' }),
        makeSignal({ id: 'sb1', domain: 'business_re', type: 'deal_update' }),
      ];

      const context = makeContext({ signals });
      const result = detectCrossDomainSignals(context);

      const workLifeSignal = result.find(s => s.type === 'context_switch_prep');
      expect(workLifeSignal).toBeDefined();
      expect(workLifeSignal).toMatchObject({
        type: 'context_switch_prep',
        severity: 'attention',
        domain: 'family',
        source: 'cross-domain-correlator',
        title: 'Work-Life Balance: Family + Business Activity',
      });
      expect(workLifeSignal?.context).toContain('1 family signal(s)');
      expect(workLifeSignal?.context).toContain('1 business signal(s)');
      expect(workLifeSignal?.context).toContain('business_re');
      expect(workLifeSignal?.suggested_action).toContain('transition time');
      expect(workLifeSignal?.related_entity_ids).toContain('sf1');
      expect(workLifeSignal?.related_entity_ids).toContain('sb1');
    });

    it('detects family + business_trading work-life balance signal', () => {
      const signals = [
        makeSignal({ id: 'sf1', domain: 'family' }),
        makeSignal({ id: 'sbt1', domain: 'business_trading' }),
      ];

      const context = makeContext({ signals });
      const result = detectCrossDomainSignals(context);

      const workLifeSignal = result.find(s => s.type === 'context_switch_prep');
      expect(workLifeSignal).toBeDefined();
      expect(workLifeSignal?.context).toContain('business_trading');
    });

    it('detects family + business_tech work-life balance signal', () => {
      const signals = [
        makeSignal({ id: 'sf1', domain: 'family' }),
        makeSignal({ id: 'stech1', domain: 'business_tech' }),
      ];

      const context = makeContext({ signals });
      const result = detectCrossDomainSignals(context);

      const workLifeSignal = result.find(s => s.type === 'context_switch_prep');
      expect(workLifeSignal).toBeDefined();
      expect(workLifeSignal?.context).toContain('business_tech');
    });

    it('handles family + multiple business domains', () => {
      const signals = [
        makeSignal({ id: 'sf1', domain: 'family' }),
        makeSignal({ id: 'sb1', domain: 'business_re' }),
        makeSignal({ id: 'sb2', domain: 'business_trading' }),
        makeSignal({ id: 'sb3', domain: 'business_tech' }),
      ];

      const context = makeContext({ signals });
      const result = detectCrossDomainSignals(context);

      const workLifeSignal = result.find(s => s.type === 'context_switch_prep');
      expect(workLifeSignal).toBeDefined();
      expect(workLifeSignal?.context).toContain('3 business signal(s)');
      expect(workLifeSignal?.context).toContain('business_re, business_trading, business_tech');
      expect(workLifeSignal?.related_entity_ids).toHaveLength(4);
    });

    it('does not alert when only family signals exist', () => {
      const signals = [
        makeSignal({ domain: 'family' }),
        makeSignal({ domain: 'personal_growth' }),
      ];

      const context = makeContext({ signals });
      const result = detectCrossDomainSignals(context);

      expect(result.find(s => s.type === 'context_switch_prep')).toBeUndefined();
    });

    it('does not alert when only business signals exist', () => {
      const signals = [
        makeSignal({ domain: 'business_re' }),
        makeSignal({ domain: 'business_trading' }),
      ];

      const context = makeContext({ signals });
      const result = detectCrossDomainSignals(context);

      expect(result.find(s => s.type === 'context_switch_prep')).toBeUndefined();
    });
  });

  describe('complex scenarios', () => {
    it('handles single-domain signals (no correlation)', () => {
      const signals = [
        makeSignal({ domain: 'personal_growth' }),
        makeSignal({ domain: 'health_fitness' }),
      ];

      const context = makeContext({ signals });
      const result = detectCrossDomainSignals(context);

      expect(result).toEqual([]);
    });

    it('handles signals across many domains', () => {
      const signals: Signal[] = [
        makeSignal({ id: 's1', domain: 'business_re' }),
        makeSignal({ id: 's2', domain: 'business_re' }),
        makeSignal({ id: 's3', domain: 'business_re' }),
        makeSignal({ id: 's4', domain: 'finance' }),
        makeSignal({ id: 's5', domain: 'family' }),
        makeSignal({ id: 's6', domain: 'personal_growth' }),
        makeSignal({ id: 's7', domain: 'health_fitness' }),
      ];

      const context = makeContext({ signals });
      const result = detectCrossDomainSignals(context);

      // Should detect:
      // 1. Domain overload for business_re (3 signals)
      // 2. Financial update (business_re + finance)
      // 3. Work-life balance (family + business_re)
      expect(result.length).toBeGreaterThanOrEqual(3);

      const domainOverload = result.find(s => s.type === 'pattern_insight');
      const financialUpdate = result.find(s => s.type === 'financial_update');
      const workLifeBalance = result.find(s => s.type === 'context_switch_prep');

      expect(domainOverload).toBeDefined();
      expect(financialUpdate).toBeDefined();
      expect(workLifeBalance).toBeDefined();
    });

    it('generates all three correlation types in one pass', () => {
      const signals: Signal[] = [
        // Domain overload: finance (3 signals)
        makeSignal({ id: 'sf1', domain: 'finance', severity: 'attention' }),
        makeSignal({ id: 'sf2', domain: 'finance', severity: 'urgent' }),
        makeSignal({ id: 'sf3', domain: 'finance', severity: 'critical' }),
        // business_re for cross-correlation
        makeSignal({ id: 'sb1', domain: 'business_re' }),
        // Family for work-life balance
        makeSignal({ id: 'sfam1', domain: 'family' }),
      ];

      const context = makeContext({ signals });
      const result = detectCrossDomainSignals(context);

      // All three correlation types should be present
      const hasOverload = result.some(s => s.type === 'pattern_insight' && s.domain === 'finance');
      const hasFinancialUpdate = result.some(s => s.type === 'financial_update');
      const hasWorkLife = result.some(s => s.type === 'context_switch_prep');

      expect(hasOverload).toBe(true);
      expect(hasFinancialUpdate).toBe(true);
      expect(hasWorkLife).toBe(true);
    });
  });
});
