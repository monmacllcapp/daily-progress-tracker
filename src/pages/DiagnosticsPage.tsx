import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  CheckCircle,
  AlertTriangle,
  XCircle,
  MinusCircle,
  RefreshCw,
  Copy,
  ClipboardCheck,
} from 'lucide-react';
import {
  runAllChecks,
  generateDebugReport,
  type DiagnosticCheck,
  type DiagnosticStatus,
} from '../services/diagnostics';

// ── Status helpers ────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: DiagnosticStatus }) {
  switch (status) {
    case 'PASS':
      return <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />;
    case 'WARN':
      return <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" />;
    case 'FAIL':
      return <XCircle className="w-5 h-5 text-red-400 shrink-0" />;
    case 'SKIP':
    default:
      return <MinusCircle className="w-5 h-5 text-slate-400 shrink-0" />;
  }
}

const STATUS_BADGE: Record<DiagnosticStatus, string> = {
  PASS: 'bg-green-500/20 text-green-300 border-green-500/30',
  WARN: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  FAIL: 'bg-red-500/20 text-red-300 border-red-500/30',
  SKIP: 'bg-slate-700/40 text-slate-400 border-slate-600/30',
};

function StatusBadge({ status }: { status: DiagnosticStatus }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-bold border ${STATUS_BADGE[status]}`}
    >
      {status}
    </span>
  );
}

// ── Check Card ────────────────────────────────────────────────────────────────

function CheckCard({ check }: { check: DiagnosticCheck }) {
  return (
    <div className="flex items-start gap-3 p-4 bg-slate-800/40 border border-white/5 rounded-xl">
      <StatusIcon status={check.status} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white">{check.title}</span>
          <StatusBadge status={check.status} />
        </div>
        {check.detail && (
          <p className="text-xs text-slate-400 leading-relaxed">{check.detail}</p>
        )}
        {check.suggestedFix && (
          <p className="text-xs text-yellow-400/80 leading-relaxed">
            Fix: {check.suggestedFix}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Category Group ────────────────────────────────────────────────────────────

const CATEGORY_ORDER: DiagnosticCheck['category'][] = [
  'Database',
  'AI',
  'Integrations',
  'Browser',
];

const CATEGORY_COLORS: Record<DiagnosticCheck['category'], string> = {
  Database: 'text-blue-400',
  AI:       'text-purple-400',
  Integrations: 'text-cyan-400',
  Browser:  'text-emerald-400',
};

function CategoryGroup({
  category,
  checks,
}: {
  category: DiagnosticCheck['category'];
  checks: DiagnosticCheck[];
}) {
  if (checks.length === 0) return null;
  return (
    <div className="space-y-2">
      <h2
        className={`text-xs font-semibold uppercase tracking-wider ${CATEGORY_COLORS[category]}`}
      >
        {category}
      </h2>
      <div className="space-y-2">
        {checks.map((c) => (
          <CheckCard key={c.id} check={c} />
        ))}
      </div>
    </div>
  );
}

// ── Summary Bar ───────────────────────────────────────────────────────────────

function SummaryBar({ checks }: { checks: DiagnosticCheck[] }) {
  const pass = checks.filter((c) => c.status === 'PASS').length;
  const warn = checks.filter((c) => c.status === 'WARN').length;
  const fail = checks.filter((c) => c.status === 'FAIL').length;
  const skip = checks.filter((c) => c.status === 'SKIP').length;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {pass > 0 && (
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30 text-green-300 text-sm font-semibold">
          <CheckCircle className="w-4 h-4" />
          {pass} Pass
        </span>
      )}
      {warn > 0 && (
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 text-sm font-semibold">
          <AlertTriangle className="w-4 h-4" />
          {warn} Warn
        </span>
      )}
      {fail > 0 && (
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-sm font-semibold">
          <XCircle className="w-4 h-4" />
          {fail} Fail
        </span>
      )}
      {skip > 0 && (
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/40 border border-slate-600/30 text-slate-400 text-sm font-semibold">
          <MinusCircle className="w-4 h-4" />
          {skip} Skip
        </span>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function DiagnosticsPage() {
  const [checks, setChecks] = useState<DiagnosticCheck[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const results = await runAllChecks();
      setChecks(results);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-run on mount
  useEffect(() => {
    run();
  }, [run]);

  const copyReport = useCallback(() => {
    if (checks.length === 0) return;
    const report = generateDebugReport(checks);
    navigator.clipboard.writeText(report).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [checks]);

  const byCategory = (cat: DiagnosticCheck['category']) =>
    checks.filter((c) => c.category === cat);

  return (
    <div className="space-y-6 animate-fade-up">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-slate-400" />
          <h1 className="text-2xl font-bold text-white">System Diagnostics</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyReport}
            disabled={checks.length === 0 || loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-slate-800/60 hover:bg-slate-700/60 border border-white/10
              text-slate-300 hover:text-white transition-colors disabled:opacity-40"
          >
            {copied ? (
              <>
                <ClipboardCheck className="w-3.5 h-3.5 text-green-400" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy Debug Report
              </>
            )}
          </button>

          <button
            onClick={run}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30
              text-blue-300 hover:text-blue-200 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Running…' : 'Run Checks'}
          </button>
        </div>
      </div>

      {/* ── Loading State ── */}
      {loading && checks.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center space-y-3">
            <div className="inline-block w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">Running diagnostics…</p>
          </div>
        </div>
      )}

      {/* ── Summary Bar ── */}
      {checks.length > 0 && !loading && <SummaryBar checks={checks} />}

      {/* ── Grouped Results ── */}
      {checks.length > 0 && (
        <div className="space-y-6">
          {CATEGORY_ORDER.map((cat) => (
            <CategoryGroup
              key={cat}
              category={cat}
              checks={byCategory(cat)}
            />
          ))}
        </div>
      )}

      {/* ── Empty State (should not normally appear) ── */}
      {!loading && checks.length === 0 && (
        <div className="text-center py-16 text-slate-500 text-sm">
          No checks have been run yet. Click Run Checks to start.
        </div>
      )}
    </div>
  );
}
