import { useEffect } from 'react';
import { Layers, Rocket, AlertTriangle, Wrench } from 'lucide-react';
import { useDevProjectsStore } from '../../store/devProjectsStore';
import { TRACKED_PROJECTS } from '../../services/github-projects';
import type { ShipGateStatus, ProjectStage } from '../../services/github-projects';

export const ProjectStageWidget: React.FC = () => {
  const projects = useDevProjectsStore((s) => s.projects);
  const startAutoRefresh = useDevProjectsStore((s) => s.startAutoRefresh);

  // Auto-refresh on mount
  useEffect(() => {
    const cleanup = startAutoRefresh(60000); // 60 seconds
    return cleanup;
  }, [startAutoRefresh]);

  // Ship gate badge helper
  const shipGateBadge = (status: ShipGateStatus) => {
    switch (status) {
      case 'ship_it':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400">
            <Rocket className="w-3 h-3" /> SHIP
          </span>
        );
      case 'scope_creep':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-500/20 text-red-400">
            <AlertTriangle className="w-3 h-3" /> CREEP
          </span>
        );
      case 'ship_and_build':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-blue-500/20 text-blue-400">
            <Rocket className="w-3 h-3" /> SHIP+BUILD
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-slate-700/50 text-slate-500">
            <Wrench className="w-3 h-3" /> BUILDING
          </span>
        );
    }
  };

  // Stage color
  const stageColor = (stage: ProjectStage) => {
    switch (stage) {
      case 'MVP': return 'bg-emerald-500';
      case 'V2': return 'bg-blue-500';
      case 'V3': return 'bg-purple-500';
      case 'V4': return 'bg-amber-500';
      default: return 'bg-slate-500';
    }
  };

  return (
    <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Layers className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-semibold text-white">Project Stages</h3>
      </div>

      {/* Project list */}
      <div className="flex-1 space-y-3 overflow-y-auto">
        {TRACKED_PROJECTS.map((trackedProject) => {
          const project = projects[trackedProject.repo];

          // Skip if project not loaded yet
          if (!project) return null;

          const gate = project.shipGate;
          const currentStageProgress = project.stageProgress?.find(
            s => s.stage === (gate?.currentStage || 'MVP')
          );

          return (
            <div key={project.repo} className="group">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-slate-300 truncate flex-1">{project.displayName}</span>
                {gate ? shipGateBadge(gate.status) : shipGateBadge('building')}
              </div>
              {currentStageProgress && currentStageProgress.total > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 w-6">{currentStageProgress.stage}</span>
                  <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${stageColor(currentStageProgress.stage)}`}
                      style={{ width: `${currentStageProgress.percent}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 w-8 text-right">{currentStageProgress.percent}%</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
