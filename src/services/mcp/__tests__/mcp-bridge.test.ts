import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockEventSource = {
  onmessage: null as ((event: MessageEvent) => void) | null,
  onerror: null as ((event: Event) => void) | null,
  close: vi.fn(),
};
vi.stubGlobal('EventSource', vi.fn(() => mockEventSource));

import { mcpBridge } from '../mcp-bridge';
import { MCP_SERVERS, getServerByName, MCP_PROXY_URL } from '../mcp-config';
import { useMcpStore } from '../../../store/mcpStore';

describe('mcp-config', () => {
  it('MCP_SERVERS has 6 servers', () => {
    expect(MCP_SERVERS).toHaveLength(6);
    expect(MCP_SERVERS.map(s => s.name)).toEqual([
      'google-workspace',
      'real-estate',
      'zillow',
      'alpaca',
      'notion',
      'pdf-reader',
    ]);
  });

  it('getServerByName returns correct server', () => {
    const server = getServerByName('alpaca');
    expect(server).toBeDefined();
    expect(server?.name).toBe('alpaca');
    expect(server?.tools).toContain('get_portfolio');
  });

  it('getServerByName returns undefined for unknown', () => {
    const server = getServerByName('nope');
    expect(server).toBeUndefined();
  });

  it('MCP_PROXY_URL defaults to localhost:3100', () => {
    expect(MCP_PROXY_URL).toBe('http://localhost:3100');
  });
});

describe('McpBridge', () => {
  beforeEach(() => {
    useMcpStore.setState({ servers: {}, isProxyRunning: false, lastProxyCheck: undefined });
    mockFetch.mockReset();
    mockEventSource.close.mockReset();
  });

  afterEach(() => {
    mcpBridge.destroy();
  });

  it('checkProxyHealth returns true on 200', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const isHealthy = await mcpBridge.checkProxyHealth();
    expect(isHealthy).toBe(true);
    expect(useMcpStore.getState().isProxyRunning).toBe(true);
  });

  it('checkProxyHealth returns false on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const isHealthy = await mcpBridge.checkProxyHealth();
    expect(isHealthy).toBe(false);
    expect(useMcpStore.getState().isProxyRunning).toBe(false);
  });

  it('connectServer sets status to connected on success', async () => {
    const alpacaConfig = getServerByName('alpaca')!;
    useMcpStore.getState().registerServer(alpacaConfig);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    await mcpBridge.connectServer(alpacaConfig);

    const store = useMcpStore.getState();
    expect(store.servers.alpaca.status).toBe('connected');
  });

  it('connectServer sets error status on failure', async () => {
    const alpacaConfig = getServerByName('alpaca')!;
    useMcpStore.getState().registerServer(alpacaConfig);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await mcpBridge.connectServer(alpacaConfig);

    const store = useMcpStore.getState();
    expect(store.servers.alpaca.status).toBe('error');
    expect(store.servers.alpaca.error).toContain('Health check failed');
  });

  it('callTool returns error when server not found', async () => {
    const result = await mcpBridge.callTool({
      server: 'unknown',
      tool: 'some_tool',
      arguments: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Server \'unknown\' not found');
  });

  it('callTool returns error when server not connected', async () => {
    const alpacaConfig = getServerByName('alpaca')!;
    useMcpStore.getState().registerServer(alpacaConfig);

    const result = await mcpBridge.callTool({
      server: 'alpaca',
      tool: 'get_portfolio',
      arguments: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('is not connected');
  });
});
