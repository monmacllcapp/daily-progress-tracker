import { describe, it, expect } from 'vitest';
import { calculateEmailScore } from '../email-scorer';
import type { Email } from '../../types/schema';
import type { SenderStats } from '../email-scorer';

function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: 'test-1',
    gmail_id: 'gm-1',
    from: 'Alice <alice@example.com>',
    subject: 'Hello',
    snippet: 'Some text',
    tier: 'to_review',
    status: 'unread',
    received_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('calculateEmailScore', () => {
  it('scores high for a reputable sender with urgent tier', () => {
    const email = makeEmail({ tier: 'reply_urgent', subject: 'Urgent: deadline approaching?' });
    const stats: SenderStats = { totalEmails: 10, repliedCount: 8, archivedCount: 1 };
    const score = calculateEmailScore(email, stats);
    // 24 (sender: 80% reply ratio * 30) + 10 (content: urgency + question) + 0 (unread) + 30 (urgent tier) = 64
    expect(score).toBeGreaterThanOrEqual(55);
  });

  it('scores low for promotional noreply sender', () => {
    const email = makeEmail({
      from: 'noreply@store.com',
      subject: '50% OFF SALE',
      snippet: 'Shop now',
      tier: 'social',
    });
    const stats: SenderStats = { totalEmails: 50, repliedCount: 0, archivedCount: 45 };
    const score = calculateEmailScore(email, stats);
    expect(score).toBeLessThan(20);
  });

  it('boosts score for question marks in subject', () => {
    const base = makeEmail({ subject: 'Meeting notes', tier: 'to_review' });
    const withQuestion = makeEmail({ subject: 'Can we meet tomorrow?', tier: 'to_review' });
    const stats: SenderStats = { totalEmails: 5, repliedCount: 0, archivedCount: 0 };

    const baseScore = calculateEmailScore(base, stats);
    const questionScore = calculateEmailScore(withQuestion, stats);
    expect(questionScore).toBeGreaterThan(baseScore);
  });

  it('clamps score to 0-100 range', () => {
    // Max possible input
    const email = makeEmail({
      tier: 'reply_urgent',
      subject: 'Re: Re: Re: Urgent action required??',
      status: 'replied',
    });
    const stats: SenderStats = { totalEmails: 1, repliedCount: 1, archivedCount: 0 };
    const score = calculateEmailScore(email, stats);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('boosts score for unreplied reply-needed emails', () => {
    const email = makeEmail({
      tier: 'reply_needed',
      reply_checked_at: new Date().toISOString(),
      status: 'unread',
    });
    const stats: SenderStats = { totalEmails: 5, repliedCount: 0, archivedCount: 0 };
    const score = calculateEmailScore(email, stats);
    // Should include the +10 unreplied boost for reply_needed
    expect(score).toBeGreaterThanOrEqual(32); // 22 tier + 10 unreplied
  });
});
