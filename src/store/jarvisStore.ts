/**
 * Jarvis Store — Shared State (Zustand)
 *
 * Controls chat panel open/close and proactive nudge state.
 */

import { create } from 'zustand';

export interface JarvisNudge {
  id: string;
  type: 'reminder' | 'insight' | 'warning';
  title: string;
  message: string;
  timestamp: Date;
  dismissed: boolean;
}

interface JarvisState {
  isOpen: boolean;
  toggleOpen: () => void;
  setIsOpen: (v: boolean) => void;
  latestNudge: JarvisNudge | null;
  setLatestNudge: (n: JarvisNudge | null) => void;
  voiceEnabled: boolean;
  toggleVoice: () => void;
}

export const useJarvisStore = create<JarvisState>((set) => ({
  isOpen: false,
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setIsOpen: (v) => set({ isOpen: v }),
  latestNudge: null,
  setLatestNudge: (n) => set({ latestNudge: n }),
  voiceEnabled: true,
  toggleVoice: () => set((s) => ({ voiceEnabled: !s.voiceEnabled })),
}));
