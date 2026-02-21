import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../claude-client', () => ({
  claudeClient: {
    isAvailable: vi.fn(),
    sendMessage: vi.fn(),
  },
}));

vi.mock('../gemini-client', () => ({
  geminiClient: {
    isAvailable: vi.fn(() => false),
    ask: vi.fn(),
  },
}));

vi.mock('../kimi-client', () => ({
  kimiClient: {
    isAvailable: vi.fn(() => false),
    ask: vi.fn(),
  },
}));

vi.mock('../deepseek-client', () => ({
  deepseekClient: {
    isAvailable: vi.fn(() => false),
    ask: vi.fn(),
  },
}));

vi.mock('../../ollama-client', () => ({
  generateContent: vi.fn(),
  isOllamaConfigured: vi.fn(() => false),
}));

vi.mock('../../../store/apiSpendStore', () => ({
  useApiSpendStore: {
    getState: () => ({ logCall: vi.fn() }),
  },
}));

import { detectProvider, askAI, aiService } from '../ai-service';
import { claudeClient } from '../claude-client';
import { geminiClient } from '../gemini-client';
import { kimiClient } from '../kimi-client';
import { deepseekClient } from '../deepseek-client';
import { isOllamaConfigured } from '../../ollama-client';

const mockedClaudeClient = vi.mocked(claudeClient);
const mockedGeminiClient = vi.mocked(geminiClient);
const mockedIsOllamaConfigured = vi.mocked(isOllamaConfigured);

describe('ai-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detectProvider returns claude when proxy available', async () => {
    mockedClaudeClient.isAvailable.mockResolvedValueOnce(true);

    const provider = await detectProvider();
    expect(provider).toBe('claude');
  });

  it('detectProvider returns gemini when Claude unavailable and Gemini configured', async () => {
    mockedClaudeClient.isAvailable.mockResolvedValueOnce(false);
    mockedGeminiClient.isAvailable.mockReturnValueOnce(true);

    const provider = await detectProvider();
    expect(provider).toBe('gemini');
  });

  it('detectProvider returns ollama when earlier providers unavailable and Ollama configured', async () => {
    mockedClaudeClient.isAvailable.mockResolvedValueOnce(false);
    mockedGeminiClient.isAvailable.mockReturnValueOnce(false);
    // deepseek + kimi also unavailable (default mocks return false)
    mockedIsOllamaConfigured.mockReturnValueOnce(true);

    const provider = await detectProvider();
    expect(provider).toBe('ollama');
  });

  it('detectProvider returns rules when nothing available', async () => {
    mockedClaudeClient.isAvailable.mockResolvedValueOnce(false);
    mockedGeminiClient.isAvailable.mockReturnValueOnce(false);
    mockedIsOllamaConfigured.mockReturnValueOnce(false);

    const provider = await detectProvider();
    expect(provider).toBe('rules');
  });

  it('askAI uses Claude (Sonnet) for default role when available', async () => {
    mockedClaudeClient.isAvailable.mockResolvedValueOnce(true);
    mockedClaudeClient.sendMessage.mockResolvedValueOnce({
      id: 'msg-1',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Claude response text' }],
      model: 'claude-sonnet-4-5-20250929',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    const result = await askAI('What is the weather?');
    expect(result).toBe('Claude response text');
    expect(mockedClaudeClient.sendMessage).toHaveBeenCalled();
  });

  it('askAI falls back to Gemini when Claude unavailable', async () => {
    mockedClaudeClient.isAvailable.mockResolvedValueOnce(false);
    mockedGeminiClient.isAvailable.mockReturnValueOnce(true);
    mockedGeminiClient.ask.mockResolvedValueOnce({
      text: 'Gemini response text',
      usage: { promptTokenCount: 10, candidatesTokenCount: 20 },
      model: 'gemini-2.5-pro',
    });

    const result = await askAI('What is the weather?');
    expect(result).toBe('Gemini response text');
  });

  it('askAI returns null when no provider available', async () => {
    mockedClaudeClient.isAvailable.mockResolvedValueOnce(false);
    mockedGeminiClient.isAvailable.mockReturnValueOnce(false);
    mockedIsOllamaConfigured.mockReturnValueOnce(false);

    const result = await askAI('What is the weather?');
    expect(result).toBeNull();
  });

  it('aiService exports all functions', () => {
    expect(aiService.askAI).toBeDefined();
    expect(aiService.askAIJSON).toBeDefined();
    expect(aiService.getActiveProvider).toBeDefined();
    expect(aiService.detectProvider).toBeDefined();
  });
});
