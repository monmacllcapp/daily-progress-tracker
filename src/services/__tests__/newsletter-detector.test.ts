import { describe, it, expect } from 'vitest';
import { buildUnsubscribeAction, buildUnsubscribeStrategy } from '../newsletter-detector';
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

describe('buildUnsubscribeAction', () => {
  it('prefers URL over mailto when both available', () => {
    const sender = makeSender({
      hasUnsubscribeUrl: true,
      unsubscribeUrl: 'https://example.com/unsub',
      hasUnsubscribeMailto: true,
      unsubscribeMailto: 'mailto:unsub@example.com',
    });
    const action = buildUnsubscribeAction(sender);
    expect(action).toEqual({ type: 'url', target: 'https://example.com/unsub' });
  });

  it('falls back to mailto when no URL', () => {
    const sender = makeSender({
      hasUnsubscribeMailto: true,
      unsubscribeMailto: 'mailto:unsub@example.com',
    });
    const action = buildUnsubscribeAction(sender);
    expect(action).toEqual({ type: 'mailto', target: 'mailto:unsub@example.com' });
  });

  it('returns null when no unsubscribe links available', () => {
    const sender = makeSender();
    const action = buildUnsubscribeAction(sender);
    expect(action).toBeNull();
  });

  it('returns URL type when only URL is available', () => {
    const sender = makeSender({
      hasUnsubscribeUrl: true,
      unsubscribeUrl: 'https://example.com/unsub',
    });
    const action = buildUnsubscribeAction(sender);
    expect(action).toEqual({ type: 'url', target: 'https://example.com/unsub' });
  });
});

describe('buildUnsubscribeStrategy', () => {
  it('returns one_click first when sender has RFC 8058 support', () => {
    const sender = makeSender({
      hasOneClick: true,
      hasUnsubscribeUrl: true,
      unsubscribeUrl: 'https://example.com/unsub',
      hasUnsubscribeMailto: true,
      unsubscribeMailto: 'mailto:unsub@example.com',
    });
    const strategies = buildUnsubscribeStrategy(sender);
    expect(strategies[0]).toEqual({ method: 'one_click', target: 'https://example.com/unsub' });
    expect(strategies.length).toBe(4); // one_click, mailto, headless, manual
  });

  it('returns mailto first when no one-click support', () => {
    const sender = makeSender({
      hasUnsubscribeMailto: true,
      unsubscribeMailto: 'mailto:unsub@example.com',
    });
    const strategies = buildUnsubscribeStrategy(sender);
    expect(strategies[0]).toEqual({ method: 'mailto', target: 'mailto:unsub@example.com' });
    expect(strategies.length).toBe(1); // only mailto
  });

  it('returns headless and manual for URL-only senders', () => {
    const sender = makeSender({
      hasUnsubscribeUrl: true,
      unsubscribeUrl: 'https://example.com/unsub',
    });
    const strategies = buildUnsubscribeStrategy(sender);
    expect(strategies.length).toBe(2); // headless, manual
    expect(strategies[0].method).toBe('headless');
    expect(strategies[1].method).toBe('manual');
  });

  it('returns empty array when no unsubscribe data', () => {
    const sender = makeSender();
    const strategies = buildUnsubscribeStrategy(sender);
    expect(strategies).toEqual([]);
  });

  it('includes all 4 tiers when sender has everything', () => {
    const sender = makeSender({
      hasOneClick: true,
      hasUnsubscribeUrl: true,
      unsubscribeUrl: 'https://example.com/unsub',
      hasUnsubscribeMailto: true,
      unsubscribeMailto: 'mailto:unsub@example.com',
    });
    const strategies = buildUnsubscribeStrategy(sender);
    const methods = strategies.map(s => s.method);
    expect(methods).toEqual(['one_click', 'mailto', 'headless', 'manual']);
  });
});
