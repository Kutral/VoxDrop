import { useState, useEffect, useMemo } from 'react';
import { DEFAULT_HOTKEY, useAppStore } from '../store';
import { testApiKey } from '../lib/groq';
import { checkForGitHubUpdate, getInstalledVersion, RELEASES_PAGE_URL, type ReleaseCheckResult } from '../lib/updates';
import { listen, emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { History, ClipboardList, Settings, CheckCircle, XCircle, Loader2, Sparkles, Command } from 'lucide-react';

export function MainView() {
  const [tab, setTab] = useState<'history' | 'snippets' | 'settings'>('history');

  // Track settings changes and broadcast to pill window so it can rehydrate
  const { apiKey, whisperModel, llamaModel, snippets, hotkey } = useAppStore();
  useEffect(() => {
    emit('settings-changed').catch(console.error);
  }, [apiKey, whisperModel, llamaModel, snippets, hotkey]);

  useEffect(() => {
    let cancelled = false;

    const syncHotkey = async () => {
      if (!useAppStore.persist.hasHydrated()) {
        await new Promise<void>((resolve) => {
          const unsub = useAppStore.persist.onFinishHydration(() => {
            unsub();
            resolve();
          });
        });
      }

      if (cancelled) return;

      const persistedHotkey = useAppStore.getState().hotkey || DEFAULT_HOTKEY;
      invoke('update_hotkey', { newHotkey: persistedHotkey }).catch((err) => {
        console.warn('Could not sync persisted hotkey:', err);
      });
    };

    syncHotkey();

    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for history events from pill window
  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;

    listen<unknown>('history-sync', (event) => {
      if (cancelled) return;
      try {
        const payload = typeof event.payload === 'string'
          ? JSON.parse(event.payload)
          : event.payload;

        if (!payload || typeof payload !== 'object' || !('id' in payload)) {
          return;
        }

        const current = useAppStore.getState().history;
        if (!current.find(h => h.id === payload.id)) {
          useAppStore.getState().addHistoryItem(payload as any);
        }
      } catch {
        // Fallback: ignore parse errors
      }
    }).then(fn => {
      if (cancelled) {
        fn();
      } else {
        unlistenFn = fn;
      }
    });

    return () => {
      cancelled = true;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  const navItem = (id: 'history' | 'snippets' | 'settings', Icon: any, label: string) => {
    const active = tab === id;
    return (
      <button 
        onClick={() => setTab(id)} 
        className="flex flex-col items-center gap-1.5 group relative w-16"
      >
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 relative z-10 ${
          active 
            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' 
            : 'text-zinc-500 group-hover:bg-white/[0.04] group-hover:text-zinc-300 border border-transparent'
        }`}>
          <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
        </div>
        <span className={`text-[10px] font-semibold tracking-widest uppercase transition-colors duration-300 ${
          active ? 'text-indigo-300' : 'text-zinc-600 group-hover:text-zinc-400'
        }`}>{label}</span>
      </button>
    );
  };

  return (
    <div className="w-screen h-screen bg-[#050505] text-zinc-100 flex relative overflow-hidden font-sans p-4 gap-4">
      {/* Background Ambience (Optimized for RAM: using simple radial gradients instead of heavy DOM blur filters) */}
      <div className="absolute inset-0 noise-bg z-0"></div>
      <div className="absolute -top-[260px] -left-[260px] w-[520px] h-[520px] rounded-full pointer-events-none opacity-[0.12]" style={{ background: 'radial-gradient(circle, rgba(79,70,229,0.22) 0%, transparent 65%)' }}></div>
      <div className="absolute top-[160px] -right-[240px] w-[420px] h-[420px] rounded-full pointer-events-none opacity-10" style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.16) 0%, transparent 68%)' }}></div>

      {/* Sidebar */}
      <div className="w-[88px] h-full flex flex-col items-center py-8 bg-zinc-900 border border-white/5 rounded-[24px] relative z-10">
        
        {/* Super Logo */}
        <div className="w-14 h-14 flex items-center justify-center mb-10 relative group cursor-pointer">
          <svg className="relative z-10 drop-shadow-md" width="40" height="40" viewBox="0 0 32 32" fill="none">
             <path d="M16 4C9.37 4 4 9.37 4 16C4 22.63 9.37 28 16 28C22.63 28 28 22.63 28 16" stroke="url(#logo-grad-1)" strokeWidth="3" strokeLinecap="round" />
             <path d="M16 12C13.79 12 12 13.79 12 16C12 18.21 13.79 20 16 20C18.21 20 20 18.21 20 16" fill="url(#logo-grad-2)" />
             <path d="M10 16a6 6 0 0112 0" stroke="url(#logo-grad-3)" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
             <defs>
               <linearGradient id="logo-grad-1" x1="4" y1="4" x2="28" y2="28">
                 <stop stopColor="#818cf8"/>
                 <stop offset="1" stopColor="#c084fc"/>
               </linearGradient>
               <linearGradient id="logo-grad-2" x1="12" y1="12" x2="20" y2="20">
                 <stop stopColor="#6366f1"/>
                 <stop offset="1" stopColor="#a855f7"/>
               </linearGradient>
               <linearGradient id="logo-grad-3" x1="10" y1="16" x2="22" y2="16">
                 <stop stopColor="#f472b6"/>
                 <stop offset="1" stopColor="#818cf8"/>
               </linearGradient>
             </defs>
          </svg>
        </div>

        {/* Nav Items */}
        <div className="flex flex-col gap-6 w-full items-center">
           {navItem('history', History, 'History')}
           {navItem('snippets', ClipboardList, 'Snippets')}
        </div>

        <div className="flex-1" />

        <div className="flex flex-col gap-6 w-full items-center">
           {navItem('settings', Settings, 'Settings')}
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="flex-1 h-full bg-zinc-900 border border-white/5 rounded-[24px] relative z-10 overflow-hidden flex flex-col">
         <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
         
         <div className="content-scroll flex-1 overflow-y-auto custom-scrollbar p-10 relative">
            <div className="max-w-[800px] mx-auto w-full relative z-10">
              {tab === 'history' && <HistoryTab />}
              {tab === 'snippets' && <SnippetsTab />}
              {tab === 'settings' && <SettingsTab />}
            </div>
         </div>
      </div>
    </div>
  );
}

function HistoryTab() {
  const history = useAppStore(state => state.history);
  const setHistory = useAppStore(state => state.setHistory);
  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [history]
  );

  return (
    <div className="pb-6">
      <div className="flex justify-between items-end mb-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-white pb-1">Activity Log</h1>
          <p className="text-zinc-400 mt-2 text-[15px] max-w-sm">Every word captured and refined, safely stored locally on your machine.</p>
        </div>
        <button 
          onClick={() => setHistory([])}
          className="px-5 py-2.5 rounded-xl border border-red-500/20 hover:bg-red-500/10 text-sm font-medium text-red-400 hover:text-red-300 transition-colors"
        >
          Clear All
        </button>
      </div>
      
      <div className="space-y-4">
        {sortedHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 px-4 rounded-3xl border border-white/5 bg-white/[0.01]">
            <div className="w-20 h-20 rounded-3xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-6">
              <Sparkles className="w-8 h-8 text-indigo-400/50" />
            </div>
            <p className="text-zinc-300 font-medium text-lg tracking-wide">Ready for your voice</p>
            <p className="text-zinc-500 text-sm mt-2">Use your hotkey to start recording.</p>
          </div>
        ) : (
          sortedHistory.map(item => (
            <div key={item.id} className="p-5 rounded-[22px] bg-zinc-950/90 border border-white/5 hover:border-indigo-500/20 transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-indigo-500/50"></div>
                  <span className="text-xs uppercase tracking-[0.2em] font-semibold text-zinc-500">{new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</span>
                </div>
                <button 
                  onClick={() => navigator.clipboard.writeText(item.transcript)}
                  className="text-[11px] uppercase tracking-wider font-bold bg-white/5 hover:bg-indigo-500/20 hover:text-indigo-300 text-zinc-400 px-4 py-2 rounded-xl transition-colors flex items-center gap-2"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  Copy
                </button>
              </div>
              <p className="text-[16px] text-zinc-200 leading-relaxed font-light tracking-wide">{item.transcript}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SnippetsTab() {
  const snippets = useAppStore(state => state.snippets);
  const addSnippet = useAppStore(state => state.addSnippet);
  const removeSnippet = useAppStore(state => state.removeSnippet);
  const [trigger, setTrigger] = useState('');
  const [expansion, setExpansion] = useState('');
  const [showForm, setShowForm] = useState(false);

  const handleAdd = () => {
    if (!trigger.trim() || !expansion.trim()) return;
    addSnippet({
      id: Date.now(),
      trigger_phrase: trigger.trim(),
      expansion: expansion.trim(),
      created_at: new Date().toISOString(),
    });
    setTrigger('');
    setExpansion('');
    setShowForm(false);
  };

  return (
    <div className="pb-6">
      <div className="flex justify-between items-end mb-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-white pb-1">Snippets</h1>
          <p className="text-zinc-400 mt-2 text-[15px] max-w-sm">Magic keywords that expand into full sentences automatically.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-6 py-3 rounded-xl border border-indigo-500/30 text-sm font-bold text-indigo-300 hover:bg-indigo-500/10 transition-colors"
        >
          {showForm ? 'Cancel Creation' : 'New Snippet'}
        </button>
      </div>

      {/* Add Snippet Form */}
      {showForm && (
        <div className="mb-10 p-8 rounded-3xl bg-zinc-950 border border-white/10 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-indigo-400/80 uppercase tracking-widest mb-3">Trigger Phrase</label>
              <div className="relative group">
                <Command className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  value={trigger}
                  onChange={e => setTrigger(e.target.value)}
                  placeholder="e.g. my link"
                  className="w-full bg-black/40 border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-[15px] text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-indigo-400/80 uppercase tracking-widest mb-3">Expansion Content</label>
              <textarea
                value={expansion}
                onChange={e => setExpansion(e.target.value)}
                placeholder="e.g. https://github.com/my-profile"
                rows={2}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-[15px] text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 transition-colors resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={handleAdd}
              disabled={!trigger.trim() || !expansion.trim()}
              className="px-8 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold tracking-wide hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              Assemble Snippet
            </button>
          </div>
        </div>
      )}

      {/* Snippets List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {snippets.length === 0 && !showForm ? (
          <div className="col-span-1 md:col-span-2 flex flex-col items-center justify-center py-20 px-4 rounded-3xl border border-white/5 bg-white/[0.01]">
            <div className="w-16 h-16 rounded-full bg-white/[0.03] flex items-center justify-center mb-4">
              <ClipboardList className="w-6 h-6 text-zinc-600" />
            </div>
            <p className="text-zinc-500 font-medium tracking-wide">Blank Slate</p>
          </div>
        ) : (
          snippets.map(snippet => (
            <div key={snippet.id} className="p-6 rounded-3xl bg-zinc-950 border border-white/5 group hover:border-white/10 transition-colors relative">
              <div className="flex justify-between items-start mb-5">
                <span className="text-xs font-bold tracking-widest uppercase text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-lg">
                  {snippet.trigger_phrase}
                </span>
                <button 
                  onClick={() => removeSnippet(snippet.id)}
                  className="opacity-0 group-hover:opacity-100 text-[10px] uppercase font-bold text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Remove
                </button>
              </div>
              <p className="text-[15px] font-light text-zinc-300 leading-relaxed line-clamp-3">{snippet.expansion}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SettingsTab() {
  const { apiKey, setApiKey, whisperModel, setWhisperModel, llamaModel, setLlamaModel, hotkey, setHotkey } = useAppStore();
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);
  const [capturedKeys, setCapturedKeys] = useState<string[]>([]);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'current' | 'error'>('idle');
  const [updateInfo, setUpdateInfo] = useState<ReleaseCheckResult | null>(null);
  const [updateError, setUpdateError] = useState('');

  useEffect(() => {
    getInstalledVersion()
      .then((version) => {
        setUpdateInfo((current) => current ?? {
          currentVersion: version,
          latestVersion: null,
          hasUpdate: false,
          htmlUrl: RELEASES_PAGE_URL,
          publishedAt: null,
          notes: '',
        });
      })
      .catch(() => {
        // Ignore version lookup issues in settings; manual checks still work.
      });
  }, []);
  
  const handleTestKey = async () => {
    if (!apiKey) return;
    setTestStatus('testing');
    const isValid = await testApiKey(apiKey);
    setTestStatus(isValid ? 'success' : 'error');
    setTimeout(() => setTestStatus('idle'), 3000);
  };

  const MODIFIER_ORDER = ['Control', 'Alt', 'Shift', 'Super'] as const;

  const normalizeKeyName = (key: string) => {
    const lowered = key.toLowerCase();
    if (lowered === 'control') return 'Control';
    if (lowered === 'alt') return 'Alt';
    if (lowered === 'shift') return 'Shift';
    if (lowered === 'meta' || lowered === 'os' || lowered === 'super') return 'Super';
    if (lowered === ' ') return 'Space';
    if (key.length === 1) return key.toUpperCase();
    return key.length > 1 ? `${key[0].toUpperCase()}${key.slice(1)}` : key;
  };

  const isModifierKey = (key: string) => MODIFIER_ORDER.includes(key as (typeof MODIFIER_ORDER)[number]);

  const sortShortcutParts = (parts: string[]) => {
    const unique = [...new Set(parts)];
    const modifiers = MODIFIER_ORDER.filter((modifier) => unique.includes(modifier));
    const mainKeys = unique.filter((part) => !MODIFIER_ORDER.includes(part as (typeof MODIFIER_ORDER)[number]));
    return [...modifiers, ...mainKeys];
  };

  const formatHotkeyLabel = (value: string) =>
    value
      .split('+')
      .filter(Boolean)
      .map((part) => {
        if (part === 'Control') return 'Ctrl';
        if (part === 'Super') return 'Win';
        return part;
      })
      .join(' + ');

  const saveHotkey = (parts: string[]) => {
    const normalized = sortShortcutParts(parts);
    const modifierCount = normalized.filter(isModifierKey).length;

    if (normalized.length === 0 || modifierCount < 2) {
      return;
    }

    const newHotkey = normalized.join('+');
    setHotkey(newHotkey);
    invoke('update_hotkey', { newHotkey }).catch((err) => {
      console.warn('Could not register hotkey:', err);
    });
    setCapturedKeys([]);
    setIsRecordingHotkey(false);
  };

  const handleHotkeyRecord = (e: React.KeyboardEvent) => {
    if (!isRecordingHotkey) return;
    e.preventDefault();

    const pressedParts = sortShortcutParts([
      ...(e.ctrlKey ? ['Control'] : []),
      ...(e.altKey ? ['Alt'] : []),
      ...(e.shiftKey ? ['Shift'] : []),
      ...(e.metaKey ? ['Super'] : []),
    ]);
    const normalizedKey = normalizeKeyName(e.key);

    if (isModifierKey(normalizedKey)) {
      setCapturedKeys(pressedParts);
      return;
    }

    saveHotkey([...pressedParts, normalizedKey]);
  };

  const handleHotkeyRelease = (e: React.KeyboardEvent) => {
    if (!isRecordingHotkey) return;

    const normalizedKey = normalizeKeyName(e.key);
    if (!isModifierKey(normalizedKey)) return;

    const nextCaptured = capturedKeys.filter((key) => key !== normalizedKey);
    if (capturedKeys.length >= 2) {
      saveHotkey(capturedKeys);
      return;
    }

    setCapturedKeys(nextCaptured);
  };

  const resetHotkey = () => {
    setHotkey(DEFAULT_HOTKEY);
    setCapturedKeys([]);
    invoke('update_hotkey', { newHotkey: DEFAULT_HOTKEY }).catch(err => {
      console.warn('Could not reset hotkey:', err);
    });
  };

  const handleCheckForUpdates = async () => {
    setUpdateStatus('checking');
    setUpdateError('');

    try {
      const result = await checkForGitHubUpdate();
      setUpdateInfo(result);
      setUpdateStatus(result.hasUpdate ? 'available' : 'current');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to check for updates right now.';
      setUpdateError(message);
      setUpdateStatus('error');
    }
  };

  const openReleasePage = async (url = updateInfo?.htmlUrl || RELEASES_PAGE_URL) => {
    try {
      await openUrl(url);
    } catch (error) {
      console.warn('Could not open releases page:', error);
      setUpdateError('Could not open the releases page.');
      setUpdateStatus('error');
    }
  };

  const SettingSection = ({ title, description, children }: any) => (
    <div className="p-8 rounded-3xl bg-zinc-950 border border-white/5 hover:bg-white/[0.03] transition-colors">
      <h3 className="text-lg font-semibold text-zinc-100 tracking-wide">{title}</h3>
      <p className="text-[14px] text-zinc-500 mt-2 mb-6 font-light">{description}</p>
      {children}
    </div>
  );

  return (
    <div className="pb-20">
      <div className="mb-12">
        <h1 className="text-4xl font-bold tracking-tight text-white pb-1">Preferences</h1>
        <p className="text-zinc-400 mt-2 text-[15px] max-w-sm">Fine-tune the intelligence engine behind VoxDrop.</p>
      </div>
      
      <div className="space-y-6">
        <SettingSection 
          title="Dictation Hotkey" 
          description="Click the input box and press your desired key combination. Modifier-only shortcuts like Ctrl + Win are supported."
        >
          <div className="flex gap-3">
            <input 
              type="text" 
              readOnly
              value={
                isRecordingHotkey
                  ? (capturedKeys.length > 0 ? formatHotkeyLabel(capturedKeys.join('+')) : 'Press shortcut...')
                  : formatHotkeyLabel(hotkey)
              }
              onFocus={() => {
                setCapturedKeys([]);
                setIsRecordingHotkey(true);
              }}
              onBlur={() => {
                setCapturedKeys([]);
                setIsRecordingHotkey(false);
              }}
              onKeyDown={handleHotkeyRecord}
              onKeyUp={handleHotkeyRelease}
              className={`flex-1 bg-black/40 border rounded-2xl px-5 py-4 text-[15px] text-zinc-200 focus:outline-none transition-colors font-mono tracking-wider cursor-pointer text-center
                ${isRecordingHotkey ? "border-indigo-500" : "border-white/10 focus:border-indigo-500/50"}`}
            />
            <button
              onClick={resetHotkey}
              className="px-5 rounded-2xl border border-white/10 text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-colors"
            >
              Reset
            </button>
          </div>
          <p className="text-xs text-zinc-600 mt-3">Requires at least two keys. Default: Ctrl + Win.</p>
        </SettingSection>

        <SettingSection
          title="App Updates"
          description="Check GitHub for the latest VoxDrop release and jump straight to the installer page when a newer build is available."
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleCheckForUpdates}
                disabled={updateStatus === 'checking'}
                className="px-6 py-3 rounded-2xl bg-white/5 text-white hover:bg-white/10 border border-white/10 text-sm font-bold tracking-wide transition-colors disabled:opacity-60 flex items-center gap-2"
              >
                {updateStatus === 'checking' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {updateStatus === 'checking' ? 'Checking...' : 'Check for Updates'}
              </button>

              <button
                onClick={() => openReleasePage()}
                className="px-6 py-3 rounded-2xl border border-indigo-500/30 text-sm font-bold text-indigo-300 hover:bg-indigo-500/10 transition-colors"
              >
                Open Releases
              </button>
            </div>

            <div className="rounded-2xl border border-white/5 bg-black/30 px-5 py-4">
              <p className="text-sm text-zinc-300">
                Installed version: <span className="text-white font-semibold">{updateInfo?.currentVersion ?? 'Unknown'}</span>
              </p>

              {updateStatus === 'idle' && (
                <p className="text-sm text-zinc-500 mt-2">Manual checks compare your installed app version with the latest GitHub release.</p>
              )}

              {updateStatus === 'current' && updateInfo && (
                <p className="text-sm text-emerald-300 mt-2">
                  You are up to date. Latest release: {updateInfo.latestVersion ?? updateInfo.currentVersion}.
                </p>
              )}

              {updateStatus === 'available' && updateInfo && (
                <div className="mt-2 space-y-2">
                  <p className="text-sm text-amber-300">
                    New version available: {updateInfo.latestVersion}.
                  </p>
                  {updateInfo.publishedAt && (
                    <p className="text-xs text-zinc-500">
                      Published {new Date(updateInfo.publishedAt).toLocaleDateString()}.
                    </p>
                  )}
                  <button
                    onClick={() => openReleasePage(updateInfo.htmlUrl)}
                    className="px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold tracking-wide hover:bg-emerald-500/20 transition-colors"
                  >
                    Download Latest Release
                  </button>
                </div>
              )}

              {updateStatus === 'error' && (
                <p className="text-sm text-rose-300 mt-2">
                  {updateError || 'Unable to check for updates right now.'}
                </p>
              )}
            </div>
          </div>
        </SettingSection>

        <SettingSection 
          title="Neural API Key" 
          description="Your Groq API key is safely stored locally. Used for ultra-fast transcription and text cleanup."
        >
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <input 
                type="password" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="gsk_################"
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-[15px] text-white placeholder-zinc-700 focus:outline-none focus:border-indigo-500/50 transition-colors font-mono"
              />
            </div>
            <button 
              onClick={handleTestKey}
              disabled={!apiKey || testStatus === 'testing'}
              className={`px-8 rounded-2xl text-sm font-bold tracking-widest uppercase transition-colors flex items-center justify-center min-w-[140px]
                ${testStatus === 'success' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 
                  testStatus === 'error' ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 
                  'bg-white/5 text-white hover:bg-white/10 border border-white/10'}`}
            >
              {testStatus === 'testing' ? <Loader2 className="w-5 h-5 animate-spin text-zinc-400" /> : 
               testStatus === 'success' ? <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4"/> Valid</span> : 
               testStatus === 'error' ? <span className="flex items-center gap-2"><XCircle className="w-4 h-4"/> Invalid</span> : 
               'Authenticate'}
            </button>
          </div>
        </SettingSection>

        <SettingSection 
          title="Acoustic Model" 
          description="Select the Whisper model variant for audio transcription. Turbo provides lower latency."
        >
          <div className="relative">
            <select 
              value={whisperModel}
              onChange={(e) => setWhisperModel(e.target.value)}
              className="w-full appearance-none bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-[15px] text-zinc-200 focus:outline-none focus:border-indigo-500/50 transition-colors cursor-pointer font-medium"
            >
              <option value="whisper-large-v3-turbo">Whisper Large v3 Turbo (High Speed)</option>
              <option value="whisper-large-v3">Whisper Large v3 (Maximum Accuracy)</option>
            </select>
            <div className="absolute inset-y-0 right-5 flex items-center pointer-events-none text-zinc-500">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </div>
          </div>
        </SettingSection>

        <SettingSection 
          title="Inference Engine" 
          description="The language model used to fix grammar and format your sentences seamlessly."
        >
          <div className="relative">
            <select 
              value={llamaModel}
              onChange={(e) => setLlamaModel(e.target.value)}
              className="w-full appearance-none bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-[15px] text-zinc-200 focus:outline-none focus:border-indigo-500/50 transition-colors cursor-pointer font-medium"
            >
              <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant (~150ms latency)</option>
              <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile (Higher intelligence)</option>
              <option value="allam-2-7b">Allam 2 7B V1</option>
            </select>
            <div className="absolute inset-y-0 right-5 flex items-center pointer-events-none text-zinc-500">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </div>
          </div>
        </SettingSection>
      </div>
    </div>
  );
}
