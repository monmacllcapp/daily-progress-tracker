import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectFinancialSignals } from '../financial-sentinel';
import type { AnticipationContext, Deal } from '../../../types/signals';

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

function makeDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: 'deal-1',
    address: '123 Main St',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    strategy: 'flip',
    status: 'analyzing',
    linked_email_ids: [],
    linked_task_ids: [],
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('financial-sentinel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('portfolio alerts', () => {
    it('returns empty array when no portfolio data', () => {
      const context = makeContext();
      const signals = detectFinancialSignals(context);
      expect(signals).toEqual([]);
    });

    it('generates critical alert for large portfolio loss (< -500)', () => {
      const context = makeContext({
        mcpData: {
          alpaca: {
            equity: 48500,
            positions: [{ symbol: 'AAPL', qty: 10, avg_price: 150, current_price: 145, pnl: -50 }],
            dayPnl: -650.75,
          },
        },
      });

      const signals = detectFinancialSignals(context);

      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({
        type: 'portfolio_alert',
        severity: 'critical',
        domain: 'finance',
        source: 'financial-sentinel',
        title: 'Critical Portfolio Loss: $650.75',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
      });
      expect(signals[0].context).toContain('$-650.75');
      expect(signals[0].context).toContain('1 active positions');
      expect(signals[0].suggested_action).toContain('risk management');
    });

    it('generates urgent alert for moderate loss (-100 to -500)', () => {
      const context = makeContext({
        mcpData: {
          alpaca: {
            equity: 49750,
            positions: [
              { symbol: 'AAPL', qty: 10, avg_price: 150, current_price: 148, pnl: -20 },
              { symbol: 'GOOGL', qty: 5, avg_price: 140, current_price: 135, pnl: -25 },
            ],
            dayPnl: -250.50,
          },
        },
      });

      const signals = detectFinancialSignals(context);

      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({
        type: 'portfolio_alert',
        severity: 'urgent',
        domain: 'finance',
        source: 'financial-sentinel',
        title: 'Portfolio Loss: $250.50',
      });
      expect(signals[0].context).toContain('-250.50');
      expect(signals[0].context).toContain('2 active positions');
    });

    it('does not generate alert for small loss (> -100)', () => {
      const context = makeContext({
        mcpData: {
          alpaca: {
            equity: 49950,
            positions: [{ symbol: 'AAPL', qty: 10, avg_price: 150, current_price: 149, pnl: -10 }],
            dayPnl: -50.25,
          },
        },
      });

      const signals = detectFinancialSignals(context);
      expect(signals).toEqual([]);
    });

    it('does not generate alert for profit', () => {
      const context = makeContext({
        mcpData: {
          alpaca: {
            equity: 50500,
            positions: [{ symbol: 'AAPL', qty: 10, avg_price: 150, current_price: 155, pnl: 50 }],
            dayPnl: 250.75,
          },
        },
      });

      const signals = detectFinancialSignals(context);
      expect(signals).toEqual([]);
    });
  });

  describe('deal pipeline alerts', () => {
    it('returns empty array when no deals', () => {
      const context = makeContext({ deals: [] });
      const signals = detectFinancialSignals(context);
      expect(signals).toEqual([]);
    });

    it('detects stale deals (last_analysis_at > 7 days)', () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

      const deal = makeDeal({
        status: 'analyzing',
        last_analysis_at: eightDaysAgo,
      });

      const context = makeContext({ deals: [deal] });
      const signals = detectFinancialSignals(context);

      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({
        type: 'deal_update',
        severity: 'attention',
        domain: 'business_re',
        source: 'financial-sentinel',
        title: 'Stale Deal: 123 Main St',
        auto_actionable: false,
      });
      expect(signals[0].context).toContain('analyzing');
      expect(signals[0].context).toContain('8 days');
      expect(signals[0].suggested_action).toContain('Run fresh comps');
      expect(signals[0].related_entity_ids).toContain('deal-1');
    });

    it('detects under_contract deals needing analysis (urgent)', () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

      const deal = makeDeal({
        status: 'under_contract',
        last_analysis_at: tenDaysAgo,
      });

      const context = makeContext({ deals: [deal] });
      const signals = detectFinancialSignals(context);

      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({
        type: 'deal_update',
        severity: 'urgent',
        domain: 'business_re',
        source: 'financial-sentinel',
        title: 'Under-Contract Deal Needs Analysis: 123 Main St',
      });
      expect(signals[0].context).toContain('under contract');
      expect(signals[0].context).toContain('10 days');
      expect(signals[0].suggested_action).toContain('contingencies');
    });

    it('skips closed deals', () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

      const closedDeal = makeDeal({
        status: 'closed',
        last_analysis_at: eightDaysAgo,
      });

      const context = makeContext({ deals: [closedDeal] });
      const signals = detectFinancialSignals(context);

      expect(signals).toEqual([]);
    });

    it('skips dead deals', () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

      const deadDeal = makeDeal({
        status: 'dead',
        last_analysis_at: eightDaysAgo,
      });

      const context = makeContext({ deals: [deadDeal] });
      const signals = detectFinancialSignals(context);

      expect(signals).toEqual([]);
    });

    it('does not alert on fresh deals (< 7 days)', () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

      const deal = makeDeal({
        status: 'analyzing',
        last_analysis_at: fiveDaysAgo,
      });

      const context = makeContext({ deals: [deal] });
      const signals = detectFinancialSignals(context);

      expect(signals).toEqual([]);
    });

    it('handles multiple deals with mixed signals', () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

      const deals = [
        makeDeal({ id: 'deal-1', status: 'analyzing', last_analysis_at: eightDaysAgo }),
        makeDeal({ id: 'deal-2', status: 'under_contract', last_analysis_at: tenDaysAgo, address: '456 Oak Ave' }),
        makeDeal({ id: 'deal-3', status: 'closed', last_analysis_at: eightDaysAgo }),
        makeDeal({ id: 'deal-4', status: 'analyzing', last_analysis_at: fiveDaysAgo }),
      ];

      const context = makeContext({ deals });
      const signals = detectFinancialSignals(context);

      expect(signals).toHaveLength(2);
      expect(signals.find(s => s.title.includes('123 Main St'))?.severity).toBe('attention');
      expect(signals.find(s => s.title.includes('456 Oak Ave'))?.severity).toBe('urgent');
    });
  });

  describe('combined portfolio + deal signals', () => {
    it('generates both portfolio and deal alerts when conditions met', () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

      const context = makeContext({
        mcpData: {
          alpaca: {
            equity: 49750,
            positions: [{ symbol: 'AAPL', qty: 10, avg_price: 150, current_price: 148, pnl: -20 }],
            dayPnl: -250.50,
          },
        },
        deals: [
          makeDeal({ status: 'analyzing', last_analysis_at: eightDaysAgo }),
        ],
      });

      const signals = detectFinancialSignals(context);

      expect(signals).toHaveLength(2);
      expect(signals.find(s => s.type === 'portfolio_alert')).toBeDefined();
      expect(signals.find(s => s.type === 'deal_update')).toBeDefined();
    });
  });
});
