/**
 * Unsubscribe Agent
 *
 * Automated email unsubscribing with a 4-tier fallback strategy:
 *   1. RFC 8058 One-Click POST (via dev server proxy to avoid CORS)
 *   2. Mailto via Gmail API (using googleFetch)
 *   3. Headless Puppeteer agent (via dev server endpoint, dev-only)
 *   4. Manual fallback (open in new tab)
 */

import { googleFetch } from './google-auth';
import { buildUnsubscribeStrategy } from './newsletter-detector';
import type { TitanDatabase } from '../db';
import type { NewsletterSender, UnsubscribeStrategy } from './newsletter-detector';
import type { Email } from '../types/schema';

export interface UnsubscribeRequest {
  sender: NewsletterSender;
  emailId?: string; // specific email ID to update status on
}

export interface UnsubscribeResult {
  success: boolean;
  method: string; // which tier succeeded
  message: string;
  steps?: string[]; // for headless, the steps taken
}

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

/**
 * Parse a mailto: URI into components.
 * Format: mailto:address?subject=xxx&body=yyy
 */
export function parseMailto(mailto: string): { to: string; subject: string; body: string } {
  // Strip leading 'mailto:' prefix (case-insensitive)
  const withoutScheme = mailto.replace(/^mailto:/i, '');

  // Split address from query params
  const questionIndex = withoutScheme.indexOf('?');
  const to = questionIndex >= 0 ? withoutScheme.slice(0, questionIndex) : withoutScheme;
  const queryString = questionIndex >= 0 ? withoutScheme.slice(questionIndex + 1) : '';

  // Parse query params
  const params = new URLSearchParams(queryString);
  const subject = params.get('subject') || '';
  const body = params.get('body') || '';

  return { to: decodeURIComponent(to), subject, body };
}

/**
 * Encode a string to base64url format (RFC 4648 Section 5).
 * Used for Gmail API raw message encoding.
 */
function toBase64Url(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Tier 1: POST to unsubscribe URL via dev server proxy (avoids CORS).
 * Uses /api/unsubscribe/one-click endpoint on the dev server.
 */
async function attemptOneClickPost(url: string): Promise<UnsubscribeResult> {
  const response = await fetch('/api/unsubscribe/one-click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    return {
      success: false,
      method: 'one_click',
      message: `One-click POST failed (${response.status}): ${errorText}`,
    };
  }

  return {
    success: true,
    method: 'one_click',
    message: 'Successfully unsubscribed via RFC 8058 one-click POST',
  };
}

/**
 * Tier 2: Send unsubscribe email via Gmail API.
 */
async function attemptMailtoUnsubscribe(mailto: string): Promise<UnsubscribeResult> {
  const { to, subject, body } = parseMailto(mailto);

  if (!to) {
    return {
      success: false,
      method: 'mailto',
      message: 'Mailto URI missing recipient address',
    };
  }

  // Construct RFC 2822 raw email
  const emailSubject = subject || 'Unsubscribe';
  const emailBody = body || 'Please unsubscribe me from this mailing list.';

  const rawEmail = [
    `To: ${to}`,
    `Subject: ${emailSubject}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    emailBody,
  ].join('\r\n');

  const encodedMessage = toBase64Url(rawEmail);

  const response = await googleFetch(`${GMAIL_API_BASE}/messages/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encodedMessage }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    return {
      success: false,
      method: 'mailto',
      message: `Gmail send failed (${response.status}): ${errorText}`,
    };
  }

  return {
    success: true,
    method: 'mailto',
    message: `Unsubscribe email sent to ${to}`,
  };
}

/**
 * Tier 3: Use headless browser via dev server endpoint.
 * Only available in dev mode.
 */
async function attemptHeadlessUnsubscribe(url: string): Promise<UnsubscribeResult> {
  if (!import.meta.env.DEV) {
    return {
      success: false,
      method: 'headless',
      message: 'Headless unsubscribe is only available in development mode',
    };
  }

  const response = await fetch('/api/unsubscribe/headless', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    return {
      success: false,
      method: 'headless',
      message: `Headless unsubscribe failed (${response.status}): ${errorText}`,
    };
  }

  const data = await response.json() as { success?: boolean; steps?: string[]; message?: string };

  return {
    success: data.success ?? true,
    method: 'headless',
    message: data.message ?? 'Headless unsubscribe completed',
    steps: data.steps,
  };
}

/**
 * Tier 4: Manual fallback — open URL in new tab.
 */
function openManualUnsubscribe(url: string): UnsubscribeResult {
  window.open(url, '_blank');

  return {
    success: true,
    method: 'manual',
    message: 'Opened unsubscribe page in new tab — please complete manually',
  };
}

/**
 * Try all strategies in priority order until one succeeds.
 */
export async function executeUnsubscribe(request: UnsubscribeRequest): Promise<UnsubscribeResult> {
  const strategies: UnsubscribeStrategy[] = buildUnsubscribeStrategy(request.sender);

  for (const strategy of strategies) {
    try {
      let result: UnsubscribeResult;

      switch (strategy.method) {
        case 'one_click':
          result = await attemptOneClickPost(strategy.target);
          break;
        case 'mailto':
          result = await attemptMailtoUnsubscribe(strategy.target);
          break;
        case 'headless':
          if (!import.meta.env.DEV) continue; // skip in production
          result = await attemptHeadlessUnsubscribe(strategy.target);
          break;
        case 'manual':
          result = openManualUnsubscribe(strategy.target);
          break;
        default:
          continue;
      }

      if (result.success) return result;
    } catch (err) {
      console.warn(`[Unsubscribe] ${strategy.method} failed:`, err);
      continue;
    }
  }

  // All strategies failed — try manual as last resort
  if (request.sender.unsubscribeUrl) {
    return openManualUnsubscribe(request.sender.unsubscribeUrl);
  }

  return { success: false, method: 'none', message: 'No unsubscribe method available' };
}

/**
 * Execute unsubscribe and update email status in the database.
 */
export async function unsubscribeAndTrack(
  db: TitanDatabase,
  senderAddress: string,
  request: UnsubscribeRequest,
): Promise<UnsubscribeResult> {
  const now = new Date().toISOString();
  const escapedAddr = senderAddress.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Find all emails from this sender
  const docs = await db.emails.find({
    selector: { from: { $regex: escapedAddr } },
  }).exec();

  // Mark all matching emails as pending unsubscribe
  for (const doc of docs) {
    await doc.patch({
      unsubscribe_status: 'pending' as Email['unsubscribe_status'],
      unsubscribe_attempted_at: now,
      updated_at: now,
    });
  }

  // Execute the unsubscribe cascade
  const result = await executeUnsubscribe(request);

  // Determine the final status based on result
  let finalStatus: Email['unsubscribe_status'];
  if (!result.success) {
    finalStatus = 'failed';
  } else if (result.method === 'headless') {
    // Headless can detect confirmation on the page
    finalStatus = 'confirmed';
  } else if (result.method === 'one_click' || result.method === 'mailto') {
    // One-click and mailto are fire-and-forget — can't verify the sender actually processed it
    finalStatus = 'attempted';
  } else {
    // Manual — user opened the page but we don't know the outcome
    finalStatus = 'attempted';
  }

  // Update all matching emails with the final status
  const updateTime = new Date().toISOString();
  for (const doc of docs) {
    await doc.patch({
      unsubscribe_status: finalStatus,
      updated_at: updateTime,
    });
  }

  return result;
}
