import { GoogleGenAI } from '@google/genai';

let genAI: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI | null {
    if (genAI) return genAI;
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) return null;
    genAI = new GoogleGenAI({ apiKey });
    return genAI;
}

/**
 * Checks if AI image generation is available (API key configured)
 */
export function isImageGenAvailable(): boolean {
    return !!import.meta.env.VITE_GEMINI_API_KEY;
}

/**
 * Builds a default image generation prompt from vision board fields
 */
export function buildDefaultPrompt(declaration: string, purpose?: string): string {
    let prompt = `Create an inspiring, photorealistic vision board image representing: "${declaration}"`;
    if (purpose?.trim()) {
        prompt += `. The deeper meaning: "${purpose}"`;
    }
    prompt += '. Make it vivid, aspirational, and emotionally compelling. No text overlays.';
    return prompt;
}

/**
 * Generates a vision board image using Gemini image generation.
 * Returns a data URL string (data:{mimeType};base64,{data}) or null on failure.
 */
export async function generateVisionImage(prompt: string): Promise<string | null> {
    const ai = getGenAI();
    if (!ai) return null;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: prompt,
        });

        const parts = response.candidates?.[0]?.content?.parts;
        if (!parts) return null;

        for (const part of parts) {
            if (part.inlineData) {
                const { mimeType, data } = part.inlineData;
                return `data:${mimeType};base64,${data}`;
            }
        }

        return null;
    } catch (err) {
        console.error('[Vision Image Generator] Generation failed:', err);
        throw err;
    }
}
