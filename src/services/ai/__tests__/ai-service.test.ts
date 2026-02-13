import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../claude-client', () => ({
  claudeClient: {
    isAvailable: vi.fn(),
    ask: vi.fn(),
    askJSON: vi.fn(),
  },
}));

vi.mock('../../ai-advisor', () => ({
  isAIAvailable: vi.fn(),
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(),
}));

import { detectProvider, askAI, askAIJSON, aiService } from '../ai-service';
import { claudeClient } from '../claude-client';
import { isAIAvailable as isGeminiAvailable } from '../../ai-advisor';

const mockedClaudeClient = vi.mocked(claudeClient);
const mockedIsGeminiAvailable = vi.mocked(isGeminiAvailable);

describe('ai-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detectProvider returns claude when proxy available', async () => {
    mockedClaudeClient.isAvailable.mockResolvedValueOnce(true);

    const provider = await detectProvider();
    expect(provider).toBe('claude');
  });

  it('detectProvider returns gemini when Claude unavailable and Gemini key set', async () => {
    mockedClaudeClient.isAvailable.mockResolvedValueOnce(false);
    mockedIsGeminiAvailable.mockReturnValueOnce(true);

    const provider = await detectProvider();
    expect(provider).toBe('gemini');
  });

  it('detectProvider returns rules when nothing available', async () => {
    mockedClaudeClient.isAvailable.mockResolvedValueOnce(false);
    mockedIsGeminiAvailable.mockReturnValueOnce(false);

    const provider = await detectProvider();
    expect(provider).toBe('rules');
  });

  it('askAI uses Claude when available', async () => {
    mockedClaudeClient.isAvailable.mockResolvedValueOnce(true);
    mockedClaudeClient.ask.mockResolvedValueOnce('Claude response text');

    const result = await askAI('What is the weather?');
    expect(result).toBe('Claude response text');
    expect(mockedClaudeClient.ask).toHaveBeenCalledWith('What is the weather?', undefined);
  });

  it('askAI returns null when no provider available', async () => {
    mockedClaudeClient.isAvailable.mockResolvedValueOnce(false);
    mockedIsGeminiAvailable.mockReturnValueOnce(false);

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
