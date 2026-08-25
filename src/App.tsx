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
    // Show the real UI as soon as hydration completes — no artificial delay.
    if (hydrated && windowLabel) {
      setShowLoading(false);
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
        {/* Subtle Ambient Lighting (static — animating huge blur layers is GPU-expensive during startup) */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[55%] rounded-full bg-indigo-200/30 blur-[120px]" />
          <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[55%] rounded-full bg-blue-100/40 blur-[120px]" />
        </div>

        {/* Studio Loading Panel */}
        <div className="relative z-10 flex flex-col items-center gap-6 p-8 rounded-[20px] studio-card max-w-sm w-full mx-4 animate-fade-in">
          {/* Logo with pulse ring */}
          <div className="relative flex items-center justify-center w-20 h-20">
            <div className="absolute inset-2 rounded-2xl bg-indigo-500/10 animate-pulse" />
            <div className="relative w-16 h-16 rounded-2xl overflow-hidden shadow-md border border-slate-200/80 bg-white p-2 flex items-center justify-center">
              <img src="/app-icon.png" alt="VoxDrop Logo" className="w-full h-full object-cover" />
            </div>
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-slate-900">
              VoxDrop
            </h1>
            <p className="studio-eyebrow justify-center mt-1.5">
              Acoustic Intelligence
            </p>
          </div>

          {/* Shimmer loading bar */}
          <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden relative">
            <div className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full w-1/2 animate-shimmer" />
          </div>

          <span className="text-[12.5px] text-slate-500 font-semibold tracking-wide flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
            Initializing acoustic engine...
          </span>
        </div>
      </div>
    );
  }

  return <MainView />;
}

export default App;
