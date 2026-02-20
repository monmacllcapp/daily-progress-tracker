/**
 * Email Snooze
 *
 * Allows users to snooze emails until a specific time.
 * Snoozed emails disappear from the main view and resurface automatically.
 */

import { addHours, nextMonday, set } from 'date-fns';
import type { TitanDatabase } from '../db';

export type SnoozePreset = 'later_today' | 'tomorrow_morning' | 'next_week' | 'custom';

/**
 * Pure function: compute the snooze-until datetime for a given preset.
 * Returns an ISO string.
 */
export function computeSnoozeTime(preset: SnoozePreset, customDate?: Date): string {
  const now = new Date();

  switch (preset) {
    case 'later_today': {
      const hour = now.getHours();
      if (hour >= 18) {
        // Past 6 PM — snooze to tomorrow 9 AM
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return set(tomorrow, { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 }).toISOString();
      }
      return addHours(now, 3).toISOString();
    }

    case 'tomorrow_morning': {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return set(tomorrow, { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 }).toISOString();
    }

    case 'next_week': {
      const monday = nextMonday(now);
      return set(monday, { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 }).toISOString();
    }

    case 'custom': {
      if (!customDate) throw new Error('customDate required for "custom" preset');
      return customDate.toISOString();
    }
  }
}

/**
 * Snooze an email until a computed time, changing its status to 'snoozed'.
 */
export async function snoozeEmail(
  db: TitanDatabase,
  emailId: string,
  preset: SnoozePreset,
  customDate?: Date
): Promise<void> {
  const snoozeUntil = computeSnoozeTime(preset, customDate);
  const doc = await db.emails.findOne(emailId).exec();
  if (!doc) throw new Error(`Email ${emailId} not found`);

  await doc.patch({
    snooze_until: snoozeUntil,
    snoozed_at: new Date().toISOString(),
    status: 'snoozed',
    updated_at: new Date().toISOString(),
  });
}

/**
 * Unsnooze an email — clear snooze fields and set status back to 'unread'.
 */
export async function unsnoozeEmail(db: TitanDatabase, emailId: string): Promise<void> {
  const doc = await db.emails.findOne(emailId).exec();
  if (!doc) throw new Error(`Email ${emailId} not found`);

  await doc.patch({
    snooze_until: undefined,
    snoozed_at: undefined,
    status: 'unread',
    updated_at: new Date().toISOString(),
  });
}

/**
 * Check all snoozed emails and unsnooze any whose snooze_until has passed.
 * Returns the number of emails unsnoozed.
 */
export async function checkSnoozedEmails(db: TitanDatabase): Promise<number> {
  const docs = await db.emails.find({
    selector: { status: 'snoozed' }
  }).exec();

  const now = new Date().toISOString();
  let count = 0;

  for (const doc of docs) {
    const email = doc.toJSON();
    if (email.snooze_until && email.snooze_until <= now) {
      await doc.patch({
        snooze_until: undefined,
        snoozed_at: undefined,
        status: 'unread',
        updated_at: new Date().toISOString(),
      });
      count++;
    }
  }

  if (count > 0) {
    console.log(`[EmailSnooze] Unsnoozed ${count} emails`);
  }
  return count;
}
