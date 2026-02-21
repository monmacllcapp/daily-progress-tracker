/**
 * Agent Task Enforcer — "No work without recording"
 *
 * Ensures every substantive agent action has a corresponding task on the
 * Kanban board. Agents call ensureAgentTask() before starting work.
 * If no task exists, one is auto-created with agent_board_status='in_progress'.
 */

import { createDatabase } from '../db';
import { logAgentActivity } from './agent-logger';

export interface EnsureTaskOptions {
  agentId: string;
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

/**
 * Ensure a task exists for this agent's work. If taskId is provided and
 * exists, returns it (and moves to in_progress if needed). Otherwise
 * creates a new task and returns the new ID.
 */
export async function ensureAgentTask(
  taskId: string | undefined,
  options: EnsureTaskOptions
): Promise<string> {
  const db = await createDatabase();

  // If taskId provided, verify it exists
  if (taskId) {
    const existing = await db.tasks.findOne(taskId).exec();
    if (existing) {
      if (
        existing.agent_board_status !== 'in_progress' &&
        existing.agent_board_status !== 'done'
      ) {
        await existing.patch({
          agent_board_status: 'in_progress',
          agent_status: 'in_progress',
          updated_at: new Date().toISOString(),
        });
      }
      return taskId;
    }
  }

  // Auto-create a task for untracked work
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.tasks.insert({
    id,
    title: options.title,
    description: options.description || `Auto-created by ${options.agentId} agent`,
    priority: options.priority || 'low',
    status: 'active',
    source: 'manual',
    created_date: now.slice(0, 10),
    sort_order: 0,
    category_id: '',
    assigned_agent: options.agentId,
    agent_status: 'in_progress',
    agent_board_status: 'in_progress',
    created_at: now,
    updated_at: now,
  });

  logAgentActivity(options.agentId, 'task_created', `Auto-tracked: "${options.title}"`, id, options.title);
  return id;
}

/**
 * Mark agent task as completed with a deliverable.
 */
export async function completeAgentTask(
  taskId: string,
  agentId: string,
  deliverable: string,
  notes?: string
): Promise<void> {
  const db = await createDatabase();
  const doc = await db.tasks.findOne(taskId).exec();
  if (!doc) return;

  await doc.patch({
    agent_board_status: 'deliverable_ready',
    agent_status: 'completed',
    deliverable,
    agent_notes: notes || doc.agent_notes,
    updated_at: new Date().toISOString(),
  });

  logAgentActivity(agentId, 'deliverable_ready', `Completed: "${doc.title}"`, taskId, doc.title);
}

/**
 * Mark agent task as blocked with a question.
 */
export async function blockAgentTask(
  taskId: string,
  agentId: string,
  question: string
): Promise<void> {
  const db = await createDatabase();
  const doc = await db.tasks.findOne(taskId).exec();
  if (!doc) return;

  await doc.patch({
    agent_board_status: 'blocked',
    agent_question: question,
    updated_at: new Date().toISOString(),
  });

  logAgentActivity(agentId, 'question_asked', `Blocked: "${doc.title}" — ${question}`, taskId, doc.title);
}
