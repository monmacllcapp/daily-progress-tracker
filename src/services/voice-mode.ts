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
const BARGEIN_CONFIDENCE = 0.7; // higher threshold during TTS to avoid echo pickup

let recognition: any = null;
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
let lastResponseTime = 0;
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let micStream: MediaStream | null = null;
let micSource: MediaStreamAudioSourceNode | null = null;
let needsUserGesture = false;
let restartPending = false;

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
    // Stay listening — restart recognition instead of going idle
    console.log('[VoiceMode] Silence timeout — restarting recognition');
    if (getStore().micEnabled) {
      startRecognition();
    } else {
      returnToIdle();
    }
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
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript: string = result[0]?.transcript?.trim() ?? '';

        if (result.isFinal) {
          const confidence: number = result[0]?.confidence ?? 0;
          getStore().setLiveTranscript('');

          if (!transcript || confidence < CONFIDENCE_THRESHOLD) return;

          // Clear any previous error on successful speech
          getStore().setVoiceError(null);

          const now = Date.now();
          if (now - lastResponseTime < RESPONSE_COOLDOWN_MS) return;

          clearSilenceTimer();
          handleUserSpeech(transcript);
          return;
        } else {
          getStore().setLiveTranscript(transcript);
          startSilenceTimer();
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('[VoiceMode] Recognition error:', event.error);

      switch (event.error) {
        case 'not-allowed':
          needsUserGesture = true;
          getStore().setVoiceError('Microphone access denied. Click the orb to retry.');
          returnToIdle();
          return;

        case 'network':
          getStore().setVoiceError('Speech recognition unavailable. Check your internet connection.');
          returnToIdle();
          return;

        case 'audio-capture':
          getStore().setVoiceError('No microphone detected.');
          returnToIdle();
          return;

        case 'aborted':
          // User cancelled — go idle quietly
          returnToIdle();
          return;

        case 'no-speech':
          // Normal silence timeout — let onend handle restart
          break;

        default:
          break;
      }
    };

    recognition.onend = () => {
      // Only restart if still in listening mode, with a guard against rapid loops
      if (getStore().voiceMode === 'listening' && getStore().micEnabled && !restartPending) {
        restartPending = true;
        setTimeout(() => {
          restartPending = false;
          if (getStore().voiceMode === 'listening' && getStore().micEnabled) {
            startRecognition();
          }
        }, 500); // 500ms cooldown before restart
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

/** Start recognition in barge-in mode — listens while TTS is playing. */
function startBargeInRecognition(): void {
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

        if (!transcript || confidence < BARGEIN_CONFIDENCE) {
          // Low confidence during barge-in — likely echo, ignore
          try { recognition.start(); } catch { /* ignore */ }
          return;
        }

        // User interrupted — stop TTS and process new speech
        console.log('[VoiceMode] Barge-in detected:', transcript);
        stopSpeaking();
        clearSilenceTimer();
        handleUserSpeech(transcript);
      } else if (transcript.length > 3) {
        // Show interim transcript — user is clearly speaking
        getStore().setLiveTranscript(transcript);
      }
    };

    recognition.onerror = () => {
      // Ignore errors during barge-in — TTS audio can trigger noise errors
    };

    recognition.onend = () => {
      // Keep restarting during speaking to stay ready for barge-in
      if (getStore().voiceMode === 'speaking') {
        try { recognition.start(); } catch { /* ignore */ }
      }
    };

    recognition.start();
  } catch {
    // Barge-in failed to start — not critical, user can still wait
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
    // Start barge-in recognition so user can interrupt
    startBargeInRecognition();
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
    startBargeInRecognition();
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

  // Auto-start listening if mic is enabled (always-on mode)
  if (getStore().micEnabled && getStore().voiceMode === 'idle') {
    console.log('[VoiceMode] Auto-starting listening (always-on)');
    try {
      await enterListening();
      needsUserGesture = false;
    } catch {
      // Browser blocked auto-start — requires user gesture (click)
      console.warn('[VoiceMode] Auto-start blocked — waiting for user gesture');
      needsUserGesture = true;
    }
  }
}

/**
 * Force-start listening mode, bypassing the wake word.
 * Used by the MapleOrb click handler and as user-gesture activation.
 */
export async function forceStartListening(): Promise<void> {
  if (getStore().voiceMode !== 'idle') return;
  needsUserGesture = false;
  getStore().setVoiceError(null);
  await enterListening();
}

/** Returns true if voice mode needs a user click to activate (browser policy). */
export function needsActivation(): boolean {
  return needsUserGesture;
}

/** Stop the current voice interaction and return to idle. */
export function stopVoiceMode(): void {
  returnToIdle();
}

/** Mute mic — stop listening and return to idle. */
export function muteMic(): void {
  returnToIdle();
}

/** Unmute mic — re-enter listening mode. */
export async function unmuteMic(): Promise<void> {
  if (getStore().voiceMode === 'idle') {
    await enterListening();
  }
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
