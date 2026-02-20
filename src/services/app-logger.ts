/**
 * App Logger — Circular buffer for service call logging
 *
 * Captures API calls (Google, Ollama, Supabase), RxDB operations,
 * and general app events for diagnostics. Max 200 entries, FIFO.
 */

const MAX_ENTRIES = 200;

export interface LogEntry {
  id: string;
  ts: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;   // 'google' | 'ollama' | 'supabase' | 'rxdb' | 'voice' | 'app'
  action: string;
  durationMs?: number;
  status?: number | string;
  ok: boolean;
  detail?: string;
  error?: string;
}

const buffer: LogEntry[] = [];

function push(entry: Omit<LogEntry, 'id' | 'ts'>): void {
  buffer.push({
    ...entry,
    id: crypto.randomUUID(),
    ts: Date.now(),
  });
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

/** Log a successful operation. */
export function logInfo(source: string, action: string, detail?: string, durationMs?: number): void {
  push({ level: 'info', source, action, ok: true, detail, durationMs });
}

/** Log a warning. */
export function logWarn(source: string, action: string, detail?: string): void {
  push({ level: 'warn', source, action, ok: true, detail });
}

/** Log a failed operation. */
export function logError(source: string, action: string, error: string, durationMs?: number): void {
  push({ level: 'error', source, action, ok: false, error, durationMs });
}

/** Get the last N log entries (newest first). */
export function getLogSnapshot(limit = 50): LogEntry[] {
  return buffer.slice(-limit).reverse();
}

/** Get only error entries. */
export function getErrors(limit = 20): LogEntry[] {
  return buffer.filter(e => e.level === 'error').slice(-limit).reverse();
}

/** Get the last error entry. */
export function getLastError(): LogEntry | null {
  for (let i = buffer.length - 1; i >= 0; i--) {
    if (buffer[i].level === 'error') return buffer[i];
  }
  return null;
}

/** Clear all logs. */
export function clearLogs(): void {
  buffer.length = 0;
}

/** Total entry count. */
export function getLogCount(): number {
  return buffer.length;
}
