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

const MODEL = 'gemini-2.5-flash';

class GeminiClient {
  isAvailable(): boolean {
    return !!import.meta.env.VITE_GEMINI_API_KEY;
  }

  async ask(prompt: string, systemPrompt?: string): Promise<string> {
    const ai = getGenAI();
    if (!ai) throw new Error('Gemini API key not configured');

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        systemInstruction: systemPrompt || undefined,
        temperature: 0.7,
      },
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No text in Gemini response');
    return text.trim();
  }

  async askJSON<T>(prompt: string, systemPrompt?: string): Promise<T | null> {
    try {
      const text = await this.ask(prompt, systemPrompt);

      let jsonText = text.trim();

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
