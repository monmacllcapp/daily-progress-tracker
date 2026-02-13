import { mcpBridge } from './mcp-bridge';

/**
 * Notion MCP Adapter
 * Provides typed interfaces for searching, reading, creating, and updating pages
 */

export interface SearchPagesParams {
  query: string;
  filter?: 'page' | 'database';
  maxResults?: number;
}

export interface CreatePageParams {
  title: string;
  content: string;
  parentId?: string;
  icon?: string;
}

export interface UpdatePageParams {
  pageId: string;
  content?: string;
  title?: string;
}

/**
 * Search Notion pages and databases
 */
export async function searchPages(params: SearchPagesParams) {
  return mcpBridge.callTool({
    server: 'notion',
    tool: 'search_pages',
    arguments: { ...params },
  });
}

/**
 * Read a Notion page by ID
 */
export async function readPage(pageId: string) {
  return mcpBridge.callTool({
    server: 'notion',
    tool: 'read_page',
    arguments: { pageId },
  });
}

/**
 * Create a new Notion page
 */
export async function createPage(params: CreatePageParams) {
  return mcpBridge.callTool({
    server: 'notion',
    tool: 'create_page',
    arguments: { ...params },
  });
}

/**
 * Update an existing Notion page
 */
export async function updatePage(params: UpdatePageParams) {
  return mcpBridge.callTool({
    server: 'notion',
    tool: 'update_page',
    arguments: { ...params },
  });
}
