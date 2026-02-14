import { useState } from 'react';
import {
  GitBranch,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  Compass,
  Flag,
  Activity,
  GitPullRequest,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { ProjectStatus } from '../../services/github-projects';

interface DevProjectCardProps {
  project: ProjectStatus;
  onRefresh?: (repo: string) => void;
}

// Helper function to convert timestamp to relative time
function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

export const DevProjectCard: React.FC<DevProjectCardProps> = ({ project }) => {
  const [northStarExpanded, setNorthStarExpanded] = useState(false);
  const [showAllMilestones, setShowAllMilestones] = useState(false);

  const milestoneStatusColors = {
    'COMPLETE': 'bg-emerald-500/20 text-emerald-400',
    'IN PROGRESS': 'bg-blue-500/20 text-blue-400',
  };

  const mergeableColors = {
    'MERGEABLE': { dot: 'bg-emerald-400', text: 'Clean' },
    'CONFLICTING': { dot: 'bg-red-400', text: 'Conflicts' },
    'UNKNOWN': { dot: 'bg-yellow-400', text: 'Checking' },
  };

  const displayedMilestones = showAllMilestones
    ? project.milestones
    : project.milestones.slice(0, 6);

  return (
    <div className="bg-slate-900/50 border border-white/10 rounded-xl overflow-hidden">
      {/* Error Banner */}
      {project.error && (
        <div className="bg-red-500/10 border-b border-red-500/20 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-400">{project.error}</p>
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <GitBranch className="w-4 h-4 text-slate-400" />
              <h3 className="text-lg font-semibold text-white">{project.displayName}</h3>
            </div>
            <p className="text-xs text-slate-500">{project.description}</p>
            {project.shipGate && project.shipGate.status !== 'building' && (
              <div className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${
                project.shipGate.status === 'ship_it' ? 'bg-emerald-500/20 text-emerald-400' :
                project.shipGate.status === 'scope_creep' ? 'bg-red-500/20 text-red-400' :
                'bg-blue-500/20 text-blue-400'  // ship_and_build
              }`}>
                {project.shipGate.status === 'ship_it' ? 'SHIP IT' :
                 project.shipGate.status === 'scope_creep' ? 'SCOPE CREEP' :
                 'SHIP + BUILD'}
              </div>
            )}
          </div>
          <a
            href={`https://github.com/monmacllcapp/${project.repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 hover:bg-white/10 rounded transition-colors"
            title="View on GitHub"
          >
            <ExternalLink className="w-4 h-4 text-slate-400" />
          </a>
        </div>
        {project.latestCommit && (
          <div className="text-xs text-slate-500">
            Last commit: {timeAgo(project.latestCommit.date)} — {project.latestCommit.message.slice(0, 60)}
            {project.latestCommit.message.length > 60 && '...'}
          </div>
        )}
      </div>

      {/* Stage Progress */}
      {project.stageProgress && project.stageProgress.length > 0 ? (
        <div className="px-4 py-3 border-b border-white/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Stage Progress
            </span>
            {project.shipGate?.alert && (
              <span className={`text-xs ${
                project.shipGate.status === 'scope_creep' ? 'text-red-400' :
                project.shipGate.status === 'ship_it' ? 'text-emerald-400' :
                'text-blue-400'
              }`}>
                {project.shipGate.alert}
              </span>
            )}
          </div>
          <div className="space-y-2">
            {project.stageProgress.filter(s => s.total > 0).map((stage) => {
              const colors: Record<string, { bar: string; text: string }> = {
                MVP: { bar: 'bg-emerald-500', text: 'text-emerald-400' },
                V2: { bar: 'bg-blue-500', text: 'text-blue-400' },
                V3: { bar: 'bg-purple-500', text: 'text-purple-400' },
                V4: { bar: 'bg-amber-500', text: 'text-amber-400' },
              };
              const color = colors[stage.stage] || colors.MVP;
              return (
                <div key={stage.stage}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium ${color.text}`}>{stage.stage}</span>
                    <span className="text-xs text-slate-500">
                      {stage.completed}/{stage.total} ({stage.percent}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${color.bar}`}
                      style={{ width: `${stage.percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : project.progress.total > 0 ? (
        <div className="px-4 py-3 border-b border-white/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Progress
            </span>
            <span className="text-xs text-slate-400">
              {project.progress.completed}/{project.progress.total} tasks ({project.progress.percent}%)
            </span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                project.progress.percent === 100
                  ? 'bg-emerald-500'
                  : project.progress.percent >= 70
                  ? 'bg-blue-500'
                  : project.progress.percent >= 40
                  ? 'bg-amber-500'
                  : 'bg-red-500'
              }`}
              style={{ width: `${project.progress.percent}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Branch Health */}
      <div className="px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2 mb-2">
          {project.branches.isHealthy ? (
            <>
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-full">
                2 branches
              </span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full">
                {project.branches.count} branches — expected 2
              </span>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {project.branches.names.map((branch) => (
            <span
              key={branch}
              className="bg-slate-800/50 text-xs text-slate-400 px-2 py-0.5 rounded"
            >
              {branch}
            </span>
          ))}
        </div>
      </div>

      {/* North Star */}
      <div className="px-4 py-3 border-b border-white/5">
        <button
          onClick={() => setNorthStarExpanded(!northStarExpanded)}
          className="flex items-center gap-2 w-full text-left hover:bg-white/5 -mx-2 px-2 py-1 rounded transition-colors"
        >
          {northStarExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
          <Compass className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            North Star
          </span>
        </button>
        {northStarExpanded && (
          <div className="mt-2 ml-6">
            {project.northStar ? (
              <p className="text-sm text-slate-300">{project.northStar}</p>
            ) : (
              <p className="text-sm text-slate-500">No North Star document found</p>
            )}
          </div>
        )}
      </div>

      {/* Milestones */}
      <div className="px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <Flag className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Milestones
          </span>
        </div>
        {project.milestones.length > 0 ? (
          <div className="space-y-2">
            {displayedMilestones.map((milestone) => (
              <div key={milestone.phase} className="flex items-center gap-2 text-sm">
                <span className="px-2 py-0.5 bg-slate-800/50 text-slate-400 text-xs rounded">
                  {milestone.phase}
                </span>
                <span className="flex-1 text-slate-300">{milestone.name}</span>
                <span
                  className={`px-2 py-0.5 text-xs rounded ${
                    milestoneStatusColors[milestone.status as keyof typeof milestoneStatusColors] ||
                    'bg-slate-700/50 text-slate-400'
                  }`}
                >
                  {milestone.status}
                </span>
              </div>
            ))}
            {project.milestones.length > 6 && (
              <button
                onClick={() => setShowAllMilestones(!showAllMilestones)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {showAllMilestones ? 'Show less' : `Show all (${project.milestones.length})`}
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No milestones found</p>
        )}
      </div>

      {/* Session Status */}
      <div className="px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Current Session
          </span>
        </div>
        {project.session ? (
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-slate-500">Done:</span>
              <p className="text-slate-300 mt-1">
                {project.session.whatWasDone.slice(0, 120)}
                {project.session.whatWasDone.length > 120 && '...'}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Next:</span>
              <p className="text-slate-300 mt-1">
                {project.session.nextStep.slice(0, 120)}
                {project.session.nextStep.length > 120 && '...'}
              </p>
            </div>
            {project.session.blockers &&
              project.session.blockers !== 'None identified.' &&
              project.session.blockers.trim() !== '' && (
                <div>
                  <span className="text-red-400">Blockers:</span>
                  <p className="text-red-400 mt-1">{project.session.blockers}</p>
                </div>
              )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No active session</p>
        )}
      </div>

      {/* Open PRs */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <GitPullRequest className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Pull Requests
          </span>
          {project.openPRs.length > 0 && (
            <span className="px-1.5 py-0.5 bg-slate-800/50 text-slate-400 text-xs rounded">
              {project.openPRs.length}
            </span>
          )}
        </div>
        {project.openPRs.length > 0 ? (
          <div className="space-y-3">
            {project.openPRs.map((pr: { number: number; title: string; headRef: string; baseRef: string; mergeable: string }) => {
              const mergeConfig = mergeableColors[pr.mergeable as keyof typeof mergeableColors];
              return (
                <div key={pr.number} className="text-sm">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-slate-300 flex-1">{pr.title}</span>
                    <span className="text-slate-500 text-xs">#{pr.number}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">
                      {pr.headRef} → {pr.baseRef}
                    </span>
                    {mergeConfig && (
                      <div className="flex items-center gap-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${mergeConfig.dot}`}></div>
                        <span className="text-slate-400">{mergeConfig.text}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No open pull requests</p>
        )}
      </div>
    </div>
  );
};
