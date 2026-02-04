/**
 * AI Email Classifier
 *
 * Uses Gemini to classify emails into 7 tiers:
 * - reply_urgent: time-sensitive, requires immediate reply TODAY
 * - reply_needed: deserves a reply but not time-critical
 * - to_review: needs to be read and a decision made
 * - important_not_urgent: meaningful but can wait
 * - unsure: unclear what to do with this
 * - unsubscribe: persistent junk, should unsubscribe
 * - social: social media notifications, community updates
 *
 * Also drafts AI responses for reply-urgent emails.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { EmailTier } from '../types/schema';

const GEMINI_KEY = typeof import.meta !== 'undefined'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Vite import.meta type narrowing
    ? (import.meta as any).env?.VITE_GEMINI_API_KEY
    : undefined;

let genAI: GoogleGenerativeAI | null = null;
let keyOverride: string | undefined;

function getGenAI(): GoogleGenerativeAI | null {
    const key = keyOverride ?? GEMINI_KEY;
    if (!key) return null;
    if (!genAI) genAI = new GoogleGenerativeAI(key);
    return genAI;
}

export function isClassifierAvailable(): boolean {
    return !!(keyOverride ?? GEMINI_KEY);
}

/**
 * Classify an email into one of 7 tiers using AI.
 * Falls back to rule-based classification if AI is unavailable.
 */
export async function classifyEmail(
    from: string,
    subject: string,
    snippet: string,
    labels: string[]
): Promise<EmailTier> {
    const ai = getGenAI();

    if (ai) {
        try {
            return await classifyWithAI(ai, from, subject, snippet);
        } catch (err) {
            console.warn('[EmailClassifier] AI classification failed, using rules:', err);
        }
    }

    return classifyWithRules(from, subject, snippet, labels);
}

async function classifyWithAI(
    ai: GoogleGenerativeAI,
    from: string,
    subject: string,
    snippet: string
): Promise<EmailTier> {
    const model = ai.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `Classify this email into exactly one category. Respond with ONLY the category name, nothing else.

Categories:
- reply_urgent: Requires a reply TODAY. Time-sensitive requests, meetings, bills due, clients waiting, security alerts, anything where delay = consequences.
- reply_needed: Deserves a reply but not time-critical. Casual asks, follow-ups, networking, informational requests.
- to_review: Needs to be read and a decision made. Reports, updates, documents to review, newsletters worth reading.
- important_not_urgent: Meaningful but can wait. Industry articles, long reads, reference material, FYI messages.
- unsure: Unclear what to do with this. Ambiguous or hard to classify.
- unsubscribe: Persistent junk, should unsubscribe. Daily digests from services you don't use, repeated marketing.
- social: Social media notifications, community updates, event invites, app alerts.

Email:
From: ${from}
Subject: ${subject}
Preview: ${snippet.slice(0, 200)}

Category:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim().toLowerCase();

    const validTiers: EmailTier[] = [
        'reply_urgent', 'reply_needed', 'to_review',
        'important_not_urgent', 'unsure', 'unsubscribe', 'social'
    ];

    if (validTiers.includes(text as EmailTier)) {
        return text as EmailTier;
    }

    // Try to extract from verbose response
    for (const tier of validTiers) {
        if (text.includes(tier)) return tier;
    }

    return 'unsure'; // Default for unrecognized AI response
}

function classifyWithRules(
    from: string,
    subject: string,
    snippet: string,
    labels: string[]
): EmailTier {
    const lowerSubject = subject.toLowerCase();
    const lowerFrom = from.toLowerCase();
    const lowerSnippet = snippet.toLowerCase();

    // Gmail's own labels help
    if (labels.includes('CATEGORY_SOCIAL')) return 'social';
    if (labels.includes('CATEGORY_PROMOTIONS')) return 'social';
    if (labels.includes('SPAM')) return 'unsubscribe';

    // Urgency patterns → reply_urgent
    if (lowerSubject.includes('urgent') ||
        lowerSubject.includes('action required') ||
        lowerSubject.includes('payment due') ||
        lowerSubject.includes('security alert') ||
        lowerSubject.includes('password reset') ||
        labels.includes('IMPORTANT')) {
        return 'reply_urgent';
    }

    // Unsubscribe patterns
    if (lowerFrom.includes('notifications@') ||
        lowerFrom.includes('digest@') ||
        lowerSubject.includes('daily digest') ||
        lowerSubject.includes('weekly roundup')) {
        return 'unsubscribe';
    }

    // Newsletter / noreply / marketing patterns → social
    if (lowerSubject.includes('sale') ||
        lowerSubject.includes('% off') ||
        lowerSubject.includes('deal') ||
        lowerSubject.includes('newsletter') ||
        lowerFrom.includes('noreply') ||
        lowerFrom.includes('no-reply') ||
        lowerFrom.includes('marketing')) {
        return 'social';
    }

    // Unsubscribe mention in snippet → social
    if (lowerSubject.includes('unsubscribe') ||
        lowerSnippet.includes('unsubscribe')) {
        return 'social';
    }

    // Personal email patterns → reply_needed
    // Named sender + question in subject or Re: thread
    const hasQuestion = lowerSubject.includes('?');
    const isReply = lowerSubject.startsWith('re:');
    const hasPersonalSender = !lowerFrom.includes('noreply') &&
        !lowerFrom.includes('no-reply') &&
        !lowerFrom.includes('notifications@') &&
        !lowerFrom.includes('marketing') &&
        !lowerFrom.includes('digest@');

    if (hasPersonalSender && (hasQuestion || isReply)) {
        return 'reply_needed';
    }

    // Default for ambiguous → unsure (force explicit triage)
    if (hasPersonalSender) return 'unsure';

    return 'unsure';
}

/** @internal Reset cached AI instance and optionally override the key (for testing). */
export function _resetForTesting(key?: string): void {
    genAI = null;
    keyOverride = key;
}

/**
 * Draft an AI response for an email.
 */
export async function draftResponse(
    from: string,
    subject: string,
    snippet: string,
    userContext?: string
): Promise<string | null> {
    const ai = getGenAI();
    if (!ai) return null;

    try {
        const model = ai.getGenerativeModel({ model: 'gemini-pro' });

        const prompt = `Draft a brief, professional email reply. Be concise and friendly. Do NOT include subject line or "Dear/Hi" greeting — start with the content directly.

Original email:
From: ${from}
Subject: ${subject}
Content: ${snippet}

${userContext ? `Additional context from user: ${userContext}` : ''}

Reply:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (err) {
        console.error('[EmailClassifier] Draft generation failed:', err);
        return null;
    }
}
