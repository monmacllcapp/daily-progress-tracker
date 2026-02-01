import { useState, lazy, Suspense } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import { DashboardGrid } from '../components/dashboard/DashboardGrid';
import { DailyProgressHeader } from '../components/DailyProgressHeader';
import { CustomizationSidebar } from '../components/dashboard/CustomizationSidebar';
import { useDashboardStore } from '../store/dashboardStore';

const RPMWizard = lazy(() =>
  import('../components/RPMWizard').then((m) => ({ default: m.RPMWizard }))
);

export default function DashboardPage() {
  const [showRPM, setShowRPM] = useState(false);
  const { setSidebarOpen } = useDashboardStore();

  return (
    <div className="animate-fade-up">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
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
