import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { ClipboardList, History, Home, Settings } from 'lucide-react';
import { DEFAULT_HOTKEY, keyFingerprint, useAppStore, whenHydrated } from '../store';
import { HomeTab } from './HomeTab';
import { HistoryTab } from './HistoryTab';
import { SnippetsTab } from './SnippetsTab';
import { SettingsTab } from './SettingsTab';
import { ToastProvider, useToast } from './ui';

export type Tab = 'home' | 'history' | 'snippets' | 'settings';

const TABS: { id: Tab; label: string; Icon: typeof Home }[] = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'history', label: 'History', Icon: History },
  { id: 'snippets', label: 'Snippets', Icon: ClipboardList },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

export function MainView() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

function Shell() {
  // First run lands on Settings: nothing works until there's a key.
  const [tab, setTab] = useState<Tab>(() => (useAppStore.getState().apiKey.trim() ? 'home' : 'settings'));
  const toast = useToast();

  useAppSync(toast);

  return (
    <div className="app-shell flex h-screen w-screen flex-col bg-paper text-ink">
      <header className="flex h-14 flex-none items-center justify-between gap-4 border-b hairline px-5">
        <div className="flex items-center gap-2.5">
          <img src="/voxdrop-favicon.svg" alt="" className="h-6 w-6" />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">VoxDrop</span>
          <StatusChip onFix={() => setTab('settings')} />
        </div>
        <nav aria-label="Sections" className="flex items-center gap-0.5">
          {TABS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-current={active ? 'page' : undefined}
                title={label}
                className={`relative flex h-9 items-center gap-2 rounded-control px-3 text-[13.5px] font-medium transition-colors ${
                  active ? 'text-ink' : 'text-mist hover:bg-ink/[0.05] hover:text-ink'
                }`}
              >
                <Icon className="h-4 w-4 flex-none" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                <span className="max-[600px]:sr-only">{label}</span>
                {active && <span className="absolute inset-x-3 -bottom-[11px] h-[2px] rounded-full bg-ink" />}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="mx-auto w-full max-w-[680px] px-5 pb-16 pt-7 sm:px-8">
          {tab === 'home' && <HomeTab onNavigate={setTab} />}
          {tab === 'history' && <HistoryTab />}
          {tab === 'snippets' && <SnippetsTab />}
          {tab === 'settings' && <SettingsTab />}
        </div>
      </main>
    </div>
  );
}

/** Ready / needs setup, from what's actually configured. */
function StatusChip({ onFix }: { onFix: () => void }) {
  const apiKey = useAppStore((s) => s.apiKey);
  const verified = useAppStore((s) => s.verifiedKeys.groq);
  if (!apiKey.trim()) {
    return (
      <button type="button" onClick={onFix} className="ml-1 rounded-full bg-brick/10 px-2.5 py-0.5 text-caption font-medium text-brick hover:bg-brick/15">
        Add a Groq key
      </button>
    );
  }
  const tested = verified === keyFingerprint(apiKey);
  return (
    <span className="ml-1 inline-flex items-center gap-1.5 text-caption text-mist" title={tested ? 'Key tested' : 'Key saved, not tested yet'}>
      <span className={`h-1.5 w-1.5 rounded-full ${tested ? 'bg-moss' : 'bg-mist/60'}`} />
      Ready
    </span>
  );
}

/**
 * Keeps the dashboard and the pill window in step, and applies the saved
 * hotkey once the store has loaded.
 */
function useAppSync(toast: ReturnType<typeof useToast>) {
  useEffect(() => {
    let cancelled = false;

    whenHydrated().then(() => {
      if (cancelled) return;
      const saved = useAppStore.getState().hotkey || DEFAULT_HOTKEY;
      invoke('update_hotkey', { newHotkey: saved }).catch((err) => {
        // Another app took the saved shortcut: Rust kept the default active,
        // so make the UI say what actually works.
        useAppStore.getState().setHotkey(DEFAULT_HOTKEY);
        toast({ message: `${String(err)} Using Ctrl + Win for now.` });
      });
    });

    // Tell the pill to re-read settings. localStorage "storage" events cover
    // this too; the explicit event is a fallback.
    let timer: number | undefined;
    const unsubscribe = useAppStore.subscribe(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => emit('settings-changed').catch(() => {}), 150);
    });

    const pending = listen('history-sync', () => void useAppStore.persist.rehydrate());

    return () => {
      cancelled = true;
      unsubscribe();
      window.clearTimeout(timer);
      pending.then((unlisten) => unlisten()).catch(() => {});
    };
  }, [toast]);
}
