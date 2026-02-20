/**
 * Platform Email Detector
 *
 * Identifies developer/platform notification emails and classifies them:
 * - Boilerplate (auto-archive): routine CI runs, dependabot, successful deploys, marketing
 * - Critical (elevate): deploy failures, security alerts, billing issues, downtime
 *
 * Works with the email-agent to auto-categorize platform noise while surfacing real issues.
 */

import type { EmailTier } from '../types/schema';

export interface PlatformEmailResult {
  platform: string;
  category: 'boilerplate' | 'critical' | 'informational';
  suggestedTier: EmailTier;
  autoArchive: boolean;
  reason: string;
}

interface PlatformPattern {
  platform: string;
  senderPatterns: RegExp[];
  rules: Array<{
    subjectPatterns?: RegExp[];
    snippetPatterns?: RegExp[];
    category: 'boilerplate' | 'critical' | 'informational';
    tier: EmailTier;
    autoArchive: boolean;
    reason: string;
  }>;
  defaultCategory: 'boilerplate' | 'critical' | 'informational';
  defaultTier: EmailTier;
  defaultAutoArchive: boolean;
}

const PLATFORM_PATTERNS: PlatformPattern[] = [
  // --- GitHub ---
  {
    platform: 'GitHub',
    senderPatterns: [
      /notifications@github\.com/i,
      /noreply@github\.com/i,
    ],
    rules: [
      // Critical: security alerts, vulnerability advisories
      {
        subjectPatterns: [
          /security\s*alert/i,
          /security\s*advisory/i,
          /vulnerability/i,
          /dependabot.*critical/i,
          /secret\s*scanning/i,
          /code\s*scanning\s*alert/i,
        ],
        category: 'critical',
        tier: 'reply_urgent',
        autoArchive: false,
        reason: 'GitHub security alert — needs immediate review',
      },
      // Critical: CI/CD failures
      {
        subjectPatterns: [
          /workflow.*fail/i,
          /build.*fail/i,
          /checks?\s*fail/i,
          /action.*fail/i,
          /deploy.*fail/i,
        ],
        category: 'critical',
        tier: 'to_review',
        autoArchive: false,
        reason: 'GitHub CI/CD failure — needs attention',
      },
      // Boilerplate: dependabot PRs, routine notifications
      {
        subjectPatterns: [
          /dependabot/i,
          /bump\s+\w+\s+from/i,
          /renovate/i,
        ],
        category: 'boilerplate',
        tier: 'social',
        autoArchive: true,
        reason: 'GitHub dependency update — routine',
      },
      // Boilerplate: successful runs
      {
        subjectPatterns: [
          /workflow.*success/i,
          /build.*pass/i,
          /checks?\s*pass/i,
          /all\s*checks\s*have\s*passed/i,
        ],
        category: 'boilerplate',
        tier: 'social',
        autoArchive: true,
        reason: 'GitHub CI success — no action needed',
      },
      // Boilerplate: stars, forks, watches
      {
        subjectPatterns: [
          /starred/i,
          /forked/i,
          /watching/i,
          /new\s*follower/i,
        ],
        category: 'boilerplate',
        tier: 'social',
        autoArchive: true,
        reason: 'GitHub social notification',
      },
    ],
    defaultCategory: 'informational',
    defaultTier: 'to_review',
    defaultAutoArchive: false,
  },

  // --- Render ---
  {
    platform: 'Render',
    senderPatterns: [
      /noreply@render\.com/i,
      /notifications@render\.com/i,
      /@mail\.render\.com/i,
    ],
    rules: [
      // Critical: deploy failures, service down
      {
        subjectPatterns: [
          /deploy.*fail/i,
          /build.*fail/i,
          /service.*down/i,
          /service.*suspended/i,
          /exceeded.*limit/i,
          /billing/i,
        ],
        snippetPatterns: [
          /deploy.*fail/i,
          /error/i,
          /suspended/i,
        ],
        category: 'critical',
        tier: 'reply_urgent',
        autoArchive: false,
        reason: 'Render deploy/service issue — needs immediate attention',
      },
      // Boilerplate: successful deploys
      {
        subjectPatterns: [
          /deploy.*success/i,
          /deploy.*live/i,
          /deployed\s+successfully/i,
          /build.*success/i,
        ],
        category: 'boilerplate',
        tier: 'social',
        autoArchive: true,
        reason: 'Render successful deploy — routine',
      },
    ],
    defaultCategory: 'informational',
    defaultTier: 'to_review',
    defaultAutoArchive: false,
  },

  // --- Supabase ---
  {
    platform: 'Supabase',
    senderPatterns: [
      /noreply@supabase\.io/i,
      /notifications@supabase\.com/i,
      /@mail\.supabase\.com/i,
      /support@supabase\.io/i,
    ],
    rules: [
      // Critical: database issues, billing, exceeded limits
      {
        subjectPatterns: [
          /database.*error/i,
          /connection.*limit/i,
          /exceeded.*quota/i,
          /billing/i,
          /payment/i,
          /paused/i,
          /project.*paused/i,
          /storage.*limit/i,
        ],
        category: 'critical',
        tier: 'reply_urgent',
        autoArchive: false,
        reason: 'Supabase critical alert — database/billing issue',
      },
      // Boilerplate: weekly digests, feature announcements
      {
        subjectPatterns: [
          /weekly\s*digest/i,
          /what.s\s*new/i,
          /new\s*feature/i,
          /launch\s*week/i,
          /community/i,
          /changelog/i,
        ],
        category: 'boilerplate',
        tier: 'social',
        autoArchive: true,
        reason: 'Supabase marketing/newsletter',
      },
    ],
    defaultCategory: 'informational',
    defaultTier: 'to_review',
    defaultAutoArchive: false,
  },

  // --- Vercel ---
  {
    platform: 'Vercel',
    senderPatterns: [
      /noreply@vercel\.com/i,
      /notifications@vercel\.com/i,
      /@mail\.vercel\.com/i,
    ],
    rules: [
      {
        subjectPatterns: [
          /deploy.*fail/i,
          /build.*fail/i,
          /exceeded.*limit/i,
          /billing/i,
        ],
        category: 'critical',
        tier: 'reply_urgent',
        autoArchive: false,
        reason: 'Vercel deploy/billing issue',
      },
      {
        subjectPatterns: [
          /deploy.*ready/i,
          /deploy.*success/i,
          /preview.*ready/i,
        ],
        category: 'boilerplate',
        tier: 'social',
        autoArchive: true,
        reason: 'Vercel successful deploy — routine',
      },
    ],
    defaultCategory: 'informational',
    defaultTier: 'to_review',
    defaultAutoArchive: false,
  },

  // --- AWS ---
  {
    platform: 'AWS',
    senderPatterns: [
      /no-reply@sns\.amazonaws\.com/i,
      /noreply@amazonaws\.com/i,
      /@notifications\.aws\.amazon\.com/i,
    ],
    rules: [
      {
        subjectPatterns: [
          /alarm.*critical/i,
          /billing\s*alert/i,
          /account.*suspend/i,
          /security/i,
          /unauthorized/i,
          /exceeded.*budget/i,
        ],
        category: 'critical',
        tier: 'reply_urgent',
        autoArchive: false,
        reason: 'AWS critical alert',
      },
      {
        subjectPatterns: [
          /monthly\s*report/i,
          /newsletter/i,
          /what.s\s*new/i,
          /re:invent/i,
        ],
        category: 'boilerplate',
        tier: 'social',
        autoArchive: true,
        reason: 'AWS marketing/newsletter',
      },
    ],
    defaultCategory: 'informational',
    defaultTier: 'important_not_urgent',
    defaultAutoArchive: false,
  },

  // --- Stripe ---
  {
    platform: 'Stripe',
    senderPatterns: [
      /notifications@stripe\.com/i,
      /noreply@stripe\.com/i,
    ],
    rules: [
      {
        subjectPatterns: [
          /payment.*fail/i,
          /charge.*fail/i,
          /dispute/i,
          /fraud/i,
          /payout.*fail/i,
          /account.*restricted/i,
        ],
        category: 'critical',
        tier: 'reply_urgent',
        autoArchive: false,
        reason: 'Stripe payment/billing alert',
      },
      {
        subjectPatterns: [
          /successful.*payment/i,
          /receipt/i,
          /payout.*sent/i,
          /transfer.*complete/i,
        ],
        category: 'boilerplate',
        tier: 'social',
        autoArchive: true,
        reason: 'Stripe routine payment notification',
      },
    ],
    defaultCategory: 'informational',
    defaultTier: 'to_review',
    defaultAutoArchive: false,
  },

  // --- npm / package registries ---
  {
    platform: 'npm',
    senderPatterns: [
      /support@npmjs\.com/i,
      /noreply@npmjs\.com/i,
    ],
    rules: [
      {
        subjectPatterns: [
          /security\s*advisory/i,
          /vulnerability/i,
          /critical/i,
        ],
        category: 'critical',
        tier: 'reply_urgent',
        autoArchive: false,
        reason: 'npm security advisory',
      },
    ],
    defaultCategory: 'boilerplate',
    defaultTier: 'social',
    defaultAutoArchive: true,
  },

  // --- Linear / Jira / Project Management ---
  {
    platform: 'Linear',
    senderPatterns: [
      /notifications@linear\.app/i,
      /noreply@linear\.app/i,
    ],
    rules: [
      {
        subjectPatterns: [
          /assigned\s*to\s*you/i,
          /mentioned\s*you/i,
        ],
        category: 'informational',
        tier: 'to_review',
        autoArchive: false,
        reason: 'Linear task assigned/mentioned — needs review',
      },
    ],
    defaultCategory: 'boilerplate',
    defaultTier: 'social',
    defaultAutoArchive: true,
  },

  // --- Slack ---
  {
    platform: 'Slack',
    senderPatterns: [
      /notification@slack\.com/i,
      /no-reply@slack\.com/i,
    ],
    rules: [
      {
        subjectPatterns: [
          /direct\s*message/i,
          /mentioned\s*you/i,
        ],
        category: 'informational',
        tier: 'reply_needed',
        autoArchive: false,
        reason: 'Slack DM or mention — may need response',
      },
    ],
    defaultCategory: 'boilerplate',
    defaultTier: 'social',
    defaultAutoArchive: true,
  },
];

