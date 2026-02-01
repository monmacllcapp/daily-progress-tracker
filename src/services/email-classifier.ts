/**
 * AI Email Classifier
 *
 * Uses Gemini to classify emails into 4 tiers:
 * - urgent: time-sensitive, requires immediate action
 * - important: meaningful, needs a thoughtful response
 * - promotions: marketing, newsletters, deals
 * - unsubscribe: spam-like, should be unsubscribed from
 *
 * Also drafts AI responses for urgent/important emails.
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
 * Classify an email into one of 4 tiers using AI.
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

    const prompt = `Classify this email into exactly one tier. Respond with ONLY the tier name, nothing else.

Tiers:
- urgent: Time-sensitive, requires immediate action (bills due, meeting changes, security alerts)
- important: Meaningful correspondence that deserves a thoughtful reply (personal emails, work requests, client messages)
- promotions: Marketing emails, newsletters, deals, social media notifications
- unsubscribe: Persistent unwanted emails, spam-like content the user should unsubscribe from

Email:
From: ${from}
Subject: ${subject}
Preview: ${snippet.slice(0, 200)}

Tier:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim().toLowerCase();

    const validTiers: EmailTier[] = ['urgent', 'important', 'promotions', 'unsubscribe'];
    if (validTiers.includes(text as EmailTier)) {
        return text as EmailTier;
    }

    // Try to extract from response
    for (const tier of validTiers) {
        if (text.includes(tier)) return tier;
    }

    return 'promotions'; // Default
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
    if (labels.includes('CATEGORY_PROMOTIONS')) return 'promotions';
    if (labels.includes('SPAM')) return 'unsubscribe';

    // Urgent patterns
    if (lowerSubject.includes('urgent') ||
        lowerSubject.includes('action required') ||
        lowerSubject.includes('payment due') ||
        lowerSubject.includes('security alert') ||
        lowerSubject.includes('password reset') ||
        labels.includes('IMPORTANT')) {
        return 'urgent';
    }

    // Promotion patterns
    if (lowerSubject.includes('unsubscribe') ||
        lowerSnippet.includes('unsubscribe') ||
        lowerSubject.includes('sale') ||
        lowerSubject.includes('% off') ||
        lowerSubject.includes('deal') ||
        lowerSubject.includes('newsletter') ||
        lowerFrom.includes('noreply') ||
        lowerFrom.includes('no-reply') ||
        lowerFrom.includes('marketing')) {
        return 'promotions';
    }

    // Unsubscribe patterns (persistent junk)
    if (lowerFrom.includes('notifications@') ||
        lowerFrom.includes('digest@') ||
        lowerSubject.includes('daily digest') ||
        lowerSubject.includes('weekly roundup')) {
        return 'unsubscribe';
    }

    // Default to important for personal-looking emails
    return 'important';
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
