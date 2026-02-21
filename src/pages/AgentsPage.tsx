import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bot, RefreshCw, Wifi, WifiOff, Moon, Sun, Plus, Send,
  MessageSquare, ChevronDown, ChevronUp, Zap, AlertTriangle,
  Clock, CheckCircle2, Pencil, X, Trash2, Eye,
} from 'lucide-react';
import {
  fetchAgentStatus, formatRelativeTime, AGENTS,
  type AgentInfo, type AgentTask,
} from '../services/agent-tracker';
import type { AgentBoardStatus, Task } from '../types/schema';
import { useDatabase } from '../hooks/useDatabase';
import { useRxQuery } from '../hooks/useRxQuery';
import { useAgentsStore, type ActivityEntry } from '../store/agentsStore';

// ── Helpers ──────────────────────────────────────────────────────────

const BOARD_COLUMNS: { key: AgentBoardStatus; label: string; color: string }[] = [
  { key: 'new',               label: 'New',        color: 'border-slate-500' },
  { key: 'picked_up',         label: 'Picked Up',  color: 'border-blue-500' },
  { key: 'in_progress',       label: 'In Progress', color: 'border-indigo-500' },
  { key: 'blocked',           label: 'Blocked',    color: 'border-amber-500' },
  { key: 'deliverable_ready', label: 'Ready',      color: 'border-cyan-500' },
  { key: 'done',              label: 'Done',       color: 'border-emerald-500' },
];

