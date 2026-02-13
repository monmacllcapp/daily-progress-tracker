import type { Signal, AnticipationContext, SignalSeverity } from '../../types/signals';

export function synthesizePriorities(signals: Signal[], context: AnticipationContext): Signal[] {
  const deduplicated = deduplicateSignals(signals);

  const scored = deduplicated.map(signal => ({
    signal,
    score: calculateSignalScore(signal, context),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.map(item => item.signal);
}

function calculateSignalScore(signal: Signal, context: AnticipationContext): number {
  let score = scoreSeverity(signal.severity);

  if (signal.related_entity_ids.length > 0) {
    const relatedTask = context.tasks.find(t => t.id === signal.related_entity_ids[0]);
    if (relatedTask?.due_date) {
      const daysUntilDue = Math.floor(
        (new Date(relatedTask.due_date).getTime() - new Date(context.today).getTime()) /
        (1000 * 60 * 60 * 24)
      );
      const timeBoost = Math.max(0, 100 - daysUntilDue * 10);
      score += timeBoost;
    }
  }

  const relatedProject = context.projects.find(p =>
    p.category_id && signal.related_entity_ids.includes(p.category_id)
  );
  if (relatedProject && relatedProject.status === 'active') {
    score += 20;
  }

  return score;
}

export function scoreSeverity(severity: SignalSeverity): number {
  const weights: Record<SignalSeverity, number> = {
    critical: 100,
    urgent: 75,
    attention: 50,
    info: 25,
  };
  return weights[severity];
}

export function deduplicateSignals(signals: Signal[]): Signal[] {
  const groupMap = new Map<string, Signal[]>();

  for (const signal of signals) {
    const key = `${signal.type}:${signal.related_entity_ids[0] || 'none'}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key)!.push(signal);
  }

  const deduplicated: Signal[] = [];

  for (const group of groupMap.values()) {
    if (group.length === 1) {
      deduplicated.push(group[0]);
    } else {
      const severityOrder: Record<SignalSeverity, number> = {
        critical: 0,
        urgent: 1,
        attention: 2,
        info: 3,
      };
      group.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
      deduplicated.push(group[0]);
    }
  }

  return deduplicated;
}
