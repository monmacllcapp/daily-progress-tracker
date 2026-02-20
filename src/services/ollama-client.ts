/**
 * Ollama Client
 *
 * Shared client for all AI features. Replaces Google Gemini SDK with
 * local Ollama inference via OpenAI-compatible API.
 * Zero API cost — runs on local GPU (10.0.0.204).
 */

const getBaseUrl = () => import.meta.env.VITE_OLLAMA_BASE_URL || '';
const getModel = () => import.meta.env.VITE_OLLAMA_MODEL || 'llama3.1:latest';

/**
 * Check if Ollama is configured (base URL set)
 */
export function isOllamaConfigured(): boolean {
    return !!import.meta.env.VITE_OLLAMA_BASE_URL;
}

/**
 * Generate text from a prompt using Ollama's OpenAI-compatible API.
 * Returns the raw text response (trimmed).
 */
export async function generateContent(prompt: string): Promise<string> {
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
        throw new Error('VITE_OLLAMA_BASE_URL is not configured');
    }

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: getModel(),
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
        }),
    });

    if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
}

// --- Testing support ---

let testOverrideUrl: string | undefined;
let testingModeActive = false;

/** @internal Override the base URL for testing. Pass undefined to disable. */
export function _setTestBaseUrl(url?: string): void {
    testOverrideUrl = url;
    testingModeActive = url !== undefined;
}

/** @internal Check if configured, respecting test override. */
export function _isConfiguredForTest(): boolean {
    if (testingModeActive) return !!testOverrideUrl;
    return isOllamaConfigured();
}
