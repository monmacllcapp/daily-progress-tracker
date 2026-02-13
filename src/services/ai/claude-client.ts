import type { ClaudeMessage, ClaudeRequest, ClaudeResponse } from '../../types/mcp-types';

/**
 * Claude API Client
 *
 * Calls Claude API through the local MCP proxy server (NOT directly to Anthropic).
 * The proxy handles CORS and API key injection.
 */
export class ClaudeClient {
  private proxyUrl: string;

  constructor(proxyUrl: string = 'http://localhost:3100') {
    this.proxyUrl = proxyUrl;
  }

  /**
   * Send a conversation to Claude and get a response
   */
  async sendMessage(
    messages: ClaudeMessage[],
    options?: {
      system?: string;
      temperature?: number;
      maxTokens?: number;
      model?: string;
    }
  ): Promise<ClaudeResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

    try {
      const request: ClaudeRequest = {
        model: options?.model || 'claude-sonnet-4-5-20250929',
        max_tokens: options?.maxTokens || 1024,
        messages,
        system: options?.system,
        temperature: options?.temperature,
      };

      const response = await fetch(`${this.proxyUrl}/api/claude`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Claude API request failed: ${response.status} ${errorBody}`);
      }

      const data: ClaudeResponse = await response.json();
      return data;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.warn('[Claude Client] Request timeout after 60s');
          throw new Error('Claude request timeout');
        }
        console.warn('[Claude Client] Request failed:', error.message);
      } else {
        console.warn('[Claude Client] Request failed:', error);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Convenience method: ask a single question and get text response
   */
  async ask(prompt: string, systemPrompt?: string): Promise<string> {
    try {
      const messages: ClaudeMessage[] = [
        { role: 'user', content: prompt },
      ];

      const response = await this.sendMessage(messages, {
        system: systemPrompt,
      });

      // Extract text from first content block
      if (response.content && response.content.length > 0) {
        const firstBlock = response.content[0];
        if (firstBlock.type === 'text') {
          return firstBlock.text;
        }
      }

      console.warn('[Claude Client] No text content in response');
      return '';
    } catch (error) {
      console.warn('[Claude Client] ask() failed:', error);
      throw error;
    }
  }

  /**
   * Ask Claude and parse response as JSON
   * Returns null on parse failure
   */
  async askJSON<T>(prompt: string, systemPrompt?: string): Promise<T | null> {
    try {
      const text = await this.ask(prompt, systemPrompt);

      // Try to extract JSON from response (handle markdown code blocks)
      let jsonText = text.trim();

      // Remove markdown code blocks if present
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
      }

      // Try to find JSON object/array in the text
      const jsonMatch = jsonText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonText);
      return parsed as T;
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.warn('[Claude Client] Failed to parse JSON response:', error.message);
      } else {
        console.warn('[Claude Client] askJSON() failed:', error);
      }
      return null;
    }
  }

  /**
   * Check if the Claude proxy is available
   */
  async isAvailable(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

    try {
      const response = await fetch(`${this.proxyUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      return response.ok;
    } catch (error) {
      // Proxy not available - this is normal if MCP server isn't running
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// Singleton instance
const PROXY_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MCP_PROXY_URL) ||
  'http://localhost:3100';

export const claudeClient = new ClaudeClient(PROXY_URL);
