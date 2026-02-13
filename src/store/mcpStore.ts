import { create } from 'zustand';
import type { McpServerConfig, McpConnectionStatus, McpServerState } from '../types/mcp-types';

interface McpState {
  servers: Record<string, McpServerState>;  // keyed by server name
  isProxyRunning: boolean;
  lastProxyCheck?: string;                  // ISO 8601

  // Getters
  getServerStatus: (name: string) => McpConnectionStatus;
  getConnectedServers: () => McpServerState[];
  getAvailableTools: (serverName: string) => string[];
  isServerAvailable: (name: string) => boolean;

  // Actions
  setServerStatus: (name: string, status: McpConnectionStatus, error?: string) => void;
  registerServer: (config: McpServerConfig) => void;
  setProxyRunning: (running: boolean) => void;
  updateHealthCheck: (name: string) => void;
  setServerTools: (name: string, tools: string[]) => void;
  resetAll: () => void;
}

export const useMcpStore = create<McpState>((set, get) => ({
  servers: {},
  isProxyRunning: false,
  lastProxyCheck: undefined,

  getServerStatus: (name) => {
    return get().servers[name]?.status ?? 'disconnected';
  },

  getConnectedServers: () => {
    return Object.values(get().servers).filter(s => s.status === 'connected');
  },

  getAvailableTools: (serverName) => {
    return get().servers[serverName]?.availableTools ?? [];
  },

  isServerAvailable: (name) => {
    return get().servers[name]?.status === 'connected';
  },

  setServerStatus: (name, status, error) => set((state) => ({
    servers: {
      ...state.servers,
      [name]: {
        ...state.servers[name],
        name,
        status,
        error: error ?? undefined,
        availableTools: state.servers[name]?.availableTools ?? [],
      }
    }
  })),

  registerServer: (config) => set((state) => ({
    servers: {
      ...state.servers,
      [config.name]: {
        name: config.name,
        status: 'disconnected',
        availableTools: config.tools,
      }
    }
  })),

  setProxyRunning: (running) => set({
    isProxyRunning: running,
    lastProxyCheck: new Date().toISOString()
  }),

  updateHealthCheck: (name) => set((state) => ({
    servers: {
      ...state.servers,
      [name]: {
        ...state.servers[name],
        lastHealthCheck: new Date().toISOString(),
      }
    }
  })),

  setServerTools: (name, tools) => set((state) => ({
    servers: {
      ...state.servers,
      [name]: {
        ...state.servers[name],
        availableTools: tools,
      }
    }
  })),

  resetAll: () => set({ servers: {}, isProxyRunning: false }),
}));
