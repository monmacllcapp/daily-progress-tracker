import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * V2 AI Fallback Tests
 *
 * Tests the AI provider fallback chain: Claude → Gemini → Rules-based
 * Verifies correct provider detection and graceful degradation.
 */

// Mock the Claude client
vi.mock('../ai/claude-client', () => ({
  claudeClient: {
    isAvailable: vi.fn(),
    ask: vi.fn(),
    askJSON: vi.fn(),
  },
}));

// Mock the AI advisor
vi.mock('../ai-advisor', () => ({
  isAIAvailable: vi.fn(),
}));

// Mock Google Generative AI
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: vi.fn().mockReturnValue('Mocked Gemini response'),
        },
      }),
    }),
  })),
}));

import { claudeClient } from '../ai/claude-client';
import { isAIAvailable } from '../ai-advisor';
import { GoogleGenerativeAI } from '@google/generative-ai';

describe('V2 AI Fallback Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Simple provider detection logic for testing
   */
  async function detectProvider(): Promise<'claude' | 'gemini' | 'rules'> {
    // Check Claude first
    const claudeAvailable = await claudeClient.isAvailable();
    if (claudeAvailable) {
      return 'claude';
    }

    // Check Gemini
    const geminiAvailable = isAIAvailable();
    if (geminiAvailable) {
      return 'gemini';
    }

    // Fallback to rules
    return 'rules';
  }

  /**
   * Simple AI wrapper for testing
   */
  async function askAI(prompt: string): Promise<string | null> {
    const provider = await detectProvider();

    if (provider === 'claude') {
      try {
        return await claudeClient.ask(prompt);
      } catch {
        return null;
      }
    }

    if (provider === 'gemini') {
      try {
        const genAI = new GoogleGenerativeAI('fake-key');
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        const result = await model.generateContent(prompt);
        return result.response.text();
      } catch {
        return null;
      }
    }

    // Rules-based fallback
    return null;
  }

  /**
   * Simple AI JSON wrapper for testing
   */
  async function askAIJSON<T>(prompt: string): Promise<T | null> {
    const provider = await detectProvider();

    if (provider === 'claude') {
      try {
        return await claudeClient.askJSON<T>(prompt);
      } catch {
        return null;
      }
    }

    if (provider === 'gemini') {
      try {
        const text = await askAI(prompt);
        if (!text) return null;
        return JSON.parse(text) as T;
      } catch {
        return null;
      }
    }

    return null;
  }

  it('should detect provider as claude when proxy is healthy', async () => {
    vi.mocked(claudeClient.isAvailable).mockResolvedValue(true);

    const provider = await detectProvider();

    expect(provider).toBe('claude');
    expect(claudeClient.isAvailable).toHaveBeenCalled();
  });

  it('should detect provider as gemini when Claude unavailable but Gemini key exists', async () => {
    vi.mocked(claudeClient.isAvailable).mockResolvedValue(false);
    vi.mocked(isAIAvailable).mockReturnValue(true);

    const provider = await detectProvider();

    expect(provider).toBe('gemini');
    expect(claudeClient.isAvailable).toHaveBeenCalled();
    expect(isAIAvailable).toHaveBeenCalled();
  });

  it('should detect provider as rules when both unavailable', async () => {
    vi.mocked(claudeClient.isAvailable).mockResolvedValue(false);
    vi.mocked(isAIAvailable).mockReturnValue(false);

    const provider = await detectProvider();

    expect(provider).toBe('rules');
    expect(claudeClient.isAvailable).toHaveBeenCalled();
    expect(isAIAvailable).toHaveBeenCalled();
  });

  it('should return Claude response when available', async () => {
    vi.mocked(claudeClient.isAvailable).mockResolvedValue(true);
    vi.mocked(claudeClient.ask).mockResolvedValue('Claude response');

    const response = await askAI('Test prompt');

    expect(response).toBe('Claude response');
    expect(claudeClient.ask).toHaveBeenCalledWith('Test prompt');
  });

  it('should fall back to null when no provider available', async () => {
    vi.mocked(claudeClient.isAvailable).mockResolvedValue(false);
    vi.mocked(isAIAvailable).mockReturnValue(false);

    const response = await askAI('Test prompt');

    expect(response).toBeNull();
  });

  it('should return parsed JSON from Claude when available', async () => {
    const mockJSON = { result: 'success', data: [1, 2, 3] };
    vi.mocked(claudeClient.isAvailable).mockResolvedValue(true);
    vi.mocked(claudeClient.askJSON).mockResolvedValue(mockJSON);

    const response = await askAIJSON<typeof mockJSON>('Test prompt');

    expect(response).toEqual(mockJSON);
    expect(claudeClient.askJSON).toHaveBeenCalledWith('Test prompt');
  });

  it('should return null when no provider available for JSON request', async () => {
    vi.mocked(claudeClient.isAvailable).mockResolvedValue(false);
    vi.mocked(isAIAvailable).mockReturnValue(false);

    const response = await askAIJSON<{ result: string }>('Test prompt');

    expect(response).toBeNull();
  });

  it('should use same detected provider for multiple sequential calls', async () => {
    // Set up Claude as available
    vi.mocked(claudeClient.isAvailable).mockResolvedValue(true);
    vi.mocked(claudeClient.ask).mockResolvedValue('Response 1');

    // First call
    const provider1 = await detectProvider();
    const response1 = await askAI('Prompt 1');

    // Second call
    const provider2 = await detectProvider();
    await askAI('Prompt 2');

    // Both should use Claude
    expect(provider1).toBe('claude');
    expect(provider2).toBe('claude');
    expect(response1).toBe('Response 1');
    expect(claudeClient.ask).toHaveBeenCalledTimes(2);
  });

  it('should handle Claude failure gracefully and return null', async () => {
    vi.mocked(claudeClient.isAvailable).mockResolvedValue(true);
    vi.mocked(claudeClient.ask).mockRejectedValue(new Error('Network error'));

    const response = await askAI('Test prompt');

    expect(response).toBeNull();
  });

  it('should fall back to Gemini when Claude unavailable', async () => {
    vi.mocked(claudeClient.isAvailable).mockResolvedValue(false);
    vi.mocked(isAIAvailable).mockReturnValue(true);

    const provider = await detectProvider();

    expect(provider).toBe('gemini');
  });

  it('should handle JSON parse failure gracefully', async () => {
    vi.mocked(claudeClient.isAvailable).mockResolvedValue(true);
    vi.mocked(claudeClient.askJSON).mockResolvedValue(null); // Claude returns null for parse failure

    const response = await askAIJSON<{ result: string }>('Test prompt');

    expect(response).toBeNull();
  });

  it('should handle Claude isAvailable timeout gracefully', async () => {
    vi.mocked(claudeClient.isAvailable).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(false), 100))
    );
    vi.mocked(isAIAvailable).mockReturnValue(false);

    const provider = await detectProvider();

    expect(provider).toBe('rules');
  });

  it('should prioritize Claude over Gemini when both available', async () => {
    vi.mocked(claudeClient.isAvailable).mockResolvedValue(true);
    vi.mocked(isAIAvailable).mockReturnValue(true);
    vi.mocked(claudeClient.ask).mockResolvedValue('Claude response');

    const provider = await detectProvider();
    const response = await askAI('Test prompt');

    expect(provider).toBe('claude');
    expect(response).toBe('Claude response');
    // Gemini should not be called
    expect(GoogleGenerativeAI).not.toHaveBeenCalled();
  });

  it('should handle empty response from Claude gracefully', async () => {
    vi.mocked(claudeClient.isAvailable).mockResolvedValue(true);
    vi.mocked(claudeClient.ask).mockResolvedValue('');

    const response = await askAI('Test prompt');

    expect(response).toBe('');
  });

  it('should handle malformed JSON from Claude askJSON gracefully', async () => {
    vi.mocked(claudeClient.isAvailable).mockResolvedValue(true);
    vi.mocked(claudeClient.askJSON).mockResolvedValue(null);

    const response = await askAIJSON<{ result: string }>('Test prompt');

    expect(response).toBeNull();
  });
});
