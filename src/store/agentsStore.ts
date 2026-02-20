import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ActivityEntry {
  id: string;
  type: 'task_created' | 'status_changed' | 'question_asked' | 'deliverable_ready' | 'broadcast_sent' | 'user_reply';
  agentId?: string;
  agentEmoji?: string;
  taskId?: string;
  taskTitle?: string;
  message: string;
  timestamp: string;
}

interface BroadcastEntry {
  text: string;
  sentAt: string;
}

interface AgentsState {
  // Mission control
  missionBrief: string;
  setMissionBrief: (text: string) => void;

  // Away mode
  awayMode: boolean;
  toggleAwayMode: () => void;

  // Broadcast
  broadcastHistory: BroadcastEntry[];
  sendBroadcast: (text: string) => void;

  // Activity feed (session-scoped, not persisted)
  activityFeed: ActivityEntry[];
  pushActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => void;
  clearFeed: () => void;
}

export const useAgentsStore = create<AgentsState>()(
  persist(
    (set, get) => ({
      // Mission control
      missionBrief: '',
      setMissionBrief: (text) => set({ missionBrief: text }),

      // Away mode
      awayMode: false,
      toggleAwayMode: () => set((s) => ({ awayMode: !s.awayMode })),

      // Broadcast
      broadcastHistory: [],
      sendBroadcast: (text) => {
        const entry: BroadcastEntry = { text, sentAt: new Date().toISOString() };
        set((s) => ({
          broadcastHistory: [entry, ...s.broadcastHistory].slice(0, 20),
        }));
        get().pushActivity({
          type: 'broadcast_sent',
          message: text.length > 80 ? text.slice(0, 80) + '…' : text,
        });
      },

      // Activity feed
      activityFeed: [],
      pushActivity: (partial) => {
        const entry: ActivityEntry = {
          ...partial,
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        };
        set((s) => ({
          activityFeed: [entry, ...s.activityFeed].slice(0, 50),
        }));
      },
      clearFeed: () => set({ activityFeed: [] }),
    }),
    {
      name: 'maple-agents-store',
      partialize: (s) => ({
        missionBrief: s.missionBrief,
        awayMode: s.awayMode,
        broadcastHistory: s.broadcastHistory,
        // activityFeed is NOT persisted — session-scoped
      }),
    }
  )
);
