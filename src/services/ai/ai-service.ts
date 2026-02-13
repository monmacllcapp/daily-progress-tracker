import { claudeClient } from './claude-client';
import { isAIAvailable as isGeminiAvailable } from '../ai-advisor';

/**
 * Unified AI Service
 *
 * Provides 3-layer fallback for AI features:
 * 1. Claude (via MCP proxy) - preferred
 * 2. Gemini (direct API) - fallback
 * 3. Rule-based logic - last resort
 */

export type AIProvider = 'claude' | 'gemini' | 'rules';

/**
 * Detect which AI provider is currently available
 */
export async function detectProvider(): Promise<AIProvider> {
  // Try Claude first (check if MCP proxy is running)
  const claudeAvailable = await claudeClient.isAvailable();
  if (claudeAvailable) {
    return 'claude';
  }

  // Try Gemini (check if API key is configured)
  if (isGeminiAvailable()) {
    return 'gemini';
  }

  // Fall back to rule-based logic
  return 'rules';
}

/**
 * Ask AI a question and get text response
 * Falls back through providers: Claude -> Gemini -> null
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

  // Try Gemini fallback
  try {
    if (isGeminiAvailable()) {
      console.info('[AI Service] Using provider: gemini');
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

      const fullPrompt = systemPrompt
        ? `${systemPrompt}\n\n${prompt}`
        : prompt;

      const result = await model.generateContent(fullPrompt);
      const text = result.response.text();
      return text;
    }
  } catch (error) {
    console.warn('[AI Service] Gemini failed:', error);
  }

  // No AI available
  console.info('[AI Service] Using provider: rules (no AI available)');
  return null;
}

/**
 * Ask AI and parse response as JSON
 * Falls back through providers: Claude -> Gemini -> null
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

  // Try Gemini fallback
  try {
    if (isGeminiAvailable()) {
      console.info('[AI Service] Using provider: gemini');
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

      const fullPrompt = systemPrompt
        ? `${systemPrompt}\n\n${prompt}`
        : prompt;

      const result = await model.generateContent(fullPrompt);
      const text = result.response.text().trim();

      // Try to extract JSON from response (handle markdown code blocks)
      let jsonText = text;
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
    console.warn('[AI Service] Gemini failed:', error);
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
