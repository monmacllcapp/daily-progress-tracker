import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bot, RefreshCw, Wifi, WifiOff, CheckCircle2, Clock,
  AlertTriangle, ChevronDown, ChevronUp, Send, Zap, BarChart3,
} from 'lucide-react';
import {
  fetchAgentStatus, getAgentTasks, getAgentStats, formatRelativeTime, AGENTS,
  type AgentInfo, type AgentTask,
} from '../services/agent-tracker';
import { useDatabase } from '../hooks/useDatabase';

function agentStatusBadge(status: AgentInfo['status']) {
  if (status === 'working')
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />working
      </span>
    );
  if (status === 'idle')
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/60 text-slate-300">idle</span>;
  if (status === 'error')
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-300">
        <AlertTriangle className="w-3 h-3" />error
      </span>
    );
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800/60 text-slate-500">offline</span>;
}

function priorityBadge(p: string) {
  const map: Record<string, string> = {
    urgent: 'bg-red-500/20 text-red-300',
    high:   'bg-amber-500/20 text-amber-300',
    medium: 'bg-blue-500/20 text-blue-300',
  };
  const cls = map[p.toLowerCase()] ?? 'bg-slate-700/60 text-slate-400';
  return <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${cls}`}>{p.toLowerCase()}</span>;
}

function taskStatusBadge(s: AgentTask['agentStatus']) {
  const map: Record<string, string> = {
    in_progress: 'bg-blue-500/20 text-blue-300',
    completed:   'bg-emerald-500/20 text-emerald-300',
    failed:      'bg-red-500/20 text-red-300',
    pending:     'bg-slate-700/60 text-slate-400',
  };
  const label = s === 'in_progress' ? 'in progress' : s;
  return <span className={`px-1.5 py-0.5 rounded text-xs ${map[s] ?? map.pending}`}>{label}</span>;
}

function TaskList({ tasks, emptyLabel }: { tasks: AgentTask[]; emptyLabel: string }) {
  if (!tasks.length)
    return <p className="text-xs text-slate-600 italic py-1">{emptyLabel}</p>;
  return (
    <ul className="space-y-2">
      {tasks.map((t) => (
        <li key={t.id} className="bg-slate-800/40 rounded-lg px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm text-slate-200 leading-snug flex-1 min-w-0 truncate">{t.title}</span>
            <div className="flex items-center gap-1 flex-shrink-0">
              {priorityBadge(t.priority)}
              {taskStatusBadge(t.agentStatus)}
            </div>
          </div>
          {t.agentNotes && <p className="mt-1 text-xs text-slate-500 leading-snug">{t.agentNotes}</p>}
        </li>
      ))}
    </ul>
  );
}

function AgentCard({ agent, tasks }: { agent: AgentInfo; tasks: AgentTask[] }) {
  const [expanded, setExpanded] = useState(false);
  const assigned     = useMemo(() => tasks.filter((t) => t.source === 'user'),  [tasks]);
  const selfInitiated = useMemo(() => tasks.filter((t) => t.source === 'agent'), [tasks]);

  return (
    <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden transition-all duration-200">
      <button
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/5 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl leading-none flex-shrink-0">{agent.emoji}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-white text-sm">{agent.name}</span>
              {agentStatusBadge(agent.status)}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="font-mono text-xs text-slate-500">{agent.model}</span>
              {agent.lastActivity && (
                <span className="text-xs text-slate-600">{formatRelativeTime(agent.lastActivity)}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {tasks.length > 0 && (
            <span className="text-xs text-slate-500 tabular-nums">
              {tasks.length} task{tasks.length !== 1 ? 's' : ''}
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-3">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Assigned Tasks</h4>
            <TaskList tasks={assigned} emptyLabel="No tasks assigned" />
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Self-Initiated</h4>
            <TaskList tasks={selfInitiated} emptyLabel="No self-initiated tasks" />
          </div>
          <div className="pt-1">
            <button
              disabled
              title="Assign task — coming soon"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
                bg-slate-800/60 hover:bg-slate-700/60 border border-white/10
                text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
            >
              <Send className="w-3 h-3" />
              Assign Task
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label, value, icon, highlight,
}: {
  label: string; value: string | number; icon: React.ReactNode; highlight?: boolean;
}) {
  return (
    <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${highlight ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-800/60 text-slate-400'}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-white tabular-nums">{value}</p>
      </div>
    </div>
  );
}

const POLL_INTERVAL = 30;

export default function AgentsPage() {
  const [db] = useDatabase();
  const [agents,   setAgents]   = useState<AgentInfo[]>(AGENTS);
  const [taskMap,  setTaskMap]  = useState<Map<string, AgentTask[]>>(new Map());
  const [gatewayOnline, setGatewayOnline] = useState(false);
  const [countdown, setCountdown] = useState(POLL_INTERVAL);
  const [loading,  setLoading]  = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [liveAgents, tasks] = await Promise.all([
        fetchAgentStatus(),
        db ? getAgentTasks(db) : Promise.resolve(new Map<string, AgentTask[]>()),
      ]);
      setAgents(liveAgents);
      setTaskMap(tasks);
      setGatewayOnline(liveAgents.some((a) => a.status !== 'offline'));
    } catch {
      setGatewayOnline(false);
    } finally {
      setLoading(false);
      setCountdown(POLL_INTERVAL);
    }
  }, [db]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const poll = setInterval(refresh, POLL_INTERVAL * 1000);
    return () => clearInterval(poll);
  }, [refresh]);
  useEffect(() => {
    const tick = setInterval(() => setCountdown((c) => (c <= 1 ? POLL_INTERVAL : c - 1)), 1000);
    return () => clearInterval(tick);
  }, []);

  const stats = useMemo(() => getAgentStats(agents, taskMap), [agents, taskMap]);

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Bot className="w-6 h-6 text-slate-400" />
          <h1 className="text-2xl font-bold text-white">Agent Operations</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border ${
            gatewayOnline
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-400'
          }`}>
            {gatewayOnline
              ? <><Wifi className="w-3.5 h-3.5" /> Gateway Connected</>
              : <><WifiOff className="w-3.5 h-3.5" /> Gateway Offline</>}
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-slate-900/50 hover:bg-slate-800 border border-white/10
              text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing…' : `Refresh (${countdown}s)`}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Online"          value={`${stats.onlineAgents}/${stats.totalAgents}`} icon={<Wifi className="w-4 h-4" />}          highlight={stats.onlineAgents > 0} />
        <StatCard label="Active"          value={stats.activeAgents}   icon={<Zap className="w-4 h-4" />}          highlight={stats.activeAgents > 0} />
        <StatCard label="Tasks In Progress" value={stats.inProgress}   icon={<Clock className="w-4 h-4" />} />
        <StatCard label="Completed Today" value={stats.completedToday} icon={<CheckCircle2 className="w-4 h-4" />} highlight={stats.completedToday > 0} />
      </div>

      {/* Summary line */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <BarChart3 className="w-3.5 h-3.5" />
        <span>{stats.totalAssigned} total task{stats.totalAssigned !== 1 ? 's' : ''} assigned</span>
        {stats.failed > 0 && (
          <span className="text-red-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />{stats.failed} failed
          </span>
        )}
      </div>

      {/* Agent cards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} tasks={taskMap.get(agent.id) ?? []} />
        ))}
      </div>
    </div>
  );
}
