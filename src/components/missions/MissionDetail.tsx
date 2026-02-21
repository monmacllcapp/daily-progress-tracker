import { useState } from 'react';
import type { Mission, MissionStatus } from '../../types/schema';
import type { Task } from '../../types/schema';
import { useRxQuery } from '../../hooks/useRxQuery';
import { useDatabase } from '../../hooks/useDatabase';
import { AGENTS } from '../../services/agent-tracker';
import { FileAttachmentZone } from './FileAttachmentZone';
import { Pause, Play, CheckCircle, Archive, Users } from 'lucide-react';

interface MissionDetailProps {
  mission: Mission;
}

const TASK_STATUS_BADGE: Record<string, string> = {
  active:    'bg-blue-500/20 text-blue-400',
  completed: 'bg-green-500/20 text-green-400',
  dismissed: 'bg-slate-600/40 text-slate-400',
  deferred:  'bg-yellow-500/20 text-yellow-400',
};

export function MissionDetail({ mission }: MissionDetailProps) {
  const [db] = useDatabase();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(mission.title);

  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(mission.description ?? '');

  const [tasks] = useRxQuery<Task>(db?.tasks, {
    selector: { mission_id: mission.id },
  });

  const assignedAgents = (mission.assigned_agents ?? [])
    .map((id) => AGENTS.find((a) => a.id === id))
    .filter(Boolean);

  async function patchMission(patch: Partial<Mission>) {
    if (!db) return;
    const doc = await db.missions.findOne(mission.id).exec();
    await doc?.patch({ ...patch, updated_at: new Date().toISOString() });
  }

  async function saveTitle() {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== mission.title) {
      await patchMission({ title: trimmed });
    } else {
      setTitleDraft(mission.title);
    }
    setEditingTitle(false);
  }

  async function saveDesc() {
    const trimmed = descDraft.trim();
    if (trimmed !== (mission.description ?? '')) {
      await patchMission({ description: trimmed || undefined });
    }
    setEditingDesc(false);
  }

  async function setStatus(status: MissionStatus) {
    const patch: Partial<Mission> = { status };
    if (status === 'completed') patch.completed_at = new Date().toISOString();
    await patchMission(patch);
  }

  const doneCount = tasks.filter((t) => t.status === 'completed').length;

  return (
    <div className="space-y-5">
      {/* Accent bar */}
      <div
        className="h-1 rounded-full w-full"
        style={{ backgroundColor: mission.color ?? '#06b6d4' }}
      />

      {/* Title */}
      {editingTitle ? (
        <input
          autoFocus
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveTitle().catch(console.error);
            if (e.key === 'Escape') { setTitleDraft(mission.title); setEditingTitle(false); }
          }}
          className="w-full bg-slate-900 border border-cyan-500/50 rounded-lg px-3 py-2 text-lg font-semibold text-white focus:outline-none"
        />
      ) : (
        <h2
          className="text-lg font-semibold text-white cursor-text hover:text-cyan-300 transition-colors"
          title="Click to edit"
          onClick={() => { setTitleDraft(mission.title); setEditingTitle(true); }}
        >
          {mission.title}
        </h2>
      )}

      {/* Description */}
      {editingDesc ? (
        <textarea
          autoFocus
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          onBlur={saveDesc}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setDescDraft(mission.description ?? ''); setEditingDesc(false); }
          }}
          rows={4}
          className="w-full bg-slate-900 border border-cyan-500/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none resize-none"
        />
      ) : (
        <p
          className={[
            'text-sm cursor-text hover:text-slate-200 transition-colors leading-relaxed',
            mission.description ? 'text-slate-300' : 'text-slate-600 italic',
          ].join(' ')}
          title="Click to edit"
          onClick={() => { setDescDraft(mission.description ?? ''); setEditingDesc(true); }}
        >
          {mission.description || 'No description — click to add one.'}
        </p>
      )}

      {/* Status action buttons */}
      <div className="flex flex-wrap gap-2">
        {mission.status === 'active' ? (
          <button
            onClick={() => setStatus('paused').catch(console.error)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 rounded-lg text-xs font-medium text-yellow-400 transition-colors"
          >
            <Pause className="w-3.5 h-3.5" /> Pause
          </button>
        ) : mission.status === 'paused' ? (
          <button
            onClick={() => setStatus('active').catch(console.error)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 rounded-lg text-xs font-medium text-green-400 transition-colors"
          >
            <Play className="w-3.5 h-3.5" /> Resume
          </button>
        ) : null}

        {mission.status !== 'completed' && (
          <button
            onClick={() => setStatus('completed').catch(console.error)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg text-xs font-medium text-blue-400 transition-colors"
          >
            <CheckCircle className="w-3.5 h-3.5" /> Complete
          </button>
        )}

        {mission.status !== 'archived' && (
          <button
            onClick={() => setStatus('archived').catch(console.error)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 border border-slate-600/40 rounded-lg text-xs font-medium text-slate-400 transition-colors"
          >
            <Archive className="w-3.5 h-3.5" /> Archive
          </button>
        )}
      </div>

      {/* Assigned agents */}
      {assignedAgents.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
            <Users className="w-3.5 h-3.5" />
            <span className="font-medium uppercase tracking-wider">Agents</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {assignedAgents.map((agent) => (
              <div
                key={agent!.id}
                className="flex items-center gap-1.5 px-2 py-1 bg-slate-700/50 rounded-lg text-xs text-slate-300"
              >
                <span>{agent!.emoji}</span>
                <span>{agent!.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File attachments */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-2">
          Attachments
        </p>
        <FileAttachmentZone missionId={mission.id} />
      </div>

      {/* Linked tasks */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-2">
          Tasks ({doneCount}/{tasks.length})
        </p>
        {tasks.length === 0 ? (
          <p className="text-xs text-slate-600">No tasks linked to this mission.</p>
        ) : (
          <ul className="space-y-1">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-900/50 rounded-lg"
              >
                <span className="text-xs text-slate-300 truncate">{task.title}</span>
                <span
                  className={[
                    'text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0',
                    TASK_STATUS_BADGE[task.status] ?? 'bg-slate-600/40 text-slate-400',
                  ].join(' ')}
                >
                  {task.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
