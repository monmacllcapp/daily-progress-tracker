import type { TitanDatabase } from '../db';

/**
 * Data Retention Service — cleans up expired and old data
 * Runs periodically to prevent unbounded data growth
 */

/** Remove signals that are both expired AND dismissed */
export async function purgeExpiredSignals(db: TitanDatabase): Promise<number> {
  const now = new Date().toISOString();
  const expired = await db.signals.find({
    selector: {
      expires_at: { $lt: now },
      is_dismissed: true
    }
  }).exec();

  for (const signal of expired) {
    await signal.remove();
  }
  return expired.length;
}

/** Remove analytics events older than 90 days */
export async function purgeOldAnalytics(db: TitanDatabase): Promise<number> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const old = await db.analytics_events.find({
    selector: {
      timestamp: { $lt: ninetyDaysAgo }
    }
  }).exec();

  for (const event of old) {
    await event.remove();
  }
  return old.length;
}

/** Remove old signal_weights that haven't been updated in 30 days */
export async function purgeStaleWeights(db: TitanDatabase): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const stale = await db.signal_weights.find({
    selector: {
      last_updated: { $lt: thirtyDaysAgo }
    }
  }).exec();

  for (const weight of stale) {
    await weight.remove();
  }
  return stale.length;
}

/** Run all retention tasks. Returns summary. */
export async function runRetentionCycle(db: TitanDatabase): Promise<{
  expiredSignals: number;
  oldAnalytics: number;
  staleWeights: number;
}> {
  const [expiredSignals, oldAnalytics, staleWeights] = await Promise.all([
    purgeExpiredSignals(db),
    purgeOldAnalytics(db),
    purgeStaleWeights(db),
  ]);

  if (expiredSignals + oldAnalytics + staleWeights > 0) {
    console.log(`[DataRetention] Cleaned: ${expiredSignals} expired signals, ${oldAnalytics} old analytics, ${staleWeights} stale weights`);
  }

  return { expiredSignals, oldAnalytics, staleWeights };
}
