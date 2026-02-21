/**
 * DeepSeek V3.2 Client
 *
 * OpenAI-compatible API for DeepSeek V3.2.
 * Outperforms GPT-5 on reasoning at $0.28/$0.42 per 1M tokens.
 */

const getApiKey = () => import.meta.env.VITE_DEEPSEEK_API_KEY || '';
const BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-chat';

export interface DeepSeekUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface DeepSeekResponse {
  text: string;
  usage: DeepSeekUsage;
  model: string;
}

class DeepSeekClient {
  isAvailable(): boolean {
    return !!getApiKey();
  }

  async ask(prompt: string, systemPrompt?: string, model?: string): Promise<DeepSeekResponse> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('DeepSeek API key not configured');

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
      throw new Error(`DeepSeek API error: ${response.status} ${errorBody}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const usage: DeepSeekUsage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    return { text: text.trim(), usage, model: data.model || model || DEFAULT_MODEL };
  }

  async askJSON<T>(prompt: string, systemPrompt?: string, model?: string): Promise<{ data: T | null; usage: DeepSeekUsage; model: string }> {
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
      console.warn('[DeepSeek Client] Failed to parse JSON response');
      return { data: null, usage: response.usage, model: response.model };
    }
  }
}

export const deepseekClient = new DeepSeekClient();
