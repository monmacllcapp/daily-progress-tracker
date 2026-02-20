/**
 * speech-tts.ts — Shared Text-to-Speech utilities
 * Extracted from JarvisChat for reuse by voice-mode and MapleOrb.
 */

// Preload voices (Chrome loads them async)
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    window.speechSynthesis.getVoices();
  });
}

export function pickBestVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const enVoices = voices.filter((v) => v.lang.startsWith('en'));
  if (enVoices.length === 0) return null;

  const tiers = [
    (v: SpeechSynthesisVoice) => /\(Premium\)|\(Enhanced\)/i.test(v.name),
    (v: SpeechSynthesisVoice) => /Siri/i.test(v.name),
    (v: SpeechSynthesisVoice) => v.name.includes('Google') && v.name.includes('UK'),
    (v: SpeechSynthesisVoice) => /\b(Daniel|Samantha|Alex|Karen|Moira)\b/.test(v.name),
    (v: SpeechSynthesisVoice) => v.name.includes('Google'),
  ];

  for (const test of tiers) {
    const match = enVoices.find(test);
    if (match) return match;
  }
  return enVoices[0];
}

/**
 * Speak text using browser TTS.
 * Returns the SpeechSynthesisUtterance for audio routing (Web Audio API).
 */
export function speakText(text: string, onEnd?: () => void): SpeechSynthesisUtterance | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1.0;
  const voice = pickBestVoice();
  if (voice) utterance.voice = voice;
  if (onEnd) utterance.onend = onEnd;
  window.speechSynthesis.speak(utterance);
  return utterance;
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export function isTTSAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.speechSynthesis;
}

/** @deprecated Use isTTSAvailable() */
export function hasTTS(): boolean {
  return isTTSAvailable();
}
