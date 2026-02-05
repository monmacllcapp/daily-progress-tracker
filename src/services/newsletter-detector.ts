/**
 * Newsletter Detection
 *
 * Identifies newsletter emails via List-ID / List-Unsubscribe headers,
 * aggregates sender stats, and provides bulk operations.
 */

import type { TitanDatabase } from '../db';
import { archiveMessage, sendUnsubscribeEmail } from './gmail';
import { isGoogleConnected } from './google-auth';
import type { Email } from '../types/schema';

export interface NewsletterSender {
  address: string;
  displayName: string;
  emailCount: number;
  lastReceived: string;
  hasUnsubscribeUrl: boolean;
  unsubscribeUrl?: string;
  hasUnsubscribeMailto: boolean;
  unsubscribeMailto?: string;
  hasOneClickUnsubscribe: boolean;
}

/**
 * Find all emails with list_id or unsubscribe headers and mark them as newsletters.
 * Returns count of newly flagged emails.
 */
export async function detectNewsletters(db: TitanDatabase): Promise<number> {
  const docs = await db.emails.find().exec();
  let count = 0;

  for (const doc of docs) {
    const email = doc.toJSON() as Email;
    if (email.is_newsletter) continue;

    if (email.list_id || email.unsubscribe_url || email.unsubscribe_mailto) {
      await doc.patch({ is_newsletter: true, updated_at: new Date().toISOString() });
      count++;
    }
  }

  console.log(`[NewsletterDetector] Flagged ${count} new newsletters`);
  return count;
}

/**
 * Aggregate newsletter emails by sender, sorted by count descending.
 */
export async function getNewsletterSenders(db: TitanDatabase): Promise<NewsletterSender[]> {
  const docs = await db.emails.find({
    selector: { is_newsletter: true }
  }).exec();

  const senderMap = new Map<string, NewsletterSender>();

  for (const doc of docs) {
    const email = doc.toJSON() as Email;
    const addrMatch = email.from.match(/<([^>]+)>/);
    const address = addrMatch ? addrMatch[1] : email.from;
    const displayName = email.from.split('<')[0].trim() || address;

    const existing = senderMap.get(address);
    if (existing) {
      existing.emailCount++;
      if (email.received_at > existing.lastReceived) {
        existing.lastReceived = email.received_at;
      }
      if (email.unsubscribe_url && !existing.hasUnsubscribeUrl) {
        existing.hasUnsubscribeUrl = true;
        existing.unsubscribeUrl = email.unsubscribe_url;
      }
      if (email.unsubscribe_mailto && !existing.hasUnsubscribeMailto) {
        existing.hasUnsubscribeMailto = true;
        existing.unsubscribeMailto = email.unsubscribe_mailto;
      }
      if (email.unsubscribe_one_click && !existing.hasOneClickUnsubscribe) {
        existing.hasOneClickUnsubscribe = true;
      }
    } else {
      senderMap.set(address, {
        address,
        displayName,
        emailCount: 1,
        lastReceived: email.received_at,
        hasUnsubscribeUrl: !!email.unsubscribe_url,
        unsubscribeUrl: email.unsubscribe_url,
        hasUnsubscribeMailto: !!email.unsubscribe_mailto,
        unsubscribeMailto: email.unsubscribe_mailto,
        hasOneClickUnsubscribe: !!email.unsubscribe_one_click,
      });
    }
  }

  return Array.from(senderMap.values()).sort((a, b) => b.emailCount - a.emailCount);
}

/**
 * Archive all emails from a given sender address.
 * Calls Gmail archive if connected, then patches local status.
 * Returns the count of archived emails.
 */
export async function bulkArchiveBySender(db: TitanDatabase, senderAddress: string): Promise<number> {
  const escapedAddr = senderAddress.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const docs = await db.emails.find({
    selector: { from: { $regex: escapedAddr } }
  }).exec();

  let count = 0;
  for (const doc of docs) {
    const email = doc.toJSON() as Email;
    if (email.status === 'archived') continue;

    try {
      if (isGoogleConnected()) {
        await archiveMessage(email.gmail_id);
      }
      await doc.patch({ status: 'archived', updated_at: new Date().toISOString() });
      count++;
    } catch (err) {
      console.error(`[NewsletterDetector] Failed to archive ${email.gmail_id}:`, err);
    }
  }

  return count;
}

/**
 * Pure function: build an unsubscribe action for a sender.
 * Prefers URL over mailto. Returns null if neither is available.
 */
export function buildUnsubscribeAction(
  sender: NewsletterSender
): { type: 'url' | 'mailto'; target: string } | null {
  if (sender.hasUnsubscribeUrl && sender.unsubscribeUrl) {
    return { type: 'url', target: sender.unsubscribeUrl };
  }
  if (sender.hasUnsubscribeMailto && sender.unsubscribeMailto) {
    return { type: 'mailto', target: sender.unsubscribeMailto };
  }
  return null;
}

export type UnsubscribeMethod = 'one-click' | 'mailto' | 'url-opened' | 'none';

export interface UnsubscribeResult {
  method: UnsubscribeMethod;
  success: boolean;
  message: string;
}

/**
 * Attempt to unsubscribe from a newsletter sender using the best available method.
 *
 * Priority:
 *   1. One-click POST (RFC 8058) — fires a no-cors POST; fully automated.
 *   2. Mailto — sends an unsubscribe email via Gmail API; fully automated.
 *   3. URL fallback — opens the unsubscribe link in a new tab for user interaction.
 *
 * For methods 1 & 2, we also open the URL as a backup (some senders require both).
 */
