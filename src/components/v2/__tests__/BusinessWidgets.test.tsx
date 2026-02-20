import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DealAnalyzer } from '../DealAnalyzer';
import { TradingDashboard } from '../TradingDashboard';
import { BusinessKPIs } from '../BusinessKPIs';
import { FinancialOverview } from '../FinancialOverview';
import type { Deal, PortfolioSnapshot, Signal } from '../../../types/signals';

// Test helper factories
const makeDeal = (overrides: Partial<Deal> = {}): Deal => ({
  id: 'deal-123',
  address: '123 Main St',
  city: 'Austin',
  state: 'TX',
  zip: '78701',
  strategy: 'flip',
  status: 'analyzing',
  purchase_price: 250000,
  arv: 350000,
  rehab_cost: 50000,
  linked_email_ids: [],
  linked_task_ids: [],
  created_at: '2026-02-13T10:00:00Z',
  ...overrides
});

const makeSnapshot = (overrides: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot => ({
  id: 'snapshot-123',
  date: '2026-02-13',
  equity: 100000,
  cash: 25000,
  buying_power: 50000,
  positions_count: 5,
  day_pnl: 1250,
  total_pnl: 12500,
  positions: [
    { symbol: 'AAPL', qty: 10, avg_price: 150, current_price: 155, pnl: 50 },
    { symbol: 'TSLA', qty: 5, avg_price: 200, current_price: 210, pnl: 50 }
  ],
  source: 'alpaca',
  created_at: '2026-02-13T10:00:00Z',
  ...overrides
});

const makeSignal = (overrides: Partial<Signal> = {}): Signal => ({
  id: 'signal-123',
  type: 'deadline_approaching',
  severity: 'urgent',
  domain: 'business_re',
  source: 'deadline-tracker',
  title: 'Deal inspection due tomorrow',
  context: 'Property at 123 Main St needs inspection',
  auto_actionable: false,
  is_dismissed: false,
  is_acted_on: false,
  related_entity_ids: [],
  created_at: '2026-02-13T10:00:00Z',
  ...overrides
});

describe('DealAnalyzer', () => {
  it('shows loading state', () => {
    render(<DealAnalyzer isLoading={true} />);
    expect(screen.getByText('Loading deals...')).toBeInTheDocument();
  });

  it('shows empty state when no deals', () => {
    render(<DealAnalyzer deals={[]} />);
    expect(screen.getByText('No deals in pipeline.')).toBeInTheDocument();
  });

  it('renders active deals', () => {
    const deals = [
      makeDeal({ id: 'deal-1', address: '123 Main St', status: 'analyzing' }),
      makeDeal({ id: 'deal-2', address: '456 Oak Ave', status: 'offer' })
    ];
    render(<DealAnalyzer deals={deals} />);

    expect(screen.getByText('123 Main St')).toBeInTheDocument();
    expect(screen.getByText('456 Oak Ave')).toBeInTheDocument();
    expect(screen.getByText('Deal Pipeline')).toBeInTheDocument();
  });

  it('shows pipeline value correctly', () => {
    const deals = [
      makeDeal({ id: 'deal-1', purchase_price: 250000 }),
      makeDeal({ id: 'deal-2', purchase_price: 350000 })
    ];
    render(<DealAnalyzer deals={deals} />);

    // Total: 600k
    expect(screen.getByText('$600k')).toBeInTheDocument();
    expect(screen.getByText('Pipeline')).toBeInTheDocument();
  });

  it('shows deal status badges with correct colors', () => {
    const deals = [
      makeDeal({ id: 'deal-1', status: 'under_contract', address: 'Contract Property' }),
      makeDeal({ id: 'deal-2', status: 'offer', address: 'Offer Property' }),
      makeDeal({ id: 'deal-3', status: 'analyzing', address: 'Analyzing Property' })
    ];
    render(<DealAnalyzer deals={deals} />);

    expect(screen.getByText('under contract')).toBeInTheDocument();
    expect(screen.getByText('offer')).toBeInTheDocument();
    expect(screen.getByText('analyzing')).toBeInTheDocument();
  });
});

describe('TradingDashboard', () => {
  it('shows loading state', () => {
    render(<TradingDashboard isLoading={true} />);
    expect(screen.getByText('Loading portfolio...')).toBeInTheDocument();
  });

  it('shows empty state when no snapshot', () => {
    render(<TradingDashboard snapshot={null} />);
    expect(screen.getByText('No portfolio data available.')).toBeInTheDocument();
  });

  it('renders equity correctly', () => {
    const snapshot = makeSnapshot({ equity: 125000 });
    render(<TradingDashboard snapshot={snapshot} />);

    expect(screen.getByText('$125,000')).toBeInTheDocument();
    expect(screen.getByText('Total Equity')).toBeInTheDocument();
  });

  it('shows day P&L with correct color for profit', () => {
    const snapshot = makeSnapshot({ day_pnl: 2500, equity: 100000 });
    render(<TradingDashboard snapshot={snapshot} />);

    expect(screen.getByText('+$2,500')).toBeInTheDocument();
    expect(screen.getByText('+2.50%')).toBeInTheDocument();
  });

  it('shows positions list', () => {
    const snapshot = makeSnapshot({
      positions: [
        { symbol: 'AAPL', qty: 10, avg_price: 150, current_price: 155, pnl: 50 },
        { symbol: 'TSLA', qty: 5, avg_price: 200, current_price: 210, pnl: 50 }
      ]
    });
    render(<TradingDashboard snapshot={snapshot} />);

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('TSLA')).toBeInTheDocument();
    expect(screen.getByText('10 shares')).toBeInTheDocument();
    expect(screen.getByText('5 shares')).toBeInTheDocument();
  });
});

