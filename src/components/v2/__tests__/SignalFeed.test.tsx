import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SignalFeed } from '../SignalFeed';
import { useSignalStore } from '../../../store/signalStore';
import type { Signal } from '../../../types/signals';

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: `sig-${Math.random().toString(36).slice(2, 8)}`,
    type: 'aging_email',
    severity: 'attention',
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

describe('SignalFeed', () => {
  beforeEach(() => {
    useSignalStore.setState({ signals: [] });
  });

  it('shows empty state when no signals', () => {
    render(<SignalFeed />);
    expect(screen.getByText('No active signals')).toBeInTheDocument();
  });

  it('renders signal cards with titles', () => {
    const signal1 = makeSignal({ id: 'sig-1', title: 'Email needs reply' });
    const signal2 = makeSignal({ id: 'sig-2', title: 'Deadline approaching' });
    useSignalStore.setState({ signals: [signal1, signal2] });

    render(<SignalFeed />);
    expect(screen.getByText('Email needs reply')).toBeInTheDocument();
    expect(screen.getByText('Deadline approaching')).toBeInTheDocument();
  });

  it('shows signal count summary', () => {
    const signals = [
      makeSignal({ id: 'sig-1', severity: 'critical' }),
      makeSignal({ id: 'sig-2', severity: 'urgent' }),
      makeSignal({ id: 'sig-3', severity: 'attention' }),
    ];
    useSignalStore.setState({ signals });

    render(<SignalFeed />);
    expect(screen.getByText('3 active')).toBeInTheDocument();
    expect(screen.getByText('2 urgent')).toBeInTheDocument();
    expect(screen.getByText('1 attention')).toBeInTheDocument();
  });

  it('dismiss button marks signal as dismissed', () => {
    const signal = makeSignal({ id: 'sig-1', title: 'Test signal' });
    useSignalStore.setState({ signals: [signal] });

    render(<SignalFeed />);
    const dismissBtn = screen.getByTitle('Dismiss');
    fireEvent.click(dismissBtn);

    const state = useSignalStore.getState();
    expect(state.signals[0].is_dismissed).toBe(true);
  });

  it('act button marks signal as acted on', () => {
    const signal = makeSignal({ id: 'sig-1', title: 'Test signal' });
    useSignalStore.setState({ signals: [signal] });

    render(<SignalFeed />);
    const actBtn = screen.getByTitle('Mark as acted on');
    fireEvent.click(actBtn);

    const state = useSignalStore.getState();
    expect(state.signals[0].is_acted_on).toBe(true);
  });

  it('sorts signals by severity (critical first)', () => {
    const signals = [
      makeSignal({ id: 'sig-1', severity: 'info', title: 'Info signal' }),
      makeSignal({ id: 'sig-2', severity: 'critical', title: 'Critical signal' }),
      makeSignal({ id: 'sig-3', severity: 'attention', title: 'Attention signal' }),
      makeSignal({ id: 'sig-4', severity: 'urgent', title: 'Urgent signal' }),
    ];
    useSignalStore.setState({ signals });

    render(<SignalFeed />);

    const titles = screen.getAllByText(/signal$/).map(el => el.textContent);
    expect(titles[0]).toBe('Critical signal');
    expect(titles[1]).toBe('Urgent signal');
    expect(titles[2]).toBe('Attention signal');
    expect(titles[3]).toBe('Info signal');
  });
});
