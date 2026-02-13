import { mcpBridge } from './mcp-bridge';

/**
 * PDF Reader MCP Adapter
 * Provides typed interfaces for text extraction, table extraction, and summarization
 */

export interface ExtractTextParams {
  url: string;
  pages?: string; // e.g., "1-5" or "1,3,5"
}

export interface ExtractTablesParams {
  url: string;
  pages?: string;
}

export interface SummarizeParams {
  url: string;
  maxLength?: number; // target word count
  format?: 'bullet' | 'paragraph';
}

/**
 * Extract text from a PDF
 */
export async function extractText(params: ExtractTextParams) {
  return mcpBridge.callTool({
    server: 'pdf-reader',
    tool: 'extract_text',
    arguments: params as Record<string, unknown>,
  });
}

/**
 * Extract tables from a PDF
 */
export async function extractTables(params: ExtractTablesParams) {
  return mcpBridge.callTool({
    server: 'pdf-reader',
    tool: 'extract_tables',
    arguments: params as Record<string, unknown>,
  });
}

/**
 * Generate a summary of a PDF
 */
export async function summarizePdf(params: SummarizeParams) {
  return mcpBridge.callTool({
    server: 'pdf-reader',
    tool: 'summarize',
    arguments: params as Record<string, unknown>,
  });
}
