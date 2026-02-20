import { useEffect } from 'react';
import { checkSnoozedEmails } from '../services/email-snooze';
import type { TitanDatabase } from '../db';

const INTERVAL_MS = 60_000;

/**
 * useSnoozedEmailTimer — Polls for snoozed emails that need to be unsnoozed.
 * Runs immediately on mount, then every 60 seconds.
 */
export function useSnoozedEmailTimer(db: TitanDatabase | null): void {
  useEffect(() => {
    if (!db) return;

    checkSnoozedEmails(db).catch(err => {
      console.error('[EmailSnooze] Initial check failed:', err);
    });

    const id = setInterval(() => {
      checkSnoozedEmails(db).catch(err => {
        console.error('[EmailSnooze] Interval check failed:', err);
      });
    }, INTERVAL_MS);

    return () => clearInterval(id);
  }, [db]);
}
