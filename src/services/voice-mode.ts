/**
 * voice-mode.ts — Voice conversation state machine
 *
 * Coordinates wake word, speech recognition, AI processing, and TTS
 * into a seamless conversation loop.
 *
 * State flow:
 *   IDLE → (wake word) → LISTENING → (speech) → PROCESSING → (AI) → SPEAKING
 *   SPEAKING → (TTS done + 800ms) → LISTENING  (continuous conversation)
 *   LISTENING → (15s silence) → IDLE
 */

import { speakText, stopSpeaking } from './speech-tts';
import { initWakeWord, getWakeWordEngine } from './wake-word';
import { processJarvisMessage, executeCalendarAction } from './jarvis';
import type { JarvisMessage, CalendarIntent } from './jarvis';
import { useJarvisStore } from '../store/jarvisStore';

// Web Speech API shim
const SpeechRecognitionClass =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

const SILENCE_TIMEOUT_MS = 15_000;
const ECHO_DELAY_MS = 800;
const RESPONSE_COOLDOWN_MS = 2_000;
const CONFIDENCE_THRESHOLD = 0.6;

let recognition: any = null;
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
let lastResponseTime = 0;
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let micStream: MediaStream | null = null;
let micSource: MediaStreamAudioSourceNode | null = null;

// ─── Store helpers ───────────────────────────────────────────────────────────

function getStore() {
  return useJarvisStore.getState();
}

function setState(mode: VoiceState) {
  getStore().setVoiceMode(mode);
}

// ─── Silence timer ───────────────────────────────────────────────────────────

function clearSilenceTimer() {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
}

function startSilenceTimer() {
  clearSilenceTimer();
  silenceTimer = setTimeout(() => {
    console.log('[VoiceMode] Silence timeout — returning to idle');
    returnToIdle();
  }, SILENCE_TIMEOUT_MS);
}

// ─── Audio analyser (for MapleOrb visualisation) ─────────────────────────────

/** Returns the AnalyserNode for MapleOrb visualisation. Null until listening starts. */
export function getAnalyser(): AnalyserNode | null {
  return analyser;
}

async function setupAudioAnalyser(): Promise<void> {
  if (analyser) return; // already set up — reuse
  try {
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 128; // 64 frequency bins — matches 64 radial bars on MapleOrb
    analyser.smoothingTimeConstant = 0.8;

    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micSource = audioContext.createMediaStreamSource(micStream);
    micSource.connect(analyser);
    // Do NOT connect analyser to destination — avoids mic feedback
  } catch (err) {
    console.warn('[VoiceMode] Audio analyser setup failed:', err);
  }
}

function teardownAudioAnalyser(): void {
  try { micSource?.disconnect(); } catch { /* ignore */ }
  micSource = null;
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  // Keep audioContext + analyser alive for reuse across listening sessions
}

// ─── Speech recognition ──────────────────────────────────────────────────────

function startRecognition(): void {
  if (!SpeechRecognitionClass) return;

  try {
    recognition = new SpeechRecognitionClass();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      const transcript: string = result[0]?.transcript?.trim() ?? '';

      if (result.isFinal) {
        const confidence: number = result[0]?.confidence ?? 0;
        getStore().setLiveTranscript('');

        if (!transcript || confidence < CONFIDENCE_THRESHOLD) {
          console.log('[VoiceMode] Low confidence, ignoring:', transcript, confidence);
          startRecognition();
          return;
        }

        const now = Date.now();
        if (now - lastResponseTime < RESPONSE_COOLDOWN_MS) {
          console.log('[VoiceMode] Cooldown active, ignoring:', transcript);
          startRecognition();
          return;
        }

        clearSilenceTimer();
        handleUserSpeech(transcript);
      } else {
        // Interim — show live transcript and reset silence timer
        getStore().setLiveTranscript(transcript);
        startSilenceTimer();
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('[VoiceMode] Speech recognition error:', event.error);
      if (event.error === 'no-speech') {
        // No speech: stay in listening, silence timer will handle idle transition
      } else {
        returnToIdle();
      }
    };

    recognition.onend = () => {
      // If still in listening state, restart recognition (browser auto-stopped it)
      const currentMode = getStore().voiceMode;
      if (currentMode === 'listening') {
        try {
          recognition.start();
        } catch {
          // Already started or recognition object was replaced — safe to ignore
        }
      }
    };

    recognition.start();
    setState('listening');
    startSilenceTimer();
  } catch (err) {
    console.error('[VoiceMode] Failed to start recognition:', err);
    returnToIdle();
  }
}

