import type { Signal, AnticipationContext, LifeDomain } from '../../types/signals';
import { v4 as uuid } from 'uuid';

export function detectStreakSignals(context: AnticipationContext): Signal[] {
  const signals: Signal[] = [];
  const today = new Date(context.today);

  for (const category of context.categories) {
    if (category.streak_count <= 0 || !category.last_active_date) {
      continue;
    }

    const lastActive = new Date(category.last_active_date);
    const daysSince = Math.floor((today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));

    let severity: 'info' | 'attention' | 'urgent' | 'critical' | null = null;
    let contextMessage = '';

    if (daysSince === 1) {
      if (category.streak_count >= 7) {
        severity = 'urgent';
        contextMessage = `Your ${category.name} streak of ${category.streak_count} days is still alive but needs action today to continue.`;
      } else {
        severity = 'attention';
        contextMessage = `Your ${category.name} streak of ${category.streak_count} days was last active yesterday. Complete a task today to keep it going.`;
      }
    } else if (daysSince >= 2) {
      severity = 'critical';
      contextMessage = `Your ${category.name} streak of ${category.streak_count} days has been broken. Last activity was ${daysSince} days ago.`;
    }

    if (severity) {
      signals.push({
        id: uuid(),
        type: 'streak_at_risk',
        severity,
        domain: mapCategoryToDomain(category.name),
        source: 'streak-guardian',
        title: `${category.name} streak at risk (${category.streak_count} days)`,
        context: contextMessage,
        suggested_action: `Complete a ${category.name} task today to maintain your streak`,
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [category.id],
        created_at: new Date().toISOString(),
      });
    }
  }

  return signals;
}

export function mapCategoryToDomain(categoryName: string): LifeDomain {
  const lower = categoryName.toLowerCase();

  if (lower.includes('health') || lower.includes('fitness')) {
    return 'health_fitness';
  }
  if (lower.includes('wealth') || lower.includes('finance') || lower.includes('money')) {
    return 'finance';
  }
  if (lower.includes('family') || lower.includes('relationship')) {
    return 'family';
  }
  if (lower.includes('business') || lower.includes('work') || lower.includes('career')) {
    return 'business_tech';
  }
  if (lower.includes('creative') || lower.includes('art')) {
    return 'creative';
  }
  if (lower.includes('spiritual') || lower.includes('mindfulness')) {
    return 'spiritual';
  }

  return 'personal_growth';
}
