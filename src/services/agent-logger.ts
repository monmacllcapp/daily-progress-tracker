/**
 * Agent Activity Logger
 *
 * Reusable utility for ALL agents to log their work to the Agent Operations
 * dashboard activity feed. Every AI call, calendar action, briefing, and error
 * gets tracked for performance monitoring and troubleshooting.
 */

import { useAgentsStore, type ActivityEntry } from '../store/agentsStore';
import { AGENTS } from './agent-tracker';

export function logAgentActivity(
  agentId: string,
  type: ActivityEntry['type'],
  message: string,
  taskId?: string,
  taskTitle?: string
) {
  try {
    const agent = AGENTS.find((a) => a.id === agentId);
    useAgentsStore.getState().pushActivity({
      type,
      agentId,
      agentEmoji: agent?.emoji,
      taskId,
      taskTitle,
      message,
    });
  } catch {
    // Never let logging break the caller
  }
}
