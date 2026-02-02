import { describe, it, expect } from 'vitest';
import { buildUnsubscribeAction } from '../newsletter-detector';
import type { NewsletterSender } from '../newsletter-detector';

function makeSender(overrides: Partial<NewsletterSender> = {}): NewsletterSender {
  return {
    address: 'news@example.com',
    displayName: 'Newsletter',
    emailCount: 5,
    lastReceived: new Date().toISOString(),
    hasUnsubscribeUrl: false,
    hasUnsubscribeMailto: false,
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
