import { useState, lazy, Suspense } from 'react';
import { Plus } from 'lucide-react';
import { ProjectsList } from '../components/ProjectsList';

const RPMWizard = lazy(() =>
  import('../components/RPMWizard').then((m) => ({ default: m.RPMWizard }))
);

export default function ProjectsPage() {
  const [showRPM, setShowRPM] = useState(false);

  return (
    <div className="animate-fade-up space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setShowRPM(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 rounded-lg font-semibold text-sm transition-all shadow-lg shadow-blue-500/20"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      <div className="glass-card p-4 sm:p-6 min-h-[60vh]">
        <ProjectsList />
      </div>

      {showRPM && (
        <Suspense fallback={null}>
          <RPMWizard onClose={() => setShowRPM(false)} />
        </Suspense>
      )}
    </div>
  );
}
