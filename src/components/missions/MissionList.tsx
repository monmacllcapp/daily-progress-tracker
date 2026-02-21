import { useState } from 'react';
import type { Mission, MissionStatus } from '../../types/schema';
import { useAgentsStore } from '../../store/agentsStore';
import { MissionCard } from './MissionCard';
import { Plus } from 'lucide-react';

interface MissionListProps {
  missions: Mission[];
  onCreateClick: () => void;
}

type FilterTab = 'active' | 'all' | 'archived';

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'active',   label: 'Active' },
  { key: 'all',      label: 'All' },
  { key: 'archived', label: 'Archived' },
];

const ACTIVE_STATUSES: MissionStatus[] = ['active', 'paused', 'completed'];

function filterMissions(missions: Mission[], tab: FilterTab): Mission[] {
  if (tab === 'active')   return missions.filter((m) => ACTIVE_STATUSES.includes(m.status));
  if (tab === 'archived') return missions.filter((m) => m.status === 'archived');
  return missions;
}

export function MissionList({ missions, onCreateClick }: MissionListProps) {
  const selectedMissionId = useAgentsStore((s) => s.selectedMissionId);
  const setSelectedMissionId = useAgentsStore((s) => s.setSelectedMissionId);

  const [activeTab, setActiveTab] = useState<FilterTab>('active');

  const filtered = filterMissions(missions, activeTab);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <h2 className="text-sm font-semibold text-white tracking-wide">Missions</h2>
        <button
          onClick={onCreateClick}
          title="New Mission"
          className="flex items-center justify-center w-6 h-6 rounded-md bg-cyan-600 hover:bg-cyan-500 transition-colors text-white"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-4 pb-3 flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={[
              'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
              activeTab === tab.key
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mission cards */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-slate-500 text-sm">No missions yet.</p>
            <p className="text-slate-600 text-xs mt-1">Click + to create one.</p>
          </div>
        ) : (
          filtered.map((mission) => (
            <MissionCard
              key={mission.id}
              mission={mission}
              isSelected={selectedMissionId === mission.id}
              onClick={() =>
                setSelectedMissionId(
                  selectedMissionId === mission.id ? null : mission.id
                )
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
