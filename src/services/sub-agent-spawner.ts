/**
 * Sub-Agent Spawner
 *
 * Enables core agents to spin up ephemeral sub-agents for specific jobs.
 * Every sub-agent gets a tracked task on the Kanban board so work is
 * never invisible. Tracks: who spawned it, why, what it did, result.
 */

import { createDatabase } from '../db';
import { logAgentActivity } from './agent-logger';
import { askAI, type AICallOptions } from './ai/ai-service';
import type { AgentRole } from '../config/modelTiers';

export interface SubAgentConfig {
  parentAgentId: string;
  name: string;
  reason: string;
  taskTitle: string;
  taskDescription?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  role?: AgentRole;
}

export interface SubAgentResult {
  taskId: string;
  subAgentName: string;
  result: string;
  success: boolean;
}

/**
 * Spawn a sub-agent: creates a tracked task, runs the AI work, records the result.
 */
export async function spawnSubAgent(
  config: SubAgentConfig,
  prompt: string,
  systemPrompt?: string
): Promise<SubAgentResult> {
  const db = await createDatabase();
  const subAgentId = `${config.parentAgentId}-sub-${crypto.randomUUID().slice(0, 8)}`;
  const taskId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Create tracked task on Kanban
  await db.tasks.insert({
    id: taskId,
    title: config.taskTitle,
    description: config.taskDescription || config.reason,
    priority: config.priority || 'medium',
    status: 'active',
    source: 'manual',
    created_date: now.slice(0, 10),
    sort_order: 0,
    category_id: '',
    assigned_agent: config.parentAgentId,
    agent_status: 'in_progress',
    agent_board_status: 'in_progress',
    is_sub_agent_task: true,
    parent_agent: config.parentAgentId,
    sub_agent_name: subAgentId,
    sub_agent_reason: config.reason,
    sub_agent_spawned_at: now,
    created_at: now,
    updated_at: now,
  });

  logAgentActivity(
    config.parentAgentId,
    'task_created',
    `Spawned sub-agent "${config.name}": ${config.reason.slice(0, 60)}`,
    taskId,
    config.taskTitle
  );

  try {
    const result = await askAI(prompt, systemPrompt, {
      role: config.role || 'workers',
      agentId: subAgentId,
    });

    const resultText = result || 'No response generated';

    // Record result
    const doc = await db.tasks.findOne(taskId).exec();
    if (doc) {
      await doc.patch({
        agent_board_status: 'deliverable_ready',
        agent_status: 'completed',
        deliverable: resultText.slice(0, 5000),
        sub_agent_result: resultText.slice(0, 5000),
        sub_agent_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    logAgentActivity(
      config.parentAgentId,
      'deliverable_ready',
      `Sub-agent "${config.name}" completed`,
      taskId,
      config.taskTitle
    );

    return { taskId, subAgentName: subAgentId, result: resultText, success: true };
  } catch (err) {
    const doc = await db.tasks.findOne(taskId).exec();
    if (doc) {
      await doc.patch({
        agent_board_status: 'blocked',
        agent_status: 'failed',
        agent_notes: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        sub_agent_result: 'FAILED',
        sub_agent_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    logAgentActivity(
      config.parentAgentId,
      'error',
      `Sub-agent "${config.name}" failed: ${err instanceof Error ? err.message : 'unknown'}`,
      taskId,
      config.taskTitle
    );

    return { taskId, subAgentName: subAgentId, result: '', success: false };
  }
}

/**
 * Get all sub-agent tasks, optionally filtered by parent agent.
 */
export async function getSubAgentTasks(parentAgentId?: string) {
  const db = await createDatabase();
  const selector: Record<string, unknown> = { is_sub_agent_task: true };
  if (parentAgentId) selector.parent_agent = parentAgentId;
  const docs = await db.tasks.find({ selector }).exec();
  return docs.map((d) => d.toJSON());
}
