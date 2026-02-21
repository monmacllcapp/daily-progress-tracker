import { createDatabase } from '../db';

export type DiagnosticStatus = 'PASS' | 'WARN' | 'FAIL' | 'SKIP';

export interface DiagnosticCheck {
  id: string;
  title: string;
  category: 'Database' | 'AI' | 'Integrations' | 'Browser';
  status: DiagnosticStatus;
  detail?: string;
  suggestedFix?: string;
}

// ── Individual Checks ─────────────────────────────────────────────────────────

async function checkRxDB(): Promise<DiagnosticCheck> {
  try {
    const db = await createDatabase();
    const collections = Object.keys(db.collections ?? {});
    return {
      id: 'rxdb',
      title: 'RxDB (IndexedDB)',
      category: 'Database',
      status: 'PASS',
      detail: `Connected. Collections: ${collections.length > 0 ? collections.join(', ') : 'none found'}`,
    };
  } catch (err) {
    return {
      id: 'rxdb',
      title: 'RxDB (IndexedDB)',
      category: 'Database',
      status: 'FAIL',
      detail: `Failed to connect: ${err instanceof Error ? err.message : String(err)}`,
      suggestedFix: 'Try appending ?resetdb to the URL to wipe and re-initialise the database.',
    };
  }
}

function checkSupabase(): DiagnosticCheck {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const bothSet = !!(url && key);
  return {
    id: 'supabase',
    title: 'Supabase Replication',
    category: 'Database',
    status: bothSet ? 'PASS' : 'WARN',
    detail: bothSet
      ? `URL and anon key are configured. Replication runs at startup.`
      : `Missing: ${!url ? 'VITE_SUPABASE_URL ' : ''}${!key ? 'VITE_SUPABASE_ANON_KEY' : ''}`.trim(),
    suggestedFix: bothSet
      ? undefined
      : 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file to enable cloud sync.',
  };
}

function checkKimi(): DiagnosticCheck {
  const key = import.meta.env.VITE_KIMI_API_KEY;
  const isSet = !!(key && key.trim());
  return {
    id: 'kimi',
    title: 'Kimi AI',
    category: 'AI',
    status: isSet ? 'PASS' : 'WARN',
    detail: isSet ? 'API key is configured.' : 'VITE_KIMI_API_KEY is not set.',
    suggestedFix: isSet ? undefined : 'Add VITE_KIMI_API_KEY to .env',
  };
}

function checkDeepSeek(): DiagnosticCheck {
  const key = import.meta.env.VITE_DEEPSEEK_API_KEY;
  const isSet = !!(key && key.trim());
  return {
    id: 'deepseek',
    title: 'DeepSeek AI',
    category: 'AI',
    status: isSet ? 'PASS' : 'WARN',
    detail: isSet ? 'API key is configured.' : 'VITE_DEEPSEEK_API_KEY is not set.',
    suggestedFix: isSet ? undefined : 'Add VITE_DEEPSEEK_API_KEY to .env',
  };
}

async function checkOllama(): Promise<DiagnosticCheck> {
  const baseUrl = (import.meta.env.VITE_OLLAMA_BASE_URL as string | undefined) ?? 'http://localhost:11434';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      return {
        id: 'ollama',
        title: 'Ollama',
        category: 'AI',
        status: 'PASS',
        detail: `Reachable at ${baseUrl}`,
      };
    }
    return {
      id: 'ollama',
      title: 'Ollama',
      category: 'AI',
      status: 'WARN',
      detail: `Server responded with HTTP ${res.status} at ${baseUrl}`,
      suggestedFix: 'Ensure Ollama is running and VITE_OLLAMA_BASE_URL is correct.',
    };
  } catch {
    clearTimeout(timeout);
    return {
      id: 'ollama',
      title: 'Ollama',
      category: 'AI',
      status: 'WARN',
      detail: `Could not reach Ollama at ${baseUrl}`,
      suggestedFix: 'Start Ollama with `ollama serve` or update VITE_OLLAMA_BASE_URL in .env.',
    };
  }
}

function checkGemini(): DiagnosticCheck {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  const isSet = !!(key && key.trim());
  return {
    id: 'gemini',
    title: 'Gemini AI',
    category: 'AI',
    status: isSet ? 'PASS' : 'WARN',
    detail: isSet ? 'API key is configured.' : 'VITE_GEMINI_API_KEY is not set.',
    suggestedFix: isSet ? undefined : 'Add VITE_GEMINI_API_KEY to .env',
  };
}

