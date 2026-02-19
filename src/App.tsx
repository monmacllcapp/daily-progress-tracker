import { useState, useEffect, lazy, Suspense } from 'react'
import { createDatabase } from './db'
import type { TitanDatabase } from './db'
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ErrorBoundary, PageErrorBoundary } from './components/ErrorBoundary';
import { WelcomeOnboarding } from './components/WelcomeOnboarding';
import { hasCompletedOnboarding } from './utils/onboarding';
import { trackEvent } from './services/analytics';
import { anticipationWorker } from './workers/anticipation-worker';

// Log active integrations at startup
if (typeof window !== 'undefined') {
  const env = import.meta.env;
  console.log('[Maple] Active integrations:', {
    google: !!env.VITE_GOOGLE_CLIENT_ID,
    ollama: !!env.VITE_OLLAMA_BASE_URL,
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
const DealsPage = lazy(() => import('./pages/DealsPage'));
const TradingPage = lazy(() => import('./pages/TradingPage'));
const FamilyPage = lazy(() => import('./pages/FamilyPage'));
const FinancePage = lazy(() => import('./pages/FinancePage'));
const StaffingPage = lazy(() => import('./pages/StaffingPage'));
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'));
const VisionPage = lazy(() => import('./pages/VisionPage'));
const FinancialPage = lazy(() => import('./pages/FinancialPage'));
const DevProjectsPage = lazy(() => import('./pages/DevProjectsPage'));
const PlanningPage = lazy(() => import('./pages/PlanningPage'));
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
      .then(database => {
        setDb(database);
        // Initialize anticipation engine with database for learning cycle
        anticipationWorker.setDatabase(database);
        // Track app open event (analytics)
        trackEvent(database, 'app_open').catch(err =>
          console.warn('[Analytics] Failed to track app open:', err)
        );
      })
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
          <p className="text-secondary">Initializing Maple...</p>
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
            {/* Shell-wrapped routes */}
            <Route element={<AppShell />}>
              <Route path="/" element={<PageErrorBoundary pageName="Dashboard"><DashboardPage /></PageErrorBoundary>} />
              <Route path="/tasks" element={<PageErrorBoundary pageName="Tasks"><TasksPage /></PageErrorBoundary>} />
              <Route path="/calendar" element={<PageErrorBoundary pageName="Calendar"><CalendarPage /></PageErrorBoundary>} />
              <Route path="/email" element={<PageErrorBoundary pageName="Email"><EmailPage /></PageErrorBoundary>} />
              <Route path="/life" element={<PageErrorBoundary pageName="Life"><LifePage /></PageErrorBoundary>} />
              <Route path="/journal" element={<PageErrorBoundary pageName="Journal"><JournalPage /></PageErrorBoundary>} />
              <Route path="/projects" element={<PageErrorBoundary pageName="Projects"><ProjectsPage /></PageErrorBoundary>} />
              <Route path="/morning" element={<PageErrorBoundary pageName="Morning Flow"><MorningFlowPage /></PageErrorBoundary>} />
              <Route path="/planning" element={<PageErrorBoundary pageName="Planning"><PlanningPage /></PageErrorBoundary>} />
              <Route path="/deals" element={<PageErrorBoundary pageName="Deals"><DealsPage /></PageErrorBoundary>} />
              <Route path="/trading" element={<PageErrorBoundary pageName="Trading"><TradingPage /></PageErrorBoundary>} />
              <Route path="/family" element={<PageErrorBoundary pageName="Family"><FamilyPage /></PageErrorBoundary>} />
              <Route path="/finance" element={<PageErrorBoundary pageName="Finance"><FinancePage /></PageErrorBoundary>} />
              <Route path="/staffing" element={<PageErrorBoundary pageName="Staffing"><StaffingPage /></PageErrorBoundary>} />
              <Route path="/categories" element={<PageErrorBoundary pageName="Categories"><CategoriesPage /></PageErrorBoundary>} />
              <Route path="/finances" element={<PageErrorBoundary pageName="Finances"><FinancialPage /></PageErrorBoundary>} />
              <Route path="/vision" element={<PageErrorBoundary pageName="Vision"><VisionPage /></PageErrorBoundary>} />
              <Route path="/dev-projects" element={<PageErrorBoundary pageName="Dev Projects"><DevProjectsPage /></PageErrorBoundary>} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
