/**
 * wake-word.ts — Web Speech API wake word detection
 *
 * Listens for "Hey Maple" (or just "Maple") using the browser's built-in
 * speech recognition. No external API keys needed — works in Chrome/Edge.
 *
 * Replaces the previous Picovoice Porcupine implementation to remove the
 * VITE_PICOVOICE_ACCESS_KEY dependency.
 *
 * Architecture: runs a SpeechRecognition instance in continuous mode during
 * idle. When the wake phrase is detected, fires the callback and pauses.
 * voice-mode.ts then takes over with its own SpeechRecognition for active
 * listening. When voice-mode returns to idle, it resumes the wake word engine.
 */

type WakeWordCallback = () => void;

interface WakeWordEngine {
  start: () => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  destroy: () => Promise<void>;
  onWakeWord: (cb: WakeWordCallback) => void;
  isRunning: boolean;
}

const SpeechRecognitionClass =
  typeof window !== 'undefined'
    ? (window as Record<string, unknown>).SpeechRecognition as typeof SpeechRecognition | undefined ??
      (window as Record<string, unknown>).webkitSpeechRecognition as typeof SpeechRecognition | undefined
    : null;

/** Phrases that trigger activation (lowercased for matching) */
const WAKE_PHRASES = ['hey maple', 'hey mabel', 'hey meple', 'a maple', 'hey april'];
const WAKE_WORD_SOLO = 'maple';

let engineInstance: WakeWordEngine | null = null;

function matchesWakeWord(transcript: string): boolean {
  const lower = transcript.toLowerCase().trim();
  // Check full phrases first
  for (const phrase of WAKE_PHRASES) {
    if (lower.includes(phrase)) return true;
  }
  // Check if the transcript is just the solo wake word (to avoid false positives
  // on longer sentences that happen to contain "maple")
  const words = lower.split(/\s+/);
  if (words.length <= 3 && words.includes(WAKE_WORD_SOLO)) return true;
  return false;
}

export async function initWakeWord(): Promise<WakeWordEngine | null> {
  if (engineInstance) return engineInstance;

  if (!SpeechRecognitionClass) {
    console.warn('[WakeWord] SpeechRecognition API not available — wake word disabled');
    return null;
  }

  let callback: WakeWordCallback = () => {};
  let running = false;
  let recognition: SpeechRecognition | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  function stopRecognition(): void {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    try {
      recognition?.stop();
    } catch {
      // already stopped
    }
    recognition = null;
  }

  function startRecognition(): void {
    if (!running || !SpeechRecognitionClass) return;
    stopRecognition();

    try {
      recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0]?.transcript ?? '';
          if (matchesWakeWord(transcript)) {
            console.log('[WakeWord] Detected "Hey Maple" in:', transcript);
            // Pause immediately so voice-mode can take over
            stopRecognition();
            running = false;
            callback();
            return;
          }
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        // Silently handle expected errors
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        if (event.error === 'not-allowed') {
          console.warn('[WakeWord] Mic access denied — wake word disabled');
          running = false;
          return;
        }
        console.warn('[WakeWord] Recognition error:', event.error);
      };

      recognition.onend = () => {
        // Auto-restart if still supposed to be running
        if (running) {
          restartTimer = setTimeout(() => {
            restartTimer = null;
            if (running) startRecognition();
          }, 300);
        }
      };

      recognition.start();
      console.log('[WakeWord] Listening for "Hey Maple"...');
    } catch (err) {
      console.error('[WakeWord] Failed to start recognition:', err);
    }
  }

  const engine: WakeWordEngine = {
    get isRunning() {
      return running;
    },

    async start() {
      if (running) return;
      running = true;
      startRecognition();
    },

    pause() {
      if (!running) return;
      running = false;
      stopRecognition();
      console.log('[WakeWord] Paused');
    },

    async resume() {
      if (running) return;
      running = true;
      startRecognition();
      console.log('[WakeWord] Resumed');
    },

    async destroy() {
      running = false;
      stopRecognition();
      engineInstance = null;
      console.log('[WakeWord] Destroyed');
    },

    onWakeWord(cb: WakeWordCallback) {
      callback = cb;
    },
  };

  engineInstance = engine;
  return engine;
}

export function getWakeWordEngine(): WakeWordEngine | null {
  return engineInstance;
}

/** Wake word is available if the browser supports SpeechRecognition */
export function isWakeWordAvailable(): boolean {
  return !!SpeechRecognitionClass;
}
