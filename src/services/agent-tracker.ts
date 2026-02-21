/**
 * Agent Tracker Service
 *
 * Fetches agent status from the Supabase `agent_status` table and merges with
 * the hardcoded AGENTS array. Falls back to all-offline if Supabase is unreachable.
 * Used by AgentsPage for the full operations dashboard.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { AgentBoardStatus } from '../types/schema';

let _supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  if (_supabase) return _supabase;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) return null;
  _supabase = createClient(url, key);
  return _supabase;
}

export interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
  status: 'idle' | 'working' | 'error' | 'offline';
  currentTask?: string;
  lastActivity?: string;
  model?: string;
  tokensToday?: number;
  tasksCompleted?: number;
  avgResponseMs?: number;
}

export interface AgentTask {
  id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  assignedAgent: string;
  agentStatus: 'pending' | 'in_progress' | 'completed' | 'failed';
  agentNotes?: string;
  createdDate: string;
  source: 'user' | 'agent';  // who created it
  boardStatus: AgentBoardStatus;
  deliverable?: string;
  agentQuestion?: string;
}

export const AGENTS: AgentInfo[] = [
  { id: 'main',      name: 'Main (Default)', emoji: '🦞', status: 'offline', model: 'claude-sonnet-4-5-20250929' },
  { id: 'manager',   name: 'Manager',        emoji: '🎯', status: 'offline', model: 'claude-opus-4-2025-04-16' },
  { id: 'sales',     name: 'Sales',          emoji: '💰', status: 'offline', model: 'kimi-k2.5' },
  { id: 'marketing', name: 'Marketing',      emoji: '📣', status: 'offline', model: 'kimi-k2.5' },
  { id: 'finance',   name: 'Finance',        emoji: '📊', status: 'offline', model: 'kimi-k2.5' },
  { id: 'support',   name: 'Support',        emoji: '🛟', status: 'offline', model: 'kimi-k2.5' },
  { id: 'ea-user',   name: 'EA (Quan)',      emoji: '🧑‍💼', status: 'offline', model: 'kimi-k2.5' },
  { id: 'ea-wife',   name: 'EA (Wife)',      emoji: '🏠', status: 'offline', model: 'kimi-k2.5' },
  { id: 'reasoner',  name: 'Reasoner',       emoji: '🧠', status: 'offline', model: 'deepseek-chat' },
  { id: 'sentry',    name: 'Sentry',         emoji: '🐾', status: 'offline', model: 'deepseek-chat' },
];

/** Fetch live agent status from Supabase `agent_status` table */
export async function fetchAgentStatus(): Promise<AgentInfo[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return AGENTS; // env vars not set — all offline

  try {
    const { data, error } = await supabase
      .from('agent_status')
      .select('id, agent_name, status, current_task, last_activity, model, metadata');

    if (error) throw error;
    if (!data) return AGENTS;

    return AGENTS.map((known) => {
      const row = data.find((r) => r.id === known.id);
      if (!row) return known;

      const meta = (row.metadata as Record<string, unknown>) ?? {};
      return {
        ...known,
        name: row.agent_name ?? known.name,
        status: (row.status as AgentInfo['status']) ?? known.status,
        currentTask: row.current_task ?? undefined,
        lastActivity: row.last_activity ?? undefined,
        model: row.model ?? known.model,
        tokensToday: typeof meta.tokensToday === 'number' ? meta.tokensToday : undefined,
        tasksCompleted: typeof meta.tasksCompleted === 'number' ? meta.tasksCompleted : undefined,
        avgResponseMs: typeof meta.avgResponseMs === 'number' ? meta.avgResponseMs : undefined,
      };
    });
  } catch {
    return AGENTS; // graceful fallback — all show as offline
  }
}

/** Check if Supabase is reachable and at least one agent is not offline */
export async function checkGatewayConnection(): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  try {
    const { count, error } = await supabase
      .from('agent_status')
      .select('*', { count: 'exact', head: true })
      .neq('status', 'offline');

    if (error) return false;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Get tasks assigned to agents from RxDB database.
 * Takes the database instance and returns tasks grouped by agent.
 */
export async function getAgentTasks(db: any): Promise<Map<string, AgentTask[]>> {
  const map = new Map<string, AgentTask[]>();

  try {
    const allTasks = await db.tasks.find().exec();
    for (const doc of allTasks) {
      const task = doc.toJSON();
      if (!task.assigned_agent) continue;

      const agentTask: AgentTask = {
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        assignedAgent: task.assigned_agent,
        agentStatus: task.agent_status || 'pending',
        agentNotes: task.agent_notes,
        createdDate: task.created_date,
        source: task.source === 'manual' ? 'user' : 'agent',
        boardStatus: task.agent_board_status || 'new',
        deliverable: task.deliverable,
        agentQuestion: task.agent_question,
      };

      const existing = map.get(task.assigned_agent) || [];
      existing.push(agentTask);
      map.set(task.assigned_agent, existing);
    }
  } catch (err) {
    console.warn('[AgentTracker] Failed to fetch tasks:', err);
  }

  return map;
}

/** Get summary stats across all agents */
export function getAgentStats(agents: AgentInfo[], taskMap: Map<string, AgentTask[]>) {
  const totalAgents = agents.length;
  const activeAgents = agents.filter(a => a.status === 'working').length;
  const onlineAgents = agents.filter(a => a.status !== 'offline').length;

  let totalAssigned = 0;
  let inProgress = 0;
  let completedToday = 0;
  let failed = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const tasks of taskMap.values()) {
    totalAssigned += tasks.length;
    for (const t of tasks) {
      if (t.agentStatus === 'in_progress') inProgress++;
      if (t.agentStatus === 'completed' && t.createdDate === today) completedToday++;
      if (t.agentStatus === 'failed') failed++;
    }
  }

  return { totalAgents, activeAgents, onlineAgents, totalAssigned, inProgress, completedToday, failed };
}

/** Format relative time string */
export function formatRelativeTime(iso?: string): string {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return 'just now';
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
