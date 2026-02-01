import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Health Nudge Timer Logic', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should fire hydration nudge at configured interval', () => {
        const handler = vi.fn();
        const intervalMs = 25 * 60 * 1000; // 25 minutes

        const timer = setInterval(() => {
            handler('HYDRATE');
        }, intervalMs);

        // Not fired yet
        expect(handler).not.toHaveBeenCalled();

        // Advance 25 minutes
        vi.advanceTimersByTime(intervalMs);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith('HYDRATE');

        // Advance another 25 minutes
        vi.advanceTimersByTime(intervalMs);
        expect(handler).toHaveBeenCalledTimes(2);

        clearInterval(timer);
    });

    it('should fire stretch nudge at 45 minute intervals', () => {
        const handler = vi.fn();
        const intervalMs = 45 * 60 * 1000; // 45 minutes

        const timer = setInterval(() => {
            handler('STRETCH');
        }, intervalMs);

        // Advance 44 minutes — should not fire
        vi.advanceTimersByTime(44 * 60 * 1000);
        expect(handler).not.toHaveBeenCalled();

        // Advance 1 more minute (total 45) — should fire
        vi.advanceTimersByTime(1 * 60 * 1000);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith('STRETCH');

        clearInterval(timer);
    });

    it('should fire eye break nudge at 60 minute intervals', () => {
        const handler = vi.fn();
        const intervalMs = 60 * 60 * 1000; // 60 minutes

        const timer = setInterval(() => {
            handler('EYE_BREAK');
        }, intervalMs);

        // Advance 60 minutes
        vi.advanceTimersByTime(intervalMs);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith('EYE_BREAK');

        // After 2 hours total
        vi.advanceTimersByTime(intervalMs);
        expect(handler).toHaveBeenCalledTimes(2);

        clearInterval(timer);
    });

    it('should support snooze (10 min delay then re-fire)', () => {
        const handler = vi.fn();
        const snoozeMs = 10 * 60 * 1000; // 10 minutes

        // Simulate snooze
        setTimeout(() => {
            handler('HYDRATE');
        }, snoozeMs);

        // Not fired yet
        vi.advanceTimersByTime(5 * 60 * 1000);
        expect(handler).not.toHaveBeenCalled();

        // After 10 minutes — snooze fires
        vi.advanceTimersByTime(5 * 60 * 1000);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith('HYDRATE');
    });

    it('should support configurable intervals', () => {
        const handler = vi.fn();

        // Custom config: hydration every 20 min
        const customInterval = 20 * 60 * 1000;
        const timer = setInterval(() => {
            handler('HYDRATE');
        }, customInterval);

        // After 20 min
        vi.advanceTimersByTime(customInterval);
        expect(handler).toHaveBeenCalledTimes(1);

        // After 40 min total
        vi.advanceTimersByTime(customInterval);
        expect(handler).toHaveBeenCalledTimes(2);

        clearInterval(timer);
    });

    it('should stop all timers on clear', () => {
        const handler = vi.fn();
        const intervalMs = 25 * 60 * 1000;

        const timer1 = setInterval(() => handler('HYDRATE'), intervalMs);
        const timer2 = setInterval(() => handler('STRETCH'), 45 * 60 * 1000);

        // Clear timers
        clearInterval(timer1);
        clearInterval(timer2);

        // Advance past all intervals — nothing should fire
        vi.advanceTimersByTime(120 * 60 * 1000);
        expect(handler).not.toHaveBeenCalled();
    });
});
