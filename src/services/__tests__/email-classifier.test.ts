import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyEmail, draftResponse, isClassifierAvailable, _resetForTesting } from '../email-classifier';

const { mockGenerateContent } = vi.hoisted(() => ({
    mockGenerateContent: vi.fn(),
}));

vi.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: class MockGoogleGenerativeAI {
        constructor() {}
        getGenerativeModel() {
            return { generateContent: mockGenerateContent };
        }
    },
}));

// Test the rule-based email classification (AI classification requires Gemini key)
describe('Email Classifier (Rule-based)', () => {
    beforeEach(() => {
        _resetForTesting(undefined);
    });

    it('should classify Gmail CATEGORY_PROMOTIONS as social', async () => {
        const tier = await classifyEmail(
            'deals@store.com',
            'Big Sale Today!',
            'Get 50% off everything',
            ['CATEGORY_PROMOTIONS']
        );
        expect(tier).toBe('social');
    });

    it('should classify SPAM as unsubscribe', async () => {
        const tier = await classifyEmail(
            'spam@junk.com',
            'You won a prize!',
            'Click here to claim',
            ['SPAM']
        );
        expect(tier).toBe('unsubscribe');
    });

    it('should classify urgent keywords as urgent', async () => {
        const tier = await classifyEmail(
            'bank@example.com',
            'Action Required: Payment Due',
            'Your payment is due today',
            ['INBOX']
        );
        expect(tier).toBe('reply_urgent');
    });

    it('should classify security alerts as urgent', async () => {
        const tier = await classifyEmail(
            'security@google.com',
            'Security alert: New sign-in detected',
            'Someone signed into your account from a new device',
            ['INBOX']
        );
        expect(tier).toBe('reply_urgent');
    });

    it('should classify IMPORTANT label as urgent', async () => {
        const tier = await classifyEmail(
            'boss@work.com',
            'Project update needed',
            'Can you update me on the status?',
            ['INBOX', 'IMPORTANT']
        );
        expect(tier).toBe('reply_urgent');
    });

    it('should classify noreply senders as promotions', async () => {
        const tier = await classifyEmail(
            'noreply@service.com',
            'Your weekly summary',
            'Here is your weekly activity summary',
            ['INBOX']
        );
        expect(tier).toBe('social');
    });

    it('should classify newsletter subjects as promotions', async () => {
        const tier = await classifyEmail(
            'editor@blog.com',
            'Weekly Newsletter: Top Stories',
            'This week in tech...',
            ['INBOX']
        );
        expect(tier).toBe('social');
    });

    it('should classify digest notifications as unsubscribe', async () => {
        const tier = await classifyEmail(
            'notifications@platform.com',
            'Your daily digest',
            '15 new items in your feed',
            ['INBOX']
        );
        expect(tier).toBe('unsubscribe');
    });

    it('should default personal-looking emails to unsure', async () => {
        const tier = await classifyEmail(
            'john.doe@gmail.com',
            'Hey, about our meeting',
            'I wanted to follow up on our conversation yesterday',
            ['INBOX']
        );
        expect(tier).toBe('unsure');
    });

    it('should report classifier availability based on API key', () => {
        // No key override set, module-level key is undefined in test env
        expect(isClassifierAvailable()).toBe(false);
    });

    it('should classify "urgent" in subject as urgent', async () => {
        const tier = await classifyEmail(
            'admin@company.com',
            'URGENT: System downtime',
            'Please take note of planned downtime',
            ['INBOX']
        );
        expect(tier).toBe('reply_urgent');
    });

    it('should classify password reset emails as urgent', async () => {
        const tier = await classifyEmail(
            'accounts@service.com',
            'Password reset request',
            'You requested a password reset for your account',
            ['INBOX']
        );
        expect(tier).toBe('reply_urgent');
    });

    it('should classify "% off" in subject as promotions', async () => {
        const tier = await classifyEmail(
            'sales@shop.com',
            'Get 30% off this weekend only',
            'Hurry, limited time offer',
            ['INBOX']
        );
        expect(tier).toBe('social');
    });

    it('should classify "deal" in subject as promotions', async () => {
        const tier = await classifyEmail(
            'promos@retailer.com',
            'Exclusive deal for you',
            'Check out our latest products',
            ['INBOX']
        );
        expect(tier).toBe('social');
    });

    it('should classify "sale" in subject as promotions', async () => {
        const tier = await classifyEmail(
            'info@store.com',
            'Annual sale starts now',
            'Save big on all categories',
            ['INBOX']
        );
        expect(tier).toBe('social');
    });

    it('should classify "unsubscribe" in snippet as promotions', async () => {
        const tier = await classifyEmail(
            'team@startup.com',
            'Check out our product update',
            'Click here to unsubscribe from this list',
            ['INBOX']
        );
        expect(tier).toBe('social');
    });

    it('should classify no-reply senders as promotions', async () => {
        const tier = await classifyEmail(
            'no-reply@platform.com',
            'Your activity update',
            'See what happened this week',
            ['INBOX']
        );
        expect(tier).toBe('social');
    });

    it('should classify marketing@ senders as promotions', async () => {
        const tier = await classifyEmail(
            'marketing@brand.com',
            'New collection announcement',
            'Discover our latest styles',
            ['INBOX']
        );
        expect(tier).toBe('social');
    });

    it('should classify digest@ senders as unsubscribe', async () => {
        const tier = await classifyEmail(
            'digest@social.com',
            'Your connections update',
            'See what your network is up to',
            ['INBOX']
        );
        expect(tier).toBe('unsubscribe');
    });

    it('should classify "weekly roundup" in subject as unsubscribe', async () => {
        const tier = await classifyEmail(
            'team@news.com',
            'Your weekly roundup for January',
            'Top stories from this week',
            ['INBOX']
        );
        expect(tier).toBe('unsubscribe');
    });

    it('should prioritize Gmail labels over keyword rules (CATEGORY_PROMOTIONS first)', async () => {
        const tier = await classifyEmail(
            'marketing@brand.com',
            'Urgent: Flash sale ending soon',
            'Buy now or miss out',
            ['CATEGORY_PROMOTIONS']
        );
        expect(tier).toBe('social');
    });

    it('should prioritize SPAM label over keyword rules', async () => {
        const tier = await classifyEmail(
            'unknown@domain.com',
            'Action Required: Verify your account',
            'Click to verify',
            ['SPAM']
        );
        expect(tier).toBe('unsubscribe');
    });
});

