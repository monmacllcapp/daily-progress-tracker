import type { McpServerConfig } from '../../types/mcp-types';

/**
 * Environment-aware URL resolver with fallback
 */
const envUrl = (envVar: string, fallback: string): string =>
  (typeof import.meta !== 'undefined' && import.meta.env?.[envVar]) || fallback;

/**
 * MCP Server Configurations
 * All servers use SSE transport and graceful degradation (required: false)
 */
export const MCP_SERVERS: McpServerConfig[] = [
  {
    name: 'google-workspace',
    url: envUrl('VITE_MCP_GOOGLE_WORKSPACE_URL', 'http://localhost:8010'),
    transport: 'sse',
    healthCheck: '/health',
    required: false,
    tools: ['calendar_events', 'gmail_search', 'gmail_send', 'drive_search'],
  },
  {
    name: 'real-estate',
    url: envUrl('VITE_MCP_REAL_ESTATE_URL', 'http://localhost:8011'),
    transport: 'sse',
    healthCheck: '/health',
    required: false,
    tools: ['analyze_deal', 'comp_search', 'market_data'],
  },
  {
    name: 'zillow',
    url: envUrl('VITE_MCP_ZILLOW_URL', 'http://localhost:8012'),
    transport: 'sse',
    healthCheck: '/health',
    required: false,
    tools: ['zestimate', 'property_details', 'price_history'],
  },
  {
    name: 'alpaca',
    url: envUrl('VITE_MCP_ALPACA_URL', 'http://localhost:8013'),
    transport: 'sse',
    healthCheck: '/health',
    required: false,
    tools: ['get_portfolio', 'get_positions', 'get_account', 'place_order'],
  },
  {
    name: 'notion',
    url: envUrl('VITE_MCP_NOTION_URL', 'http://localhost:8014'),
    transport: 'sse',
    healthCheck: '/health',
    required: false,
    tools: ['search_pages', 'read_page', 'create_page', 'update_page'],
  },
  {
    name: 'pdf-reader',
    url: envUrl('VITE_MCP_PDF_READER_URL', 'http://localhost:8015'),
    transport: 'sse',
    healthCheck: '/health',
    required: false,
    tools: ['extract_text', 'extract_tables', 'summarize'],
  },
];

/**
 * Find server configuration by name
 */
export function getServerByName(name: string): McpServerConfig | undefined {
  return MCP_SERVERS.find((server) => server.name === name);
}

/**
 * MCP Proxy URL (central gateway for all MCP servers)
 */
export const MCP_PROXY_URL = envUrl('VITE_MCP_PROXY_URL', 'http://localhost:3100');
