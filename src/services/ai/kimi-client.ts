/**
 * Kimi K2.5 Client — Moonshot AI
 *
 * OpenAI-compatible API for Kimi K2.5 (Agent Swarm capable).
 * Best-in-class for tool use and multi-agent orchestration.
 */

const getApiKey = () => import.meta.env.VITE_KIMI_API_KEY || '';
const BASE_URL = 'https://api.moonshot.cn/v1';
const DEFAULT_MODEL = 'kimi-k2.5';

export interface KimiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface KimiResponse {
  text: string;
  usage: KimiUsage;
  model: string;
}

class KimiClient {
  isAvailable(): boolean {
    return !!getApiKey();
  }

  async ask(prompt: string, systemPrompt?: string, model?: string): Promise<KimiResponse> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('Kimi API key not configured');

    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        messages,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Kimi API error: ${response.status} ${errorBody}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const usage: KimiUsage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    return { text: text.trim(), usage, model: data.model || model || DEFAULT_MODEL };
  }

  async askJSON<T>(prompt: string, systemPrompt?: string, model?: string): Promise<{ data: T | null; usage: KimiUsage; model: string }> {
    const response = await this.ask(prompt, systemPrompt, model);

    try {
      let jsonText = response.text;
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
      }
      const jsonMatch = jsonText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }
      return { data: JSON.parse(jsonText) as T, usage: response.usage, model: response.model };
    } catch {
      console.warn('[Kimi Client] Failed to parse JSON response');
      return { data: null, usage: response.usage, model: response.model };
    }
  }
}

export const kimiClient = new KimiClient();
