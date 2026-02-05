/**
 * Newsletter Detection
 *
 * Identifies newsletter emails via List-ID / List-Unsubscribe headers,
 * aggregates sender stats, and provides bulk operations.
 */

import type { TitanDatabase } from '../db';
import { archiveMessage } from './gmail';
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
  hasOneClick: boolean;
  unsubscribeStatus?: 'pending' | 'attempted' | 'confirmed' | 'failed';
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
        // Use latest unsubscribe status
        if (email.unsubscribe_status) {
          existing.unsubscribeStatus = email.unsubscribe_status;
        }
      }
      if (email.unsubscribe_url && !existing.hasUnsubscribeUrl) {
        existing.hasUnsubscribeUrl = true;
        existing.unsubscribeUrl = email.unsubscribe_url;
      }
      if (email.unsubscribe_mailto && !existing.hasUnsubscribeMailto) {
        existing.hasUnsubscribeMailto = true;
        existing.unsubscribeMailto = email.unsubscribe_mailto;
      }
      if (email.unsubscribe_one_click && !existing.hasOneClick) {
        existing.hasOneClick = true;
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
        hasOneClick: !!email.unsubscribe_one_click,
        unsubscribeStatus: email.unsubscribe_status,
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

export type UnsubscribeMethod = 'one_click' | 'mailto' | 'headless' | 'manual';

export interface UnsubscribeStrategy {
  method: UnsubscribeMethod;
  target: string;
}

/**
 * Build a priority-ordered list of unsubscribe strategies for a sender.
 * Tier 1: RFC 8058 one-click POST (highest reliability)
 * Tier 2: Mailto via Gmail API
 * Tier 3: Headless browser (interactive pages)
 * Tier 4: Manual fallback (open in new tab)
 */
export function buildUnsubscribeStrategy(sender: NewsletterSender): UnsubscribeStrategy[] {
  const strategies: UnsubscribeStrategy[] = [];

  // Tier 1: One-click POST (RFC 8058)
  if (sender.hasOneClick && sender.hasUnsubscribeUrl && sender.unsubscribeUrl) {
    strategies.push({ method: 'one_click', target: sender.unsubscribeUrl });
  }

  // Tier 2: Mailto via Gmail API
  if (sender.hasUnsubscribeMailto && sender.unsubscribeMailto) {
    strategies.push({ method: 'mailto', target: sender.unsubscribeMailto });
  }

  // Tier 3: Headless browser (only available in dev mode)
  if (sender.hasUnsubscribeUrl && sender.unsubscribeUrl) {
    strategies.push({ method: 'headless', target: sender.unsubscribeUrl });
  }

  // Tier 4: Manual fallback (always available if URL exists)
  if (sender.hasUnsubscribeUrl && sender.unsubscribeUrl) {
    strategies.push({ method: 'manual', target: sender.unsubscribeUrl });
  }

  return strategies;
}
