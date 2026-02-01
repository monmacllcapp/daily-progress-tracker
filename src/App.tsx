import { useState, useEffect, lazy, Suspense } from 'react'
import { createDatabase } from './db'
import type { TitanDatabase } from './db'
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WelcomeOnboarding } from './components/WelcomeOnboarding';
import { hasCompletedOnboarding } from './utils/onboarding';

// Log active integrations at startup
if (typeof window !== 'undefined') {
  const env = import.meta.env;
  console.log('[Titan] Active integrations:', {
    google: !!env.VITE_GOOGLE_CLIENT_ID,
    gemini: !!env.VITE_GEMINI_API_KEY,
    supabase: !!(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY),
  });
}

// Layout shell
const AppShell = lazy(() =>
  import('./components/layout/AppShell').then((m) => ({ default: m.AppShell }))
);

// Pages (lazy-loaded for code splitting)
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const EmailPage = lazy(() => import('./pages/EmailPage'));
const LifePage = lazy(() => import('./pages/LifePage'));
const JournalPage = lazy(() => import('./pages/JournalPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const MorningFlowPage = lazy(() => import('./pages/MorningFlowPage'));

function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-[var(--color-background)] text-white flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    </div>
  );
}

function App() {
  const [db, setDb] = useState<TitanDatabase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onboardingDone, setOnboardingDone] = useState(() => hasCompletedOnboarding());

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
      <div className="min-h-screen bg-[var(--color-background)] text-white flex items-center justify-center p-6">
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
      <div className="min-h-screen bg-[var(--color-background)] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-secondary">Initializing Titan Life OS...</p>
        </div>
      </div>
    );
  }

  if (!onboardingDone) {
    return <WelcomeOnboarding onComplete={() => setOnboardingDone(true)} />;
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            {/* Full-screen (no shell) */}
            <Route path="/morning" element={<MorningFlowPage />} />

            {/* Shell-wrapped routes */}
            <Route element={<AppShell />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/email" element={<EmailPage />} />
              <Route path="/life" element={<LifePage />} />
              <Route path="/journal" element={<JournalPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
