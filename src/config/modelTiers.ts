/**
 * Model Tier Configuration
 *
 * Maps agent roles to tiered AI model chains (primary → fallback → emergency).
 * Each role has a specific model strategy optimized for its workload.
 */

export type AgentRole = 'ceo' | 'ea' | 'fast' | 'coding' | 'workers' | 'reasoner' | 'sentry' | 'default';

export type AIProviderType = 'claude' | 'gemini' | 'kimi' | 'deepseek' | 'ollama';

export interface ModelSpec {
  provider: AIProviderType;
  model: string;
  label: string; // Human-readable name for UI
}

export interface ModelTier {
  primary: ModelSpec;
  fallbacks: ModelSpec[];
}

/**
 * Model tiers per role — iterate primary then fallbacks in order.
 *
 * CEO:      Opus → Gemini 3.1 Pro → DeepSeek V3.2
 * Fast:     Gemini Flash → Kimi K2.5 → DeepSeek V3.2
 * EA:       Kimi K2.5 → Gemini 3.1 Pro → DeepSeek V3.2
 * Coding:   Sonnet → Gemini 3.1 Pro → DeepSeek V3.2
 * Workers:  Kimi K2.5 → DeepSeek V3.2 → Llama (local)
 * Reasoner: DeepSeek V3.2 → Kimi K2.5 → Llama (local)
 * Default:  Sonnet → Gemini 3.1 Pro → DeepSeek V3.2 → Llama (local)
 */
export const MODEL_TIERS: Record<AgentRole, ModelTier> = {
  ceo: {
    primary: { provider: 'claude', model: 'claude-opus-4-2025-04-16', label: 'Opus' },
    fallbacks: [
      { provider: 'gemini', model: 'gemini-2.5-pro', label: 'Gemini 3.1 Pro' },
      { provider: 'deepseek', model: 'deepseek-chat', label: 'DeepSeek V3.2' },
    ],
  },
  fast: {
    primary: { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini Flash' },
    fallbacks: [
      { provider: 'kimi', model: 'kimi-k2.5', label: 'Kimi K2.5' },
      { provider: 'deepseek', model: 'deepseek-chat', label: 'DeepSeek V3.2' },
    ],
  },
  ea: {
    primary: { provider: 'kimi', model: 'kimi-k2.5', label: 'Kimi K2.5' },
    fallbacks: [
      { provider: 'gemini', model: 'gemini-2.5-pro', label: 'Gemini 3.1 Pro' },
      { provider: 'deepseek', model: 'deepseek-chat', label: 'DeepSeek V3.2' },
    ],
  },
  coding: {
    primary: { provider: 'claude', model: 'claude-sonnet-4-5-20250929', label: 'Sonnet' },
    fallbacks: [
      { provider: 'gemini', model: 'gemini-2.5-pro', label: 'Gemini 3.1 Pro' },
      { provider: 'deepseek', model: 'deepseek-chat', label: 'DeepSeek V3.2' },
    ],
  },
  workers: {
    primary: { provider: 'kimi', model: 'kimi-k2.5', label: 'Kimi K2.5' },
    fallbacks: [
      { provider: 'deepseek', model: 'deepseek-chat', label: 'DeepSeek V3.2' },
      { provider: 'ollama', model: 'llama3.3', label: 'Llama (local)' },
    ],
  },
  reasoner: {
    primary: { provider: 'deepseek', model: 'deepseek-chat', label: 'DeepSeek V3.2' },
    fallbacks: [
      { provider: 'kimi', model: 'kimi-k2.5', label: 'Kimi K2.5' },
      { provider: 'ollama', model: 'llama3.3', label: 'Llama (local)' },
    ],
  },
  sentry: {
    primary: { provider: 'deepseek', model: 'deepseek-chat', label: 'DeepSeek V3.2' },
    fallbacks: [
      { provider: 'kimi', model: 'kimi-k2.5', label: 'Kimi K2.5' },
      { provider: 'ollama', model: 'llama3.3', label: 'Llama (local)' },
    ],
  },
  default: {
    primary: { provider: 'claude', model: 'claude-sonnet-4-5-20250929', label: 'Sonnet' },
    fallbacks: [
      { provider: 'gemini', model: 'gemini-2.5-pro', label: 'Gemini 3.1 Pro' },
      { provider: 'deepseek', model: 'deepseek-chat', label: 'DeepSeek V3.2' },
      { provider: 'ollama', model: 'llama3.3', label: 'Llama (local)' },
    ],
  },
};

/** Map agent IDs → roles */
export const AGENT_ROLE_MAP: Record<string, AgentRole> = {
  manager: 'ceo',
  'ea-user': 'ea',
  'ea-wife': 'ea',
  sales: 'workers',
  marketing: 'workers',
  finance: 'workers',
  support: 'workers',
  reasoner: 'reasoner',
  sentry: 'sentry',
  main: 'default',
};

/** Cost per 1M tokens: [input, output] */
export const TOKEN_PRICING: Record<string, [number, number]> = {
  'claude-opus-4-2025-04-16': [15, 75],
  'claude-sonnet-4-5-20250929': [3, 15],
  'gemini-2.5-pro': [2, 12],
  'gemini-2.5-flash': [0.15, 0.60],
  'kimi-k2.5': [0.60, 3],
  'deepseek-chat': [0.28, 0.42],
  'llama3.3': [0, 0],
  'llama3.1:latest': [0, 0],
};

/** Calculate cost in USD from token counts */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = TOKEN_PRICING[model] || [0, 0];
  const inputCost = (inputTokens / 1_000_000) * pricing[0];
  const outputCost = (outputTokens / 1_000_000) * pricing[1];
  return inputCost + outputCost;
}
