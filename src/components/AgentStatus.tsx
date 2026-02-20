import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Wifi, WifiOff, Activity } from 'lucide-react';

interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
  status: 'idle' | 'working' | 'error' | 'offline';
  currentTask?: string;
  lastActivity?: string;
  model?: string;
}

const KNOWN_AGENTS: AgentInfo[] = [
  { id: 'manager',   name: 'Manager',    emoji: '🎯', status: 'offline' },
  { id: 'sales',     name: 'Sales',      emoji: '💰', status: 'offline' },
  { id: 'marketing', name: 'Marketing',  emoji: '📣', status: 'offline' },
  { id: 'finance',   name: 'Finance',    emoji: '📊', status: 'offline' },
  { id: 'support',   name: 'Support',    emoji: '🛟', status: 'offline' },
  { id: 'ea-user',   name: 'EA (Quan)',  emoji: '🧑‍💼', status: 'offline' },
  { id: 'ea-wife',   name: 'EA (Wife)',  emoji: '👩‍💼', status: 'offline' },
  { id: 'reasoner',  name: 'Reasoner',   emoji: '🧠', status: 'offline' },
];

const POLL_INTERVAL_MS = 30_000;

function formatRelativeTime(iso?: string): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return 'just now';
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function statusBadge(status: AgentInfo['status']): string {
  switch (status) {
    case 'working': return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    case 'idle':    return 'bg-slate-700/60 text-slate-300 border border-slate-600/40';
    case 'error':   return 'bg-red-500/20 text-red-300 border border-red-500/40';
    case 'offline': return 'bg-slate-800/60 text-slate-500 border border-slate-700/40';
  }
}

function statusLabel(status: AgentInfo['status']): string {
  switch (status) {
    case 'working': return 'Working';
    case 'idle':    return 'Idle';
    case 'error':   return 'Error';
    case 'offline': return 'Offline';
  }
}

export function AgentStatus() {
  const [agents, setAgents] = useState<AgentInfo[]>(KNOWN_AGENTS);
  const [connected, setConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(POLL_INTERVAL_MS / 1000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAgents = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/openclaw/agents', { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AgentInfo[] = await res.json();
      // Merge live data with known agents so all 8 always appear
      const merged = KNOWN_AGENTS.map((known) => {
        const live = data.find((a) => a.id === known.id);
        return live ? { ...known, ...live } : { ...known, status: 'offline' as const };
      });
      setAgents(merged);
      setConnected(true);
    } catch {
      // Graceful degradation: keep existing state, mark gateway unreachable
      setConnected(false);
      setAgents((prev) =>
        prev.map((a) => (a.status === 'working' ? { ...a, status: 'offline' as const } : a))
      );
    } finally {
      setRefreshing(false);
      setCountdown(POLL_INTERVAL_MS / 1000);
    }
  }, []);

  const startCountdown = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(POLL_INTERVAL_MS / 1000);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
  }, []);

  useEffect(() => {
    fetchAgents();
    startCountdown();

    intervalRef.current = setInterval(() => {
      fetchAgents();
      startCountdown();
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [fetchAgents, startCountdown]);

  const handleRefresh = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    fetchAgents();
    startCountdown();
    intervalRef.current = setInterval(() => {
      fetchAgents();
      startCountdown();
    }, POLL_INTERVAL_MS);
  };

  const workingCount = agents.filter((a) => a.status === 'working').length;

  return (
    <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">Agent Status</h2>
          {workingCount > 0 && (
            <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded-full">
              {workingCount} active
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Connection indicator */}
          <div className="flex items-center gap-1.5">
            {connected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs text-emerald-400">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs text-red-400">Unreachable</span>
              </>
            )}
          </div>

          {/* Refresh button + countdown */}
          <div className="flex items-center gap-1">
            {!refreshing && (
              <span className="text-xs text-slate-500 tabular-nums w-5 text-right">{countdown}s</span>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
              title="Refresh now"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Agent grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className={`rounded-lg p-3 border transition-colors ${
              agent.status === 'offline'
                ? 'bg-slate-800/30 border-slate-700/30'
                : agent.status === 'error'
                ? 'bg-red-900/20 border-red-700/30'
                : agent.status === 'working'
                ? 'bg-emerald-900/20 border-emerald-700/30'
                : 'bg-slate-800/50 border-slate-700/40'
            }`}
          >
            {/* Agent header row */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-base leading-none" role="img" aria-label={agent.name}>
                  {agent.emoji}
                </span>
                <span className={`text-sm font-medium ${agent.status === 'offline' ? 'text-slate-500' : 'text-white'}`}>
                  {agent.name}
                </span>
              </div>

              {/* Status badge */}
              <span className={`text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1 ${statusBadge(agent.status)}`}>
                {agent.status === 'working' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                )}
                {statusLabel(agent.status)}
              </span>
            </div>

            {/* Current task */}
            {agent.currentTask && (
              <p className="text-xs text-slate-400 truncate mb-1" title={agent.currentTask}>
                {agent.currentTask}
              </p>
            )}

            {/* Bottom row: model + last activity */}
            <div className="flex items-center justify-between">
              {agent.model ? (
                <span className="text-xs text-slate-600 font-mono">{agent.model}</span>
              ) : (
                <span />
              )}
              {agent.lastActivity && (
                <span className="text-xs text-slate-600">{formatRelativeTime(agent.lastActivity)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
