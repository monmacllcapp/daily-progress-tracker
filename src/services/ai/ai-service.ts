import { claudeClient } from './claude-client';
import { geminiClient } from './gemini-client';
import { generateContent, isOllamaConfigured } from '../ollama-client';

/**
 * Unified AI Service
 *
 * Provides 4-layer fallback for AI features:
 * 1. Claude (via MCP proxy) - preferred
 * 2. Gemini (Google AI cloud) - stable fallback
 * 3. Ollama (local LLM) - offline fallback
 * 4. Rule-based logic - last resort
 */

export type AIProvider = 'claude' | 'gemini' | 'ollama' | 'rules';

/**
 * Detect which AI provider is currently available
 */
export async function detectProvider(): Promise<AIProvider> {
  // Try Claude first (check if MCP proxy is running)
  const claudeAvailable = await claudeClient.isAvailable();
  if (claudeAvailable) {
    return 'claude';
  }

  // Try Gemini (check if API key is set)
  if (geminiClient.isAvailable()) {
    return 'gemini';
  }

  // Try Ollama (check if local LLM is configured)
  if (isOllamaConfigured()) {
    return 'ollama';
  }

  // Fall back to rule-based logic
  return 'rules';
}

/**
 * Ask AI a question and get text response
 * Falls back through providers: Claude -> Gemini -> Ollama -> null
 */
export async function askAI(
  prompt: string,
  systemPrompt?: string
): Promise<string | null> {
  // Try Claude first
  try {
    const claudeAvailable = await claudeClient.isAvailable();
    if (claudeAvailable) {
      console.info('[AI Service] Using provider: claude');
      const response = await claudeClient.ask(prompt, systemPrompt);
      return response;
    }
  } catch (error) {
    console.warn('[AI Service] Claude failed, trying Gemini:', error);
  }

  // Try Gemini
  try {
    if (geminiClient.isAvailable()) {
      console.info('[AI Service] Using provider: gemini');
      return await geminiClient.ask(prompt, systemPrompt);
    }
  } catch (error) {
    console.warn('[AI Service] Gemini failed, trying Ollama:', error);
  }

  // Try Ollama fallback
  try {
    if (isOllamaConfigured()) {
      console.info('[AI Service] Using provider: ollama');
      const fullPrompt = systemPrompt
        ? `${systemPrompt}\n\n${prompt}`
        : prompt;

      const text = await generateContent(fullPrompt);
      return text;
    }
  } catch (error) {
    console.warn('[AI Service] Ollama failed:', error);
  }

  // No AI available
  console.info('[AI Service] Using provider: rules (no AI available)');
  return null;
}

/**
 * Ask AI and parse response as JSON
 * Falls back through providers: Claude -> Gemini -> Ollama -> null
 */
export async function askAIJSON<T>(
  prompt: string,
  systemPrompt?: string
): Promise<T | null> {
  // Try Claude first
  try {
    const claudeAvailable = await claudeClient.isAvailable();
    if (claudeAvailable) {
      console.info('[AI Service] Using provider: claude');
      const response = await claudeClient.askJSON<T>(prompt, systemPrompt);
      return response;
    }
  } catch (error) {
    console.warn('[AI Service] Claude failed, trying Gemini:', error);
  }

  // Try Gemini
  try {
    if (geminiClient.isAvailable()) {
      console.info('[AI Service] Using provider: gemini');
      return await geminiClient.askJSON<T>(prompt, systemPrompt);
    }
  } catch (error) {
    console.warn('[AI Service] Gemini failed, trying Ollama:', error);
  }

  // Try Ollama fallback
  try {
    if (isOllamaConfigured()) {
      console.info('[AI Service] Using provider: ollama');
      const fullPrompt = systemPrompt
        ? `${systemPrompt}\n\n${prompt}`
        : prompt;

      const text = await generateContent(fullPrompt);

      // Try to extract JSON from response (handle markdown code blocks)
      let jsonText = text.trim();
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
      }

      const jsonMatch = jsonText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonText);
      return parsed as T;
    }
  } catch (error) {
    console.warn('[AI Service] Ollama failed:', error);
  }

  // No AI available
  console.info('[AI Service] Using provider: rules (no AI available)');
  return null;
}

/**
 * Get the currently active AI provider
 */
export async function getActiveProvider(): Promise<AIProvider> {
  return detectProvider();
}

// Export unified service interface
export const aiService = {
  askAI,
  askAIJSON,
  getActiveProvider,
  detectProvider,
};
