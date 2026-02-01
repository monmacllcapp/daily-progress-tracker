import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { createDatabase } from './db'
import type { TitanDatabase } from './db'
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Plus } from 'lucide-react';
import { rolloverTasks } from './services/task-rollover';
import { checkStreakResets } from './services/streak-service';
import { DailyProgressHeader } from './components/DailyProgressHeader';
import { Celebration } from './components/Celebration';
import { HealthNudge } from './components/HealthNudge';
import type { NudgeType } from './components/HealthNudge';
import { WelcomeOnboarding } from './components/WelcomeOnboarding';
import { hasCompletedOnboarding } from './utils/onboarding';
import { FeedbackWidget } from './components/FeedbackWidget';

// Log active integrations at startup
if (typeof window !== 'undefined') {
  const env = import.meta.env;
  console.log('[Titan] Active integrations:', {
    google: !!env.VITE_GOOGLE_CLIENT_ID,
    gemini: !!env.VITE_GEMINI_API_KEY,
    supabase: !!(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY),
  });
}

// Lazy-loaded route components for code splitting
const MorningFlow = lazy(() => import('./components/MorningFlow').then(m => ({ default: m.MorningFlow })));
const RPMWizard = lazy(() => import('./components/RPMWizard').then(m => ({ default: m.RPMWizard })));
const TitanDashboard = lazy(() => import('./components/dashboard/TitanDashboard').then(m => ({ default: m.TitanDashboard })));
const PatternInterrupt = lazy(() => import('./components/PatternInterrupt').then(m => ({ default: m.PatternInterrupt })));

function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    </div>
  );
}

// Toast notification component
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-slide-up">
      {message}
    </div>
  );
}

