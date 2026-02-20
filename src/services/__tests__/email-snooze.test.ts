import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeSnoozeTime } from '../email-snooze';

describe('computeSnoozeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('later_today adds approximately 3 hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T10:00:00'));

    const result = new Date(computeSnoozeTime('later_today'));
    const expected = new Date('2025-06-15T13:00:00');
    // Within 1 minute of 3h from now
    expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(60000);
  });

  it('later_today past 6PM snoozes to next day 9AM', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T19:00:00'));

    const result = new Date(computeSnoozeTime('later_today'));
    expect(result.getDate()).toBe(16);
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(0);
  });

  it('tomorrow_morning returns next day 9AM', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T14:30:00'));

    const result = new Date(computeSnoozeTime('tomorrow_morning'));
    expect(result.getDate()).toBe(16);
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(0);
  });

  it('next_week returns next Monday 9AM', () => {
    vi.useFakeTimers();
    // Wednesday June 18, 2025
    vi.setSystemTime(new Date('2025-06-18T14:30:00'));

    const result = new Date(computeSnoozeTime('next_week'));
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(0);
    // Should be June 23
    expect(result.getDate()).toBe(23);
  });
});
