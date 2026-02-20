import { mcpBridge } from './mcp-bridge';

/**
 * Zillow MCP Adapter
 * Provides typed interfaces for Zestimate, property details, and price history
 */

export interface ZillowPropertyParams {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
}

/**
 * Get Zillow Zestimate for a property
 */
export async function getZestimate(address: string) {
  return mcpBridge.callTool({
    server: 'zillow',
    tool: 'zestimate',
    arguments: { address },
  });
}

/**
 * Get detailed property information from Zillow
 */
export async function getPropertyDetails(address: string) {
  return mcpBridge.callTool({
    server: 'zillow',
    tool: 'property_details',
    arguments: { address },
  });
}

/**
 * Get price history for a property
 */
export async function getPriceHistory(address: string) {
  return mcpBridge.callTool({
    server: 'zillow',
    tool: 'price_history',
    arguments: { address },
  });
}
