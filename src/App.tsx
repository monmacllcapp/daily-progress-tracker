import { useState, useEffect } from 'react'
import { createDatabase } from './db'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { MorningFlow } from './components/MorningFlow';

function Home() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      <header className="p-6 border-b border-white/10 glass-panel">
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-rose-400 bg-clip-text text-transparent">
          Titan Planner
        </h1>
        <p className="text-secondary text-sm font-medium">Cognitive Offloading Engine</p>
      </header>

      <main className="p-6 max-w-4xl mx-auto space-y-8">
        <div className="glass-card p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Welcome to your Morning Flow</h2>
          <p className="text-secondary mb-6">Initialize your cognitive stack.</p>

          <button
            onClick={() => navigate('/morning')}
            className="bg-primary hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium transition-all shadow-lg shadow-blue-500/20 active:scale-95"
          >
            Start Session
          </button>
        </div>
      </main>
    </div>
  );
}

function App() {
  const [dbReady, setDbReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createDatabase()
      .then(() => setDbReady(true))
      .catch((err) => {
        console.error("Failed to init DB:", err);
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-red-950 text-white flex flex-col items-center justify-center p-6">
        <h2 className="text-xl font-bold mb-4">Startup Error</h2>
        <pre className="bg-black/50 p-4 rounded text-sm font-mono overflow-auto max-w-full">
          {error}
        </pre>
      </div>
    );
  }

  if (!dbReady) {
    return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">Loading Brain...</div>
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/morning" element={<MorningFlow />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
