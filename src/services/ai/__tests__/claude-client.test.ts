import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeClient } from '../claude-client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

let client: ClaudeClient;

describe('ClaudeClient', () => {
  beforeEach(() => {
    client = new ClaudeClient('http://localhost:3100');
    mockFetch.mockReset();
  });

  it('sendMessage sends request to proxy', async () => {
    const mockResponse = {
      id: 'msg-123',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello!' }],
      model: 'claude-sonnet-4-5-20250929',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const response = await client.sendMessage([
      { role: 'user', content: 'Hi' },
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3100/api/claude',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
    );
    expect(response.id).toBe('msg-123');
    expect(response.content[0].text).toBe('Hello!');
  });

  it('sendMessage throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    await expect(
      client.sendMessage([{ role: 'user', content: 'Hi' }])
    ).rejects.toThrow('Claude API request failed');
  });

  it('ask returns text from first content block', async () => {
    const mockResponse = {
      id: 'msg-456',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'The answer is 42' }],
      model: 'claude-sonnet-4-5-20250929',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const text = await client.ask('What is the meaning of life?');
    expect(text).toBe('The answer is 42');
  });

  it('ask returns empty string when no content', async () => {
    const mockResponse = {
      id: 'msg-789',
      type: 'message',
      role: 'assistant',
      content: [],
      model: 'claude-sonnet-4-5-20250929',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 0 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const text = await client.ask('Hello');
    expect(text).toBe('');
  });

  it('askJSON parses valid JSON response', async () => {
    const mockResponse = {
      id: 'msg-001',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: '{"status": "ok", "count": 42}' }],
      model: 'claude-sonnet-4-5-20250929',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const json = await client.askJSON<{ status: string; count: number }>('Give me JSON');
    expect(json).toEqual({ status: 'ok', count: 42 });
  });

  it('askJSON extracts JSON from markdown code block', async () => {
    const mockResponse = {
      id: 'msg-002',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: '```json\n{"name": "Alice"}\n```' }],
      model: 'claude-sonnet-4-5-20250929',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const json = await client.askJSON<{ name: string }>('Give me JSON');
    expect(json).toEqual({ name: 'Alice' });
  });

  it('askJSON returns null on invalid JSON', async () => {
    const mockResponse = {
      id: 'msg-003',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'This is not JSON at all' }],
      model: 'claude-sonnet-4-5-20250929',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const json = await client.askJSON('Give me JSON');
    expect(json).toBeNull();
  });

  it('isAvailable returns true when proxy responds 200', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const available = await client.isAvailable();
    expect(available).toBe(true);
  });

  it('isAvailable returns false when proxy unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const available = await client.isAvailable();
    expect(available).toBe(false);
  });
});