describe('Email Classifier (AI-powered)', () => {
    beforeEach(() => {
        mockGenerateContent.mockReset();
        _resetForTesting('test-key');
    });

    it('should classify email as urgent via AI', async () => {
        mockGenerateContent.mockResolvedValue({
            response: { text: () => 'reply_urgent' },
        });

        const tier = await classifyEmail(
            'boss@company.com',
            'Meeting moved to today',
            'Our 3pm meeting has been moved to 10am today',
            ['INBOX']
        );

        expect(tier).toBe('reply_urgent');
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('should classify email as to_review via AI', async () => {
        mockGenerateContent.mockResolvedValue({
            response: { text: () => 'to_review' },
        });

        const tier = await classifyEmail(
            'colleague@company.com',
            'Feedback on proposal',
            'I reviewed your proposal and have some thoughts',
            ['INBOX']
        );

        expect(tier).toBe('to_review');
    });

    it('should classify email as social via AI', async () => {
        mockGenerateContent.mockResolvedValue({
            response: { text: () => 'social' },
        });

        const tier = await classifyEmail(
            'deals@retailer.com',
            'New arrivals just for you',
            'Check out what is new this season',
            ['INBOX']
        );

        expect(tier).toBe('social');
    });

    it('should classify email as unsubscribe via AI', async () => {
        mockGenerateContent.mockResolvedValue({
            response: { text: () => 'unsubscribe' },
        });

        const tier = await classifyEmail(
            'spam@sketchy.com',
            'You have been selected',
            'Claim your prize now',
            ['INBOX']
        );

        expect(tier).toBe('unsubscribe');
    });

    it('should extract tier from verbose AI response', async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () => 'I would classify this as reply_urgent because it requires immediate attention.',
            },
        });

        const tier = await classifyEmail(
            'alert@service.com',
            'Account locked',
            'Your account has been locked due to suspicious activity',
            ['INBOX']
        );

        expect(tier).toBe('reply_urgent');
    });

    it('should default to unsure when AI returns unrecognized tier', async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () => 'I cannot determine the category of this email.',
            },
        });

        const tier = await classifyEmail(
            'test@example.com',
            'Hello',
            'Just testing',
            ['INBOX']
        );

        expect(tier).toBe('unsure');
    });

    it('should fall back to rule-based classification when AI throws error', async () => {
        mockGenerateContent.mockRejectedValue(new Error('API quota exceeded'));

        // This email has urgent keywords, so rule-based should classify as urgent
        const tier = await classifyEmail(
            'bank@example.com',
            'Action Required: Verify payment',
            'Please verify your recent payment',
            ['INBOX']
        );

        expect(tier).toBe('reply_urgent');
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('should fall back to rule-based for personal email when AI fails', async () => {
        mockGenerateContent.mockRejectedValue(new Error('Network error'));

        const tier = await classifyEmail(
            'friend@gmail.com',
            'Dinner plans',
            'Are we still on for Friday?',
            ['INBOX']
        );

        // No urgent/promo/unsub keywords, personal sender with no question in subject, so should default to unsure
        expect(tier).toBe('unsure');
    });
});

