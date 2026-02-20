import { mcpBridge } from './mcp-bridge';

/**
 * Alpaca Trading MCP Adapter
 * Provides typed interfaces for portfolio, positions, account, and orders
 */

export interface PlaceOrderParams {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type?: 'market' | 'limit' | 'stop' | 'stop_limit';
  time_in_force?: 'day' | 'gtc' | 'ioc' | 'fok';
  limit_price?: number;
  stop_price?: number;
}

/**
 * Get portfolio summary (holdings, P&L, allocation)
 */
export async function getPortfolio() {
  return mcpBridge.callTool({
    server: 'alpaca',
    tool: 'get_portfolio',
    arguments: {},
  });
}

/**
 * Get all open positions
 */
export async function getPositions() {
  return mcpBridge.callTool({
    server: 'alpaca',
    tool: 'get_positions',
    arguments: {},
  });
}

/**
 * Get account information (buying power, equity, cash)
 */
export async function getAccount() {
  return mcpBridge.callTool({
    server: 'alpaca',
    tool: 'get_account',
    arguments: {},
  });
}

/**
 * Place a trading order
 */
export async function placeOrder(params: PlaceOrderParams) {
  return mcpBridge.callTool({
    server: 'alpaca',
    tool: 'place_order',
    arguments: { ...params },
  });
}
