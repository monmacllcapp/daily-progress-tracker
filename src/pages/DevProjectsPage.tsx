import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw, AlertTriangle, Clock, Key, Target,
  CheckCircle2, ExternalLink, Rocket, Wrench, Layers,
} from 'lucide-react';
import { useDevProjectsStore } from '../store/devProjectsStore';
import { DevProjectCard } from '../components/v2/DevProjectCard';
import { TRACKED_PROJECTS, GITHUB_ORG } from '../services/github-projects';
import type { ShipGateStatus, ProjectStage } from '../services/github-projects';
import { SignalFeed } from '../components/v2/SignalFeed';
import { useSignalStore } from '../store/signalStore';

const hasGithubPat = !!import.meta.env.VITE_GITHUB_PAT;

// ── Ship Gate Helpers ────────────────────────────────────────────────

function shipGateBadge(status: ShipGateStatus) {
  switch (status) {
    case 'ship_it':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-400">
          <Rocket className="w-3 h-3" /> SHIP
        </span>
      );
    case 'scope_creep':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-bold rounded-full bg-red-500/20 text-red-400">
          <AlertTriangle className="w-3 h-3" /> CREEP
        </span>
      );
    case 'ship_and_build':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-bold rounded-full bg-blue-500/20 text-blue-400">
          <Rocket className="w-3 h-3" /> SHIP+BUILD
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full bg-slate-700/50 text-slate-500">
          <Wrench className="w-3 h-3" /> BUILDING
        </span>
      );
  }
}