export async function performUnsubscribe(sender: NewsletterSender): Promise<UnsubscribeResult> {
  // 1. Try one-click POST (RFC 8058)
  if (sender.hasOneClickUnsubscribe && sender.hasUnsubscribeUrl && sender.unsubscribeUrl) {
    try {
      await fetch(sender.unsubscribeUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      });
      // Also open the URL so user can verify / handle CAPTCHAs if needed
      window.open(sender.unsubscribeUrl, '_blank', 'noopener,noreferrer');
      return { method: 'one-click', success: true, message: 'One-click unsubscribe sent' };
    } catch (err) {
      console.warn('[Unsubscribe] One-click POST failed, falling through:', err);
    }
  }

  // 2. Try mailto via Gmail API
  if (sender.hasUnsubscribeMailto && sender.unsubscribeMailto && isGoogleConnected()) {
    try {
      await sendUnsubscribeEmail(sender.unsubscribeMailto);
      // Also open URL if available, as some senders require confirmation
      if (sender.hasUnsubscribeUrl && sender.unsubscribeUrl) {
        window.open(sender.unsubscribeUrl, '_blank', 'noopener,noreferrer');
      }
      return { method: 'mailto', success: true, message: 'Unsubscribe email sent' };
    } catch (err) {
      console.warn('[Unsubscribe] Mailto send failed, falling through:', err);
    }
  }

  // 3. Fallback: open URL in new tab
  if (sender.hasUnsubscribeUrl && sender.unsubscribeUrl) {
    window.open(sender.unsubscribeUrl, '_blank', 'noopener,noreferrer');
    return { method: 'url-opened', success: true, message: 'Opened unsubscribe page' };
  }

  return { method: 'none', success: false, message: 'No unsubscribe method available' };
}

// ============================================================
// Sender Protection (localStorage-persisted safelist)
// ============================================================

const PROTECTED_KEY = 'titan_protected_senders_v1';

interface ProtectionStore {
  senders: string[];
  domains: string[];
}

function getProtectionStore(): ProtectionStore {
  try {
    const raw = localStorage.getItem(PROTECTED_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* corrupted — start fresh */ }
  return { senders: [], domains: [] };
}

function saveProtectionStore(store: ProtectionStore): void {
  localStorage.setItem(PROTECTED_KEY, JSON.stringify(store));
}

export function protectSender(address: string): void {
  const store = getProtectionStore();
  const lower = address.toLowerCase();
  if (!store.senders.includes(lower)) {
    store.senders.push(lower);
    saveProtectionStore(store);
  }
}

export function protectDomain(domain: string): void {
  const store = getProtectionStore();
  const lower = domain.toLowerCase();
  if (!store.domains.includes(lower)) {
    store.domains.push(lower);
    saveProtectionStore(store);
  }
}

export function isProtected(address: string): boolean {
  const store = getProtectionStore();
  const lower = address.toLowerCase();
  if (store.senders.includes(lower)) return true;
  const domain = extractDomain(lower);
  return domain ? store.domains.includes(domain) : false;
}

export function getProtectedDomains(): string[] {
  return getProtectionStore().domains;
}

export function unprotectSender(address: string): void {
  const store = getProtectionStore();
  store.senders = store.senders.filter(s => s !== address.toLowerCase());
  saveProtectionStore(store);
}

export function unprotectDomain(domain: string): void {
  const store = getProtectionStore();
  store.domains = store.domains.filter(d => d !== domain.toLowerCase());
  saveProtectionStore(store);
}

// ============================================================
// Service Notification Detection
// ============================================================

/** Domains whose emails are operational notifications, not marketing. */
const NOTIFICATION_DOMAINS = [
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'vercel.com',
  'render.com',
  'netlify.com',
  'heroku.com',
  'sentry.io',
  'linear.app',
  'circleci.com',
  'travis-ci.com',
  'railway.app',
  'fly.io',
  'supabase.com',
  'planetscale.com',
  'datadog.com',
  'pagerduty.com',
  'opsgenie.com',
  'atlassian.net',
  'jira.com',
  'slack.com',
  'notion.so',
  'figma.com',
];

/** Local-part prefixes that indicate automated service emails. */
const NOTIFICATION_PREFIXES = [
  'noreply',
  'no-reply',
  'notifications',
  'notification',
  'notify',
  'alerts',
  'alert',
  'builds',
  'ci',
  'deploy',
  'security',
  'monitoring',
  'system',
  'automated',
  'mailer',
  'postmaster',
];

export function extractDomain(address: string): string {
  const at = address.lastIndexOf('@');
  return at >= 0 ? address.slice(at + 1).toLowerCase() : '';
}

/**
 * Returns true if the sender address looks like a service/ops notification
 * rather than a marketing newsletter.
 */
export function isServiceNotification(address: string): boolean {
  const lower = address.toLowerCase();
  const domain = extractDomain(lower);
  const localPart = lower.split('@')[0];

  // Match known service domains (including subdomains like mail.github.com)
  if (domain && NOTIFICATION_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) {
    return true;
  }

  // Match common automated-sender prefixes
  if (NOTIFICATION_PREFIXES.some(p => localPart === p || localPart.startsWith(p + '+') || localPart.startsWith(p + '-'))) {
    return true;
  }

  return false;
}
