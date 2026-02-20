import { v4 as uuid } from 'uuid';
import type { TitanDatabase } from '../../db';
import type { Signal, SignalWeight, SignalType, LifeDomain } from '../../types/signals';

interface FeedbackStats {
  signalType: SignalType;
  domain: LifeDomain;
  totalGenerated: number;
  totalDismissed: number;
  totalActedOn: number;
}

/**
 * Aggregate feedback stats from historical signals.
 * Groups by signal type + domain.
 */
export function aggregateSignalFeedback(signals: Signal[]): Map<string, FeedbackStats> {
  const statsMap = new Map<string, FeedbackStats>();

  for (const signal of signals) {
    const key = `${signal.type}:${signal.domain}`;

    if (!statsMap.has(key)) {
      statsMap.set(key, {
        signalType: signal.type,
        domain: signal.domain,
        totalGenerated: 0,
        totalDismissed: 0,
        totalActedOn: 0,
      });
    }

    const stats = statsMap.get(key)!;
    stats.totalGenerated++;
    if (signal.is_dismissed) stats.totalDismissed++;
    if (signal.is_acted_on) stats.totalActedOn++;
  }

  return statsMap;
}

/**
 * Compute effectiveness score from feedback stats.
 * Returns 0.0 to 1.0.
 * Requires minimum 5 signals for a trusted score (below returns 0.5 neutral).
 */
export function computeEffectivenessScore(stats: FeedbackStats): number {
  const interacted = stats.totalActedOn + stats.totalDismissed;

  // Not enough data to be trusted
  if (interacted < 5) return 0.5;

  // effectiveness = acted / (acted + dismissed)
  return stats.totalActedOn / interacted;
}

/**
 * Convert effectiveness (0.0-1.0) to weight modifier (0.3-2.0).
 * - 0% effectiveness = 0.3x (heavily suppressed, never fully silenced)
 * - 50% effectiveness = 1.15x (near neutral)
 * - 100% effectiveness = 2.0x (heavily boosted)
 */
export function computeWeightModifier(effectiveness: number): number {
  return 0.3 + (effectiveness * 1.7);
}

/**
 * Apply feedback weights to a signal's priority score.
 * Finds matching weight by type+domain and multiplies score.
 * Returns original score if no matching weight found.
 */
export function applyFeedbackWeights(
  score: number,
  signal: Signal,
  weights: SignalWeight[]
): number {
  const matchingWeight = weights.find(
    w => w.signal_type === signal.type && w.domain === signal.domain
  );

  if (!matchingWeight) return score;

  return score * matchingWeight.weight_modifier;
}

/**
 * Persist computed weights to the signal_weights RxDB collection.
 * Upserts by signal_type + domain.
 */
export async function persistWeights(
  db: TitanDatabase,
  weights: SignalWeight[]
): Promise<void> {
  for (const weight of weights) {
    const existing = await db.signal_weights.findOne({
      selector: {
        signal_type: weight.signal_type,
        domain: weight.domain,
      }
    }).exec();

    if (existing) {
      await existing.patch({
        total_generated: weight.total_generated,
        total_dismissed: weight.total_dismissed,
        total_acted_on: weight.total_acted_on,
        effectiveness_score: weight.effectiveness_score,
        weight_modifier: weight.weight_modifier,
        last_updated: weight.last_updated,
      });
    } else {
      await db.signal_weights.insert(weight);
    }
  }
}

/**
 * Main entry point: compute signal weights from historical feedback.
 * Reads all signals, aggregates feedback, computes weights, persists.
 */
export async function computeSignalWeights(db: TitanDatabase): Promise<SignalWeight[]> {
  console.info('[Feedback Loop] Computing signal weights...');

  const signalDocs = await db.signals.find().exec();
  const signals = signalDocs.map(d => d.toJSON() as Signal);

  const feedbackMap = aggregateSignalFeedback(signals);
  const now = new Date().toISOString();

  const weights: SignalWeight[] = [];

  for (const stats of Array.from(feedbackMap.values())) {
    const effectiveness = computeEffectivenessScore(stats);
    const modifier = computeWeightModifier(effectiveness);

    weights.push({
      id: uuid(),
      signal_type: stats.signalType,
      domain: stats.domain,
      total_generated: stats.totalGenerated,
      total_dismissed: stats.totalDismissed,
      total_acted_on: stats.totalActedOn,
      effectiveness_score: effectiveness,
      weight_modifier: modifier,
      last_updated: now,
      created_at: now,
    });
  }

  await persistWeights(db, weights);

  console.info(`[Feedback Loop] Computed ${weights.length} signal weights`);
  return weights;
}
