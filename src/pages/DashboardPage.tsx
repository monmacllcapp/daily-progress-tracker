import { useState, lazy, Suspense } from 'react';
import { Plus, Settings2, AlertTriangle } from 'lucide-react';
import { DashboardGrid } from '../components/dashboard/DashboardGrid';
import { DailyProgressHeader } from '../components/DailyProgressHeader';
import { CustomizationSidebar } from '../components/dashboard/CustomizationSidebar';
import { useDashboardStore } from '../store/dashboardStore';
import { JarvisIcon } from '../components/JarvisIcon';
import { useJarvisStore } from '../store/jarvisStore';
import { useSignalStore } from '../store/signalStore';

const RPMWizard = lazy(() =>
  import('../components/RPMWizard').then((m) => ({ default: m.RPMWizard }))
);

export default function DashboardPage() {
  const [showRPM, setShowRPM] = useState(false);
  const { setSidebarOpen } = useDashboardStore();
  const { isOpen: jarvisOpen, toggleOpen: jarvisToggle, latestNudge } = useJarvisStore();

  const urgentSignals = useSignalStore(s => {
    const now = new Date().toISOString();
    return s.signals.filter(sig =>
      !sig.is_dismissed &&
      (!sig.expires_at || sig.expires_at > now) &&
      (sig.severity === 'critical' || sig.severity === 'urgent')
    );
  });

  return (
    <div className="animate-fade-up">
      {/* ANDIE AI — top of dashboard, AI-first */}
      <div className="flex justify-center mb-3">
        <JarvisIcon onClick={jarvisToggle} nudge={latestNudge} isActive={jarvisOpen} />
      </div>

      {/* Urgent Signals Banner */}
      {urgentSignals.length > 0 && (
        <div className="mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-red-300">
              {urgentSignals.length} Urgent Signal{urgentSignals.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-1">
            {urgentSignals.slice(0, 3).map(signal => (
              <div key={signal.id} className="flex items-center gap-2 text-sm text-red-200">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                <span className="truncate">{signal.title}</span>
                <span className="text-xs text-red-400/60 flex-shrink-0">{signal.domain}</span>
              </div>
            ))}
            {urgentSignals.length > 3 && (
              <div className="text-xs text-red-400/60 pl-4">
                +{urgentSignals.length - 3} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div />
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900/50 hover:bg-slate-800 border border-white/10 rounded-lg text-sm font-medium text-slate-300 hover:text-white transition-all backdrop-blur-sm"
          >
            <Settings2 className="w-4 h-4" />
            <span className="hidden sm:inline">Customize</span>
          </button>
          <button
            onClick={() => setShowRPM(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 rounded-lg font-semibold text-sm transition-all shadow-lg shadow-blue-500/20"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Project</span>
          </button>
        </div>
      </div>

      {/* Progress summary */}
      <div className="mb-6">
        <DailyProgressHeader />
      </div>

      {/* Widget grid */}
      <DashboardGrid />

      {/* Customization sidebar overlay */}
      <CustomizationSidebar />

      {/* RPM Wizard modal */}
      {showRPM && (
        <Suspense fallback={null}>
          <RPMWizard onClose={() => setShowRPM(false)} />
        </Suspense>
      )}
    </div>
  );
}
