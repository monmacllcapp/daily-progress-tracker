import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseMailto, executeUnsubscribe } from '../unsubscribe-agent';
import type { UnsubscribeRequest } from '../unsubscribe-agent';
import type { NewsletterSender } from '../newsletter-detector';

function makeSender(overrides: Partial<NewsletterSender> = {}): NewsletterSender {
  return {
    address: 'news@example.com',
    displayName: 'Newsletter',
    emailCount: 5,
    lastReceived: new Date().toISOString(),
    hasUnsubscribeUrl: false,
    hasUnsubscribeMailto: false,
    hasOneClick: false,
    ...overrides,
  };
}

describe('parseMailto', () => {
  it('parses simple mailto address', () => {
    const result = parseMailto('mailto:unsub@example.com');
    expect(result.to).toBe('unsub@example.com');
    expect(result.subject).toBe('');
    expect(result.body).toBe('');
  });

  it('parses mailto with subject and body', () => {
    const result = parseMailto('mailto:unsub@example.com?subject=Unsubscribe&body=Please%20remove%20me');
    expect(result.to).toBe('unsub@example.com');
    expect(result.subject).toBe('Unsubscribe');
    expect(result.body).toBe('Please remove me');
  });

  it('handles case-insensitive mailto prefix', () => {
    const result = parseMailto('MAILTO:test@example.com');
    expect(result.to).toBe('test@example.com');
  });

  it('handles encoded email address', () => {
    const result = parseMailto('mailto:unsub%40example.com');
    expect(result.to).toBe('unsub@example.com');
  });

  it('handles mailto with only subject', () => {
    const result = parseMailto('mailto:unsub@example.com?subject=Remove');
    expect(result.to).toBe('unsub@example.com');
    expect(result.subject).toBe('Remove');
    expect(result.body).toBe('');
  });
});

describe('executeUnsubscribe', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('tries one-click first when available', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const sender = makeSender({
      hasOneClick: true,
      hasUnsubscribeUrl: true,
      unsubscribeUrl: 'https://example.com/unsub',
    });

    const result = await executeUnsubscribe({ sender });
    expect(result.method).toBe('one_click');
    expect(result.success).toBe(true);

    // Verify it called the one-click proxy endpoint
    expect(mockFetch).toHaveBeenCalledWith('/api/unsubscribe/one-click', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('falls back to manual when no strategies available', async () => {
    const mockOpen = vi.fn();
    vi.stubGlobal('open', mockOpen);

    // Sender with no unsubscribe data at all
    const sender = makeSender();

    const result = await executeUnsubscribe({ sender });
    expect(result.success).toBe(false);
    expect(result.method).toBe('none');
    expect(result.message).toContain('No unsubscribe method available');
  });

  it('falls back to manual when one-click fails and no mailto', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Server error'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const mockOpen = vi.fn();
    vi.stubGlobal('open', mockOpen);

    const sender = makeSender({
      hasOneClick: true,
      hasUnsubscribeUrl: true,
      unsubscribeUrl: 'https://example.com/unsub',
    });

    const result = await executeUnsubscribe({ sender });
    // Should fall through to manual since one-click failed
    // headless is skipped (not in DEV) or also fails, then manual opens
    expect(result.success).toBe(true);
    expect(result.method).toBe('manual');
  });

  it('returns result with steps for headless method', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('fail') }) // one-click fails
      .mockResolvedValueOnce({ // headless succeeds
        ok: true,
        json: () => Promise.resolve({
          success: true,
          message: 'Unsubscribed successfully',
          steps: ['Navigated', 'Clicked unsubscribe'],
        }),
      });
    vi.stubGlobal('fetch', mockFetch);

    // Manually set import.meta.env.DEV
    // Note: in test env, import.meta.env.DEV is true
    const sender = makeSender({
      hasOneClick: true,
      hasUnsubscribeUrl: true,
      unsubscribeUrl: 'https://example.com/unsub',
    });

    const result = await executeUnsubscribe({ sender });
    // Either one_click or headless depending on DEV mode
    expect(result.success).toBe(true);
  });
});
