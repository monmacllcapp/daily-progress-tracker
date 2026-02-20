/**
 * Jarvis Store — Shared State (Zustand)
 *
 * Controls chat panel open/close, voice mode state, and messages.
 */

import { create } from 'zustand';
import type { JarvisMessage, CalendarIntent, JarvisIntent } from '../services/jarvis';

export interface JarvisNudge {
  id: string;
  type: 'reminder' | 'insight' | 'warning';
  title: string;
  message: string;
  timestamp: Date;
  dismissed: boolean;
}

type VoiceMode = 'idle' | 'listening' | 'processing' | 'speaking';

interface JarvisState {
  // Panel state
  isOpen: boolean;
  toggleOpen: () => void;
  setIsOpen: (v: boolean) => void;

  // Nudges
  latestNudge: JarvisNudge | null;
  setLatestNudge: (n: JarvisNudge | null) => void;

  // Voice output (TTS on/off)
  voiceEnabled: boolean;
  toggleVoice: () => void;

  // Voice mode (state machine)
  voiceMode: VoiceMode;
  setVoiceMode: (mode: VoiceMode) => void;

  // Wake word
  wakeWordEnabled: boolean;
  toggleWakeWord: () => void;

  // Mic on/off (always-on listening toggle)
  micEnabled: boolean;
  toggleMic: () => void;

  // Live transcript
  liveTranscript: string;
  setLiveTranscript: (text: string) => void;

  // Messages (shared between voice mode + panel)
  messages: JarvisMessage[];
  addMessage: (role: 'user' | 'jarvis', text: string, intent?: CalendarIntent, jarvisIntent?: JarvisIntent) => JarvisMessage;
  clearMessages: () => void;
}

export const useJarvisStore = create<JarvisState>((set, get) => ({
  // Panel
  isOpen: false,
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setIsOpen: (v) => set({ isOpen: v }),

  // Nudges
  latestNudge: null,
  setLatestNudge: (n) => set({ latestNudge: n }),

  // Voice output
  voiceEnabled: true,
  toggleVoice: () => set((s) => ({ voiceEnabled: !s.voiceEnabled })),

  // Voice mode
  voiceMode: 'idle',
  setVoiceMode: (mode) => set({ voiceMode: mode }),

  // Wake word
  wakeWordEnabled: true,
  toggleWakeWord: () => set((s) => ({ wakeWordEnabled: !s.wakeWordEnabled })),

  // Mic on/off
  micEnabled: true,
  toggleMic: () => set((s) => ({ micEnabled: !s.micEnabled })),

  // Live transcript
  liveTranscript: '',
  setLiveTranscript: (text) => set({ liveTranscript: text }),

  // Messages
  messages: [],
  addMessage: (role, text, intent?, jarvisIntent?) => {
    const msg: JarvisMessage = {
      id: crypto.randomUUID(),
      role,
      text,
      intent,
      jarvisIntent,
      timestamp: new Date(),
    };
    set((s) => ({ messages: [...s.messages, msg] }));
    return msg;
  },
  clearMessages: () => set({ messages: [] }),
}));