function Home() {
  const [showRPM, setShowRPM] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showPatternInterrupt, setShowPatternInterrupt] = useState(false);
  const [showMorningFlow, setShowMorningFlow] = useState(false);
  const [isCheckingMorningFlow, setIsCheckingMorningFlow] = useState(true);
  const [celebration, setCelebration] = useState<{ show: boolean; message?: string }>({ show: false });
  const [activeNudge, setActiveNudge] = useState<NudgeType | null>(null);
  const healthWorkerRef = useRef<Worker | null>(null);
  const [onboardingDone, setOnboardingDone] = useState(() => hasCompletedOnboarding());

  const handleTaskRollover = async () => {
    try {
      const db = await createDatabase();
      const count = await rolloverTasks(db);
      // Check for broken streaks on daily reset
      await checkStreakResets(db);
      if (count > 0) {
        setToast(`${count} task${count > 1 ? 's' : ''} rolled to today`);
      }
    } catch (err) {
      console.error('Failed to rollover tasks:', err);
    }
  };

  const clearTodaysStressors = async () => {
    try {
      const db = await createDatabase();
      const stressors = await db.stressors?.find({ selector: { is_today: true } }).exec();

      if (stressors) {
        await Promise.all(stressors.map(doc => doc.patch({ is_today: false })));
      }
    } catch (err) {
      console.error('Failed to clear stressors:', err);
    }
  };

  useEffect(() => {
    // FORCE CLEAR CACHE for layout issues
    localStorage.removeItem('titan_glass_layout_v1');
    localStorage.removeItem('titan_glass_layout_v2');
    localStorage.removeItem('titan_glass_layout_v3');
    localStorage.removeItem('dashboard_panels'); // Clear old DndGrid dashboard

    // Check if morning flow completed today
    const checkMorningFlow = () => {
      const today = new Date().toISOString().split('T')[0];
      const flowData = localStorage.getItem('morning_flow_completed');

      if (!flowData) {
        setShowMorningFlow(true);
      } else {
        try {
          const { date } = JSON.parse(flowData);
          if (date !== today) {
            setShowMorningFlow(true);
          }
        } catch {
          setShowMorningFlow(true);
        }
      }
      setIsCheckingMorningFlow(false);
    };

    checkMorningFlow();

    // Health worker setup
    const healthWorker = new Worker(new URL('./workers/health-worker.ts', import.meta.url), { type: 'module' });

    healthWorker.onmessage = (e) => {
      const msgType = e.data.type;
      if (msgType === 'HYDRATE' || msgType === 'STRETCH' || msgType === 'EYE_BREAK') {
        setActiveNudge(msgType as NudgeType);
      } else if (msgType === 'PATTERN_INTERRUPT') {
        // Legacy support
        setShowPatternInterrupt(true);
      }
    };

    healthWorkerRef.current = healthWorker;
    healthWorker.postMessage({ type: 'START' });

    // Daily reset worker setup
    const resetWorker = new Worker(new URL('./workers/daily-reset-worker.ts', import.meta.url), { type: 'module' });

    resetWorker.onmessage = (e) => {
      if (e.data.type === 'RESET_MORNING_FLOW') {
        console.log('[App] Morning flow reset triggered for', e.data.date);
        localStorage.removeItem('morning_flow_completed');
        setShowMorningFlow(true);
      } else if (e.data.type === 'RESET_STRESSORS') {
        console.log('[App] Stressors reset triggered for', e.data.date);
        clearTodaysStressors();
      } else if (e.data.type === 'ROLLOVER_TASKS') {
        console.log('[App] Task rollover triggered for', e.data.date);
        handleTaskRollover();
      }
    };

    const lastResetDate = localStorage.getItem('last_reset_date');
    resetWorker.postMessage({ type: 'START', lastResetDate });

    return () => {
      healthWorker.terminate();
      resetWorker.terminate();
    };
  }, []);

  const handleMorningFlowComplete = () => {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem('morning_flow_completed', JSON.stringify({ date: today, completed: true }));
    localStorage.setItem('last_reset_date', today);
    setShowMorningFlow(false);
    setIsCheckingMorningFlow(false); // Ensure dashboard shows
  };

  // Show loading state while checking morning flow
  if (isCheckingMorningFlow) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-secondary">Initializing your day...</p>
        </div>
      </div>
    );
  }

  // Temporarily disabled to allow dashboard to show
  // if (isCheckingMorningFlow) {
  //   return null; // Don't render anything while checking
  // }

  // Show onboarding on first visit
  if (!onboardingDone) {
    return <WelcomeOnboarding onComplete={() => setOnboardingDone(true)} />;
  }

  // Show morning flow if not completed today
  if (showMorningFlow) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <MorningFlow onComplete={handleMorningFlowComplete} />
      </Suspense>
    );
  }

  return (
    <>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      <PatternInterrupt isOpen={showPatternInterrupt} onDismiss={() => setShowPatternInterrupt(false)} />
      <Celebration show={celebration.show} message={celebration.message} onComplete={() => setCelebration({ show: false })} />
      <HealthNudge
        type={activeNudge}
        onDismiss={() => setActiveNudge(null)}
        onSnooze={(nudgeType) => {
          setActiveNudge(null);
          healthWorkerRef.current?.postMessage({ type: 'SNOOZE', nudgeType });
        }}
      />

      <FeedbackWidget />
      <main className="min-h-screen bg-zinc-950 text-white p-6">
        {/* Header */}
        <header className="w-full px-4 sm:px-6 lg:px-8 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-rose-400 bg-clip-text text-transparent">
                Titan Life OS
              </h1>
              <p className="text-secondary mt-1">Your cognitive operating system</p>
            </div>

          <button
            onClick={() => setShowRPM(true)}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 rounded-xl font-bold transition-all shadow-lg shadow-[rgba(59,130,246,0.2)]"
          >
            <Plus className="w-5 h-5" />
            New Project
          </button>
          </div>

          {/* Daily Progress Summary */}
          <div className="mt-4">
            <DailyProgressHeader />
          </div>
        </header>

        {/* RPM Wizard Modal */}
        {showRPM && (
          <Suspense fallback={<LoadingSpinner />}>
            <RPMWizard onClose={() => setShowRPM(false)} />
          </Suspense>
        )}

        {/* Dashboard - Always Show */}
        <div className="w-full">
          <Suspense fallback={<LoadingSpinner />}>
            <TitanDashboard />
          </Suspense>
        </div>
      </main>
    </>
  );
}

function App() {
  const [db, setDb] = useState<TitanDatabase | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createDatabase()
      .then(database => setDb(database))
      .catch(err => {
        console.error('Failed to initialize database:', err);
        setError(err.message);
      });
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
        <div className="glass-card p-8 max-w-md">
          <h2 className="text-2xl font-bold text-red-400 mb-4">Database Error</h2>
          <p className="text-secondary mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg font-bold transition-all"
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }

  if (!db) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-secondary">Initializing Titan Life OS...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/morning" element={<MorningFlow />} />
            <Route path="/rpm" element={<RPMWizard />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
