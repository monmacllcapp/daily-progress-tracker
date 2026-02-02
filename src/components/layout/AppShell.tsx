import { lazy, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useAppLifecycle } from '../../hooks/useAppLifecycle';
import { useThemeApplicator } from '../../hooks/useThemeApplicator';
import { Celebration } from '../Celebration';
import { HealthNudge } from '../HealthNudge';
import { FeedbackWidget } from '../FeedbackWidget';
import { PomodoroTimer } from '../PomodoroTimer';

const PatternInterrupt = lazy(
  () => import('../PatternInterrupt').then((m) => ({ default: m.PatternInterrupt }))
);

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-slide-up">
      <button onClick={onClose} className="absolute -top-2 -right-2 w-5 h-5 bg-slate-800 rounded-full text-xs flex items-center justify-center text-slate-300 hover:text-white">
        &times;
      </button>
      {message}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-2" />
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    </div>
  );
}

export function AppShell() {
  const {
    toast,
    setToast,
    showPatternInterrupt,
    setShowPatternInterrupt,
    celebration,
    setCelebration,
    activeNudge,
    setActiveNudge,
    snoozeNudge,
  } = useAppLifecycle();

  useThemeApplicator();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-background)]">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />

        <main className="flex-1 overflow-y-auto scrollbar-thin p-4 sm:p-6">
          <Suspense fallback={<LoadingSpinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Global overlays */}
      <PomodoroTimer />
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      <Suspense fallback={null}>
        <PatternInterrupt
          isOpen={showPatternInterrupt}
          onDismiss={() => setShowPatternInterrupt(false)}
        />
      </Suspense>

      <Celebration
        show={celebration.show}
        message={celebration.message}
        onComplete={() => setCelebration({ show: false })}
      />

      <HealthNudge
        type={activeNudge}
        onDismiss={() => setActiveNudge(null)}
        onSnooze={snoozeNudge}
      />

      <FeedbackWidget />
    </div>
  );
}
