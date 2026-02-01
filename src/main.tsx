/* eslint-disable react-refresh/only-export-components -- entry point file, no exports needed */
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css' // Restore CSS
import './utils/reset-db.ts' // Make resetDB() available in console

console.log("Restoring Titan Planner...");

// Dynamic Import Wrapper to catch module loading errors
function RootErrorBoundary() {
  const [AppComponent, setAppComponent] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log("Attempting to load App module...");
    import('./App.tsx')
      .then((module) => {
        console.log("App module loaded successfully");
        setAppComponent(() => module.default);
      })
      .catch((err) => {
        console.error("Failed to load App module:", err);
        setError(String(err) + "\n\nStack: " + (err?.stack || ''));
      });
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-black p-8 text-red-500 font-mono overflow-auto">
        <h1 className="text-2xl font-bold mb-4">CRITICAL MODULE LOAD ERROR</h1>
        <pre className="whitespace-pre-wrap">{error}</pre>
        <p className="text-white mt-4">Check console for more details.</p>
      </div>
    );
  }

  if (!AppComponent) {
    return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">Loading Components...</div>;
  }

  return <AppComponent />;
}

try {
  const root = document.getElementById('root');
  if (!root) throw new Error("Root element not found");

  createRoot(root).render(
    <StrictMode>
      <RootErrorBoundary />
    </StrictMode>,
  )
} catch (e) {
  console.error("Critical Render Error:", e);
  const root = document.getElementById('root')!;
  root.textContent = '';
  const h1 = document.createElement('h1');
  h1.style.color = 'red';
  h1.textContent = `Critical Error: ${e}`;
  root.appendChild(h1);
}
