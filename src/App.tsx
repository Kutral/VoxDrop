import { getCurrentWindow } from '@tauri-apps/api/window';
import { PillView } from './components/PillView';
import { MainView } from './components/MainView';
import { useEffect, useState } from 'react';
import { useAppStore } from './store';

function App() {
  const [windowLabel, setWindowLabel] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [showLoading, setShowLoading] = useState(true);

  useEffect(() => {
    // Determine which window context we are in
    const appWindow = getCurrentWindow();
    setWindowLabel(appWindow.label || 'main');

    // Check Zustand store hydration
    if (useAppStore.persist.hasHydrated()) {
      setHydrated(true);
    } else {
      const unsub = useAppStore.persist.onFinishHydration(() => {
        setHydrated(true);
      });
      return () => unsub();
    }
  }, []);

  useEffect(() => {
    if (hydrated && windowLabel) {
      // Small delay to prevent flash of content and ensure smooth loading animation
      const timer = setTimeout(() => {
        setShowLoading(false);
      }, 750);
      return () => clearTimeout(timer);
    }
  }, [hydrated, windowLabel]);

  // If in the offscreen dictation pill window, bypass the loading screen to save CPU/resources
  if (windowLabel === 'pill') {
    return <PillView />;
  }

  // Show a premium glassmorphic loading screen for the main interface
  if (showLoading) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/40 to-purple-50/40 text-gray-900 overflow-hidden relative">
        {/* Animated Background Mesh */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[55%] rounded-full bg-purple-300/30 blur-[120px] animate-pulse"></div>
          <div className="absolute bottom-[-25%] left-[15%] w-[55%] h-[45%] rounded-full bg-blue-300/30 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
        </div>

        {/* Loading Glass Panel */}
        <div className="relative z-10 flex flex-col items-center gap-6 p-10 rounded-3xl border border-white/40 bg-white/20 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.45)] max-w-sm w-full mx-4 animate-fade-in">
          {/* Logo with ripple rings */}
          <div className="relative flex items-center justify-center w-20 h-20">
            <div className="absolute inset-0 rounded-2xl bg-indigo-500/10 animate-ping" />
            <div className="absolute inset-2 rounded-2xl bg-purple-500/10 animate-pulse" style={{ animationDelay: '0.5s' }} />
            <div className="relative w-16 h-16 rounded-2xl overflow-hidden shadow-md border border-white/60 bg-white/30 backdrop-blur-md flex items-center justify-center">
              <img src="/app-icon.png" alt="VoxDrop Logo" className="w-12 h-12 object-cover animate-pulse" />
            </div>
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-indigo-900 via-purple-800 to-indigo-600">
              VoxDrop
            </h1>
            <p className="text-xs text-gray-500 mt-1 font-medium tracking-wide">
              LOCAL INTELLIGENCE DICTATION
            </p>
          </div>

          {/* Shimmer loading bar */}
          <div className="w-full h-1 bg-gray-200/50 rounded-full overflow-hidden relative">
            <div className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full w-1/2 animate-shimmer" />
          </div>

          <span className="text-[13px] text-indigo-950/70 font-semibold tracking-wide flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping" />
            Initializing neural engine...
          </span>
        </div>
      </div>
    );
  }

  return <MainView />;
}

export default App;