function checkGoogleAuth(): DiagnosticCheck {
  try {
    const token = localStorage.getItem('google_access_token');
    const isSet = !!(token && token.trim());
    return {
      id: 'google-auth',
      title: 'Google Auth',
      category: 'Integrations',
      status: isSet ? 'PASS' : 'WARN',
      detail: isSet
        ? 'Access token found in localStorage.'
        : 'No Google access token found. Calendar and Gmail features will be unavailable.',
      suggestedFix: isSet ? undefined : 'Sign in with Google in Settings.',
    };
  } catch {
    return {
      id: 'google-auth',
      title: 'Google Auth',
      category: 'Integrations',
      status: 'WARN',
      detail: 'Could not read localStorage.',
      suggestedFix: 'Ensure the app is running in a secure context (https or localhost).',
    };
  }
}

function checkVoiceEngine(): DiagnosticCheck {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- webkitSpeechRecognition is non-standard
  const available = !!(window.SpeechRecognition || (window as any).webkitSpeechRecognition);
  return {
    id: 'voice-engine',
    title: 'Voice Engine (SpeechRecognition)',
    category: 'Browser',
    status: available ? 'PASS' : 'WARN',
    detail: available
      ? 'SpeechRecognition API is available in this browser.'
      : 'SpeechRecognition API is not available.',
    suggestedFix: available
      ? undefined
      : 'Use Chrome, Edge, or Safari for voice support. Firefox does not support SpeechRecognition.',
  };
}

function checkLocalStorage(): DiagnosticCheck {
  try {
    const testKey = '__maple_diag_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);

    // Estimate usage
    let usedBytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? '';
      usedBytes += k.length + (localStorage.getItem(k)?.length ?? 0);
    }
    const usedKB = (usedBytes / 1024).toFixed(1);

    return {
      id: 'localstorage',
      title: 'LocalStorage',
      category: 'Browser',
      status: 'PASS',
      detail: `Read/write OK. Estimated usage: ${usedKB} KB across ${localStorage.length} keys.`,
    };
  } catch (err) {
    return {
      id: 'localstorage',
      title: 'LocalStorage',
      category: 'Browser',
      status: 'FAIL',
      detail: `LocalStorage is not accessible: ${err instanceof Error ? err.message : String(err)}`,
      suggestedFix: 'Check if the browser has cookies/storage blocked, or if private browsing is limiting storage.',
    };
  }
}

function checkIndexedDB(): DiagnosticCheck {
  const available = typeof window !== 'undefined' && !!window.indexedDB;
  return {
    id: 'indexeddb',
    title: 'IndexedDB',
    category: 'Browser',
    status: available ? 'PASS' : 'FAIL',
    detail: available
      ? 'IndexedDB API is available.'
      : 'IndexedDB is not available. The app cannot store data locally.',
    suggestedFix: available
      ? undefined
      : 'IndexedDB may be blocked in private browsing mode. Try a regular browser window.',
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function runAllChecks(): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];

  // Database
  checks.push(await checkRxDB());
  checks.push(checkSupabase());

  // AI providers
  checks.push(checkKimi());
  checks.push(checkDeepSeek());
  checks.push(await checkOllama());
  checks.push(checkGemini());

  // Integrations
  checks.push(checkGoogleAuth());

  // Browser
  checks.push(checkVoiceEngine());
  checks.push(checkLocalStorage());
  checks.push(checkIndexedDB());

  return checks;
}

export function generateDebugReport(checks: DiagnosticCheck[]): string {
  const report = {
    generatedAt: new Date().toISOString(),
    app: { name: 'Maple Life OS', buildMode: import.meta.env.MODE },
    browser: { userAgent: navigator.userAgent, language: navigator.language },
    checks,
    summary: {
      pass: checks.filter((c) => c.status === 'PASS').length,
      warn: checks.filter((c) => c.status === 'WARN').length,
      fail: checks.filter((c) => c.status === 'FAIL').length,
      skip: checks.filter((c) => c.status === 'SKIP').length,
      total: checks.length,
    },
  };
  return JSON.stringify(report, null, 2);
}
