import type { Signal, AnticipationContext, AgingConfig } from '../../types/signals';
import { v4 as uuid } from 'uuid';

export const DEFAULT_AGING_CONFIG: AgingConfig = {
  email_attention_hours: 24,
  email_urgent_hours: 48,
  email_critical_hours: 72,
  task_stale_days: 3,
  lead_response_hours: 4,
};

export function detectAgingSignals(
  context: AnticipationContext,
  config?: AgingConfig
): Signal[] {
  const actualConfig = config ?? DEFAULT_AGING_CONFIG;
  const signals: Signal[] = [];
  const now = Date.now();

  context.emails.forEach((email) => {
    if (email.status === 'replied' || email.status === 'archived') {
      return;
    }

    if (email.tier === 'promotions' || email.tier === 'unsubscribe') {
      return;
    }

    const receivedAt = new Date(email.received_at).getTime();
    const hoursSince = (now - receivedAt) / (1000 * 60 * 60);

    let severity: 'attention' | 'urgent' | 'critical' | null = null;

    if (hoursSince > actualConfig.email_critical_hours) {
      severity = 'critical';
    } else if (hoursSince > actualConfig.email_urgent_hours) {
      severity = 'urgent';
    } else if (hoursSince > actualConfig.email_attention_hours) {
      severity = 'attention';
    }

    if (severity) {
      signals.push({
        id: uuid(),
        type: 'aging_email',
        severity,
        domain: 'business_tech',
        source: 'aging-detector',
        title: `Email from ${email.from} aging (${Math.floor(hoursSince)}h)`,
        context: `Subject: "${email.subject}" — received ${Math.floor(hoursSince)} hours ago`,
        suggested_action: `Review and respond to email from ${email.from}`,
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [email.id],
        created_at: new Date().toISOString(),
      });
    }
  });

  context.tasks.forEach((task) => {
    if (task.status !== 'active') {
      return;
    }

    const createdAt = new Date(task.created_date).getTime();
    const daysSince = (now - createdAt) / 86400000;

    if (daysSince > actualConfig.task_stale_days) {
      signals.push({
        id: uuid(),
        type: 'follow_up_due',
        severity: 'attention',
        domain: 'business_tech',
        source: 'aging-detector',
        title: `Task "${task.title}" has been active for ${Math.floor(daysSince)} days`,
        context: `Created ${Math.floor(daysSince)} days ago with priority ${task.priority}`,
        suggested_action: `Review progress or complete task "${task.title}"`,
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [task.id],
        created_at: new Date().toISOString(),
      });
    }
  });

  return signals;
}