function priorityBadge(p: string) {
  const map: Record<string, string> = {
    urgent: 'bg-red-500/20 text-red-300',
    high:   'bg-amber-500/20 text-amber-300',
    medium: 'bg-blue-500/20 text-blue-300',
  };
  const cls = map[p?.toLowerCase()] ?? 'bg-slate-700/60 text-slate-400';
  return <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${cls}`}>{p?.toLowerCase() ?? 'low'}</span>;
}

function agentEmoji(agentId?: string) {
  return AGENTS.find((a) => a.id === agentId)?.emoji ?? '🤖';
}

function agentName(agentId?: string) {
  return AGENTS.find((a) => a.id === agentId)?.name ?? agentId ?? 'Unknown';
}

function activityIcon(type: ActivityEntry['type']) {
  switch (type) {
    case 'task_created':      return <Plus className="w-3 h-3 text-emerald-400" />;
    case 'status_changed':    return <Clock className="w-3 h-3 text-blue-400" />;
    case 'question_asked':    return <MessageSquare className="w-3 h-3 text-amber-400" />;
    case 'deliverable_ready': return <CheckCircle2 className="w-3 h-3 text-cyan-400" />;
    case 'broadcast_sent':    return <Send className="w-3 h-3 text-purple-400" />;
    case 'user_reply':        return <MessageSquare className="w-3 h-3 text-emerald-400" />;
    default: return <Zap className="w-3 h-3 text-slate-400" />;
  }
}

// ── Stat Card ────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, highlight, highlightColor,
}: {
  label: string; value: string | number; icon: React.ReactNode;
  highlight?: boolean; highlightColor?: string;
}) {
  const bg = highlightColor ?? 'bg-emerald-500/15 text-emerald-400';
  return (
    <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${highlight ? bg : 'bg-slate-800/60 text-slate-400'}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-white tabular-nums">{value}</p>
      </div>
    </div>
  );
}

// ── Mission Control Banner ───────────────────────────────────────────

function MissionBanner() {
  const { missionBrief, setMissionBrief } = useAgentsStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(missionBrief);

  const save = () => {
    setMissionBrief(draft.trim());
    setEditing(false);
  };

  return (
    <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4 border-l-4 border-l-cyan-500">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Mission Brief</h3>
        <button
          onClick={() => { if (editing) save(); else { setDraft(missionBrief); setEditing(true); } }}
          className="text-slate-500 hover:text-white transition-colors"
        >
          {editing ? <CheckCircle2 className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
        </button>
      </div>
      {editing ? (
        <textarea
          autoFocus
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } }}
          placeholder="What is the squad working toward?"
          className="w-full bg-slate-800/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
        />
      ) : (
        <p className="text-sm text-slate-300 leading-relaxed">
          {missionBrief || <span className="italic text-slate-600">No mission brief set — click the pencil to add one.</span>}
        </p>
      )}
    </div>
  );
}

// ── Questions Queue ──────────────────────────────────────────────────

function QuestionsQueue({ tasks, db }: { tasks: Task[]; db: any }) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const pushActivity = useAgentsStore((s) => s.pushActivity);

  const blocked = tasks.filter((t) => t.agent_board_status === 'blocked' && t.agent_question);

  if (!blocked.length) return null;

  const handleReply = async (task: Task) => {
    if (!replyText.trim() || !db) return;
    try {
      const doc = await db.tasks.findOne(task.id).exec();
      if (doc) {
        await doc.patch({
          agent_notes: replyText.trim(),
          agent_board_status: 'in_progress',
          agent_question: '',
        });
        pushActivity({
          type: 'user_reply',
          agentId: task.assigned_agent,
          agentEmoji: agentEmoji(task.assigned_agent),
          taskId: task.id,
          taskTitle: task.title,
          message: `Replied to ${agentName(task.assigned_agent)}: "${replyText.trim().slice(0, 60)}"`,
        });
      }
    } catch (err) {
      console.error('Failed to reply:', err);
    }
    setReplyText('');
    setReplyingTo(null);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-2">
        <MessageSquare className="w-4 h-4" />
        Questions from Agents ({blocked.length})
      </h3>
      {blocked.map((task) => (
        <div key={task.id} className="bg-slate-900/50 border border-amber-500/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-lg">{agentEmoji(task.assigned_agent)}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-white">{agentName(task.assigned_agent)}</span>
                <span className="text-xs text-slate-600">re: {task.title}</span>
              </div>
              <p className="text-sm text-amber-200/80">{task.agent_question}</p>
              {replyingTo === task.id ? (
                <div className="mt-3 flex gap-2">
                  <input
                    autoFocus
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleReply(task); }}
                    placeholder="Type your reply..."
                    className="flex-1 bg-slate-800/60 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                  />
                  <button onClick={() => handleReply(task)} className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-xs font-medium transition-colors">Reply</button>
                  <button onClick={() => setReplyingTo(null)} className="px-2 py-1.5 text-slate-500 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <button
                  onClick={() => setReplyingTo(task.id)}
                  className="mt-2 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Reply →
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Kanban Board ─────────────────────────────────────────────────────

function KanbanCard({
  task, onSelect, isSelected,
}: {
  task: Task; onSelect: (id: string) => void; isSelected: boolean;
}) {
  return (
    <button
      onClick={() => onSelect(task.id)}
      className={`w-full text-left bg-slate-800/40 rounded-lg p-3 space-y-2 border transition-all duration-150 hover:bg-slate-800/60 ${
        isSelected ? 'border-cyan-500/50 ring-1 ring-cyan-500/30' : 'border-transparent'
      }`}
    >
      <p className="text-sm text-slate-200 leading-snug line-clamp-2">{task.title}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs">{agentEmoji(task.assigned_agent)}</span>
        {priorityBadge(task.priority)}
        {task.source !== 'manual' && <Zap className="w-3 h-3 text-yellow-500" title="Self-initiated" />}
      </div>
      <span className="text-xs text-slate-600">{formatRelativeTime(task.created_at || task.created_date)}</span>
    </button>
  );
}

function TaskDetail({ task, db, onClose }: { task: Task; db: any; onClose: () => void }) {
  const pushActivity = useAgentsStore((s) => s.pushActivity);
  const [status, setStatus] = useState<AgentBoardStatus>(task.agent_board_status || 'new');

  const updateStatus = async (newStatus: AgentBoardStatus) => {
    setStatus(newStatus);
    try {
      const doc = await db.tasks.findOne(task.id).exec();
      if (doc) {
        await doc.patch({ agent_board_status: newStatus });
        pushActivity({
          type: 'status_changed',
          agentId: task.assigned_agent,
          agentEmoji: agentEmoji(task.assigned_agent),
          taskId: task.id,
          taskTitle: task.title,
          message: `${task.title} → ${newStatus.replace('_', ' ')}`,
        });
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const deleteTask = async () => {
    try {
      const doc = await db.tasks.findOne(task.id).exec();
      if (doc) await doc.remove();
      onClose();
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-white/10 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-base font-semibold text-white">{task.title}</h4>
          <div className="flex items-center gap-2 mt-1">
            <span>{agentEmoji(task.assigned_agent)}</span>
            <span className="text-sm text-slate-400">{agentName(task.assigned_agent)}</span>
            {priorityBadge(task.priority)}
          </div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
      </div>

      {task.description && (
        <p className="text-sm text-slate-400 leading-relaxed">{task.description}</p>
      )}

      {task.agent_notes && (
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Agent Notes</h5>
          <p className="text-sm text-slate-300 bg-slate-800/40 rounded-lg p-3">{task.agent_notes}</p>
        </div>
      )}

      {task.deliverable && (
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Deliverable</h5>
          <p className="text-sm text-cyan-300 bg-cyan-500/10 rounded-lg p-3">{task.deliverable}</p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <label className="text-xs text-slate-500 font-medium">Status</label>
        <select
          value={status}
          onChange={(e) => updateStatus(e.target.value as AgentBoardStatus)}
          className="bg-slate-800/60 border border-white/10 rounded-lg px-2 py-1 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
        >
          {BOARD_COLUMNS.map((col) => (
            <option key={col.key} value={col.key}>{col.label}</option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          onClick={deleteTask}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
        >
          <Trash2 className="w-3 h-3" /> Delete
        </button>
      </div>
    </div>
  );
}

function KanbanBoard({ tasks, db }: { tasks: Task[]; db: any }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const columns = useMemo(() => {
    const map = new Map<AgentBoardStatus, Task[]>();
    for (const col of BOARD_COLUMNS) map.set(col.key, []);
    for (const t of tasks) {
      const bs = t.agent_board_status || 'new';
      const arr = map.get(bs);
      if (arr) arr.push(t);
      else map.get('new')!.push(t);
    }
    return map;
  }, [tasks]);

  const selectedTask = selectedId ? tasks.find((t) => t.id === selectedId) : null;

  return (
    <div className="space-y-4">
      <div className="flex gap-3 overflow-x-auto pb-2">
        {BOARD_COLUMNS.map((col) => {
          const items = columns.get(col.key) || [];
          return (
            <div key={col.key} className="flex-shrink-0 w-52">
              <div className={`flex items-center gap-2 mb-3 pb-2 border-b-2 ${col.color}`}>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{col.label}</h4>
                <span className="text-xs text-slate-600 tabular-nums">{items.length}</span>
              </div>
              <div className="space-y-2 min-h-[60px]">
                {items.map((task) => (
                  <KanbanCard
                    key={task.id}
                    task={task}
                    onSelect={setSelectedId}
                    isSelected={selectedId === task.id}
                  />
                ))}
                {items.length === 0 && (
                  <p className="text-xs text-slate-700 italic text-center py-4">No tasks</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          db={db}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ── Assign Task Form ─────────────────────────────────────────────────

function AssignTaskForm({ db, onDone }: { db: any; onDone: () => void }) {
  const pushActivity = useAgentsStore((s) => s.pushActivity);
  const [title, setTitle] = useState('');
  const [agentId, setAgentId] = useState(AGENTS[0].id);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !db) return;
    setSubmitting(true);
    try {
      const id = crypto.randomUUID();
      await db.tasks.insert({
        id,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        status: 'active',
        source: 'manual',
        created_date: new Date().toISOString().slice(0, 10),
        sort_order: 0,
        assigned_agent: agentId,
        agent_status: 'pending',
        agent_board_status: 'new',
      });
      pushActivity({
        type: 'task_created',
        agentId,
        agentEmoji: agentEmoji(agentId),
        taskId: id,
        taskTitle: title.trim(),
        message: `Assigned "${title.trim()}" to ${agentName(agentId)}`,
      });
      setTitle('');
      setDescription('');
      onDone();
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Assign Task</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title*"
          className="sm:col-span-2 bg-slate-800/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
        />
        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          className="bg-slate-800/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
        >
          {AGENTS.map((a) => (
            <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="sm:col-span-2 bg-slate-800/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
        />
        <div className="space-y-3">
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as any)}
            className="w-full bg-slate-800/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
          >
            <option value="low">Low Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="high">High Priority</option>
            <option value="urgent">Urgent</option>
          </select>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || submitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
              bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30
              transition-colors disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {submitting ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Agent Fleet Grid ─────────────────────────────────────────────────

interface AgentStats {
  total: number;
  done: number;
  blocked: number;
  inProgress: number;
  failed: number;
  successRate: number; // 0-100
}

function computeAgentStats(tasks: Task[], agentId: string): AgentStats {
  const mine = tasks.filter((t) => t.assigned_agent === agentId);
  const total = mine.length;
  const done = mine.filter((t) => t.agent_board_status === 'done').length;
  const blocked = mine.filter((t) => t.agent_board_status === 'blocked').length;
  const inProgress = mine.filter((t) => t.agent_board_status === 'in_progress' || t.agent_board_status === 'picked_up').length;
  const failed = mine.filter((t) => t.agent_status === 'failed').length;
  const resolved = done + failed;
  const successRate = resolved > 0 ? Math.round((done / resolved) * 100) : 0;
  return { total, done, blocked, inProgress, failed, successRate };
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-1.5 w-full bg-slate-800/60 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SubAgentSection({ tasks }: { tasks: Task[] }) {
  const [expanded, setExpanded] = useState(false);
  const activeCount = tasks.filter((t) => t.agent_board_status !== 'done').length;

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-400 hover:text-purple-300 transition-colors mb-3"
      >
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        Sub-Agents ({activeCount} active, {tasks.length} total)
      </button>
      {expanded && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {tasks.map((task) => (
            <div key={task.id} className="bg-slate-900/50 border border-purple-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">sub-agent</span>
                <span className="text-xs text-slate-500">
                  spawned by {agentEmoji(task.parent_agent)} {agentName(task.parent_agent)}
                </span>
              </div>
              <p className="text-sm text-white font-medium truncate">{task.title}</p>
              {task.sub_agent_reason && (
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">Why: {task.sub_agent_reason}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  task.agent_board_status === 'done' || task.agent_board_status === 'deliverable_ready'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : task.agent_board_status === 'blocked' || task.agent_status === 'failed'
                    ? 'bg-red-500/20 text-red-300'
                    : 'bg-blue-500/20 text-blue-300'
                }`}>
                  {task.agent_status === 'failed' ? 'failed' : task.agent_board_status || 'new'}
                </span>
                {task.sub_agent_name && (
                  <span className="text-xs text-slate-600 font-mono truncate max-w-[120px]">{task.sub_agent_name}</span>
                )}
              </div>
              {task.deliverable && (
                <div className="mt-2 text-xs text-cyan-300 bg-cyan-500/10 rounded p-2 max-h-20 overflow-y-auto">
                  {task.deliverable.slice(0, 300)}{task.deliverable.length > 300 ? '...' : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgentFleetCard({ agent, stats }: { agent: AgentInfo; stats: AgentStats }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-slate-900/50 border border-white/10 rounded-xl overflow-hidden transition-all duration-200">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{agent.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white text-sm">{agent.name}</span>
              {agent.status === 'working' && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />active
                </span>
              )}
              {agent.status === 'idle' && (
                <span className="px-1.5 py-0.5 rounded-full text-xs bg-slate-700/60 text-slate-400">idle</span>
              )}
              {agent.status === 'offline' && (
                <span className="px-1.5 py-0.5 rounded-full text-xs bg-slate-800/60 text-slate-600">offline</span>
              )}
            </div>
            {/* Quick stats row */}
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-emerald-400 tabular-nums">{stats.done} done</span>
              {stats.inProgress > 0 && <span className="text-xs text-blue-400 tabular-nums">{stats.inProgress} active</span>}
              {stats.blocked > 0 && <span className="text-xs text-amber-400 tabular-nums">{stats.blocked} stuck</span>}
              {stats.total === 0 && <span className="text-xs text-slate-600">No tasks yet</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {stats.total > 0 && (
              <span className={`text-lg font-bold tabular-nums ${
                stats.successRate >= 80 ? 'text-emerald-400' :
                stats.successRate >= 50 ? 'text-amber-400' :
                stats.total > 0 ? 'text-slate-500' : 'text-slate-700'
              }`}>
                {stats.done + stats.failed > 0 ? `${stats.successRate}%` : '—'}
              </span>
            )}
            {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-3">
          {/* Completion bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500">Completion</span>
              <span className="text-xs text-slate-500 tabular-nums">{stats.done}/{stats.total}</span>
            </div>
            <MiniBar value={stats.done} max={stats.total || 1} color="bg-emerald-500" />
          </div>

          {/* Stat grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-lg font-bold text-white tabular-nums">{stats.total}</p>
              <p className="text-xs text-slate-500">Total</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-400 tabular-nums">{stats.done}</p>
              <p className="text-xs text-slate-500">Done</p>
            </div>
            <div className="text-center">
              <p className={`text-lg font-bold tabular-nums ${stats.blocked > 0 ? 'text-amber-400' : 'text-slate-600'}`}>{stats.blocked}</p>
              <p className="text-xs text-slate-500">Stuck</p>
            </div>
          </div>

          {/* Reliability + meta */}
          <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-white/5">
            <span>
              Reliability: {stats.done + stats.failed > 0 ? (
                <span className={stats.successRate >= 80 ? 'text-emerald-400' : stats.successRate >= 50 ? 'text-amber-400' : 'text-red-400'}>
                  {stats.successRate}%
                </span>
              ) : <span className="text-slate-600">N/A</span>}
              {stats.failed > 0 && <span className="text-red-400 ml-2">({stats.failed} failed)</span>}
            </span>
            <span className="font-mono">{agent.model}</span>
          </div>
          {agent.lastActivity && (
            <p className="text-xs text-slate-600">Last seen {formatRelativeTime(agent.lastActivity)}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Broadcast Bar ────────────────────────────────────────────────────

function BroadcastBar() {
  const { broadcastHistory, sendBroadcast } = useAgentsStore();
  const [text, setText] = useState('');

  const handleSend = () => {
    if (!text.trim()) return;
    sendBroadcast(text.trim());
    setText('');
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
        <Send className="w-3.5 h-3.5" /> Broadcast
      </h3>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
          placeholder="Send message to all agents..."
          className="flex-1 bg-slate-800/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 transition-colors disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      {broadcastHistory.length > 0 && (
        <div className="space-y-1">
          {broadcastHistory.slice(0, 5).map((b, i) => (
            <p key={i} className="text-xs text-slate-600">
              <span className="text-slate-700">{new Date(b.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              {' '}{b.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Activity Feed ────────────────────────────────────────────────────

function ActivityFeed() {
  const { activityFeed, clearFeed } = useAgentsStore();
  const [expanded, setExpanded] = useState(false);

  if (!activityFeed.length) return null;

  const visible = expanded ? activityFeed : activityFeed.slice(0, 5);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-300 transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          Activity ({activityFeed.length})
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {activityFeed.length > 0 && (
          <button onClick={clearFeed} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">Clear</button>
        )}
      </div>
      <div className="space-y-1">
        {visible.map((entry) => (
          <div key={entry.id} className="flex items-center gap-2 text-xs text-slate-500">
            <span className="text-slate-700 tabular-nums w-12 flex-shrink-0">
              {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {activityIcon(entry.type)}
            {entry.agentEmoji && <span>{entry.agentEmoji}</span>}
            <span className="truncate">{entry.message}</span>
          </div>
        ))}
      </div>
      {!expanded && activityFeed.length > 5 && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
        >
          Show {activityFeed.length - 5} more…
        </button>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

const POLL_INTERVAL = 30;

export default function AgentsPage() {
  const [db] = useDatabase();
  const [agents, setAgents] = useState<AgentInfo[]>(AGENTS);
  const [gatewayOnline, setGatewayOnline] = useState(false);
  const [countdown, setCountdown] = useState(POLL_INTERVAL);
  const [loading, setLoading] = useState(true);
  const [showAssignForm, setShowAssignForm] = useState(false);

  const { awayMode, toggleAwayMode, activityFeed } = useAgentsStore();

  // Reactive query for all agent-assigned tasks
  const [allAgentTasks] = useRxQuery<Task>(db?.tasks, {
    selector: { assigned_agent: { $exists: true } },
    sort: [{ created_date: 'desc' }],
  });

  // Derive board columns
  const blockedCount = useMemo(
    () => allAgentTasks.filter((t) => t.agent_board_status === 'blocked').length,
    [allAgentTasks]
  );
  const readyCount = useMemo(
    () => allAgentTasks.filter((t) => t.agent_board_status === 'deliverable_ready').length,
    [allAgentTasks]
  );
  const coreTasks = useMemo(
    () => allAgentTasks.filter((t) => !t.is_sub_agent_task),
    [allAgentTasks]
  );
  const subAgentTasks = useMemo(
    () => allAgentTasks.filter((t) => t.is_sub_agent_task),
    [allAgentTasks]
  );

  // Per-agent performance stats for fleet grid
  const agentStatsMap = useMemo(() => {
    const map = new Map<string, AgentStats>();
    for (const a of AGENTS) {
      map.set(a.id, computeAgentStats(allAgentTasks, a.id));
    }
    return map;
  }, [allAgentTasks]);

  // Poll agent status from Supabase
  const refreshAgents = useCallback(async () => {
    setLoading(true);
    try {
      const liveAgents = await fetchAgentStatus();
      setAgents(liveAgents);
      setGatewayOnline(liveAgents.some((a) => a.status !== 'offline'));
    } catch {
      setGatewayOnline(false);
    } finally {
      setLoading(false);
      setCountdown(POLL_INTERVAL);
    }
  }, []);

  useEffect(() => { refreshAgents(); }, [refreshAgents]);
  useEffect(() => {
    const poll = setInterval(refreshAgents, POLL_INTERVAL * 1000);
    return () => clearInterval(poll);
  }, [refreshAgents]);
  useEffect(() => {
    const tick = setInterval(() => setCountdown((c) => (c <= 1 ? POLL_INTERVAL : c - 1)), 1000);
    return () => clearInterval(tick);
  }, []);

  const onlineCount = agents.filter((a) => a.status !== 'offline').length;
  const activeCount = agents.filter((a) => a.status === 'working').length;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Bot className="w-6 h-6 text-slate-400" />
          <h1 className="text-2xl font-bold text-white">Agent Operations</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAssignForm((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Assign Task
          </button>

          <button
            onClick={toggleAwayMode}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              awayMode
                ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                : 'bg-slate-800/60 border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            {awayMode ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
            {awayMode ? 'Away' : 'Active'}
          </button>

          <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border ${
            gatewayOnline
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-400'
          }`}>
            {gatewayOnline
              ? <><Wifi className="w-3.5 h-3.5" /> Gateway</>
              : <><WifiOff className="w-3.5 h-3.5" /> Offline</>}
          </div>

          <button
            onClick={refreshAgents}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-slate-900/50 hover:bg-slate-800 border border-white/10
              text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {countdown}s
          </button>
        </div>
      </div>

      {/* ── Mission Control Banner ── */}
      <MissionBanner />

      {/* ── Assign Task Form (collapsible) ── */}
      {showAssignForm && db && (
        <AssignTaskForm db={db} onDone={() => setShowAssignForm(false)} />
      )}

      {/* ── Stats Bar ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Online / Active"
          value={`${onlineCount} / ${activeCount}`}
          icon={<Wifi className="w-4 h-4" />}
          highlight={onlineCount > 0}
        />
        <StatCard
          label="Total Tasks"
          value={allAgentTasks.length}
          icon={<Zap className="w-4 h-4" />}
        />
        <StatCard
          label="Blocked"
          value={blockedCount}
          icon={<AlertTriangle className="w-4 h-4" />}
          highlight={blockedCount > 0}
          highlightColor="bg-amber-500/15 text-amber-400"
        />
        <StatCard
          label="Ready for Review"
          value={readyCount}
          icon={<CheckCircle2 className="w-4 h-4" />}
          highlight={readyCount > 0}
          highlightColor="bg-cyan-500/15 text-cyan-400"
        />
      </div>

      {/* ── Untracked Work Warning ── */}
      {(() => {
        const agentsWithActivity = new Set(activityFeed.filter(a => a.agentId).map(a => a.agentId!));
        const agentsWithActiveTasks = new Set(
          allAgentTasks.filter(t => t.agent_board_status !== 'done').map(t => t.assigned_agent)
        );
        const untracked = [...agentsWithActivity].filter(id => !agentsWithActiveTasks.has(id));
        if (untracked.length === 0) return null;
        return (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">
              <span className="font-semibold">Untracked work detected:</span>{' '}
              {untracked.map(id => `${agentEmoji(id)} ${agentName(id)}`).join(', ')}{' '}
              — activity logged without a Kanban task.
            </p>
          </div>
        );
      })()}

      {/* ── Questions Queue ── */}
      {db && <QuestionsQueue tasks={allAgentTasks} db={db} />}

      {/* ── Kanban Board (core agent tasks only) ── */}
      {db && <KanbanBoard tasks={coreTasks} db={db} />}

      {/* ── Sub-Agent Ops ── */}
      {subAgentTasks.length > 0 && <SubAgentSection tasks={subAgentTasks} />}

      {/* ── Agent Fleet Grid ── */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Agent Fleet</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {agents.map((agent) => (
            <AgentFleetCard
              key={agent.id}
              agent={agent}
              stats={agentStatsMap.get(agent.id) ?? { total: 0, done: 0, blocked: 0, inProgress: 0, failed: 0, successRate: 0 }}
            />
          ))}
        </div>
      </div>

      {/* ── Broadcast + Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BroadcastBar />
        <ActivityFeed />
      </div>
    </div>
  );
}
