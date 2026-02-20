import { describe, it, expect, beforeEach } from 'vitest';
import { useMcpStore } from '../mcpStore';
import type { McpServerConfig } from '../../types/mcp-types';

const testServer: McpServerConfig = {
    name: 'test-mcp',
    url: 'http://localhost:9999',
    transport: 'sse',
    healthCheck: '/health',
    required: false,
    tools: ['tool_a', 'tool_b'],
};

describe('mcpStore', () => {
    beforeEach(() => {
        useMcpStore.setState({ servers: {}, isProxyRunning: false, lastProxyCheck: undefined });
    });

    it('starts with empty servers', () => {
        expect(useMcpStore.getState().servers).toEqual({});
        expect(useMcpStore.getState().isProxyRunning).toBe(false);
    });

    it('registerServer adds a new server', () => {
        useMcpStore.getState().registerServer(testServer);
        const state = useMcpStore.getState();
        expect(state.servers['test-mcp']).toBeDefined();
        expect(state.servers['test-mcp'].status).toBe('disconnected');
        expect(state.servers['test-mcp'].availableTools).toEqual(['tool_a', 'tool_b']);
    });

    it('setServerStatus updates connection status', () => {
        useMcpStore.getState().registerServer(testServer);
        useMcpStore.getState().setServerStatus('test-mcp', 'connected');
        expect(useMcpStore.getState().servers['test-mcp'].status).toBe('connected');
    });

    it('setServerStatus records error message', () => {
        useMcpStore.getState().registerServer(testServer);
        useMcpStore.getState().setServerStatus('test-mcp', 'error', 'Connection refused');
        const server = useMcpStore.getState().servers['test-mcp'];
        expect(server.status).toBe('error');
        expect(server.error).toBe('Connection refused');
    });

    it('getServerStatus returns disconnected for unknown server', () => {
        expect(useMcpStore.getState().getServerStatus('unknown')).toBe('disconnected');
    });

    it('getConnectedServers returns only connected servers', () => {
        useMcpStore.getState().registerServer(testServer);
        useMcpStore.getState().registerServer({ ...testServer, name: 'other-mcp', tools: ['tool_c'] });
        useMcpStore.getState().setServerStatus('test-mcp', 'connected');

        const connected = useMcpStore.getState().getConnectedServers();
        expect(connected).toHaveLength(1);
        expect(connected[0].name).toBe('test-mcp');
    });

    it('isServerAvailable returns true only when connected', () => {
        useMcpStore.getState().registerServer(testServer);
        expect(useMcpStore.getState().isServerAvailable('test-mcp')).toBe(false);
        useMcpStore.getState().setServerStatus('test-mcp', 'connected');
        expect(useMcpStore.getState().isServerAvailable('test-mcp')).toBe(true);
    });

    it('setProxyRunning updates proxy state with timestamp', () => {
        useMcpStore.getState().setProxyRunning(true);
        const state = useMcpStore.getState();
        expect(state.isProxyRunning).toBe(true);
        expect(state.lastProxyCheck).toBeDefined();
    });

    it('resetAll clears all state', () => {
        useMcpStore.getState().registerServer(testServer);
        useMcpStore.getState().setProxyRunning(true);
        useMcpStore.getState().resetAll();
        expect(useMcpStore.getState().servers).toEqual({});
        expect(useMcpStore.getState().isProxyRunning).toBe(false);
    });
});
