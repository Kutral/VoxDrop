import { getCurrentWindow } from '@tauri-apps/api/window';
import { PillView } from './components/PillView';
import { MainView } from './components/MainView';
import { useEffect, useState } from 'react';
import { useAppStore } from './store';

function App() {
  const [windowLabel, setWindowLabel] = useState<string>('main');
  const [hydrated, setHydrated] = useState(() => useAppStore.persist.hasHydrated());
  const [showLoading, setShowLoading] = useState(true);

  useEffect(() => {
    try {
      const appWindow = getCurrentWindow();
      setWindowLabel(appWindow?.label || 'main');
    } catch {
      setWindowLabel('main');
    }

    const finishHydration = () => setHydrated(true);

    if (useAppStore.persist.hasHydrated()) {
      finishHydration();
      return;
    }

    const unsub = useAppStore.persist.onFinishHydration(finishHydration);
    const timeout = window.setTimeout(finishHydration, 2500);

    return () => {
      unsub();
      window.clearTimeout(timeout);
    };
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

  // Show a studio loading screen for the main interface
  if (showLoading) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center studio-app text-slate-900 overflow-hidden relative">
        {/* Subtle Ambient Lighting */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[55%] rounded-full bg-indigo-200/30 blur-[120px] animate-pulse" />
          <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[55%] rounded-full bg-blue-100/40 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
        </div>

        {/* Studio Loading Panel */}
        <div className="relative z-10 flex flex-col items-center gap-6 p-8 rounded-3xl studio-card max-w-sm w-full mx-4 shadow-xl animate-fade-in">
          {/* Logo with pulse rings */}
          <div className="relative flex items-center justify-center w-20 h-20">
            <div className="absolute inset-0 rounded-2xl bg-indigo-500/10 animate-ping" />
            <div className="absolute inset-2 rounded-2xl bg-indigo-500/15 animate-pulse" style={{ animationDelay: '0.5s' }} />
            <div className="relative w-16 h-16 rounded-2xl overflow-hidden shadow-md border border-slate-200 bg-white p-2 flex items-center justify-center">
              <img src="/app-icon.png" alt="VoxDrop Logo" className="w-full h-full object-cover" />
            </div>
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-extrabold tracking-tight text-studio-gradient">
              VoxDrop
            </h1>
            <p className="text-[11px] text-slate-500 mt-1 font-mono font-bold tracking-widest uppercase">
              Acoustic Intelligence
            </p>
          </div>

          {/* Shimmer loading bar */}
          <div className="w-full h-1 bg-slate-200/80 rounded-full overflow-hidden relative">
            <div className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full w-1/2 animate-shimmer" />
          </div>

          <span className="text-[12.5px] text-slate-600 font-semibold tracking-wide flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
            Initializing acoustic engine...
          </span>
        </div>
      </div>
    );
  }

  return <MainView />;
}

export default App;
