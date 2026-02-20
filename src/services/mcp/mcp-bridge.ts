import type {
  McpServerConfig,
  McpToolCall,
  McpToolResult,
  McpSseEvent,
} from '../../types/mcp-types';
import { useMcpStore } from '../../store/mcpStore';
import { MCP_SERVERS, MCP_PROXY_URL, getServerByName } from './mcp-config';

/**
 * MCP Bridge - Browser-side client for MCP servers
 * Manages connections, health checks, and tool calls via HTTP/SSE
 */
class McpBridge {
  private eventSources: Map<string, EventSource> = new Map();
  private healthIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor() {
    // Initialization happens via initialize() method
  }

  /**
   * Initialize the MCP bridge
   * Registers all servers and attempts connections
   */
  async initialize(): Promise<void> {
    const store = useMcpStore.getState();

    // Register all servers in the store
    MCP_SERVERS.forEach((config) => {
      store.registerServer(config);
    });

    // Check if proxy is healthy
    const proxyHealthy = await this.checkProxyHealth();
    if (!proxyHealthy) {
      console.warn('[MCP Bridge] Proxy not healthy, skipping server connections');
      return;
    }

    // Attempt to connect to each server
    const connectionPromises = MCP_SERVERS.map((config) =>
      this.connectServer(config).catch((err) => {
        console.warn(`[MCP Bridge] Failed to connect to ${config.name}:`, err);
      })
    );

    await Promise.allSettled(connectionPromises);
  }

  /**
   * Check if MCP proxy is running and healthy
   */
  async checkProxyHealth(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${MCP_PROXY_URL}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const isHealthy = response.ok;
      useMcpStore.getState().setProxyRunning(isHealthy);
      return isHealthy;
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn('[MCP Bridge] Proxy health check failed:', err);
      useMcpStore.getState().setProxyRunning(false);
      return false;
    }
  }

  /**
   * Connect to a specific MCP server
   */
  async connectServer(config: McpServerConfig): Promise<void> {
    const store = useMcpStore.getState();
    store.setServerStatus(config.name, 'connecting');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${config.url}${config.healthCheck}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        store.setServerStatus(config.name, 'connected');
        this.startHealthCheck(config);
      } else {
        throw new Error(`Health check failed: ${response.status}`);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      const errorMsg = err instanceof Error ? err.message : 'Connection failed';
      console.warn(`[MCP Bridge] Failed to connect to ${config.name}:`, errorMsg);
      store.setServerStatus(config.name, 'error', errorMsg);
    }
  }

  /**
   * Call a tool on an MCP server
   */
  async callTool(call: McpToolCall): Promise<McpToolResult> {
    const config = getServerByName(call.server);
    if (!config) {
      return {
        success: false,
        error: `Server '${call.server}' not found`,
        duration_ms: 0,
      };
    }

    const store = useMcpStore.getState();
    const serverState = store.servers[call.server];
    if (serverState?.status !== 'connected') {
      return {
        success: false,
        error: `Server '${call.server}' is not connected`,
        duration_ms: 0,
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const startTime = performance.now();

    try {
      const response = await fetch(`${config.url}/tools/${call.tool}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(call.arguments),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const duration_ms = performance.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        return {
          success: false,
          error: `Tool call failed: ${response.status} - ${errorText}`,
          duration_ms,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data,
        duration_ms,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      const duration_ms = performance.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : 'Tool call failed';
      console.warn(`[MCP Bridge] Tool call failed for ${call.server}.${call.tool}:`, errorMsg);
      return {
        success: false,
        error: errorMsg,
        duration_ms,
      };
    }
  }

  /**
   * Subscribe to server-sent events from an MCP server
   * Returns an unsubscribe function
   */
  subscribeToEvents(
    serverName: string,
    onEvent: (event: McpSseEvent) => void
  ): () => void {
    const config = getServerByName(serverName);
    if (!config) {
      console.warn(`[MCP Bridge] Cannot subscribe: server '${serverName}' not found`);
      return () => {};
    }

    // Close existing EventSource if any
    const existingSource = this.eventSources.get(serverName);
    if (existingSource) {
      existingSource.close();
    }

    const eventSource = new EventSource(`${config.url}/events`);

    eventSource.onmessage = (event) => {
      try {
        const parsedEvent: McpSseEvent = JSON.parse(event.data);
        onEvent(parsedEvent);
      } catch (err) {
        console.warn(`[MCP Bridge] Failed to parse SSE event from ${serverName}:`, err);
      }
    };

    eventSource.onerror = (err) => {
      console.warn(`[MCP Bridge] SSE connection error for ${serverName}:`, err);
      useMcpStore.getState().setServerStatus(serverName, 'error', 'SSE connection lost');
    };

    this.eventSources.set(serverName, eventSource);

    // Return unsubscribe function
    return () => {
      eventSource.close();
      this.eventSources.delete(serverName);
    };
  }

  /**
   * Disconnect from a specific server
   */
  async disconnectServer(name: string): Promise<void> {
    // Close EventSource
    const eventSource = this.eventSources.get(name);
    if (eventSource) {
      eventSource.close();
      this.eventSources.delete(name);
    }

    // Clear health check interval
    const interval = this.healthIntervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.healthIntervals.delete(name);
    }

    // Update status
    useMcpStore.getState().setServerStatus(name, 'disconnected');
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.eventSources.keys()).map((name) =>
      this.disconnectServer(name)
    );
    await Promise.all(disconnectPromises);
  }

  /**
   * Start periodic health checks for a server
   */
  private startHealthCheck(config: McpServerConfig): void {
    // Clear any existing interval
    const existingInterval = this.healthIntervals.get(config.name);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    const interval = setInterval(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(`${config.url}${config.healthCheck}`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const store = useMcpStore.getState();
        if (response.ok) {
          store.setServerStatus(config.name, 'connected');
          store.updateHealthCheck(config.name);
        } else {
          store.setServerStatus(config.name, 'error', `Health check failed: ${response.status}`);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        const errorMsg = err instanceof Error ? err.message : 'Health check failed';
        console.warn(`[MCP Bridge] Health check failed for ${config.name}:`, errorMsg);
        useMcpStore.getState().setServerStatus(config.name, 'error', errorMsg);
      }
    }, 30000); // Every 30 seconds

    this.healthIntervals.set(config.name, interval);
  }

  /**
   * Clean up all resources
   */
  destroy(): void {
    // Clear all health check intervals
    this.healthIntervals.forEach((interval) => clearInterval(interval));
    this.healthIntervals.clear();

    // Close all EventSources
    this.eventSources.forEach((source) => source.close());
    this.eventSources.clear();

    // Reset store
    const store = useMcpStore.getState();
    MCP_SERVERS.forEach((config) => {
      store.setServerStatus(config.name, 'disconnected');
    });
    store.setProxyRunning(false);
  }
}

/**
 * Singleton instance of MCP Bridge
 */
export const mcpBridge = new McpBridge();
