import { useState, useEffect, useMemo, useRef } from 'react';
import { DEFAULT_HOTKEY, useAppStore } from '../store';
import { testApiKey } from '../lib/groq';
import { checkForGitHubUpdate, getInstalledVersion, RELEASES_PAGE_URL, type ReleaseCheckResult } from '../lib/updates';
import { listen, emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { LayoutDashboard, History, ClipboardList, Settings, CheckCircle, XCircle, Loader2, Sparkles, Command, Plus, Trash2, Edit2, Copy, Check } from 'lucide-react';

export function MainView() {
  const [tab, setTab] = useState<'dashboard' | 'history' | 'snippets' | 'settings'>('dashboard');

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

  const navItem = (id: 'dashboard' | 'history' | 'snippets' | 'settings', Icon: any, label: string) => {
    const active = tab === id;
    return (
      <button
        onClick={() => setTab(id)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 ${
          active
            ? 'bg-white/30 text-indigo-900 border border-white/60 backdrop-blur-xl shadow-[0_4px_20px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.5)]'
            : 'text-gray-500 hover:bg-white/20 hover:text-indigo-800 border border-transparent hover:border-white/30'
        }`}
      >
        <Icon className={`w-[18px] h-[18px] ${active ? 'text-indigo-600' : ''}`} strokeWidth={active ? 2.5 : 2} />
        <span className={`text-[14px] tracking-wide ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
      </button>
    );
  };

  return (
    <div className="w-screen h-screen bg-gradient-to-br from-slate-50 via-indigo-50/40 to-purple-50/40 text-gray-900 flex font-sans overflow-hidden relative">
      {/* Animated Background Mesh */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[55%] rounded-full bg-purple-300/50 blur-[120px] animate-blob mix-blend-multiply"></div>
        <div className="absolute top-[15%] right-[-12%] w-[40%] h-[45%] rounded-full bg-indigo-300/50 blur-[120px] animate-blob mix-blend-multiply" style={{ animationDelay: '2s' }}></div>
        <div className="absolute bottom-[-25%] left-[15%] w-[55%] h-[45%] rounded-full bg-blue-300/50 blur-[120px] animate-blob mix-blend-multiply" style={{ animationDelay: '4s' }}></div>
        <div className="absolute top-[40%] left-[30%] w-[30%] h-[30%] rounded-full bg-pink-300/40 blur-[100px] animate-blob mix-blend-multiply" style={{ animationDelay: '6s' }}></div>
      </div>

      {/* Glass edge light overlay */}
      <div className="absolute inset-0 pointer-events-none z-[1] bg-gradient-to-b from-white/30 via-transparent to-white/10"></div>

      {/* Sidebar */}
      <div className="w-[240px] h-full flex flex-col glass-panel p-5 flex-shrink-0 z-20 border-r border-white/40">

        {/* Brand */}
        <div className="flex items-center gap-3 px-2 mb-10 mt-2">
          <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shadow-sm border border-white/40 bg-white/30 backdrop-blur-md">
            <img src="/app-icon.png" alt="VoxDrop Logo" className="w-full h-full object-cover" />
          </div>
          <span className="text-lg font-bold tracking-tight text-gray-900">VoxDrop</span>
        </div>

        {/* Nav Items */}
        <div className="flex flex-col gap-1.5 w-full">
           {navItem('dashboard', LayoutDashboard, 'Dashboard')}
           {navItem('history', History, 'History')}
           {navItem('snippets', ClipboardList, 'Snippets')}
        </div>

        <div className="flex-1" />

        <div className="flex flex-col gap-1.5 w-full">
           {navItem('settings', Settings, 'Settings')}
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="flex-1 h-full relative z-10 overflow-hidden flex flex-col bg-transparent">
         <div className="content-scroll flex-1 overflow-y-auto custom-scrollbar p-10 lg:p-14 relative">
            <div className="max-w-[840px] mx-auto w-full relative z-10">
              {tab === 'dashboard' && <DashboardTab />}
              {tab === 'history' && <HistoryTab />}
              {tab === 'snippets' && <SnippetsTab />}
              {tab === 'settings' && <SettingsTab />}
            </div>
         </div>
      </div>
    </div>
  );
}

function DashboardTab() {
  const history = useAppStore(state => state.history);
  const hotkey = useAppStore(state => state.hotkey);

  const formatHotkeyLabel = (value: string) => {
    return value
      .split('+')
      .filter(Boolean)
      .map((part) => {
        if (part === 'Control') return 'ctrl';
        if (part === 'Super') return 'win';
        if (part === 'Alt') return 'alt';
        if (part === 'Shift') return 'shift';
        return part.toLowerCase();
      })
      .join(' + ');
  };

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning,';
    if (hour < 17) return 'Good afternoon,';
    return 'Good evening,';
  }, []);

  const totalWords = useMemo(() => {
    return history.reduce((acc, item) => {
      return acc + item.transcript.split(/\s+/).filter(w => w.length > 0).length;
    }, 0);
  }, [history]);

  const averageWpm = useMemo(() => {
    if (history.length === 0) return 0;
    let totalDuration = 0;
    let totalWordsInValidItems = 0;
    
    history.forEach(item => {
      const duration = Number(item.duration_seconds) || 0;
      if (duration > 0) {
        totalDuration += duration;
        totalWordsInValidItems += item.transcript.split(/\s+/).filter(w => w.length > 0).length;
      }
    });

    if (totalDuration === 0 || totalWordsInValidItems === 0) return 0;
    const minutes = totalDuration / 60;
    const wpm = Math.round(totalWordsInValidItems / minutes);
    return isNaN(wpm) ? 0 : wpm;
  }, [history]);

  const postcards = Math.floor(totalWords / 50);

  // Compute a real weekly streak based on history items
  const weeklyStreak = useMemo(() => {
    if (history.length === 0) return 0;
    
    const getWeekSinceEpoch = (dateString: string) => {
      const date = new Date(dateString);
      // Offset to align weeks properly (e.g., starting Monday or Sunday)
      return Math.floor(date.getTime() / (7 * 24 * 60 * 60 * 1000));
    };

    const activeWeeks = new Set(history.map(h => getWeekSinceEpoch(h.created_at)));
    const currentWeek = getWeekSinceEpoch(new Date().toISOString());

    let streak = 0;
    let checkWeek = currentWeek;

    // Streak is active if there's activity this week, OR if they haven't dictacted this week yet but did last week
    if (!activeWeeks.has(currentWeek) && activeWeeks.has(currentWeek - 1)) {
        checkWeek = currentWeek - 1;
    } else if (!activeWeeks.has(currentWeek)) {
        return 0;
    }

    while (activeWeeks.has(checkWeek)) {
        streak++;
        checkWeek--;
    }

    return streak;
  }, [history]);

  return (
    <div className="pb-6 animate-fade-in">
      <div className="mb-14">
        <h1 className="text-[44px] font-bold tracking-tight text-gradient mb-2">{greeting}</h1>
        <div className="flex items-center text-[17px] text-gray-600 gap-1.5 font-medium">
          Hold down 
          <kbd className="px-2.5 py-1 rounded-lg bg-white/20 border border-white/50 text-indigo-900 text-sm font-mono mx-1 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_2px_6px_rgba(0,0,0,0.04)]">
            {formatHotkeyLabel(hotkey)}
          </kbd> 
          and speak into any textbox
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Streak Card */}
        <div className="glass-card rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-400/20 to-purple-400/20 blur-2xl -mr-10 -mt-10 transition-transform duration-500 group-hover:scale-150"></div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-gray-700 font-bold tracking-wide text-[13px] uppercase">Weekly streak</span>
              </div>
              <div className="text-[32px] font-bold text-gray-900 mb-1 tracking-tight">
                {weeklyStreak === 0 ? '0 weeks' : `${weeklyStreak}${weeklyStreak === 1 ? 'st' : weeklyStreak === 2 ? 'nd' : weeklyStreak === 3 ? 'rd' : 'th'} week`}
              </div>
            </div>
            <div className="text-[15px] text-gray-500 font-medium mt-6">
              {weeklyStreak > 0 ? 'You are off to a great start!' : 'Start dictating to build a streak!'}
            </div>
          </div>
        </div>

        {/* Speed Card */}
        <div className="glass-card rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-teal-400/20 to-emerald-400/20 blur-2xl -mr-10 -mt-10 transition-transform duration-500 group-hover:scale-150"></div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-gray-700 font-bold tracking-wide text-[13px] uppercase">Average Speed</span>
              </div>
              <div className="text-[32px] font-bold text-gray-900 mb-1 tracking-tight">
                {averageWpm > 0 ? averageWpm : 0} <span className="text-[20px] text-gray-500 font-semibold">WPM</span>
              </div>
            </div>
            <div className="text-[15px] text-gray-500 font-medium mt-6">
              {averageWpm > 0 ? (averageWpm > 60 ? 'Faster than 90% of typers' : 'Steady and clear') : 'Start dictating to track speed'}
            </div>
          </div>
        </div>

        {/* Total Words Card */}
        <div className="glass-card rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-rose-400/20 to-orange-400/20 blur-2xl -mr-10 -mt-10 transition-transform duration-500 group-hover:scale-150"></div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-gray-700 font-bold tracking-wide text-[13px] uppercase">Total words</span>
              </div>
              <div className="text-[32px] font-bold text-gray-900 mb-1 tracking-tight flex items-center gap-2">
                {totalWords} <span className="text-[24px]">🔥</span>
              </div>
            </div>
            <div className="text-[15px] text-gray-500 font-medium mt-6">
              {postcards > 0 ? `You've written ${postcards} postcard${postcards !== 1 ? 's' : ''}!` : "Keep going to fill a postcard!"}
            </div>
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
    <div className="pb-6 animate-fade-in">
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-[34px] font-bold tracking-tight text-gradient pb-1">Activity Log</h1>
          <p className="text-gray-500 mt-2 text-[15px] max-w-sm font-medium">Every word captured and refined, safely stored locally on your machine.</p>
        </div>
        <button
          onClick={() => setHistory([])}
          className="px-5 py-2.5 rounded-xl glass-btn hover:border-rose-200/60 hover:bg-rose-50/40 hover:text-rose-600 text-[14px] font-medium text-gray-600 transition-all duration-200"
        >
          Clear All
        </button>
      </div>
      
      <div className="space-y-4">
        {sortedHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-4 rounded-3xl glass-surface">
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mb-5 border border-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] backdrop-blur-md">
              <Sparkles className="w-7 h-7 text-indigo-400" />
            </div>
            <p className="text-gray-900 font-bold text-lg tracking-tight">Ready for your voice</p>
            <p className="text-gray-500 text-[15px] mt-1 font-medium">Use your hotkey to start recording.</p>
          </div>
        ) : (
          sortedHistory.map(item => (
            <div key={item.id} className="p-6 rounded-2xl glass-card group relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-indigo-400 to-purple-400 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div>
                  <span className="text-[12px] font-bold text-gray-500 tracking-wider uppercase">
                    {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} • {new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(item.transcript)}
                  className="text-[12px] font-bold glass-btn hover:text-indigo-600 text-gray-500 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  Copy
                </button>
              </div>
              <p className="text-[16px] text-gray-800 leading-relaxed font-medium pl-1">{item.transcript}</p>
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
  const updateSnippet = useAppStore(state => state.updateSnippet);
  const removeSnippet = useAppStore(state => state.removeSnippet);
  const [trigger, setTrigger] = useState('');
  const [expansion, setExpansion] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const handleSave = () => {
    if (!trigger.trim() || !expansion.trim()) return;
    
    if (editingId) {
      updateSnippet(editingId, {
        trigger_phrase: trigger.trim(),
        expansion: expansion.trim(),
      });
    } else {
      addSnippet({
        id: Date.now(),
        trigger_phrase: trigger.trim(),
        expansion: expansion.trim(),
        created_at: new Date().toISOString(),
      });
    }
    
    setTrigger('');
    setExpansion('');
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (snippet: any) => {
    setTrigger(snippet.trigger_phrase);
    setExpansion(snippet.expansion);
    setEditingId(snippet.id);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(!showForm);
    if (!showForm) {
      setEditingId(null);
      setTrigger('');
      setExpansion('');
    } else {
      setEditingId(null);
      setTrigger('');
      setExpansion('');
    }
  };

  const handleCopy = (snippet: any) => {
    navigator.clipboard.writeText(snippet.expansion);
    setCopiedId(snippet.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="pb-6 animate-fade-in">
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-[34px] font-bold tracking-tight text-gradient pb-1">Snippets</h1>
          <p className="text-gray-500 mt-2 text-[15px] max-w-sm font-medium">Magic keywords that expand into full sentences automatically.</p>
        </div>
        <button
          onClick={handleCancel}
          className={`px-5 py-2.5 rounded-xl border shadow-sm text-[14px] font-semibold transition-all duration-200 flex items-center gap-2 ${
            showForm
              ? 'glass-btn text-gray-700 hover:bg-white/40'
              : 'glass-btn-primary'
          }`}
        >
          {showForm ? 'Cancel' : <><Plus className="w-4 h-4"/> New Snippet</>}
        </button>
      </div>

      {/* Add Snippet Form */}
      {showForm && (
        <div className="mb-8 p-6 rounded-2xl glass-card space-y-5 animate-in slide-in-from-top-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-[13px] font-semibold text-gray-700 mb-2">Trigger Phrase</label>
              <div className="relative">
                <Command className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={trigger}
                  onChange={e => setTrigger(e.target.value)}
                  placeholder="e.g. my link"
                  className="w-full glass-input pl-10 pr-4"
                />
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-bold text-gray-700 mb-2 uppercase tracking-wide">Expansion Content</label>
              <textarea
                value={expansion}
                onChange={e => setExpansion(e.target.value)}
                placeholder="e.g. https://github.com/my-profile"
                rows={2}
                className="w-full glass-input resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={!trigger.trim() || !expansion.trim()}
              className="px-6 py-2.5 rounded-xl glass-btn-primary text-[14px] font-semibold disabled:opacity-50 disabled:shadow-none transition-all flex items-center gap-2"
            >
              {editingId ? 'Update Snippet' : 'Assemble Snippet'}
            </button>
          </div>
        </div>
      )}

      {/* Snippets List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {snippets.length === 0 && !showForm ? (
          <div className="col-span-1 md:col-span-2 flex flex-col items-center justify-center py-24 px-4 rounded-3xl glass-surface">
            <div className="w-16 h-16 rounded-2xl bg-white/20 border border-white/50 flex items-center justify-center mb-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] backdrop-blur-md">
              <ClipboardList className="w-7 h-7 text-indigo-400" />
            </div>
            <p className="text-gray-500 font-bold text-[15px]">No snippets configured yet</p>
          </div>
        ) : (
          snippets.map(snippet => (
            <div key={snippet.id} className="p-5 rounded-2xl glass-card group relative">
              <div className="flex justify-between items-start mb-3">
                <span className="text-[13px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-md tracking-wide">
                  {snippet.trigger_phrase}
                </span>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleCopy(snippet)}
                    className="text-[12px] font-bold text-gray-600 hover:text-indigo-700 glass-btn px-2 py-1 rounded-md transition-all flex items-center gap-1"
                  >
                    {copiedId === snippet.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedId === snippet.id ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={() => handleEdit(snippet)}
                    className="text-[12px] font-bold text-gray-600 hover:text-amber-700 glass-btn px-2 py-1 rounded-md transition-all flex items-center gap-1"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => removeSnippet(snippet.id)}
                    className="text-[12px] font-bold text-gray-600 hover:text-rose-600 glass-btn px-2 py-1 rounded-md transition-all flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
              <p className="text-[15px] font-medium text-gray-600 leading-relaxed line-clamp-3">{snippet.expansion}</p>
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
  const capturedKeysRef = useRef<string[]>([]);
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
        // Ignore version lookup issues
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
    
    // We require at least 2 keys for any shortcut to prevent accidental triggers
    if (normalized.length < 2) {
      return;
    }

    const newHotkey = normalized.join('+');
    setHotkey(newHotkey);
    invoke('update_hotkey', { newHotkey }).catch((err) => {
      console.warn('Could not register hotkey:', err);
    });
    setCapturedKeys([]);
    capturedKeysRef.current = [];
    setIsRecordingHotkey(false);
  };

  const handleHotkeyRecord = (e: React.KeyboardEvent) => {
    if (!isRecordingHotkey) return;
    e.preventDefault();

    const modifierParts = [
      ...(e.ctrlKey ? ['Control'] : []),
      ...(e.altKey ? ['Alt'] : []),
      ...(e.shiftKey ? ['Shift'] : []),
      ...(e.metaKey ? ['Super'] : []),
    ];
    
    const keyName = normalizeKeyName(e.key);
    
    // Create a new set of keys including existing ones and the new one
    // We filter out duplicates and handle the current physical state
    const currentCaptured = sortShortcutParts([...capturedKeysRef.current, ...modifierParts, keyName]);
    capturedKeysRef.current = currentCaptured;
    setCapturedKeys(currentCaptured);

    // If we have 2+ keys and the just-pressed key is NOT a modifier, save immediately
    if (currentCaptured.length >= 2 && !isModifierKey(keyName)) {
        saveHotkey(currentCaptured);
    }
  };

  const handleHotkeyRelease = (e: React.KeyboardEvent) => {
    if (!isRecordingHotkey) return;

    // Handle modifier-only shortcuts or any multi-key combo on release
    if (capturedKeysRef.current.length >= 2) {
        saveHotkey(capturedKeysRef.current);
        return;
    }

    // Clear ref and display if everything is released
    if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
       capturedKeysRef.current = [];
       setCapturedKeys([]);
    }
  };

  const resetHotkey = () => {
    setHotkey(DEFAULT_HOTKEY);
    setCapturedKeys([]);
    capturedKeysRef.current = [];
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
    <div className="glass-card p-6 rounded-2xl relative overflow-hidden">
      <div className="absolute -inset-x-4 -inset-y-4 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none opacity-50 mix-blend-overlay"></div>
      <h3 className="text-[18px] font-bold text-gray-900 tracking-tight relative z-10">{title}</h3>
      <p className="text-[14px] text-gray-600 mt-1 mb-5 font-medium relative z-10">{description}</p>
      <div className="relative z-10">{children}</div>
    </div>
  );

  return (
    <div className="pb-16 animate-fade-in">
      <div className="mb-10">
        <h1 className="text-[34px] font-bold tracking-tight text-gradient pb-1">Preferences</h1>
        <p className="text-gray-500 mt-2 text-[15px] max-w-sm font-medium">Fine-tune the intelligence engine behind VoxDrop.</p>
      </div>
      
      <div className="space-y-5 max-w-[700px]">
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
                capturedKeysRef.current = [];
                setIsRecordingHotkey(true);
              }}
              onBlur={() => {
                // Delay a bit to allow onClick or other events to process if needed
                setTimeout(() => {
                  setCapturedKeys([]);
                  capturedKeysRef.current = [];
                  setIsRecordingHotkey(false);
                }, 200);
              }}
              onKeyDown={handleHotkeyRecord}
              onKeyUp={handleHotkeyRelease}
              className={`flex-1 glass-input text-center font-mono tracking-wide cursor-pointer font-semibold
                ${isRecordingHotkey ? "border-indigo-500 ring-2 ring-indigo-500/20 bg-white/30" : ""}`}
            />
            <button
              onClick={resetHotkey}
              className="px-5 rounded-xl glass-btn text-[14px] font-semibold text-gray-600 hover:text-gray-900 transition-all"
            >
              Reset
            </button>
          </div>
          <p className="text-[13px] text-gray-500 mt-3 font-medium">Requires at least two keys. Default: Ctrl + Win.</p>
        </SettingSection>

        <SettingSection 
          title="Neural API Key" 
          description="Your Groq API key is safely stored locally. Used for ultra-fast transcription and text cleanup."
        >
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="gsk_################"
                className="w-full glass-input font-mono"
              />
            </div>
            <button
              onClick={handleTestKey}
              disabled={!apiKey || testStatus === 'testing'}
              className={`px-6 rounded-xl text-[14px] font-semibold transition-all shadow-sm flex items-center justify-center min-w-[130px]
                ${testStatus === 'success' ? 'bg-emerald-500/15 text-emerald-700 border border-emerald-400/40 backdrop-blur-md' :
                  testStatus === 'error' ? 'bg-rose-500/15 text-rose-700 border border-rose-400/40 backdrop-blur-md' :
                  'glass-btn-primary disabled:opacity-50 disabled:shadow-none'}`}
            >
              {testStatus === 'testing' ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> :
               testStatus === 'success' ? <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4"/> Valid</span> :
               testStatus === 'error' ? <span className="flex items-center gap-1.5"><XCircle className="w-4 h-4"/> Invalid</span> :
               'Authenticate'}
            </button>
          </div>
        </SettingSection>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <SettingSection 
            title="Acoustic Model" 
            description="Whisper model for audio transcription."
          >
            <div className="relative">
              <select
                value={whisperModel}
                onChange={(e) => setWhisperModel(e.target.value)}
                className="w-full appearance-none glass-input cursor-pointer font-semibold text-[14px] py-3"
              >
                <option value="whisper-large-v3-turbo">Whisper Turbo (Fast)</option>
                <option value="whisper-large-v3">Whisper V3 (Accurate)</option>
              </select>
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-500">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </div>
            </div>
          </SettingSection>

          <SettingSection 
            title="Inference Engine" 
            description="LLM for formatting and cleanup."
          >
            <div className="relative">
              <select
                value={llamaModel}
                onChange={(e) => setLlamaModel(e.target.value)}
                className="w-full appearance-none glass-input cursor-pointer font-semibold text-[14px] py-3"
              >
                <option value="llama-3.1-8b-instant">Llama 3.1 8B</option>
                <option value="llama-3.3-70b-versatile">Llama 3.3 70B</option>
                <option value="allam-2-7b">Allam 2 7B V1</option>
              </select>
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-500">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </div>
            </div>
          </SettingSection>
        </div>

        <SettingSection
          title="App Updates"
          description="Check for the latest VoxDrop release and jump to the installer page."
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleCheckForUpdates}
                disabled={updateStatus === 'checking'}
                className="px-5 py-2.5 rounded-xl glass-btn text-gray-700 hover:text-gray-900 text-[14px] font-semibold transition-all disabled:opacity-60 flex items-center gap-2"
              >
                {updateStatus === 'checking' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {updateStatus === 'checking' ? 'Checking...' : 'Check for Updates'}
              </button>

              <button
                onClick={() => openReleasePage()}
                className="px-5 py-2.5 rounded-xl glass-btn text-[14px] font-semibold text-gray-600 hover:text-gray-900 transition-all"
              >
                Open Releases
              </button>
            </div>

            <div className="rounded-xl glass-surface px-4 py-3">
              <p className="text-[14px] text-gray-600 font-medium">
                Installed version: <span className="text-gray-900 font-bold">{updateInfo?.currentVersion ?? 'Unknown'}</span>
              </p>

              {updateStatus === 'current' && updateInfo && (
                <p className="text-[13px] text-emerald-600 font-semibold mt-1">
                  You are up to date. Latest release: {updateInfo.latestVersion ?? updateInfo.currentVersion}.
                </p>
              )}

              {updateStatus === 'available' && updateInfo && (
                <div className="mt-2 space-y-2">
                  <p className="text-[14px] font-semibold text-amber-600">
                    New version available: {updateInfo.latestVersion}.
                  </p>
                  <button
                    onClick={() => openReleasePage(updateInfo.htmlUrl)}
                    className="px-4 py-2 rounded-lg bg-amber-500/15 border border-amber-400/40 text-amber-800 text-[13px] font-bold tracking-wide hover:bg-amber-500/25 transition-colors backdrop-blur-md"
                  >
                    Download Latest Release
                  </button>
                </div>
              )}

              {updateStatus === 'error' && (
                <p className="text-[13px] font-medium text-rose-500 mt-1">
                  {updateError || 'Unable to check for updates right now.'}
                </p>
              )}
            </div>
          </div>
        </SettingSection>
      </div>
    </div>
  );
}
