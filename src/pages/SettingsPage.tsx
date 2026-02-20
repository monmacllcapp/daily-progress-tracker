import { useState, useEffect, useCallback } from 'react';
import {
  Settings, Activity, ScrollText, Bug, Lightbulb, MessageCircle,
  FileText, RefreshCw, Copy, Check, X, Trash2, ChevronDown, ChevronRight,
  Wifi, WifiOff, Database, Brain, Mail, Calendar,
} from 'lucide-react';
import { getLogSnapshot, getErrors, clearLogs, getLogCount, type LogEntry } from '../services/app-logger';
import { isGoogleConnected, isGoogleAuthAvailable } from '../services/google-auth';
import { isOllamaConfigured } from '../services/ollama-client';

// ─── Diagnostics Tab ─────────────────────────────────────────────────────────

interface CheckResult {
  id: string;
  title: string;
  status: 'pass' | 'warn' | 'fail' | 'checking';
  detail: string;
}

function DiagnosticsTab() {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);

  const runChecks = useCallback(async () => {
    setRunning(true);
    const results: CheckResult[] = [];

    // 1. Google Auth
    const googleAvailable = isGoogleAuthAvailable();
    const googleConnected = isGoogleConnected();
    results.push({
      id: 'google',
      title: 'Google (Calendar + Gmail)',
      status: googleConnected ? 'pass' : googleAvailable ? 'warn' : 'fail',
      detail: googleConnected
        ? 'Connected with valid token'
        : googleAvailable
          ? 'Client ID configured but not authenticated'
          : 'VITE_GOOGLE_CLIENT_ID not set',
    });

    // 2. Ollama / AI
    const ollamaConfigured = isOllamaConfigured();
    if (ollamaConfigured) {
      try {
        const baseUrl = import.meta.env.VITE_OLLAMA_BASE_URL;
        const resp = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
        const data = await resp.json();
        const modelCount = data?.models?.length ?? 0;
        results.push({
          id: 'ollama',
          title: 'Ollama (Local AI)',
          status: modelCount > 0 ? 'pass' : 'warn',
          detail: modelCount > 0 ? `Reachable — ${modelCount} model${modelCount !== 1 ? 's' : ''} available` : 'Reachable but no models loaded',
        });
      } catch {
        results.push({
          id: 'ollama',
          title: 'Ollama (Local AI)',
          status: 'fail',
          detail: `Cannot reach ${import.meta.env.VITE_OLLAMA_BASE_URL}`,
        });
      }
    } else {
      results.push({
        id: 'ollama',
        title: 'Ollama (Local AI)',
        status: 'fail',
        detail: 'VITE_OLLAMA_BASE_URL not set',
      });
    }

    // 3. Supabase
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
      try {
        const resp = await fetch(`${supabaseUrl}/rest/v1/`, {
          headers: { apikey: supabaseKey },
          signal: AbortSignal.timeout(5000),
        });
        results.push({
          id: 'supabase',
          title: 'Supabase (Cloud Sync)',
          status: resp.ok ? 'pass' : 'warn',
          detail: resp.ok ? 'Reachable and authenticated' : `HTTP ${resp.status}`,
        });
      } catch {
        results.push({
          id: 'supabase',
          title: 'Supabase (Cloud Sync)',
          status: 'fail',
          detail: 'Cannot reach Supabase',
        });
      }
    } else {
      results.push({
        id: 'supabase',
        title: 'Supabase (Cloud Sync)',
        status: 'warn',
        detail: 'Not configured (local-only mode)',
      });
    }

    // 4. RxDB
    try {
      const { createDatabase } = await import('../db');
      const db = await createDatabase();
      const collections = Object.keys(db.collections).length;
      results.push({
        id: 'rxdb',
        title: 'RxDB (Local Database)',
        status: 'pass',
        detail: `Healthy — ${collections} collections`,
      });
    } catch (err) {
      results.push({
        id: 'rxdb',
        title: 'RxDB (Local Database)',
        status: 'fail',
        detail: `Init failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // 5. Speech Recognition
    const hasSpeech = !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
    results.push({
      id: 'speech',
      title: 'Speech Recognition',
      status: hasSpeech ? 'pass' : 'warn',
      detail: hasSpeech ? 'Web Speech API available' : 'Not supported in this browser',
    });

    setChecks(results);
    setRunning(false);
  }, []);

  useEffect(() => { runChecks(); }, [runChecks]);

  const statusIcon = (s: string) => {
    if (s === 'pass') return <Wifi className="w-4 h-4 text-emerald-400" />;
    if (s === 'warn') return <Activity className="w-4 h-4 text-amber-400" />;
    if (s === 'fail') return <WifiOff className="w-4 h-4 text-red-400" />;
    return <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />;
  };

  const statusBg = (s: string) => {
    if (s === 'pass') return 'border-emerald-500/20 bg-emerald-500/5';
    if (s === 'warn') return 'border-amber-500/20 bg-amber-500/5';
    if (s === 'fail') return 'border-red-500/20 bg-red-500/5';
    return 'border-white/10 bg-white/5';
  };

  const passCount = checks.filter(c => c.status === 'pass').length;
  const warnCount = checks.filter(c => c.status === 'warn').length;
  const failCount = checks.filter(c => c.status === 'fail').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-400">{passCount} PASS</span>
          {warnCount > 0 && <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-400">{warnCount} WARN</span>}
          {failCount > 0 && <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400">{failCount} FAIL</span>}
        </div>
        <button
          onClick={runChecks}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-slate-300 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
          Re-run
        </button>
      </div>

      <div className="space-y-2">
        {checks.map(c => (
          <div key={c.id} className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${statusBg(c.status)}`}>
            {statusIcon(c.status)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{c.title}</p>
              <p className="text-xs text-slate-400 truncate">{c.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Logs Tab ─────────────────────────────────────────────────────────────────

function LogsTab() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'error'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    setLogs(filter === 'error' ? getErrors(50) : getLogSnapshot(100));
  }, [filter]);

  useEffect(() => { refresh(); }, [refresh]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const levelColor = (l: string) => {
    if (l === 'error') return 'text-red-400';
    if (l === 'warn') return 'text-amber-400';
    if (l === 'debug') return 'text-slate-500';
    return 'text-slate-300';
  };

  const sourceIcon = (s: string) => {
    if (s === 'google') return <Mail className="w-3 h-3 text-blue-400" />;
    if (s === 'ollama') return <Brain className="w-3 h-3 text-purple-400" />;
    if (s === 'supabase') return <Database className="w-3 h-3 text-emerald-400" />;
    if (s === 'rxdb') return <Database className="w-3 h-3 text-cyan-400" />;
    if (s === 'voice') return <Activity className="w-3 h-3 text-pink-400" />;
    return <Calendar className="w-3 h-3 text-slate-400" />;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${filter === 'all' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            All ({getLogCount()})
          </button>
          <button
            onClick={() => setFilter('error')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${filter === 'error' ? 'bg-red-500/20 text-red-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Errors
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={refresh} className="p-1.5 hover:bg-white/10 rounded transition-colors" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button
            onClick={() => { clearLogs(); refresh(); }}
            className="p-1.5 hover:bg-white/10 rounded transition-colors"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-8 text-slate-600 text-sm">No log entries yet</div>
      ) : (
        <div className="space-y-1 max-h-[500px] overflow-y-auto scrollbar-thin">
          {logs.map(entry => (
            <div key={entry.id}>
              <button
                onClick={() => toggleExpand(entry.id)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-white/5 transition-colors text-left"
              >
                {expanded.has(entry.id)
                  ? <ChevronDown className="w-3 h-3 text-slate-500 flex-shrink-0" />
                  : <ChevronRight className="w-3 h-3 text-slate-500 flex-shrink-0" />
                }
                {sourceIcon(entry.source)}
                <span className={`text-xs font-mono flex-shrink-0 ${levelColor(entry.level)}`}>
                  {entry.level.toUpperCase().padEnd(5)}
                </span>
                <span className="text-xs text-slate-300 truncate flex-1">{entry.action}</span>
                {entry.durationMs != null && (
                  <span className="text-[10px] text-slate-600 flex-shrink-0">{entry.durationMs}ms</span>
                )}
                <span className="text-[10px] text-slate-600 flex-shrink-0">
                  {new Date(entry.ts).toLocaleTimeString()}
                </span>
              </button>
              {expanded.has(entry.id) && (
                <div className="ml-8 px-3 py-2 mb-1 bg-white/[0.02] rounded text-xs space-y-1">
                  <p><span className="text-slate-500">Source:</span> <span className="text-slate-300">{entry.source}</span></p>
                  {entry.detail && <p><span className="text-slate-500">Detail:</span> <span className="text-slate-300">{entry.detail}</span></p>}
                  {entry.error && <p><span className="text-slate-500">Error:</span> <span className="text-red-400">{entry.error}</span></p>}
                  {entry.status != null && <p><span className="text-slate-500">Status:</span> <span className="text-slate-300">{entry.status}</span></p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Feedback Tab ─────────────────────────────────────────────────────────────

type FeedbackType = 'bug' | 'feature' | 'general';

interface FeedbackEntry {
  id: string;
  type: FeedbackType;
  message: string;
  page: string;
  timestamp: string;
}

const FEEDBACK_KEY = 'maple_feedback_entries';

function loadFeedback(): FeedbackEntry[] {
  try {
    // Migrate old key
    const old = localStorage.getItem('titan_feedback_entries');
    if (old) {
      localStorage.setItem(FEEDBACK_KEY, old);
      localStorage.removeItem('titan_feedback_entries');
    }
    return JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '[]');
  } catch { return []; }
}

function saveFeedback(entries: FeedbackEntry[]) {
  localStorage.setItem(FEEDBACK_KEY, JSON.stringify(entries));
}

const TYPE_OPTIONS: { value: FeedbackType; label: string; icon: typeof Bug; color: string }[] = [
  { value: 'bug', label: 'Bug', icon: Bug, color: 'text-red-400' },
  { value: 'feature', label: 'Feature', icon: Lightbulb, color: 'text-amber-400' },
  { value: 'general', label: 'General', icon: MessageCircle, color: 'text-blue-400' },
];

function FeedbackTab() {
  const [type, setType] = useState<FeedbackType>('general');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [history, setHistory] = useState<FeedbackEntry[]>(() => loadFeedback());
  const [showHistory, setShowHistory] = useState(false);

  const handleSubmit = () => {
    if (!message.trim()) return;
    const entry: FeedbackEntry = {
      id: crypto.randomUUID(),
      type,
      message: message.trim(),
      page: window.location.pathname,
      timestamp: new Date().toISOString(),
    };
    const updated = [...history, entry];
    saveFeedback(updated);
    setHistory(updated);
    setSubmitted(true);
    setTimeout(() => { setSubmitted(false); setMessage(''); setType('general'); }, 1500);
  };

  return (
    <div className="space-y-4">
      {submitted ? (
        <div className="text-center py-8">
          <Check className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-emerald-400">Thanks for your feedback!</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            {TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setType(opt.value)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  type === opt.value
                    ? 'border-white/20 bg-white/10 text-white'
                    : 'border-white/5 bg-white/[0.02] text-slate-500 hover:text-slate-300'
                }`}
              >
                <opt.icon className={`w-4 h-4 ${type === opt.value ? opt.color : ''}`} />
                {opt.label}
              </button>
            ))}
          </div>

          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={
              type === 'bug' ? 'Describe the bug — what happened and what you expected...'
                : type === 'feature' ? 'What feature would make Maple better?'
                  : 'Share your thoughts...'
            }
            rows={4}
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 resize-none"
          />

          <button
            onClick={handleSubmit}
            disabled={!message.trim()}
            className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-bold transition-all text-sm text-white"
          >
            Submit Feedback
          </button>
        </>
      )}

      {history.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showHistory ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {history.length} previous submission{history.length !== 1 ? 's' : ''}
          </button>
          {showHistory && (
            <div className="mt-2 space-y-2 max-h-60 overflow-y-auto scrollbar-thin">
              {history.slice().reverse().map(entry => (
                <div key={entry.id} className="px-3 py-2 bg-white/[0.03] border border-white/5 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                      entry.type === 'bug' ? 'bg-red-500/20 text-red-400'
                        : entry.type === 'feature' ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-blue-500/20 text-blue-400'
                    }`}>{entry.type.toUpperCase()}</span>
                    <span className="text-[10px] text-slate-600">{new Date(entry.timestamp).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs text-slate-400">{entry.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Debug Report Tab ─────────────────────────────────────────────────────────

function DebugReportTab() {
  const [report, setReport] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    const env = import.meta.env;
    const errors = getErrors(10);

    let dbInfo = 'Not initialized';
    try {
      const { createDatabase } = await import('../db');
      const db = await createDatabase();
      const collections = Object.keys(db.collections);
      dbInfo = `${collections.length} collections: ${collections.join(', ')}`;
    } catch (e) {
      dbInfo = `Error: ${e instanceof Error ? e.message : String(e)}`;
    }

    const lines = [
      '# Maple Life OS — Debug Report',
      `Generated: ${new Date().toISOString()}`,
      '',
      '## Environment',
      `- Build: ${env.MODE}`,
      `- Origin: ${window.location.origin}`,
      `- User Agent: ${navigator.userAgent}`,
      `- Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
      `- Locale: ${navigator.language}`,
      '',
      '## Integrations',
      `- Google Client ID: ${env.VITE_GOOGLE_CLIENT_ID ? 'configured' : 'NOT SET'}`,
      `- Google Connected: ${isGoogleConnected()}`,
      `- Ollama URL: ${env.VITE_OLLAMA_BASE_URL || 'NOT SET'}`,
      `- Ollama Model: ${env.VITE_OLLAMA_MODEL || 'default'}`,
      `- Supabase URL: ${env.VITE_SUPABASE_URL ? 'configured' : 'NOT SET'}`,
      '',
      '## Database',
      `- ${dbInfo}`,
      '',
      '## Recent Errors (last 10)',
      ...(errors.length === 0
        ? ['- None']
        : errors.map(e => `- [${new Date(e.ts).toISOString()}] ${e.source}/${e.action}: ${e.error}`)),
      '',
      `## Log Buffer: ${getLogCount()} entries`,
    ];

    setReport(lines.join('\n'));
  }, []);

  const handleCopy = async () => {
    if (!report) return;
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={generate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-slate-300 transition-colors"
        >
          <FileText className="w-3.5 h-3.5" />
          Generate Report
        </button>
        {report && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-slate-300 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>

      {report && (
        <pre className="p-4 bg-black/30 border border-white/5 rounded-lg text-xs text-slate-300 font-mono whitespace-pre-wrap max-h-[500px] overflow-y-auto scrollbar-thin">
          {report}
        </pre>
      )}
    </div>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────────

type Tab = 'diagnostics' | 'logs' | 'feedback' | 'debug';

const TABS: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: 'diagnostics', label: 'Diagnostics', icon: Activity },
  { id: 'logs', label: 'Logs', icon: ScrollText },
  { id: 'feedback', label: 'Feedback', icon: MessageCircle },
  { id: 'debug', label: 'Debug Report', icon: FileText },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('diagnostics');

  return (
    <div className="animate-fade-up max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="w-5 h-5 text-slate-400" />
        <h1 className="text-lg font-bold text-white">Settings</h1>
      </div>

      <div className="glass-card overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-white/5">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium transition-colors border-b-2 ${
                  active
                    ? 'border-blue-400 text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="p-5">
          {tab === 'diagnostics' && <DiagnosticsTab />}
          {tab === 'logs' && <LogsTab />}
          {tab === 'feedback' && <FeedbackTab />}
          {tab === 'debug' && <DebugReportTab />}
        </div>
      </div>
    </div>
  );
}
