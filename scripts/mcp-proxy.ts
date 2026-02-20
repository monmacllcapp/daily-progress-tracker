import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';

// ============================================================================
// Configuration
// ============================================================================

const PORT = parseInt(process.env.MCP_PROXY_PORT || '3100', 10);
const CLAUDE_API_URL = process.env.CLAUDE_API_URL || 'https://api.anthropic.com/v1/messages';
const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

// ============================================================================
// Types
// ============================================================================

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeRequest {
  model?: string;
  max_tokens?: number;
  messages: ClaudeMessage[];
  system?: string;
  temperature?: number;
}

interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
}

interface ErrorResponse {
  error: string;
  details?: string;
  routes?: string[];
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Parse request body as a string from the stream
 */
async function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Set CORS headers on response
 */
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:4009',
  'http://localhost:5173'
];

function setCorsHeaders(res: ServerResponse, origin?: string): void {
  const requestOrigin = origin || '';
  if (ALLOWED_ORIGINS.includes(requestOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, statusCode: number, data: unknown, origin?: string): void {
  setCorsHeaders(res, origin);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /health
 */
function handleHealth(res: ServerResponse, origin?: string): void {
  const response: HealthResponse = {
    status: 'ok',
    version: '2.0.0',
    uptime: process.uptime()
  };
  sendJson(res, 200, response, origin);
}

/**
 * POST /api/claude
 * Proxy requests to Anthropic API
 */
async function handleClaude(req: IncomingMessage, res: ServerResponse, origin?: string): Promise<void> {
  // Check if API key is configured
  if (!CLAUDE_API_KEY) {
    console.log('[MCP Proxy] Claude API request failed: ANTHROPIC_API_KEY not configured');
    sendJson(res, 503, {
      error: 'ANTHROPIC_API_KEY not configured'
    } as ErrorResponse, origin);
    return;
  }

  try {
    // Parse request body
    const bodyStr = await parseBody(req);
    const clientRequest: ClaudeRequest = JSON.parse(bodyStr);

    // Build request to Anthropic
    const apiRequest = {
      model: clientRequest.model || CLAUDE_MODEL,
      max_tokens: clientRequest.max_tokens || 4096,
      messages: clientRequest.messages,
      ...(clientRequest.system && { system: clientRequest.system }),
      ...(clientRequest.temperature !== undefined && { temperature: clientRequest.temperature })
    };

    console.log('[MCP Proxy] Forwarding request to Claude API:', {
      model: apiRequest.model,
      messageCount: apiRequest.messages.length
    });

    // Forward to Anthropic API using Node's native https module
    const apiUrl = new URL(CLAUDE_API_URL);
    const requestBody = JSON.stringify(apiRequest);

    const options = {
      hostname: apiUrl.hostname,
      port: apiUrl.port || 443,
      path: apiUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const apiReq = httpsRequest(options, (apiRes) => {
      console.log('[MCP Proxy] Claude API responded with status:', apiRes.statusCode);

      // Set CORS headers and forward status code
      setCorsHeaders(res, origin);
      res.writeHead(apiRes.statusCode || 500, {
        'Content-Type': 'application/json'
      });

      // Stream response back to client
      apiRes.pipe(res);
    });

    apiReq.on('error', (error) => {
      console.error('[MCP Proxy] Claude API request error:', error);
      sendJson(res, 502, {
        error: 'Claude API error',
        details: error.message
      } as ErrorResponse, origin);
    });

    // Send request body
    apiReq.write(requestBody);
    apiReq.end();

  } catch (error) {
    console.error('[MCP Proxy] Error handling Claude request:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 500, {
      error: 'Internal server error',
      details: errorMessage
    } as ErrorResponse, origin);
  }
}

/**
 * OPTIONS *
 * Handle CORS preflight
 */
function handleOptions(res: ServerResponse, origin?: string): void {
  setCorsHeaders(res, origin);
  res.writeHead(204);
  res.end();
}

/**
 * Catch-all 404 handler
 */
function handleNotFound(res: ServerResponse, origin?: string): void {
  sendJson(res, 404, {
    error: 'Not found',
    routes: ['/health', '/api/claude']
  } as ErrorResponse, origin);
}

// ============================================================================
// Request Router
// ============================================================================

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method || 'GET';
  const url = req.url || '/';
  const origin = req.headers.origin;

  console.log(`[MCP Proxy] ${method} ${url}`);

  // Handle OPTIONS for CORS preflight
  if (method === 'OPTIONS') {
    handleOptions(res, origin);
    return;
  }

  // Route requests
  if (method === 'GET' && url === '/health') {
    handleHealth(res, origin);
  } else if (method === 'POST' && url === '/api/claude') {
    await handleClaude(req, res, origin);
  } else {
    handleNotFound(res, origin);
  }
}

// ============================================================================
// Server Setup
// ============================================================================

const server = createServer(handleRequest);

// Error handling
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[MCP Proxy] Error: Port ${PORT} is already in use`);
    console.error(`[MCP Proxy] Please stop the other process or set a different MCP_PROXY_PORT`);
  } else if (error.code === 'EACCES') {
    console.error(`[MCP Proxy] Error: Permission denied to bind to port ${PORT}`);
    console.error(`[MCP Proxy] Try using a port number above 1024`);
  } else {
    console.error('[MCP Proxy] Server error:', error);
  }
  process.exit(1);
});

// Graceful shutdown
function shutdown(): void {
  console.log('\n[MCP Proxy] Shutting down gracefully...');
  server.close(() => {
    console.log('[MCP Proxy] Server closed');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
server.listen(PORT, () => {
  console.log(`[MCP Proxy] Running on http://localhost:${PORT}`);
  console.log(`[MCP Proxy] Claude API: ${CLAUDE_API_KEY ? 'configured' : 'NOT configured (set ANTHROPIC_API_KEY)'}`);
  console.log('[MCP Proxy] Available routes:');
  console.log('[MCP Proxy]   GET  /health');
  console.log('[MCP Proxy]   POST /api/claude');
});
