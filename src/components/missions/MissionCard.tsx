import type { Mission } from '../../types/schema';
import { useRxQuery } from '../../hooks/useRxQuery';
import { useDatabase } from '../../hooks/useDatabase';
import { AGENTS } from '../../services/agent-tracker';
import { Paperclip } from 'lucide-react';
import type { Task, MissionAttachment } from '../../types/schema';

interface MissionCardProps {
  mission: Mission;
  isSelected: boolean;
  onClick: () => void;
}

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  active:    { label: 'Active',    classes: 'bg-green-500/20 text-green-400 border border-green-500/30' },
  paused:    { label: 'Paused',    classes: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' },
  completed: { label: 'Completed', classes: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' },
  archived:  { label: 'Archived',  classes: 'bg-slate-600/40 text-slate-400 border border-slate-600/40' },
};

export function MissionCard({ mission, isSelected, onClick }: MissionCardProps) {
  const [db] = useDatabase();

  const [tasks] = useRxQuery<Task>(db?.tasks, {
    selector: { mission_id: mission.id },
  });

  const [attachments] = useRxQuery<MissionAttachment>(db?.mission_attachments, {
    selector: { mission_id: mission.id },
  });

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === 'completed').length;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const accentColor = mission.color ?? '#06b6d4'; // cyan-500 default

  const badge = STATUS_BADGE[mission.status] ?? STATUS_BADGE.active;

  const assignedAgents = (mission.assigned_agents ?? [])
    .map((id) => AGENTS.find((a) => a.id === id))
    .filter(Boolean);

  return (
    <button
      onClick={onClick}
      className={[
        'w-full text-left rounded-lg border transition-all duration-150 p-3',
        'bg-slate-800 hover:bg-slate-750',
        isSelected
          ? 'border-cyan-500/60 ring-1 ring-cyan-500/30 shadow-lg shadow-cyan-500/10'
          : 'border-white/10 hover:border-white/20',
      ].join(' ')}
      style={{ borderLeftColor: accentColor, borderLeftWidth: 3 }}
    >
      {/* Title + badge row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-semibold text-white text-sm leading-tight line-clamp-2 flex-1">
          {mission.title}
        </span>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${badge.classes}`}>
          {badge.label}
        </span>
      </div>

      {/* Progress bar */}
      {totalTasks > 0 && (
        <div className="mb-2">
          <div className="flex justify-between text-[10px] text-slate-400 mb-1">
            <span>{doneTasks}/{totalTasks} tasks</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progress}%`, backgroundColor: accentColor }}
            />
          </div>
        </div>
      )}

      {/* Footer: agents + attachments */}
      <div className="flex items-center justify-between mt-1">
        {/* Agent emojis */}
        <div className="flex gap-0.5">
          {assignedAgents.length > 0
            ? assignedAgents.slice(0, 5).map((agent) => (
                <span key={agent!.id} className="text-sm" title={agent!.name}>
                  {agent!.emoji}
                </span>
              ))
            : <span className="text-slate-600 text-xs">No agents</span>
          }
        </div>

        {/* Attachment count */}
        {attachments.length > 0 && (
          <div className="flex items-center gap-1 text-slate-400 text-xs">
            <Paperclip className="w-3 h-3" />
            <span>{attachments.length}</span>
          </div>
        )}
      </div>
    </button>
  );
}