describe('BusinessKPIs', () => {
  it('shows empty state when no data', () => {
    render(<BusinessKPIs signals={[]} deals={[]} />);
    expect(screen.getByText('No active signals or deals to display.')).toBeInTheDocument();
  });

  it('renders signal counts by severity', () => {
    const signals = [
      makeSignal({ id: 'sig-1', severity: 'critical' }),
      makeSignal({ id: 'sig-2', severity: 'critical' }),
      makeSignal({ id: 'sig-3', severity: 'urgent' }),
      makeSignal({ id: 'sig-4', severity: 'attention' }),
      makeSignal({ id: 'sig-5', severity: 'info' })
    ];
    render(<BusinessKPIs signals={signals} deals={[]} />);

    // Check counts are rendered (numbers as text)
    const criticalCount = screen.getAllByText('2').find(el =>
      el.closest('.bg-red-500\\/10')
    );
    expect(criticalCount).toBeInTheDocument();

    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.getByText('Attention')).toBeInTheDocument();
    expect(screen.getByText('Info')).toBeInTheDocument();
  });

  it('shows deal counts by status', () => {
    const deals = [
      makeDeal({ id: 'deal-1', status: 'prospect' }),
      makeDeal({ id: 'deal-2', status: 'analyzing' }),
      makeDeal({ id: 'deal-3', status: 'offer' }),
      makeDeal({ id: 'deal-4', status: 'under_contract' })
    ];
    render(<BusinessKPIs signals={[]} deals={deals} />);

    expect(screen.getByText('Prospect')).toBeInTheDocument();
    expect(screen.getByText('Analyzing')).toBeInTheDocument();
    expect(screen.getByText('Offer')).toBeInTheDocument();
    expect(screen.getByText('Under Contract')).toBeInTheDocument();
  });

  it('filters out dismissed signals', () => {
    const signals = [
      makeSignal({ id: 'sig-1', severity: 'critical', is_dismissed: false }),
      makeSignal({ id: 'sig-2', severity: 'critical', is_dismissed: true }),
      makeSignal({ id: 'sig-3', severity: 'urgent', is_dismissed: false })
    ];
    render(<BusinessKPIs signals={signals} deals={[]} />);

    // Should show 1 critical (not 2, since one is dismissed)
    const criticalCount = screen.getAllByText('1').find(el =>
      el.closest('.bg-red-500\\/10')
    );
    expect(criticalCount).toBeInTheDocument();
  });
});

describe('FinancialOverview', () => {
  it('shows empty state when no data', () => {
    render(<FinancialOverview snapshot={null} deals={[]} />);
    expect(screen.getByText('No financial data available.')).toBeInTheDocument();
  });

  it('renders net worth combining portfolio and deals', () => {
    const snapshot = makeSnapshot({ equity: 100000 });
    const deals = [
      makeDeal({ purchase_price: 250000, status: 'analyzing' }),
      makeDeal({ purchase_price: 350000, status: 'offer' })
    ];
    render(<FinancialOverview snapshot={snapshot} deals={deals} />);

    // Net worth: 100k + 250k + 350k = 700k
    expect(screen.getByText('$700,000')).toBeInTheDocument();
    expect(screen.getByText('Total Net Worth')).toBeInTheDocument();
  });

  it('shows deal pipeline by strategy', () => {
    const deals = [
      makeDeal({ id: 'deal-1', strategy: 'flip' }),
      makeDeal({ id: 'deal-2', strategy: 'flip' }),
      makeDeal({ id: 'deal-3', strategy: 'brrrr' }),
      makeDeal({ id: 'deal-4', strategy: 'rental' })
    ];
    render(<FinancialOverview snapshot={null} deals={deals} />);

    expect(screen.getByText('Flip')).toBeInTheDocument();
    expect(screen.getByText('BRRRR')).toBeInTheDocument();
    expect(screen.getByText('Rental')).toBeInTheDocument();
  });

  it('handles no portfolio gracefully', () => {
    const deals = [makeDeal({ purchase_price: 250000 })];
    render(<FinancialOverview snapshot={null} deals={deals} />);

    // Should show net worth from deals only
    expect(screen.getByText('$250,000')).toBeInTheDocument();
    expect(screen.queryByText('Portfolio Allocation')).not.toBeInTheDocument();
  });
});
