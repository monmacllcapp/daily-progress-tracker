import { describe, it, expect, beforeEach } from 'vitest';
import { useSignalStore } from '../signalStore';
import type { Signal } from '../../types/signals';

function makeSignal(overrides: Partial<Signal> = {}): Signal {
    return {
        id: 'sig-' + Math.random().toString(36).slice(2, 8),
        type: 'aging_email',
        severity: 'attention',
        domain: 'business_re',
        source: 'test',
        title: 'Test signal',
        context: 'Test context',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: new Date().toISOString(),
        ...overrides,
    };
}

describe('signalStore', () => {
    beforeEach(() => {
        useSignalStore.setState({ signals: [] });
    });

    it('starts with empty signals', () => {
        expect(useSignalStore.getState().signals).toEqual([]);
    });

    it('addSignal adds a new signal', () => {
        const signal = makeSignal({ id: 'sig-001' });
        useSignalStore.getState().addSignal(signal);
        expect(useSignalStore.getState().signals).toHaveLength(1);
        expect(useSignalStore.getState().signals[0].id).toBe('sig-001');
    });

    it('addSignal replaces existing signal with same id', () => {
        const signal1 = makeSignal({ id: 'sig-001', title: 'Original' });
        const signal2 = makeSignal({ id: 'sig-001', title: 'Updated' });
        useSignalStore.getState().addSignal(signal1);
        useSignalStore.getState().addSignal(signal2);
        expect(useSignalStore.getState().signals).toHaveLength(1);
        expect(useSignalStore.getState().signals[0].title).toBe('Updated');
    });

    it('addSignals batch adds and deduplicates', () => {
        const existing = makeSignal({ id: 'sig-001' });
        useSignalStore.getState().addSignal(existing);

        const batch = [
            makeSignal({ id: 'sig-001', title: 'Updated' }),
            makeSignal({ id: 'sig-002' }),
        ];
        useSignalStore.getState().addSignals(batch);

        const signals = useSignalStore.getState().signals;
        expect(signals).toHaveLength(2);
        expect(signals.find(s => s.id === 'sig-001')?.title).toBe('Updated');
    });

    it('dismissSignal marks signal as dismissed', () => {
        const signal = makeSignal({ id: 'sig-001', is_dismissed: false });
        useSignalStore.getState().addSignal(signal);
        useSignalStore.getState().dismissSignal('sig-001');
        expect(useSignalStore.getState().signals[0].is_dismissed).toBe(true);
    });

    it('actOnSignal marks signal as acted on', () => {
        const signal = makeSignal({ id: 'sig-001' });
        useSignalStore.getState().addSignal(signal);
        useSignalStore.getState().actOnSignal('sig-001');
        expect(useSignalStore.getState().signals[0].is_acted_on).toBe(true);
    });

    it('activeSignals filters out dismissed signals', () => {
        useSignalStore.getState().addSignals([
            makeSignal({ id: 'sig-001', is_dismissed: false }),
            makeSignal({ id: 'sig-002', is_dismissed: true }),
        ]);
        const active = useSignalStore.getState().activeSignals();
        expect(active).toHaveLength(1);
        expect(active[0].id).toBe('sig-001');
    });

    it('urgentSignals returns only urgent and critical', () => {
        useSignalStore.getState().addSignals([
            makeSignal({ id: 'sig-001', severity: 'info' }),
            makeSignal({ id: 'sig-002', severity: 'urgent' }),
            makeSignal({ id: 'sig-003', severity: 'critical' }),
            makeSignal({ id: 'sig-004', severity: 'attention' }),
        ]);
        const urgent = useSignalStore.getState().urgentSignals();
        expect(urgent).toHaveLength(2);
    });

    it('signalCount returns correct counts', () => {
        useSignalStore.getState().addSignals([
            makeSignal({ severity: 'urgent' }),
            makeSignal({ severity: 'critical' }),
            makeSignal({ severity: 'attention' }),
            makeSignal({ severity: 'info' }),
            makeSignal({ severity: 'info' }),
        ]);
        const counts = useSignalStore.getState().signalCount();
        expect(counts.total).toBe(5);
        expect(counts.urgent).toBe(2);
        expect(counts.attention).toBe(1);
        expect(counts.info).toBe(2);
    });

    it('clearExpired removes all expired signals regardless of severity', () => {
        const pastDate = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
        useSignalStore.getState().addSignals([
            makeSignal({ id: 'sig-001', severity: 'info', expires_at: pastDate }),
            makeSignal({ id: 'sig-002', severity: 'urgent', expires_at: pastDate }),
            makeSignal({ id: 'sig-003', severity: 'attention' }), // no expiry
        ]);
        useSignalStore.getState().clearExpired();
        const remaining = useSignalStore.getState().signals;
        expect(remaining).toHaveLength(1); // Only sig-003 (no expiry) should remain
        expect(remaining.find(s => s.id === 'sig-001')).toBeUndefined();
        expect(remaining.find(s => s.id === 'sig-002')).toBeUndefined(); // Expired urgent is also removed
        expect(remaining.find(s => s.id === 'sig-003')).toBeDefined();
    });
});