function stageColor(stage: ProjectStage) {
  switch (stage) {
    case 'MVP': return 'bg-emerald-500';
    case 'V2': return 'bg-blue-500';
    case 'V3': return 'bg-purple-500';
    case 'V4': return 'bg-amber-500';
    default: return 'bg-slate-500';
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

// ── Main Page ────────────────────────────────────────────────────────

export default function DevProjectsPage() {
  const projects = useDevProjectsStore((s) => s.projects);
  const isLoading = useDevProjectsStore((s) => s.isLoading);
  const lastFetched = useDevProjectsStore((s) => s.lastFetched);
  const error = useDevProjectsStore((s) => s.error);
  const fetchAll = useDevProjectsStore((s) => s.fetchAll);
  const startAutoRefresh = useDevProjectsStore((s) => s.startAutoRefresh);

  const [countdown, setCountdown] = useState(60);

  const getLastRefreshTime = useCallback(() => {
    if (!lastFetched) return 'Never';
    const diffMs = Date.now() - new Date(lastFetched).getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(lastFetched).toLocaleDateString();
  }, [lastFetched]);

  // Scope control stats
  const stats = useMemo(() => {
    const loaded = Object.values(projects);

    const shipReady = loaded.filter(
      (p) => p.shipGate?.status === 'ship_it' || p.shipGate?.status === 'ship_and_build'
    ).length;
    const building = loaded.filter(
      (p) => !p.shipGate || p.shipGate.status === 'building'
    ).length;
    const scopeCreepProjects = loaded.filter(
      (p) => p.shipGate?.status === 'scope_creep'
    );

    const totalCompleted = loaded.reduce((sum, p) => sum + p.progress.completed, 0);
    const totalItems = loaded.reduce((sum, p) => sum + p.progress.total, 0);
    const milestonePercent = totalItems > 0 ? Math.round((totalCompleted / totalItems) * 100) : 0;

    return {
      total: TRACKED_PROJECTS.length,
      loaded: loaded.length,
      shipReady,
      building,
      scopeAlerts: scopeCreepProjects.length,
      scopeCreepProjects,
      milestonePercent,
      withErrors: loaded.filter((p) => p.error).length,
      lastRefreshed: getLastRefreshTime(),
    };
  }, [projects, getLastRefreshTime]);

  const allSignals = useSignalStore((s) => s.signals);
  const techSignals = useMemo(() => {
    const now = new Date().toISOString();
    return allSignals.filter(
      (sig) => !sig.is_dismissed && (!sig.expires_at || sig.expires_at > now) && sig.domain === 'business_tech'
    );
  }, [allSignals]);

  const handleRefresh = useCallback(() => {
    fetchAll();
    setCountdown(60);
  }, [fetchAll]);

  useEffect(() => {
    const cleanup = startAutoRefresh(60000);
    return cleanup;
  }, [startAutoRefresh]);

  useEffect(() => {
    const tick = setInterval(() => setCountdown((c) => (c <= 1 ? 60 : c - 1)), 1000);
    return () => clearInterval(tick);
  }, []);

  const firstLoad = isLoading && Object.keys(projects).length === 0;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Target className="w-6 h-6 text-slate-400" />
          <h1 className="text-2xl font-bold text-white">Scope Control</h1>
          {hasGithubPat && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-300">
              <CheckCircle2 className="w-3 h-3" />PAT
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`https://github.com/${GITHUB_ORG}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-slate-900/50 hover:bg-slate-800 border border-white/10
              text-slate-400 hover:text-white transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> GitHub
          </a>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-slate-900/50 hover:bg-slate-800 border border-white/10
              text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Fetching…' : `${countdown}s`}
          </button>
        </div>
      </div>

      {/* ── PAT Banner ── */}
      {!hasGithubPat && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
          <Key className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-amber-300">GitHub PAT Required</h3>
            <p className="text-xs text-slate-400 mt-1">
              Add{' '}
              <code className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-300">VITE_GITHUB_PAT=ghp_your_token</code>{' '}
              to <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">.env</code> with{' '}
              <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">repo</code> scope.
              Without it, GitHub API is rate-limited to 60 req/hour.
            </p>
          </div>
        </div>
      )}

      {/* ── Scope Alerts Banner ── */}
      {stats.scopeCreepProjects.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h2 className="text-sm font-semibold text-red-300">
              Scope Creep Detected — {stats.scopeCreepProjects.length} Project{stats.scopeCreepProjects.length !== 1 ? 's' : ''}
            </h2>
          </div>
          <ul className="space-y-1">
            {stats.scopeCreepProjects.map((p) => (
              <li key={p.repo} className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                <span className="text-red-300 font-medium">{p.displayName}</span>
                {p.shipGate?.alert && (
                  <span className="text-slate-400 text-xs">— {p.shipGate.alert}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Error Banner ── */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* ── Stats Bar ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Ship Ready"
          value={stats.shipReady}
          icon={<Rocket className="w-4 h-4" />}
          highlight={stats.shipReady > 0}
        />
        <StatCard
          label="Building"
          value={stats.building}
          icon={<Wrench className="w-4 h-4" />}
        />
        <StatCard
          label="Scope Alerts"
          value={stats.scopeAlerts}
          icon={<AlertTriangle className="w-4 h-4" />}
          highlight={stats.scopeAlerts > 0}
          highlightColor="bg-red-500/15 text-red-400"
        />
        <StatCard
          label="Milestone %"
          value={`${stats.milestonePercent}%`}
          icon={<Target className="w-4 h-4" />}
          highlight={stats.milestonePercent > 0}
          highlightColor="bg-blue-500/15 text-blue-400"
        />
      </div>

      {/* ── Last Refreshed ── */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Clock className="w-3.5 h-3.5" />
        <span>Last refreshed: {stats.lastRefreshed}</span>
        <span>·</span>
        <span>{stats.loaded}/{stats.total} projects loaded</span>
        {stats.withErrors > 0 && (
          <span className="text-red-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />{stats.withErrors} with errors
          </span>
        )}
      </div>

      {/* ── Ship Gate Overview ── */}
      <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">Ship Gate Overview</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {TRACKED_PROJECTS.map((tp) => {
            const p = projects[tp.repo];
            if (!p) {
              return (
                <div key={tp.repo} className="bg-slate-800/40 rounded-lg p-3">
                  <span className="text-xs text-slate-500 truncate">{tp.displayName}</span>
                  <p className="text-xs text-slate-700 mt-1 italic">Loading…</p>
                </div>
              );
            }
            const gate = p.shipGate;
            const stageBar = p.stageProgress?.find(s => s.stage === (gate?.currentStage || 'MVP'));
            return (
              <div key={tp.repo} className="bg-slate-800/40 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-slate-300 truncate font-medium">{p.displayName}</span>
                  {shipGateBadge(gate?.status || 'building')}
                </div>
                {stageBar && stageBar.total > 0 && (
                  <>
                    <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden mb-1">
                      <div
                        className={`h-full rounded-full ${stageColor(stageBar.stage)}`}
                        style={{ width: `${stageBar.percent}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-500">{stageBar.stage} · {stageBar.percent}%</div>
                  </>
                )}
                <div className="text-xs text-slate-600 mt-1">{p.progress.percent}% milestones</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Tech Signals ── */}
      {techSignals.length > 0 && (
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Dev Signals
          </div>
          <SignalFeed filterDomain="business_tech" maxSignals={5} />
        </div>
      )}

      {/* ── First Load Spinner ── */}
      {firstLoad && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-3" />
            <p className="text-slate-400">Fetching {stats.total} projects…</p>
            {!hasGithubPat && (
              <p className="text-xs text-slate-600 mt-1">Rate-limited without PAT</p>
            )}
          </div>
        </div>
      )}

      {/* ── Project Cards Grid ── */}
      {!firstLoad && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {TRACKED_PROJECTS.map((tp) => {
            const status = projects[tp.repo];
            return status ? (
              <DevProjectCard key={tp.repo} project={status} onRefresh={handleRefresh} />
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}
