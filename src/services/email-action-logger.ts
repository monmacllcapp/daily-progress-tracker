import type { EmailTier } from '../types/schema';

export interface EmailAction {
  id: string;
  timestamp: string;
  emailId: string;
  gmailId: string;
  action: 'archive' | 'reclassify' | 'snooze' | 'reply' | 'draft';
  from: string;
  domain: string;
  subject: string;
  tier: EmailTier;
  newTier?: EmailTier;
  snoozePreset?: string;
}

export interface ActionSession {
  sessionId: string;
  startedAt: string;
  actions: EmailAction[];
}

const STORAGE_KEY = 'titan_email_actions_v1';

function loadSession(): ActionSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session: ActionSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function startSession(): string {
  const sessionId = crypto.randomUUID();
  const session: ActionSession = {
    sessionId,
    startedAt: new Date().toISOString(),
    actions: [],
  };
  saveSession(session);
  return sessionId;
}

export function logAction(action: Omit<EmailAction, 'id' | 'timestamp'>): void {
  let session = loadSession();
  if (!session) {
    const sessionId = startSession();
    session = { sessionId, startedAt: new Date().toISOString(), actions: [] };
  }
  session.actions.push({
    ...action,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  });
  saveSession(session);
}

export function getCurrentSession(): ActionSession | null {
  return loadSession();
}

export function getSessionActions(): EmailAction[] {
  const session = loadSession();
  return session?.actions ?? [];
}

export function endSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getActionCount(): number {
  const session = loadSession();
  return session?.actions.length ?? 0;
}
