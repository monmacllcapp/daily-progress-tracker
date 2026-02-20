/**
 * wake-word.ts — Picovoice Porcupine wake word detection
 * Uses "Jarvis" built-in keyword (free). Runs entirely in-browser via WASM.
 * Graceful degradation: returns null if no access key or mic denied.
 *
 * Architecture note: PorcupineWorker is a raw PCM-frame processor with no
 * built-in mic integration. This module manages getUserMedia + ScriptProcessor
 * to pipe 16-bit PCM frames into Porcupine at the required sample rate.
 *
 * The Porcupine model file (porcupine_params.pv) must be present in /public.
 * Copy it from: node_modules/@picovoice/porcupine-web/lib/porcupine_params.pv
 */

import { PorcupineWorker, BuiltInKeyword } from '@picovoice/porcupine-web';
import type { PorcupineDetection } from '@picovoice/porcupine-web';

type WakeWordCallback = () => void;

interface WakeWordEngine {
  start: () => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  destroy: () => Promise<void>;
  onWakeWord: (cb: WakeWordCallback) => void;
  isRunning: boolean;
}

let engineInstance: WakeWordEngine | null = null;

// Mic capture state (shared across start/pause/resume)
let micStream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let scriptProcessor: ScriptProcessorNode | null = null;
let micSource: MediaStreamAudioSourceNode | null = null;

/** Convert Float32 audio samples to Int16 PCM expected by Porcupine */
function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = clamped < 0 ? clamped * 32768 : clamped * 32767;
  }
  return int16;
}

function teardownMic() {
  try { scriptProcessor?.disconnect(); } catch { /* ignore */ }
  try { micSource?.disconnect(); } catch { /* ignore */ }
  scriptProcessor = null;
  micSource = null;
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => { /* ignore */ });
    audioCtx = null;
  }
}

export async function initWakeWord(): Promise<WakeWordEngine | null> {
  if (engineInstance) return engineInstance;

  const accessKey = import.meta.env.VITE_PICOVOICE_ACCESS_KEY;
  if (!accessKey) {
    console.warn('[WakeWord] No VITE_PICOVOICE_ACCESS_KEY — wake word disabled');
    return null;
  }

  try {
    let callback: WakeWordCallback = () => {};
    let running = false;
    let porcupine: PorcupineWorker | null = null;

    // Initialize Porcupine with "Jarvis" built-in keyword.
    // The model file must be served from /public as porcupine_params.pv.
    porcupine = await PorcupineWorker.create(
      accessKey,
      { builtin: BuiltInKeyword.Jarvis, sensitivity: 0.65 },
      (detection: PorcupineDetection) => {
        if (detection.index >= 0) {
          console.log('[WakeWord] Detected:', detection.label);
          callback();
        }
      },
      { publicPath: '/porcupine_params.pv', forceWrite: false }
    );

    const frameLength = porcupine.frameLength;
    const sampleRate = porcupine.sampleRate;

    async function setupMicPipeline(): Promise<void> {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioCtx = new AudioContext({ sampleRate });
      micSource = audioCtx.createMediaStreamSource(micStream);

      // ScriptProcessorNode accumulates samples into Porcupine frame-sized chunks
      const bufferSize = 4096;
      scriptProcessor = audioCtx.createScriptProcessor(bufferSize, 1, 1);

      let accumulator = new Float32Array(0);

      scriptProcessor.onaudioprocess = (event) => {
        if (!porcupine || !running) return;
        const input = event.inputBuffer.getChannelData(0);

        // Append new samples to accumulator
        const merged = new Float32Array(accumulator.length + input.length);
        merged.set(accumulator, 0);
        merged.set(input, accumulator.length);
        accumulator = merged;

        // Process complete frames
        while (accumulator.length >= frameLength) {
          const frame = accumulator.slice(0, frameLength);
          accumulator = accumulator.slice(frameLength);
          porcupine!.process(float32ToInt16(frame));
        }
      };

      micSource.connect(scriptProcessor);
      // Connect to destination with zero gain to keep pipeline alive (required by some browsers)
      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;
      scriptProcessor.connect(silentGain);
      silentGain.connect(audioCtx.destination);
    }

    const engine: WakeWordEngine = {
      get isRunning() {
        return running;
      },

      async start() {
        if (running) return;
        try {
          await setupMicPipeline();
          running = true;
          console.log('[WakeWord] Listening for "Jarvis"...');
        } catch (err) {
          console.error('[WakeWord] Failed to start:', err);
          teardownMic();
        }
      },

      pause() {
        if (!running) return;
        running = false;
        teardownMic();
        console.log('[WakeWord] Paused');
      },

      async resume() {
        if (running) return;
        try {
          await setupMicPipeline();
          running = true;
          console.log('[WakeWord] Resumed');
        } catch (err) {
          console.error('[WakeWord] Failed to resume:', err);
          teardownMic();
        }
      },

      async destroy() {
        running = false;
        teardownMic();
        try {
          if (porcupine) {
            await porcupine.release();
            porcupine.terminate();
            porcupine = null;
          }
        } catch (err) {
          console.error('[WakeWord] Failed to destroy:', err);
        }
        engineInstance = null;
        console.log('[WakeWord] Destroyed');
      },

      onWakeWord(cb: WakeWordCallback) {
        callback = cb;
      },
    };

    engineInstance = engine;
    return engine;
  } catch (err) {
    console.error('[WakeWord] Init failed (mic denied or WASM error):', err);
    return null;
  }
}

export function getWakeWordEngine(): WakeWordEngine | null {
  return engineInstance;
}

/** Check if wake word detection is potentially available (has access key configured) */
export function isWakeWordAvailable(): boolean {
  return !!import.meta.env.VITE_PICOVOICE_ACCESS_KEY;
}
