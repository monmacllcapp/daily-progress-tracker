/**
 * Unified AI Service — Role-Based Tiered Routing
 *
 * Each agent role (ceo, ea, coding, workers, reasoner, default) has its own
 * primary → fallback → emergency model chain defined in modelTiers.ts.
 * Every call is logged to apiSpendStore with real token counts and cost.
 *
 * Backward compatible: askAI(prompt) with no options uses 'default' role.
 */

import { claudeClient } from './claude-client';
import { geminiClient } from './gemini-client';
import { kimiClient } from './kimi-client';
import { deepseekClient } from './deepseek-client';
import { generateContent, isOllamaConfigured } from '../ollama-client';
import {
  MODEL_TIERS,
  type AgentRole,
  type AIProviderType,
  type ModelSpec,
} from '../../config/modelTiers';
import { useApiSpendStore } from '../../store/apiSpendStore';

export type AIProvider = AIProviderType | 'rules';

export interface AICallOptions {
  role?: AgentRole;
  agentId?: string;
}

interface ProviderResult {
  text: string;
  provider: AIProviderType;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Check if a specific provider is available
 */
function isProviderAvailable(provider: AIProviderType): boolean | Promise<boolean> {
  switch (provider) {
    case 'claude':
      return claudeClient.isAvailable();
    case 'gemini':
      return geminiClient.isAvailable();
    case 'kimi':
      return kimiClient.isAvailable();
    case 'deepseek':
      return deepseekClient.isAvailable();
    case 'ollama':
      return isOllamaConfigured();
  }
}

/**
 * Call a single provider with a prompt. Returns text + token usage.
 */
async function callProvider(
  spec: ModelSpec,
  prompt: string,
  systemPrompt?: string
): Promise<ProviderResult> {
  switch (spec.provider) {
    case 'claude': {
      const response = await claudeClient.sendMessage(
        [{ role: 'user', content: prompt }],
        { system: systemPrompt, model: spec.model }
      );
      const text = response.content?.[0]?.type === 'text' ? response.content[0].text : '';
      return {
        text,
        provider: 'claude',
        model: response.model || spec.model,
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
      };
    }

    case 'gemini': {
      const response = await geminiClient.ask(prompt, systemPrompt, spec.model);
      // Gemini returns token counts via usageMetadata
      return {
        text: response.text,
        provider: 'gemini',
        model: response.model,
        inputTokens: response.usage.promptTokenCount || 0,
        outputTokens: response.usage.candidatesTokenCount || 0,
      };
    }

    case 'kimi': {
      const response = await kimiClient.ask(prompt, systemPrompt, spec.model);
      return {
        text: response.text,
        provider: 'kimi',
        model: response.model,
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
      };
    }

    case 'deepseek': {
      const response = await deepseekClient.ask(prompt, systemPrompt, spec.model);
      return {
        text: response.text,
        provider: 'deepseek',
        model: response.model,
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
      };
    }

    case 'ollama': {
      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
      const text = await generateContent(fullPrompt);
      return {
        text,
        provider: 'ollama',
        model: spec.model,
        inputTokens: 0,
        outputTokens: 0,
      };
    }
  }
}

/**
 * Log a successful call to the spend store
 */
function logSpend(result: ProviderResult, role: string, agentId?: string) {
  try {
    useApiSpendStore.getState().logCall({
      provider: result.provider,
      model: result.model,
      role,
      agentId,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
  } catch {
    // Don't let logging errors break AI calls
  }
}

/**
 * Get the ordered model chain for a role
 */
function getModelChain(role: AgentRole): ModelSpec[] {
  const tier = MODEL_TIERS[role] || MODEL_TIERS.default;
  return [tier.primary, ...tier.fallbacks];
}

/**
 * Detect which AI provider is currently available (first in default chain)
 */
export async function detectProvider(): Promise<AIProvider> {
  const chain = getModelChain('default');
  for (const spec of chain) {
    const available = await isProviderAvailable(spec.provider);
    if (available) return spec.provider;
  }
  return 'rules';
}

/**
 * Ask AI a question — iterates the role's model chain.
 * Falls back through providers until one succeeds.
 */
export async function askAI(
  prompt: string,
  systemPrompt?: string,
  options?: AICallOptions
): Promise<string | null> {
  const role = options?.role || 'default';
  const chain = getModelChain(role);

  for (let i = 0; i < chain.length; i++) {
    const spec = chain[i];
    try {
      const available = await isProviderAvailable(spec.provider);
      if (!available) continue;

      console.info(`[AI Service] Using ${spec.label} (${spec.provider}) for role: ${role}`);
      const result = await callProvider(spec, prompt, systemPrompt);
      logSpend(result, role, options?.agentId);
      return result.text;
    } catch (error) {
      const next = chain[i + 1];
      if (next) {
        console.warn(`[AI Service] ${spec.label} failed, trying ${next.label}:`, error);
      } else {
        console.warn(`[AI Service] ${spec.label} failed (last in chain):`, error);
      }
    }
  }

  console.info('[AI Service] Using provider: rules (no AI available)');
  return null;
}

/**
 * Ask AI and parse response as JSON — iterates the role's model chain.
 */
export async function askAIJSON<T>(
  prompt: string,
  systemPrompt?: string,
  options?: AICallOptions
): Promise<T | null> {
  const role = options?.role || 'default';
  const chain = getModelChain(role);

  for (let i = 0; i < chain.length; i++) {
    const spec = chain[i];
    try {
      const available = await isProviderAvailable(spec.provider);
      if (!available) continue;

      console.info(`[AI Service] Using ${spec.label} (${spec.provider}) for role: ${role}`);
      const result = await callProvider(spec, prompt, systemPrompt);
      logSpend(result, role, options?.agentId);

      // Parse JSON from response
      let jsonText = result.text.trim();
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
      }
      const jsonMatch = jsonText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      return JSON.parse(jsonText) as T;
    } catch (error) {
      const next = chain[i + 1];
      if (next) {
        console.warn(`[AI Service] ${spec.label} failed, trying ${next.label}:`, error);
      } else {
        console.warn(`[AI Service] ${spec.label} failed (last in chain):`, error);
      }
    }
  }

  console.info('[AI Service] Using provider: rules (no AI available)');
  return null;
}

/**
 * Get the currently active AI provider for a given role
 */
export async function getActiveProvider(role: AgentRole = 'default'): Promise<AIProvider> {
  const chain = getModelChain(role);
  for (const spec of chain) {
    const available = await isProviderAvailable(spec.provider);
    if (available) return spec.provider;
  }
  return 'rules';
}

// Export unified service interface
export const aiService = {
  askAI,
  askAIJSON,
  getActiveProvider,
  detectProvider,
};