describe('Email Classifier — New tiers', () => {
    beforeEach(() => {
        _resetForTesting(undefined);
    });

    it('should classify CATEGORY_SOCIAL as social', async () => {
        const tier = await classifyEmail(
            'updates@facebook.com',
            'You have new notifications',
            'See what your friends are up to',
            ['CATEGORY_SOCIAL']
        );
        expect(tier).toBe('social');
    });

    it('should classify personal email with question as reply_needed', async () => {
        const tier = await classifyEmail(
            'colleague@company.com',
            'Quick question about the project?',
            'I was wondering about the timeline',
            ['INBOX']
        );
        expect(tier).toBe('reply_needed');
    });

    it('should classify personal reply thread as reply_needed', async () => {
        const tier = await classifyEmail(
            'friend@gmail.com',
            'Re: Weekend plans',
            'Sounds good, see you then',
            ['INBOX']
        );
        expect(tier).toBe('reply_needed');
    });

    it('should classify ambiguous personal email as unsure', async () => {
        const tier = await classifyEmail(
            'someone@company.com',
            'FYI',
            'Just wanted to let you know about this',
            ['INBOX']
        );
        expect(tier).toBe('unsure');
    });
});

describe('Email Classifier — draftResponse', () => {
    beforeEach(() => {
        mockGenerateContent.mockReset();
    });

    it('should return null when no API key is set', async () => {
        _resetForTesting(undefined);
        const result = await draftResponse(
            'sender@example.com',
            'Meeting request',
            'Can we schedule a meeting next week?'
        );
        expect(result).toBeNull();
    });

    it('should return AI-generated draft when API key is set', async () => {
        _resetForTesting('test-key');
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () => 'Thanks for reaching out. I am available next Tuesday or Wednesday afternoon. Let me know what works for you.',
            },
        });

        const result = await draftResponse(
            'client@company.com',
            'Meeting request',
            'Can we schedule a meeting next week?'
        );

        expect(result).not.toBeNull();
        expect(result).toContain('available next Tuesday');
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('should include user context in the prompt when provided', async () => {
        _resetForTesting('test-key');
        mockGenerateContent.mockResolvedValue({
            response: { text: () => 'I am free next week. Let me know.' },
        });

        const result = await draftResponse(
            'colleague@work.com',
            'Project review',
            'Can you review the proposal?',
            'I am busy this week but free next week'
        );

        expect(result).not.toBeNull();

        // Verify the prompt included user context
        const callArg = mockGenerateContent.mock.calls[0][0];
        expect(callArg).toContain('I am busy this week but free next week');
    });

    it('should return null when AI draft generation fails', async () => {
        _resetForTesting('test-key');
        mockGenerateContent.mockRejectedValue(new Error('Service unavailable'));

        const result = await draftResponse(
            'someone@example.com',
            'Quick question',
            'What time does the event start?'
        );

        expect(result).toBeNull();
    });

    it('should trim whitespace from AI draft response', async () => {
        _resetForTesting('test-key');
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () => '  Thank you for the update. I will review it shortly.  \n',
            },
        });

        const result = await draftResponse(
            'team@company.com',
            'Status update',
            'Here is the latest update on the project'
        );

        expect(result).toBe('Thank you for the update. I will review it shortly.');
    });
});
