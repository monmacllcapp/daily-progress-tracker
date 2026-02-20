import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MorningBrief } from '../MorningBrief';
import type { MorningBrief as MorningBriefType, Signal } from '../../../types/signals';

// Helper function to create a mock MorningBrief
function makeBrief(overrides: Partial<MorningBriefType> = {}): MorningBriefType {
  return {
    id: 'brief-1',
    date: '2026-02-13',
    urgent_signals: [],
    attention_signals: [],
    calendar_summary: [],
    family_summary: [],
    ai_insight: 'Clear day ahead',
    generated_at: '2026-02-13T06:00:00Z',
    ...overrides,
  };
}

// Helper function to create a mock Signal
function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 'sig-1',
    type: 'aging_email',
    severity: 'urgent',
    domain: 'business_tech',
    source: 'test',
    title: 'Test signal',
    context: 'Test context',
    auto_actionable: false,
    is_dismissed: false,
    is_acted_on: false,
    related_entity_ids: [],
    created_at: '2026-02-13T06:00:00Z',
    ...overrides,
  };
}

describe('MorningBrief', () => {
  it('shows loading state when isLoading is true', () => {
    render(<MorningBrief isLoading={true} />);
    expect(screen.getByText('Generating morning brief...')).toBeInTheDocument();
  });

  it('shows empty state when no brief provided', () => {
    render(<MorningBrief />);
    expect(screen.getByText('No brief available yet.')).toBeInTheDocument();
  });

  it('renders AI insight text', () => {
    const brief = makeBrief({
      ai_insight: 'Ideal conditions for deep work — minimal distractions.',
    });
    render(<MorningBrief brief={brief} />);
    expect(screen.getByText('Ideal conditions for deep work — minimal distractions.')).toBeInTheDocument();
  });

  it('renders urgent signals with count', () => {
    const urgentSignal1 = makeSignal({
      id: 'sig-1',
      title: 'Critical email from client',
      severity: 'urgent',
    });
    const urgentSignal2 = makeSignal({
      id: 'sig-2',
      title: 'Deal deadline tomorrow',
      severity: 'critical',
    });
    const brief = makeBrief({
      urgent_signals: [urgentSignal1, urgentSignal2],
    });
    render(<MorningBrief brief={brief} />);

    expect(screen.getByText(/Urgent \(2\)/)).toBeInTheDocument();
    expect(screen.getByText('Critical email from client')).toBeInTheDocument();
    expect(screen.getByText('Deal deadline tomorrow')).toBeInTheDocument();
  });

  it('renders portfolio pulse with equity and day PnL', () => {
    const brief = makeBrief({
      portfolio_pulse: {
        equity: 125000,
        day_pnl: 1500,
        day_pnl_pct: 1.2,
        positions_count: 8,
        active_deals_count: 3,
        total_deal_value: 450000,
      },
    });
    render(<MorningBrief brief={brief} />);

    expect(screen.getByText(/Portfolio/)).toBeInTheDocument();
    expect(screen.getByText('$125,000')).toBeInTheDocument();
    expect(screen.getByText('+$1,500')).toBeInTheDocument();
  });

  it('renders calendar summary items', () => {
    const brief = makeBrief({
      calendar_summary: [
        '09:00 - Team standup',
        '14:00 - Client presentation',
        '16:00 - Deal walkthrough',
      ],
    });
    render(<MorningBrief brief={brief} />);

    expect(screen.getByText(/Today's Schedule/)).toBeInTheDocument();
    expect(screen.getByText('09:00 - Team standup')).toBeInTheDocument();
    expect(screen.getByText('14:00 - Client presentation')).toBeInTheDocument();
    expect(screen.getByText('16:00 - Deal walkthrough')).toBeInTheDocument();
  });

  it('renders family summary items', () => {
    const brief = makeBrief({
      family_summary: [
        'Sarah: Soccer practice at 15:30',
        'Emma: Doctor appointment at 10:00',
      ],
    });
    render(<MorningBrief brief={brief} />);

    expect(screen.getByText(/Family/)).toBeInTheDocument();
    expect(screen.getByText('Sarah: Soccer practice at 15:30')).toBeInTheDocument();
    expect(screen.getByText('Emma: Doctor appointment at 10:00')).toBeInTheDocument();
  });
});
