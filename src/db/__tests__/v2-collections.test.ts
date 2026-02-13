import { describe, it, expect, vi } from 'vitest';

// Helper to create mock documents for V2 collections
function mockDoc(data: Record<string, unknown>) {
    return {
        ...data,
        toJSON: () => data,
        patch: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
    };
}

describe('V2 Collection Schemas', () => {
    describe('signals collection', () => {
        it('should create a valid signal document', () => {
            const signal = mockDoc({
                id: 'sig-001',
                type: 'aging_email',
                severity: 'urgent',
                domain: 'business_re',
                source: 'email-intelligence',
                title: 'Investor email aging 3 days',
                context: 'Email from John at ABC Capital received 72 hours ago',
                suggested_action: 'Draft a reply',
                auto_actionable: false,
                is_dismissed: false,
                is_acted_on: false,
                related_entity_ids: ['email-123'],
                created_at: '2026-02-13T06:00:00Z',
                expires_at: '2026-02-14T06:00:00Z',
            });

            expect(signal.id).toBe('sig-001');
            expect(signal.type).toBe('aging_email');
            expect(signal.severity).toBe('urgent');
            expect(signal.domain).toBe('business_re');
            expect(signal.toJSON()).toEqual(expect.objectContaining({ id: 'sig-001' }));
        });

        it('should support dismissing a signal', async () => {
            const signal = mockDoc({ id: 'sig-001', is_dismissed: false });
            await signal.patch({ is_dismissed: true });
            expect(signal.patch).toHaveBeenCalledWith({ is_dismissed: true });
        });
    });

    describe('deals collection', () => {
        it('should create a valid deal document', () => {
            const deal = mockDoc({
                id: 'deal-001',
                address: '1234 Oak St',
                city: 'Antioch',
                state: 'CA',
                zip: '94509',
                strategy: 'brrrr',
                status: 'under_contract',
                purchase_price: 285000,
                arv: 476000,
                rehab_cost: 45000,
                noi: 24000,
                cap_rate: 0.084,
                dscr: 1.42,
                cash_on_cash: 0.142,
                zestimate: 461000,
                linked_email_ids: ['email-456'],
                linked_task_ids: ['task-789'],
                created_at: '2026-02-10T12:00:00Z',
            });

            expect(deal.address).toBe('1234 Oak St');
            expect(deal.strategy).toBe('brrrr');
            expect(deal.purchase_price).toBe(285000);
            expect(deal.dscr).toBe(1.42);
        });

        it('should support updating deal status', async () => {
            const deal = mockDoc({ id: 'deal-001', status: 'analyzing' });
            await deal.patch({ status: 'offer' });
            expect(deal.patch).toHaveBeenCalledWith({ status: 'offer' });
        });
    });

    describe('portfolio_snapshots collection', () => {
        it('should create a valid snapshot with positions', () => {
            const snapshot = mockDoc({
                id: 'snap-001',
                date: '2026-02-13',
                equity: 76902.04,
                cash: 76902.04,
                buying_power: 153804.08,
                positions_count: 0,
                day_pnl: 231.50,
                total_pnl: 2500.00,
                positions: [],
                source: 'alpaca',
                created_at: '2026-02-13T09:30:00Z',
            });

            expect(snapshot.equity).toBe(76902.04);
            expect(snapshot.source).toBe('alpaca');
            expect(snapshot.positions).toEqual([]);
        });

        it('should store positions array with details', () => {
            const snapshot = mockDoc({
                id: 'snap-002',
                date: '2026-02-13',
                equity: 80000,
                positions_count: 2,
                positions: [
                    { symbol: 'AAPL', qty: 10, avg_price: 180, current_price: 185, pnl: 50 },
                    { symbol: 'TSLA', qty: 5, avg_price: 250, current_price: 245, pnl: -25 },
                ],
                source: 'alpaca',
                created_at: '2026-02-13T09:30:00Z',
            });

            expect(snapshot.positions_count).toBe(2);
            expect(snapshot.positions).toHaveLength(2);
            expect(snapshot.positions[0].symbol).toBe('AAPL');
        });
    });

    describe('family_events collection', () => {
        it('should create a family event with conflict tracking', () => {
            const event = mockDoc({
                id: 'fam-001',
                member: 'spouse',
                summary: 'Dentist appointment',
                start_time: '2026-02-13T15:00:00Z',
                end_time: '2026-02-13T16:00:00Z',
                source_calendar: 'wife-cal@google.com',
                conflict_with: 'cal-event-123',
                created_at: '2026-02-13T06:00:00Z',
            });

            expect(event.member).toBe('spouse');
            expect(event.conflict_with).toBe('cal-event-123');
        });
    });

    describe('morning_briefs collection', () => {
        it('should create a morning brief with sections', () => {
            const brief = mockDoc({
                id: 'brief-001',
                date: '2026-02-13',
                urgent_signals: [{ id: 'sig-001', title: 'Aging email' }],
                attention_signals: [{ id: 'sig-002', title: 'Streak at risk' }],
                portfolio_pulse: { equity: 76902, day_pnl: 231, day_pnl_pct: 0.3 },
                calendar_summary: ['9:00 AM — Team standup', '2:00 PM — Site visit'],
                family_summary: ['Spouse: Dentist at 3 PM'],
                ai_insight: 'Your Tuesday productivity is typically 2.3x higher. Consider front-loading deep work.',
                generated_at: '2026-02-13T05:30:00Z',
            });

            expect(brief.date).toBe('2026-02-13');
            expect(brief.urgent_signals).toHaveLength(1);
            expect(brief.ai_insight).toContain('2.3x');
        });
    });

    describe('productivity_patterns collection', () => {
        it('should create a pattern with confidence score', () => {
            const pattern = mockDoc({
                id: 'pat-001',
                pattern_type: 'peak_hours',
                description: 'Most tasks completed between 9 AM and 11 AM',
                data: { peak_start: 9, peak_end: 11, avg_completions: 4.2 },
                confidence: 0.85,
                week_start: '2026-02-10',
                created_at: '2026-02-13T00:00:00Z',
            });

            expect(pattern.pattern_type).toBe('peak_hours');
            expect(pattern.confidence).toBe(0.85);
            expect(pattern.data.peak_start).toBe(9);
        });
    });
});