function stopRecognition(): void {
  clearSilenceTimer();
  getStore().setLiveTranscript('');
  try {
    recognition?.stop();
  } catch {
    // ignore — recognition may already be stopped
  }
  recognition = null;
}

// ─── Process user speech ─────────────────────────────────────────────────────

async function handleUserSpeech(transcript: string): Promise<void> {
  setState('processing');
  stopRecognition();

  const store = getStore();
  store.addMessage('user', transcript);

  try {
    const messages: JarvisMessage[] = store.messages;
    const intent = await processJarvisMessage(transcript, messages);
    lastResponseTime = Date.now();

    let responseText = intent.response;

    // Execute calendar mutations immediately when no confirmation is needed
    if (
      (intent.action === 'create' || intent.action === 'move' || intent.action === 'delete') &&
      !intent.needsConfirmation
    ) {
      const calendarIntent: CalendarIntent = {
        action: intent.action as CalendarIntent['action'],
        eventTitle: intent.eventTitle,
        startTime: intent.startTime,
        endTime: intent.endTime,
        duration: intent.duration,
        originalEventId: intent.originalEventId,
        conflicts: intent.conflicts,
        response: intent.response,
        needsConfirmation: intent.needsConfirmation,
      };
      responseText = await executeCalendarAction(calendarIntent);
      store.addMessage('jarvis', responseText, calendarIntent, intent);
    } else {
      store.addMessage('jarvis', responseText, undefined, intent);
    }

    // Speak response, then loop back to LISTENING after echo-prevention delay
    setState('speaking');
    speakText(responseText, () => {
      setTimeout(() => {
        if (getStore().voiceMode === 'speaking') {
          enterListening();
        }
      }, ECHO_DELAY_MS);
    });
  } catch (err) {
    console.error('[VoiceMode] Processing failed:', err);
    const errorMsg = 'Something went wrong. Please try again.';
    store.addMessage('jarvis', errorMsg);
    setState('speaking');
    speakText(errorMsg, () => {
      setTimeout(() => returnToIdle(), ECHO_DELAY_MS);
    });
  }
}

// ─── State transitions ────────────────────────────────────────────────────────

async function enterListening(): Promise<void> {
  // Pause wake word engine — it shares the mic and would interfere
  const wakeWord = getWakeWordEngine();
  wakeWord?.pause();

  await setupAudioAnalyser();
  startRecognition();
}

function returnToIdle(): void {
  stopRecognition();
  stopSpeaking();
  teardownAudioAnalyser();
  setState('idle');

  // Re-enable wake word detection
  const wakeWord = getWakeWordEngine();
  wakeWord?.resume().catch((err) => {
    console.warn('[VoiceMode] Failed to resume wake word:', err);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise voice mode: sets up Porcupine wake word detection (if configured)
 * and subscribes to detection events.
 * Call once on app mount (e.g., inside the MapleOrb component).
 */
export async function initVoiceMode(): Promise<void> {
  const wakeWord = await initWakeWord();
  if (wakeWord) {
    wakeWord.onWakeWord(() => {
      console.log('[VoiceMode] Wake word detected!');
      const store = getStore();
      if (store.voiceMode === 'idle' && store.wakeWordEnabled) {
        enterListening();
      }
    });

    if (getStore().wakeWordEnabled) {
      await wakeWord.start();
    }
  }
}

/**
 * Force-start listening mode, bypassing the wake word.
 * Used by the MapleOrb double-click handler.
 */
export async function forceStartListening(): Promise<void> {
  if (getStore().voiceMode !== 'idle') return;
  await enterListening();
}

/** Stop the current voice interaction and return to idle. */
export function stopVoiceMode(): void {
  returnToIdle();
}

/**
 * Full teardown: stop voice mode, destroy Porcupine engine, and close
 * the Web Audio context. Call on component unmount.
 */
export async function destroyVoiceMode(): Promise<void> {
  stopVoiceMode();
  const wakeWord = getWakeWordEngine();
  await wakeWord?.destroy();
  if (audioContext) {
    await audioContext.close();
    audioContext = null;
    analyser = null;
  }
}

/** Returns true if Web Speech API is available in this browser. */
export function isVoiceModeAvailable(): boolean {
  return !!SpeechRecognitionClass;
}
