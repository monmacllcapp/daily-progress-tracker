import { mcpBridge } from './mcp-bridge';

/**
 * Todoist MCP Adapter
 * Provides typed interfaces for tasks (get, create, complete)
 * Note: Todoist server not yet configured in mcp-config.ts
 */

export interface GetTasksParams {
  filter?: string; // Todoist filter syntax
  projectId?: string;
}

export interface CreateTaskParams {
  content: string;
  priority?: 1 | 2 | 3 | 4; // 1 = lowest, 4 = highest
  dueDate?: string; // ISO 8601 or natural language
  projectId?: string;
  labels?: string[];
}

/**
 * Get tasks from Todoist
 */
export async function getTasks(params: GetTasksParams = {}) {
  return mcpBridge.callTool({
    server: 'todoist',
    tool: 'get_tasks',
    arguments: { ...params },
  });
}

/**
 * Create a new task in Todoist
 */
export async function createTask(params: CreateTaskParams) {
  return mcpBridge.callTool({
    server: 'todoist',
    tool: 'create_task',
    arguments: { ...params },
  });
}

/**
 * Mark a task as complete
 */
export async function completeTask(taskId: string) {
  return mcpBridge.callTool({
    server: 'todoist',
    tool: 'complete_task',
    arguments: { taskId },
  });
}