/**
 * Detect if an email is from a known developer platform.
 * Returns classification result or null if not a platform email.
 */
export function detectPlatformEmail(
  from: string,
  subject: string,
  snippet: string
): PlatformEmailResult | null {
  const lowerFrom = from.toLowerCase();

  for (const platform of PLATFORM_PATTERNS) {
    const senderMatch = platform.senderPatterns.some((p) => p.test(lowerFrom));
    if (!senderMatch) continue;

    // Check specific rules first (most specific wins)
    for (const rule of platform.rules) {
      const subjectMatch = rule.subjectPatterns?.some((p) => p.test(subject)) ?? false;
      const snippetMatch = rule.snippetPatterns?.some((p) => p.test(snippet)) ?? false;

      if (subjectMatch || snippetMatch) {
        return {
          platform: platform.platform,
          category: rule.category,
          suggestedTier: rule.tier,
          autoArchive: rule.autoArchive,
          reason: rule.reason,
        };
      }
    }

    // No specific rule matched — use platform default
    return {
      platform: platform.platform,
      category: platform.defaultCategory,
      suggestedTier: platform.defaultTier,
      autoArchive: platform.defaultAutoArchive,
      reason: `${platform.platform} notification — default handling`,
    };
  }

  return null; // Not a recognized platform email
}
