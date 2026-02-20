import { useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, GitBranch, AlertTriangle, GitPullRequest, Clock, Key } from 'lucide-react';
import { useDevProjectsStore } from '../store/devProjectsStore';
import { DevProjectCard } from '../components/v2/DevProjectCard';
import { TRACKED_PROJECTS } from '../services/github-projects';
import { SignalFeed } from '../components/v2/SignalFeed';
import { useSignalStore } from '../store/signalStore';

const hasGithubPat = !!import.meta.env.VITE_GITHUB_PAT;

export default function DevProjectsPage() {
  const projects = useDevProjectsStore((s) => s.projects);
  const isLoading = useDevProjectsStore((s) => s.isLoading);
  const lastFetched = useDevProjectsStore((s) => s.lastFetched);
  const fetchAll = useDevProjectsStore((s) => s.fetchAll);
  const startAutoRefresh = useDevProjectsStore((s) => s.startAutoRefresh);

  // Helper function to get relative time for last refresh
  const getLastRefreshTime = useCallback(() => {
    if (!lastFetched) return 'Never';
    const now = Date.now();
    const then = new Date(lastFetched).getTime();
    const diffMs = now - then;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(lastFetched).toLocaleDateString();
  }, [lastFetched]);

  // Calculate stats
  const stats = useCallback(() => {
    const projectsArray = Object.values(projects);
    const branchIssues = projectsArray.filter((p) => !p.branches.isHealthy).length;
    const totalPRs = projectsArray.reduce((sum, p) => sum + p.openPRs.length, 0);

    return {
      total: TRACKED_PROJECTS.length,
      branchIssues,
      totalPRs,
      lastRefreshed: getLastRefreshTime(),
    };
  }, [projects, getLastRefreshTime]);

  const currentStats = stats();

  const allSignals = useSignalStore(s => s.signals);
  const techSignals = useMemo(() => {
    const now = new Date().toISOString();
    return allSignals.filter(sig =>
      !sig.is_dismissed &&
      (!sig.expires_at || sig.expires_at > now) &&
      sig.domain === 'business_tech'
    );
  }, [allSignals]);

  const handleRefresh = useCallback(() => {
    fetchAll();
  }, [fetchAll]);

  // Auto-refresh on mount
  useEffect(() => {
    const cleanup = startAutoRefresh(60000); // 60 seconds
    return cleanup;
  }, [startAutoRefresh]);

  // Show loading state if no projects loaded yet
  if (isLoading && Object.keys(projects).length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen animate-fade-up">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-400">Loading projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Summary Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 border border-white/10 rounded-lg p-3 flex items-center gap-3">
          <GitBranch className="w-5 h-5 text-blue-400" />
          <div>
            <div className="text-xs text-slate-500">Total Projects</div>
            <div className="text-xl font-semibold text-white">{currentStats.total}</div>
          </div>
        </div>

        <div
          className={`bg-slate-900/50 border border-white/10 rounded-lg p-3 flex items-center gap-3 ${
            currentStats.branchIssues > 0 ? 'border-red-500/30' : ''
          }`}
        >
          <AlertTriangle
            className={`w-5 h-5 ${currentStats.branchIssues > 0 ? 'text-red-400' : 'text-slate-600'}`}
          />
          <div>
            <div className="text-xs text-slate-500">Branch Issues</div>
            <div
              className={`text-xl font-semibold ${
                currentStats.branchIssues > 0 ? 'text-red-400' : 'text-slate-400'
              }`}
            >
              {currentStats.branchIssues}
            </div>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-white/10 rounded-lg p-3 flex items-center gap-3">
          <GitPullRequest className="w-5 h-5 text-indigo-400" />
          <div>
            <div className="text-xs text-slate-500">Open PRs</div>
            <div className="text-xl font-semibold text-white">{currentStats.totalPRs}</div>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-white/10 rounded-lg p-3 flex items-center gap-3">
          <Clock className="w-5 h-5 text-slate-400" />
          <div className="flex-1">
            <div className="text-xs text-slate-500">Last Refreshed</div>
            <div className="text-sm text-slate-300">{currentStats.lastRefreshed}</div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
            title="Refresh all projects"
          >
            <RefreshCw className={`w-4 h-4 text-slate-400 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* GitHub PAT Config Banner */}
      {!hasGithubPat && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
          <Key className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-amber-300">GitHub PAT Required</h3>
            <p className="text-xs text-slate-400 mt-1">
              Add <code className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-300">VITE_GITHUB_PAT=ghp_your_token</code> to
              your <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">.env</code> file
              with <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">repo</code> scope.
              Without it, GitHub API calls hit rate limits quickly.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Get one at github.com/settings/tokens → Generate new token (classic) → check "repo"
            </p>
          </div>
        </div>
      )}

      {/* Tech Domain Signals */}
      {techSignals.length > 0 && (
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Dev Signals
          </div>
          <SignalFeed filterDomain="business_tech" maxSignals={5} />
        </div>
      )}

      {/* Project Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {TRACKED_PROJECTS.map((tp) => {
          const status = projects[tp.repo];
          return status ? (
            <DevProjectCard key={tp.repo} project={status} onRefresh={handleRefresh} />
          ) : null;
        })}
      </div>
    </div>
  );
}
