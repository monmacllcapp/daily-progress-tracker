import { mcpBridge } from './mcp-bridge';

/**
 * Real Estate MCP Adapter
 * Provides typed interfaces for deal analysis, comps, and market data
 */

export interface AnalyzeDealParams {
  address: string;
  strategy?: 'rental' | 'flip' | 'brrr' | 'wholesale';
  purchasePrice?: number;
  rehabBudget?: number;
}

export interface CompSearchParams {
  address: string;
  radius?: number; // miles
  maxResults?: number;
}

export interface MarketDataParams {
  zip: string;
  period?: 'month' | 'quarter' | 'year';
}

/**
 * Analyze a real estate deal with detailed metrics
 */
export async function analyzeDeal(params: AnalyzeDealParams) {
  const result = await mcpBridge.callTool({
    server: 'real-estate',
    tool: 'analyze_deal',
    arguments: { ...params },
  });
  return result;
}

/**
 * Search for comparable properties
 */
export async function searchComps(params: CompSearchParams) {
  const result = await mcpBridge.callTool({
    server: 'real-estate',
    tool: 'comp_search',
    arguments: { ...params },
  });
  return result;
}

/**
 * Get market data for a specific ZIP code
 */
export async function getMarketData(params: MarketDataParams) {
  return mcpBridge.callTool({
    server: 'real-estate',
    tool: 'market_data',
    arguments: { ...params },
  });
}
