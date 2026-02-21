/**
 * Gemini Client — Google AI Text Generation
 *
 * Uses @google/genai SDK (already installed for vision-image-generator).
 * Provides text generation via Gemini 2.5 Flash — fast, stable, cloud-hosted.
 */

import { GoogleGenAI } from '@google/genai';

let genAI: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI | null {
  if (genAI) return genAI;
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return null;
  genAI = new GoogleGenAI({ apiKey });
  return genAI;
}

const DEFAULT_MODEL = 'gemini-2.5-flash';

export interface GeminiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface GeminiResponse {
  text: string;
  usage: GeminiUsage;
  model: string;
}

class GeminiClient {
  isAvailable(): boolean {
    return !!import.meta.env.VITE_GEMINI_API_KEY;
  }

  async ask(prompt: string, systemPrompt?: string, model?: string): Promise<GeminiResponse> {
    const ai = getGenAI();
    if (!ai) throw new Error('Gemini API key not configured');

    const modelId = model || DEFAULT_MODEL;
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        systemInstruction: systemPrompt || undefined,
        temperature: 0.7,
      },
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No text in Gemini response');

    const usage: GeminiUsage = response.usageMetadata || {};

    return { text: text.trim(), usage, model: modelId };
  }

  /** Simple text-only ask (backward compat) */
  async askText(prompt: string, systemPrompt?: string, model?: string): Promise<string> {
    const response = await this.ask(prompt, systemPrompt, model);
    return response.text;
  }

  async askJSON<T>(prompt: string, systemPrompt?: string, model?: string): Promise<T | null> {
    try {
      const response = await this.ask(prompt, systemPrompt, model);

      let jsonText = response.text.trim();

      // Remove markdown code blocks if present
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
      }

      // Extract JSON object/array from surrounding text
      const jsonMatch = jsonText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      return JSON.parse(jsonText) as T;
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.warn('[Gemini Client] Failed to parse JSON response:', error.message);
      } else {
        console.warn('[Gemini Client] askJSON() failed:', error);
      }
      return null;
    }
  }
}

export const geminiClient = new GeminiClient();
