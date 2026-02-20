import { useState } from 'react';
import { MorningBrief } from '../components/v2/MorningBrief';
import { SignalFeed } from '../components/v2/SignalFeed';
import { CommandPalette } from '../components/v2/CommandPalette';
import { useAnticipationEngine } from '../hooks/useAnticipationEngine';
import { askAI } from '../services/ai/ai-service';

export default function CommandCenterPage() {
  const { isActive, lastRunAt, triggerCycle } = useAnticipationEngine();
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-400">
          Engine: {isActive ? 'Active' : 'Idle'}
          {lastRunAt && <span className="ml-2">Last run: {new Date(lastRunAt).toLocaleTimeString()}</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={triggerCycle} className="px-3 py-1.5 text-sm bg-indigo-500/20 text-indigo-400 rounded-lg hover:bg-indigo-500/30 transition-colors">
            Run Cycle
          </button>
          <button onClick={() => setPaletteOpen(true)} className="px-3 py-1.5 text-sm bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors">
            AI Command (⌘K)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Morning Brief
          </div>
          <MorningBrief />
        </div>

        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Signal Feed
          </div>
          <SignalFeed />
        </div>
      </div>

      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} onSubmit={askAI} />
    </div>
  );
}
