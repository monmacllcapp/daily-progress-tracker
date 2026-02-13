import { mcpBridge } from './mcp-bridge';

/**
 * Google Workspace MCP Adapter
 * Provides typed interfaces for Calendar, Gmail, and Drive operations
 */

export interface CalendarEventsParams {
  timeMin?: string; // ISO 8601
  timeMax?: string; // ISO 8601
  calendarId?: string;
}

export interface GmailSearchParams {
  query: string;
  maxResults?: number;
}

export interface GmailSendParams {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}

/**
 * Get calendar events within a time range
 */
export async function getCalendarEvents(params: CalendarEventsParams = {}) {
  const result = await mcpBridge.callTool({
    server: 'google-workspace',
    tool: 'calendar_events',
    arguments: { ...params },
  });
  return result;
}

/**
 * Search Gmail messages
 */
export async function searchGmail(params: GmailSearchParams) {
  const result = await mcpBridge.callTool({
    server: 'google-workspace',
    tool: 'gmail_search',
    arguments: { ...params },
  });
  return result;
}

/**
 * Send an email via Gmail
 */
export async function sendGmail(to: string, subject: string, body: string) {
  return mcpBridge.callTool({
    server: 'google-workspace',
    tool: 'gmail_send',
    arguments: { to, subject, body },
  });
}

/**
 * Search Google Drive files
 */
export async function searchDrive(query: string) {
  return mcpBridge.callTool({
    server: 'google-workspace',
    tool: 'drive_search',
    arguments: { query },
  });
}
