// MCP Server configuration
export type McpTransport = 'sse' | 'http';

export interface McpServerConfig {
  name: string;
  url: string;                 // e.g. "http://localhost:8010"
  transport: McpTransport;
  healthCheck: string;         // e.g. "/health"
  required: boolean;           // false = graceful degradation
  tools: string[];             // Available tool names
}

// MCP connection status
export type McpConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface McpServerState {
  name: string;
  status: McpConnectionStatus;
  lastHealthCheck?: string;    // ISO 8601
  error?: string;
  availableTools: string[];
}

// MCP tool call/response
export interface McpToolCall {
  server: string;
  tool: string;
  arguments: Record<string, unknown>;
}

export interface McpToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration_ms: number;
}

// MCP SSE event types
export interface McpSseEvent {
  type: 'tool_result' | 'error' | 'heartbeat' | 'notification';
  data: unknown;
  id?: string;
}

// Proxy server configuration
export interface McpProxyConfig {
  port: number;                // default: 3100
  claudeApiUrl: string;       // default: "https://api.anthropic.com/v1/messages"
  servers: McpServerConfig[];
}

// Claude API passthrough types (for proxy)
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeRequest {
  model: string;
  max_tokens: number;
  messages: ClaudeMessage[];
  system?: string;
  temperature?: number;
}

export interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{ type: 'text'; text: string }>;
  model: string;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}
