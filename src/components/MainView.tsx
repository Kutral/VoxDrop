import { useState, useEffect, useMemo, useRef } from 'react';
import { DEFAULT_HOTKEY, useAppStore, getWeekIndex, LLMProvider } from '../store';
import { testKeyWithProvider, GROQ_MODEL_PRESETS, CEREBRAS_MODEL_PRESETS, WHISPER_MODEL_PRESETS } from '../lib/inference';
import { DEFAULT_GROQ_CHAT_MODEL } from '../lib/groq';
import { DEFAULT_CEREBRAS_MODEL } from '../lib/cerebras';
import { checkForGitHubUpdate, getInstalledVersion, RELEASES_PAGE_URL, type ReleaseCheckResult } from '../lib/updates';
import { listen, emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { 
  LayoutDashboard, 
  History, 
  ClipboardList, 
  Settings, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Sparkles, 
  Command, 
  Plus, 
  Trash2, 
  Edit3, 
  Copy, 
  Check,
  Cpu,
  Zap,
  Key,
  ExternalLink,
  Search,
  Clock,
  Flame,
  Gauge,
  Hourglass,
  Eye,
  EyeOff,
  Mic,
  ChevronDown,
  RotateCcw,
  ArrowRight,
  X,
  ShieldCheck,
  RefreshCw,
  Sliders,
  HardDrive,
  Keyboard,
  Calendar,
  TrendingUp,
  Activity
} from 'lucide-react';

const getOrdinalSuffix = (num: number) => {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
};

export function MainView() {
  const [tab, setTab] = useState<'dashboard' | 'history' | 'snippets' | 'settings'>('dashboard');
  const [installedVer, setInstalledVer] = useState<string>('0.0.12');

  const history = useAppStore(state => state.history);
  const { apiKey, cerebrasApiKey, whisperModel, llamaModel, llamaProvider, snippets, hotkey, recomputeStats } = useAppStore();

  // Ensure stats are recomputed on mount
  useEffect(() => {
    recomputeStats();
    getInstalledVersion().then(setInstalledVer).catch(() => {});
  }, [recomputeStats]);

  // Track settings changes and broadcast to pill window so it can rehydrate
  useEffect(() => {
    emit('settings-changed').catch(console.error);
  }, [apiKey, cerebrasApiKey, whisperModel, llamaModel, llamaProvider, snippets, hotkey]);

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
        if (!current.find(h => h.id === (payload as any).id)) {
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

  const navItem = (id: 'dashboard' | 'history' | 'snippets' | 'settings', Icon: any, label: string, badgeCount?: number) => {
    const active = tab === id;
    return (
      <button
        onClick={() => setTab(id)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all duration-150 relative ${
          active
            ? 'bg-indigo-600 text-white font-semibold shadow-[0_2px_10px_rgba(79,70,229,0.3),inset_0_1px_0_rgba(255,255,255,0.25)]'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-medium'
        }`}
      >
        <div className="flex items-center gap-3">
          <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-500'}`} strokeWidth={active ? 2.4 : 2} />
          <span className="text-[13.5px] tracking-tight">{label}</span>
        </div>
        {badgeCount !== undefined && badgeCount > 0 && (
          <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full ${
            active ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-600'
          }`}>
            {badgeCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="w-screen h-screen studio-app text-slate-900 flex font-sans overflow-hidden relative">
      {/* Studio Ambient Subtle Lighting */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[60%] rounded-full bg-indigo-200/30 blur-[130px]" />
        <div className="absolute top-[40%] -right-[15%] w-[45%] h-[50%] rounded-full bg-blue-100/40 blur-[140px]" />
      </div>

      {/* Sidebar */}
      <aside className="w-[230px] h-full flex flex-col studio-sidebar p-4 flex-shrink-0 z-20">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-2 py-3 mb-6">
          <div className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center shadow-sm border border-slate-200/80 bg-white p-1">
            <img src="/app-icon.png" alt="VoxDrop Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[15px] font-extrabold tracking-tight text-slate-900 leading-none">VoxDrop</span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-100/80">
                v{installedVer}
              </span>
            </div>
            <span className="text-[10.5px] font-medium text-slate-600 tracking-wider uppercase block mt-0.5">
              Acoustic Dictation
            </span>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex flex-col gap-1 w-full">
          {navItem('dashboard', LayoutDashboard, 'Dashboard')}
          {navItem('history', History, 'History', history.length)}
          {navItem('snippets', ClipboardList, 'Snippets', snippets.length)}
        </nav>

        <div className="flex-1" />

        {/* Engine Status Tag */}
        <div className="p-3 mb-3 rounded-xl bg-slate-100/80 border border-slate-200/60 text-[11px] text-slate-600">
          <div className="flex items-center gap-1.5 font-semibold text-slate-700 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Active Engine</span>
          </div>
          <p className="font-mono text-[10px] text-slate-500 truncate">
            {llamaProvider === 'cerebras' ? 'Cerebras Wafer' : 'Groq LPU'} • Whisper
          </p>
        </div>

        {/* Settings button */}
        <div className="flex flex-col gap-1 w-full pt-2 border-t border-slate-200/60">
          {navItem('settings', Settings, 'Preferences')}
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 h-full relative z-10 overflow-hidden flex flex-col">
        <div className="content-scroll flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 lg:p-10 relative">
          <div className="max-w-5xl mx-auto w-full relative z-10">
            {tab === 'dashboard' && <DashboardTab onNavigate={(target) => setTab(target)} />}
            {tab === 'history' && <HistoryTab />}
            {tab === 'snippets' && <SnippetsTab />}
            {tab === 'settings' && <SettingsTab />}
          </div>
        </div>
      </main>
    </div>
  );
}

function DashboardTab({ onNavigate }: { onNavigate: (target: 'history' | 'snippets' | 'settings') => void }) {
  const hotkey = useAppStore(state => state.hotkey);
  const history = useAppStore(state => state.history);
  const activeWeeks = useAppStore(state => state.activeWeeks || []);
  const apiKey = useAppStore(state => state.apiKey);
  const llamaProvider = useAppStore(state => state.llamaProvider);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const formatHotkeyLabel = (value: string) => {
    return value
      .split('+')
      .filter(Boolean)
      .map((part) => {
        if (part === 'Control') return 'Ctrl';
        if (part === 'Super') return 'Win';
        if (part === 'Alt') return 'Alt';
        if (part === 'Shift') return 'Shift';
        return part;
      });
  };

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  // Compute telemetry and statistics with high accuracy & outlier filtering
  const stats = useMemo(() => {
    if (!history || history.length === 0) {
      return {
        totalWords: 0,
        averageWpm: 0,
        peakWpm: 0,
        wordsToday: 0,
        todayCount: 0,
        timeSavedMinutes: 0,
        timeSavedFormatted: '0m',
        totalSpokenSeconds: 0,
        totalSpokenFormatted: '0s',
        speedMultiplier: '3.8x',
        speedTier: 'Ready to speak',
        averageWordsPerSession: 0,
        pagesCount: 0,
      };
    }

    let allWords = 0;
    let validWpmWords = 0;
    let validWpmMinutes = 0;
    let todayWords = 0;
    let todayCount = 0;
    let totalDuration = 0;
    let peakWpm = 0;

    const todayDateString = new Date().toDateString();

    for (const item of history) {
      if (!item.transcript) continue;
      const words = item.transcript.trim().split(/\s+/).filter(w => w.length > 0).length;
      allWords += words;

      const durationSec = Number(item.duration_seconds) || 0;
      totalDuration += durationSec;

      // Track words today
      if (item.created_at && new Date(item.created_at).toDateString() === todayDateString) {
        todayWords += words;
        todayCount++;
      }

      // Filter outlier durations (< 0.6s or noise clicks) for high accuracy speaking WPM
      if (words >= 2 && durationSec >= 0.6 && durationSec <= 300) {
        const itemWpm = words / (durationSec / 60);
        if (itemWpm >= 30 && itemWpm <= 450) {
          validWpmWords += words;
          validWpmMinutes += (durationSec / 60);
          if (words >= 5 && itemWpm > peakWpm) {
            peakWpm = Math.round(itemWpm);
          }
        }
      }
    }

    // Weighted average WPM
    const wpm = validWpmMinutes > 0 ? Math.round(validWpmWords / validWpmMinutes) : 0;

    // Standard human typing benchmark is ~40 WPM
    const effectiveWpm = wpm > 40 ? wpm : 140;
    const timeSavedMin = Math.round(allWords * (1 / 40 - 1 / effectiveWpm));

    const timeSavedFormatted = timeSavedMin >= 60 
      ? `${(timeSavedMin / 60).toFixed(1)} hrs`
      : `${timeSavedMin} mins`;

    const totalSpokenFormatted = totalDuration >= 60
      ? `${Math.floor(totalDuration / 60)}m ${Math.round(totalDuration % 60)}s`
      : `${Math.round(totalDuration)}s`;

    const speedMultiplier = wpm > 0 
      ? `${(wpm / 40).toFixed(1)}x` 
      : '3.8x';

    let speedTier = 'Conversational';
    if (wpm >= 170) speedTier = '⚡ Turbo Velocity';
    else if (wpm >= 130) speedTier = '🔥 High Speed';
    else if (wpm >= 90) speedTier = '✨ Conversational';
    else if (wpm > 0) speedTier = '🎯 Steady';

    const avgPerSession = history.length > 0 ? Math.round(allWords / history.length) : 0;
    const pages = Math.max(1, Math.round(allWords / 250));

    return {
      totalWords: allWords,
      averageWpm: wpm,
      peakWpm,
      wordsToday: todayWords,
      todayCount,
      timeSavedMinutes: Math.max(0, timeSavedMin),
      timeSavedFormatted,
      totalSpokenSeconds: totalDuration,
      totalSpokenFormatted,
      speedMultiplier,
      speedTier,
      averageWordsPerSession: avgPerSession,
      pagesCount: pages,
    };
  }, [history]);

  // Compute accurate weekly streak based on active weeks
  const weeklyStreak = useMemo(() => {
    if (activeWeeks.length === 0) return 0;
    
    const currentWeek = getWeekIndex(new Date().toISOString());
    const weekSet = new Set(activeWeeks);

    let streak = 0;
    let checkWeek = currentWeek;

    if (!weekSet.has(currentWeek) && weekSet.has(currentWeek - 1)) {
      checkWeek = currentWeek - 1;
    } else if (!weekSet.has(currentWeek)) {
      return 0;
    }

    while (weekSet.has(checkWeek)) {
      streak++;
      checkWeek--;
    }

    return streak;
  }, [activeWeeks]);

  // 7-Day Activity Rhythm Map for the current calendar week
  const weekDays = useMemo(() => {
    const now = new Date();
    const currentDay = now.getDay(); // 0 is Sunday
    // Calculate Monday of current week
    const distanceToMonday = (currentDay + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distanceToMonday);
    monday.setHours(0, 0, 0, 0);

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days.map((dayLabel, index) => {
      const dayDate = new Date(monday.getTime() + index * 24 * 60 * 60 * 1000);
      const dateStr = dayDate.toDateString();
      const isToday = dateStr === now.toDateString();
      const isPastOrToday = dayDate <= now;
      
      let wordsOnDay = 0;
      let countOnDay = 0;
      for (const item of history) {
        if (item.created_at && new Date(item.created_at).toDateString() === dateStr) {
          const w = item.transcript.trim().split(/\s+/).filter(Boolean).length;
          wordsOnDay += w;
          countOnDay++;
        }
      }

      return {
        dayLabel,
        dateNumber: dayDate.getDate(),
        isToday,
        isPastOrToday,
        hasActivity: countOnDay > 0,
        wordsOnDay,
        countOnDay,
      };
    });
  }, [history]);

  const recentItems = useMemo(() => {
    return [...history].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 4);
  }, [history]);

  const handleCopy = (item: any) => {
    navigator.clipboard.writeText(item.transcript);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const keyParts = formatHotkeyLabel(hotkey);

  return (
    <div className="pb-12 space-y-7 animate-fade-in">
      {/* Hero Header & Live Telemetry Strip */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-3 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] font-mono font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100 flex items-center gap-1.5 shadow-2xs">
              <Activity className="w-3.5 h-3.5 text-indigo-600" />
              Acoustic Intelligence Hub
            </span>
            {apiKey && (
              <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/80 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Engine Active
              </span>
            )}
          </div>
          <h1 className="text-[32px] sm:text-[34px] font-extrabold tracking-tight text-slate-900 mt-2 text-studio-gradient">
            {greeting}, ready to dictate
          </h1>
          <p className="text-slate-600 text-[14.5px] mt-1 font-medium max-w-xl">
            High-velocity speech capture, auto-formatted and instantly pasted into your active app.
          </p>
        </div>

        {/* Hotkey Badge Pill */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white/90 border border-slate-200/80 shadow-xs self-start lg:self-auto backdrop-blur-md">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Mic className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Global Trigger</span>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[12px] font-semibold text-slate-600 mr-0.5">Hold</span>
              {keyParts.map((k, i) => (
                <span key={i} className="keycap text-[12px]">{k}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4 High-Accuracy Stat Telemetry Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Speaking Velocity */}
        <div className="studio-card p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden group hover:border-indigo-300">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Gauge className="w-4 h-4 text-indigo-600" /> Speaking Speed
            </span>
            {stats.averageWpm > 0 && (
              <span className="telemetry-badge text-[10.5px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                {stats.speedTier}
              </span>
            )}
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[34px] font-extrabold font-mono text-slate-900 tracking-tight leading-none">
                {stats.averageWpm > 0 ? stats.averageWpm : '—'}
              </span>
              <span className="text-[14px] font-bold text-slate-500">WPM</span>
            </div>

            {/* Velocity Bar Indicator */}
            <div className="w-full h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(10, (stats.averageWpm / 200) * 100))}%` }}
              />
            </div>

            <p className="text-[12px] text-slate-600 font-medium mt-2">
              {stats.averageWpm > 0 
                ? <><strong className="text-slate-800 font-bold">{stats.speedMultiplier}</strong> faster than typing (~40 WPM)</>
                : 'Start dictating to calculate speed'}
            </p>
          </div>
        </div>

        {/* Card 2: Time Saved */}
        <div className="studio-card p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden group hover:border-blue-300">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Hourglass className="w-4 h-4 text-blue-600" /> Time Saved
            </span>
            <span className="telemetry-badge text-[10.5px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              ~75% Savings
            </span>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[34px] font-extrabold font-mono text-slate-900 tracking-tight leading-none">
                {stats.timeSavedFormatted}
              </span>
              <span className="text-[14px] font-bold text-slate-500">saved</span>
            </div>

            {/* Efficiency Progress Line */}
            <div className="w-full h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                style={{ width: '75%' }}
              />
            </div>

            <p className="text-[12px] text-slate-600 font-medium mt-2">
              Saved vs standard keyboard typing
            </p>
          </div>
        </div>

        {/* Card 3: Total Words Captured */}
        <div className="studio-card p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden group hover:border-amber-300">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-500" /> Words Captured
            </span>
            {stats.wordsToday > 0 && (
              <span className="telemetry-badge text-[10.5px] px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                +{stats.wordsToday} today
              </span>
            )}
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[34px] font-extrabold font-mono text-slate-900 tracking-tight leading-none">
                {stats.totalWords.toLocaleString()}
              </span>
              <span className="text-[14px] font-bold text-slate-500">words</span>
            </div>

            {/* Volume Line */}
            <div className="w-full h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(15, (stats.totalWords / 2000) * 100))}%` }}
              />
            </div>

            <p className="text-[12px] text-slate-600 font-medium mt-2">
              {stats.totalWords > 0 
                ? `Equivalent to ~${stats.pagesCount} standard written pages` 
                : 'Your voice stream is ready'}
            </p>
          </div>
        </div>

        {/* Card 4: Active Streak */}
        <div className="studio-card p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden group hover:border-purple-300">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-purple-600" /> Weekly Streak
            </span>
            <span className="telemetry-badge text-[10.5px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
              {history.length} captures
            </span>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[34px] font-extrabold font-mono text-slate-900 tracking-tight leading-none">
                {weeklyStreak}
              </span>
              <span className="text-[14px] font-bold text-slate-500">
                {weeklyStreak === 1 ? 'week' : 'weeks'}
              </span>
            </div>

            {/* Streak Progress Line */}
            <div className="w-full h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(20, weeklyStreak * 25))}%` }}
              />
            </div>

            <p className="text-[12px] text-slate-600 font-medium mt-2">
              {weeklyStreak > 0 
                ? `${weeklyStreak}${getOrdinalSuffix(weeklyStreak)} active week in a row!` 
                : 'Dictate this week to build streak'}
            </p>
          </div>
        </div>
      </div>

      {/* 7-Day Activity Rhythm Bar */}
      <div className="studio-card p-5 rounded-2xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <h3 className="text-[15.5px] font-bold text-slate-900 tracking-tight">Weekly Dictation Rhythm</h3>
          </div>
          <span className="text-[12px] font-medium text-slate-500">
            {stats.todayCount > 0 
              ? `${stats.todayCount} capture${stats.todayCount > 1 ? 's' : ''} recorded today (${stats.wordsToday} words)` 
              : 'No captures yet today'}
          </span>
        </div>

        {/* 7-Day Grid */}
        <div className="grid grid-cols-7 gap-2 pt-1">
          {weekDays.map((day, idx) => {
            return (
              <div
                key={idx}
                className={`p-3 rounded-xl flex flex-col items-center justify-center transition-all ${
                  day.isToday
                    ? 'bg-indigo-50/80 border-2 border-indigo-600 shadow-xs'
                    : day.hasActivity
                    ? 'bg-slate-50 border border-slate-200/90'
                    : 'bg-slate-50/40 border border-slate-200/50 opacity-60'
                }`}
              >
                <span className={`text-[11.5px] font-bold uppercase tracking-wider ${
                  day.isToday ? 'text-indigo-700' : 'text-slate-500'
                }`}>
                  {day.dayLabel}
                </span>

                <span className={`text-[16px] font-extrabold font-mono mt-0.5 ${
                  day.isToday ? 'text-indigo-900' : day.hasActivity ? 'text-slate-800' : 'text-slate-400'
                }`}>
                  {day.dateNumber}
                </span>

                <div className="mt-1 flex items-center gap-1">
                  {day.hasActivity ? (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs" title={`${day.wordsOnDay} words captured`} />
                  ) : day.isPastOrToday ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                  )}
                </div>

                {day.hasActivity && (
                  <span className="text-[10px] font-mono font-semibold text-emerald-700 mt-1">
                    {day.wordsOnDay}w
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Transcripts Feed & Quick Actions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent Stream */}
        <div className="lg:col-span-2 studio-card p-6 rounded-2xl space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/70">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                <h2 className="text-[16px] font-bold text-slate-900 tracking-tight">Recent Activity Stream</h2>
              </div>
              <button
                onClick={() => onNavigate('history')}
                className="text-[13px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline"
              >
                View Full Audit Log ({history.length}) <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {recentItems.length === 0 ? (
              <div className="py-12 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200 mt-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-2 text-indigo-600">
                  <Mic className="w-5 h-5" />
                </div>
                <p className="text-slate-800 font-bold text-[14px]">No dictations recorded yet</p>
                <p className="text-slate-500 text-[12.5px] mt-1 max-w-xs mx-auto font-medium">
                  Hold down <kbd className="keycap text-[11px] mx-1">{keyParts.join(' + ')}</kbd> anywhere on your computer to capture voice instantly.
                </p>
              </div>
            ) : (
              <div className="space-y-3 mt-4">
                {recentItems.map(item => {
                  const words = item.transcript.trim().split(/\s+/).filter(w => w.length > 0).length;
                  const durationSec = Number(item.duration_seconds) || 0;
                  const sessionWpm = durationSec > 0.5 && words > 1 ? Math.round(words / (durationSec / 60)) : 0;

                  return (
                    <div 
                      key={item.id}
                      className="p-4 rounded-xl bg-white border border-slate-200/80 hover:border-indigo-300 hover:shadow-xs transition-all flex items-start justify-between gap-4 group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="telemetry-badge text-[10.5px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60">
                            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="telemetry-badge text-[10.5px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                            {words} words
                          </span>
                          {durationSec > 0 && (
                            <span className="telemetry-badge text-[10.5px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60">
                              ⏱ {durationSec.toFixed(1)}s
                            </span>
                          )}
                          {sessionWpm > 0 && (
                            <span className="telemetry-badge text-[10.5px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              ⚡ {sessionWpm} WPM
                            </span>
                          )}
                        </div>
                        <p className="text-[14px] text-slate-800 font-medium line-clamp-2 leading-relaxed select-text">
                          {item.transcript}
                        </p>
                      </div>

                      <button
                        onClick={() => handleCopy(item)}
                        className="shrink-0 studio-btn px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-slate-600 hover:text-indigo-600 flex items-center gap-1 mt-0.5"
                        title="Copy transcript"
                      >
                        {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedId === item.id ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Col: Quick Control Surfaces */}
        <div className="space-y-4">
          {/* Quick Audio Telemetry Card */}
          <div className="studio-card p-5 rounded-2xl space-y-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-[14.5px]">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              <span>Acoustic Telemetry</span>
            </div>

            <div className="space-y-2.5 pt-1 text-[13px]">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                <span className="text-slate-600 font-medium">Audio Captured:</span>
                <span className="font-mono font-bold text-slate-900">{stats.totalSpokenFormatted}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                <span className="text-slate-600 font-medium">Avg Words/Capture:</span>
                <span className="font-mono font-bold text-slate-900">{stats.averageWordsPerSession} words</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                <span className="text-slate-600 font-medium">Peak Speed:</span>
                <span className="font-mono font-bold text-emerald-700">
                  {stats.peakWpm > 0 ? `${stats.peakWpm} WPM` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-medium">Active Provider:</span>
                <span className="telemetry-badge text-[11px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  {llamaProvider === 'cerebras' ? 'Cerebras' : 'Groq LPU'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Voice Snippets CTA */}
          <div className="studio-card p-5 rounded-2xl bg-gradient-to-br from-indigo-50/60 to-purple-50/40 border border-indigo-100 space-y-3">
            <div className="flex items-center gap-2 text-indigo-950 font-bold text-[14.5px]">
              <Command className="w-4 h-4 text-indigo-600" />
              <span>Voice Snippets</span>
            </div>
            <p className="text-[12.5px] text-slate-600 font-medium">
              Create instant spoken triggers to expand links, templates, and code blocks.
            </p>
            <button
              onClick={() => onNavigate('snippets')}
              className="w-full studio-btn px-3 py-2 rounded-xl text-[12.5px] font-bold text-indigo-700 hover:bg-white flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <span>Manage Voice Snippets</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Preferences CTA */}
          <button
            onClick={() => onNavigate('settings')}
            className="w-full studio-btn p-4 rounded-2xl text-left hover:border-indigo-300 flex items-center justify-between group transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[13.5px] font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  Studio Preferences
                </p>
                <span className="text-[11.5px] text-slate-500 font-medium">Configure models, hotkeys, & API keys</span>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryTab() {
  const history = useAppStore(state => state.history);
  const setHistory = useAppStore(state => state.setHistory);
  const removeHistoryItem = useAppStore(state => state.removeHistoryItem);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const sortedFilteredHistory = useMemo(() => {
    let list = [...history].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(item => item.transcript.toLowerCase().includes(q));
    }
    return list;
  }, [history, searchQuery]);

  const handleCopy = (item: any) => {
    navigator.clipboard.writeText(item.transcript);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearAll = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3500);
      return;
    }
    setHistory([]);
    setConfirmClear(false);
  };

  return (
    <div className="pb-10 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <span className="text-[11.5px] font-mono font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100">
            Audit Trail
          </span>
          <h1 className="text-[32px] font-extrabold tracking-tight text-slate-900 mt-2 text-studio-gradient">
            Activity Log
          </h1>
          <p className="text-slate-600 text-[14.5px] mt-1 font-medium">
            Every audio capture refined and safely preserved locally on your device.
          </p>
        </div>

        {history.length > 0 && (
          <button
            onClick={handleClearAll}
            className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all flex items-center gap-1.5 ${
              confirmClear
                ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-300'
                : 'studio-btn text-slate-600 hover:text-rose-600 hover:border-rose-200'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {confirmClear ? 'Click Again to Confirm' : 'Clear All'}
          </button>
        )}
      </div>

      {/* Search Filter */}
      {history.length > 0 && (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transcripts by keywords..."
            className="studio-input w-full !pl-10 !pr-10 text-[14px]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 transition-colors"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Stream Cards */}
      <div className="space-y-3">
        {history.length === 0 ? (
          <div className="py-20 text-center studio-card rounded-2xl border-dashed">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-3 text-indigo-600">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-[17px] font-bold text-slate-900">No transcripts yet</h3>
            <p className="text-[14px] text-slate-600 mt-1 max-w-sm mx-auto font-medium">
              Hold down your dictation shortcut in any app to record and see your words captured here.
            </p>
          </div>
        ) : sortedFilteredHistory.length === 0 ? (
          <div className="py-12 text-center studio-card rounded-2xl">
            <p className="text-slate-600 font-semibold">No results matching "{searchQuery}"</p>
          </div>
        ) : (
          sortedFilteredHistory.map(item => {
            const words = item.transcript.trim().split(/\s+/).filter(w => w.length > 0).length;
            const durationSec = Number(item.duration_seconds) || 0;
            const sessionWpm = durationSec > 0.5 && words > 1 ? Math.round(words / (durationSec / 60)) : 0;

            return (
              <div 
                key={item.id}
                className="studio-card p-5 rounded-2xl group relative overflow-hidden transition-all hover:border-slate-300"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="telemetry-badge text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60">
                      {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} • {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="telemetry-badge text-[11px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                      {words} words
                    </span>
                    {durationSec > 0 && (
                      <span className="telemetry-badge text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60">
                        ⏱ {durationSec.toFixed(1)}s
                      </span>
                    )}
                    {sessionWpm > 0 && (
                      <span className="telemetry-badge text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        ⚡ {sessionWpm} WPM
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleCopy(item)}
                      className="studio-btn px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-slate-600 hover:text-indigo-600 flex items-center gap-1"
                    >
                      {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId === item.id ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      onClick={() => removeHistoryItem(item.id)}
                      className="studio-btn px-2 py-1.5 rounded-lg text-[12px] font-semibold text-slate-600 hover:text-rose-600 hover:border-rose-200 flex items-center"
                      title="Delete entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-[15px] text-slate-800 leading-relaxed font-medium select-text">
                  {item.transcript}
                </p>
              </div>
            );
          })
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
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSnippets = useMemo(() => {
    if (!searchQuery.trim()) return snippets;
    const q = searchQuery.toLowerCase();
    return snippets.filter(s => s.trigger_phrase.toLowerCase().includes(q) || s.expansion.toLowerCase().includes(q));
  }, [snippets, searchQuery]);

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
    setShowForm(false);
    setEditingId(null);
    setTrigger('');
    setExpansion('');
  };

  const handleCopy = (snippet: any) => {
    navigator.clipboard.writeText(snippet.expansion);
    setCopiedId(snippet.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="pb-10 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <span className="text-[11.5px] font-mono font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100">
            Acoustic Expansion
          </span>
          <h1 className="text-[32px] font-extrabold tracking-tight text-slate-900 mt-2 text-studio-gradient">
            Voice Snippets
          </h1>
          <p className="text-slate-600 text-[14.5px] mt-1 font-medium">
            Spoken triggers automatically expand into templates, URLs, and code snippets.
          </p>
        </div>

        <button
          onClick={() => {
            if (showForm) handleCancel();
            else setShowForm(true);
          }}
          className={`px-4 py-2.5 rounded-xl text-[13.5px] font-bold transition-all flex items-center gap-1.5 ${
            showForm
              ? 'studio-btn text-slate-700'
              : 'studio-btn-primary'
          }`}
        >
          {showForm ? 'Cancel' : <><Plus className="w-4 h-4"/> New Snippet</>}
        </button>
      </div>

      {/* Snippet Form Drawer */}
      {showForm && (
        <div className="studio-card p-6 rounded-2xl space-y-5 border-indigo-200 bg-indigo-50/20 shadow-md">
          <div className="flex items-center justify-between">
            <h3 className="text-[16px] font-bold text-slate-900">
              {editingId ? 'Edit Spoken Snippet' : 'Configure New Snippet'}
            </h3>
            <span className="text-[11px] font-mono text-slate-500">Case-insensitive trigger matching</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[12.5px] font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                Spoken Trigger Phrase
              </label>
              <div className="relative">
                <Command className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={trigger}
                  onChange={e => setTrigger(e.target.value)}
                  placeholder="e.g. my meet link"
                  className="studio-input w-full !pl-10 font-medium"
                />
              </div>
              <p className="text-[11.5px] text-slate-500 mt-1">What you say during dictation.</p>
            </div>

            <div>
              <label className="block text-[12.5px] font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                Expansion Output
              </label>
              <textarea
                value={expansion}
                onChange={e => setExpansion(e.target.value)}
                placeholder="e.g. https://meet.google.com/abc-defg-hij"
                rows={2}
                className="studio-input w-full resize-none font-medium text-[13.5px]"
              />
              <p className="text-[11.5px] text-slate-500 mt-1">What gets pasted into the active application.</p>
            </div>
          </div>

          {/* Interactive Preview */}
          {trigger.trim() && expansion.trim() && (
            <div className="p-3 rounded-xl bg-white border border-slate-200 text-[12.5px] flex items-center gap-2">
              <span className="font-semibold text-slate-500">Preview:</span>
              <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">"{trigger.trim()}"</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono text-slate-800 bg-slate-100 px-2 py-0.5 rounded truncate max-w-md">{expansion.trim()}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/80">
            <button
              onClick={handleCancel}
              className="studio-btn px-4 py-2 rounded-xl text-[13px] font-semibold text-slate-600"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!trigger.trim() || !expansion.trim()}
              className="studio-btn-primary px-5 py-2 rounded-xl text-[13px] font-bold disabled:opacity-50 disabled:shadow-none"
            >
              {editingId ? 'Update Snippet' : 'Save Snippet'}
            </button>
          </div>
        </div>
      )}

      {/* Snippet Search */}
      {snippets.length > 0 && (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search triggers or expansions..."
            className="studio-input w-full !pl-10 !pr-10 text-[14px]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 transition-colors"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Snippets List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {snippets.length === 0 && !showForm ? (
          <div className="col-span-full py-16 text-center studio-card rounded-2xl border-dashed">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-3 text-indigo-600">
              <ClipboardList className="w-6 h-6" />
            </div>
            <h3 className="text-[17px] font-bold text-slate-900">No voice snippets created yet</h3>
            <p className="text-[14px] text-slate-600 mt-1 max-w-sm mx-auto font-medium">
              Create instant shortcuts for links, email signatures, boilerplate text, or code templates.
            </p>
          </div>
        ) : filteredSnippets.length === 0 ? (
          <div className="col-span-full py-8 text-center studio-card rounded-2xl">
            <p className="text-slate-600 font-semibold">No snippets matching "{searchQuery}"</p>
          </div>
        ) : (
          filteredSnippets.map(snippet => (
            <div key={snippet.id} className="studio-card p-5 rounded-2xl flex flex-col justify-between group relative space-y-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[12.5px] font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-1 rounded-lg">
                  "{snippet.trigger_phrase}"
                </span>

                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleCopy(snippet)}
                    className="studio-btn px-2 py-1 rounded-lg text-[12px] font-semibold text-slate-600 hover:text-indigo-600"
                    title="Copy expansion"
                  >
                    {copiedId === snippet.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => handleEdit(snippet)}
                    className="studio-btn px-2 py-1 rounded-lg text-[12px] font-semibold text-slate-600 hover:text-indigo-600"
                    title="Edit snippet"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => removeSnippet(snippet.id)}
                    className="studio-btn px-2 py-1 rounded-lg text-[12px] font-semibold text-slate-600 hover:text-rose-600 hover:border-rose-200"
                    title="Delete snippet"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <p className="text-[14px] text-slate-700 font-mono bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 break-all line-clamp-3">
                {snippet.expansion}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SettingsTab() {
  const { 
    apiKey, 
    setApiKey, 
    cerebrasApiKey, 
    setCerebrasApiKey, 
    whisperModel, 
    setWhisperModel, 
    llamaModel, 
    setLlamaModel, 
    llamaProvider, 
    setLlamaProvider, 
    hotkey, 
    setHotkey,
    recomputeStats,
    history,
    setHistory
  } = useAppStore();

  const [groqTestStatus, setGroqTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [groqErrorMsg, setGroqErrorMsg] = useState('');
  const [cerebrasTestStatus, setCerebrasTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [cerebrasErrorMsg, setCerebrasErrorMsg] = useState('');
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showCerebrasKey, setShowCerebrasKey] = useState(false);

  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);
  const [capturedKeys, setCapturedKeys] = useState<string[]>([]);
  const capturedKeysRef = useRef<string[]>([]);

  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'current' | 'error'>('idle');
  const [updateInfo, setUpdateInfo] = useState<ReleaseCheckResult | null>(null);
  const [updateError, setUpdateError] = useState('');

  const [recomputeNotice, setRecomputeNotice] = useState(false);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  // Preset shortcut options
  const HOTKEY_PRESETS = [
    { label: 'Ctrl + Win', value: 'Control+Super', tag: 'Default' },
    { label: 'Alt + Space', value: 'Alt+Space', tag: 'Spotlight' },
    { label: 'Ctrl + Shift + D', value: 'Control+Shift+D', tag: 'Dictate' },
    { label: 'Ctrl + Alt + V', value: 'Control+Alt+V', tag: 'Voice' },
  ];

  // Mode detections
  const isWhisperPreset = WHISPER_MODEL_PRESETS.some(p => p.id === whisperModel);
  const activeLlmPresets = llamaProvider === 'cerebras' ? CEREBRAS_MODEL_PRESETS : GROQ_MODEL_PRESETS;
  const isLlamaPreset = activeLlmPresets.some(p => p.id === llamaModel);

  const [isCustomWhisperMode, setIsCustomWhisperMode] = useState(!isWhisperPreset);
  const [isCustomLlamaMode, setIsCustomLlamaMode] = useState(!isLlamaPreset);

  useEffect(() => {
    setIsCustomWhisperMode(!WHISPER_MODEL_PRESETS.some(p => p.id === whisperModel));
  }, [whisperModel]);

  useEffect(() => {
    const presets = llamaProvider === 'cerebras' ? CEREBRAS_MODEL_PRESETS : GROQ_MODEL_PRESETS;
    setIsCustomLlamaMode(!presets.some(p => p.id === llamaModel));
  }, [llamaModel, llamaProvider]);

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
      .catch(() => {});
  }, []);

  const handleTestGroqKey = async () => {
    if (!apiKey) return;
    setGroqTestStatus('testing');
    setGroqErrorMsg('');
    const res = await testKeyWithProvider('groq', apiKey);
    if (res.valid) {
      setGroqTestStatus('success');
    } else {
      setGroqTestStatus('error');
      setGroqErrorMsg(res.error || 'Invalid API Key');
    }
    setTimeout(() => setGroqTestStatus('idle'), 4500);
  };

  const handleTestCerebrasKey = async () => {
    if (!cerebrasApiKey) return;
    setCerebrasTestStatus('testing');
    setCerebrasErrorMsg('');
    const res = await testKeyWithProvider('cerebras', cerebrasApiKey);
    if (res.valid) {
      setCerebrasTestStatus('success');
    } else {
      setCerebrasTestStatus('error');
      setCerebrasErrorMsg(res.error || 'Invalid API Key');
    }
    setTimeout(() => setCerebrasTestStatus('idle'), 4500);
  };

  const handleProviderSwitch = (provider: LLMProvider) => {
    setLlamaProvider(provider);
    if (provider === 'cerebras') {
      if (!CEREBRAS_MODEL_PRESETS.some(p => p.id === llamaModel)) {
        setLlamaModel(DEFAULT_CEREBRAS_MODEL);
        setIsCustomLlamaMode(false);
      }
    } else {
      if (!GROQ_MODEL_PRESETS.some(p => p.id === llamaModel)) {
        setLlamaModel(DEFAULT_GROQ_CHAT_MODEL);
        setIsCustomLlamaMode(false);
      }
    }
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
      });

  const saveHotkey = (parts: string[]) => {
    const normalized = sortShortcutParts(parts);
    if (normalized.length < 2) return;

    const newHotkey = normalized.join('+');
    setHotkey(newHotkey);
    invoke('update_hotkey', { newHotkey }).catch((err) => {
      console.warn('Could not register hotkey:', err);
    });
    setCapturedKeys([]);
    capturedKeysRef.current = [];
    setIsRecordingHotkey(false);
  };

  const applyPresetHotkey = (presetValue: string) => {
    setHotkey(presetValue);
    invoke('update_hotkey', { newHotkey: presetValue }).catch((err) => {
      console.warn('Could not register hotkey preset:', err);
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
    const currentCaptured = sortShortcutParts([...capturedKeysRef.current, ...modifierParts, keyName]);
    capturedKeysRef.current = currentCaptured;
    setCapturedKeys(currentCaptured);

    if (currentCaptured.length >= 2 && !isModifierKey(keyName)) {
      saveHotkey(currentCaptured);
    }
  };

  const handleHotkeyRelease = (e: React.KeyboardEvent) => {
    if (!isRecordingHotkey) return;
    if (capturedKeysRef.current.length >= 2) {
      saveHotkey(capturedKeysRef.current);
      return;
    }
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

  const handleRecomputeStats = () => {
    recomputeStats();
    setRecomputeNotice(true);
    setTimeout(() => setRecomputeNotice(false), 3000);
  };

  const handleClearHistory = () => {
    if (!confirmClearHistory) {
      setConfirmClearHistory(true);
      setTimeout(() => setConfirmClearHistory(false), 3500);
      return;
    }
    setHistory([]);
    setConfirmClearHistory(false);
  };

  const keyDisplayParts = isRecordingHotkey && capturedKeys.length > 0 
    ? capturedKeys.map(k => (k === 'Control' ? 'Ctrl' : k === 'Super' ? 'Win' : k))
    : formatHotkeyLabel(hotkey);

  const activeWhisperObj = WHISPER_MODEL_PRESETS.find(p => p.id === whisperModel);
  const activeLlmObj = activeLlmPresets.find(p => p.id === llamaModel);

  return (
    <div className="pb-16 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="pb-2 border-b border-slate-200/80">
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] font-mono font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-indigo-600" />
            Studio Control Center
          </span>
        </div>
        <h1 className="text-[32px] font-extrabold tracking-tight text-slate-900 mt-2 text-studio-gradient">
          Preferences & Hardware
        </h1>
        <p className="text-slate-600 text-[14.5px] mt-1 font-medium">
          Configure acoustic speech recognition, real-time AI formatting, API credentials, and global triggers.
        </p>
      </div>

      {/* Studio Engine Readiness & Telemetry Bar */}
      <div className="studio-card p-4 sm:p-5 rounded-2xl bg-white/80 border border-slate-200/80 shadow-xs backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Speech-to-Text Acoustic Engine */}
          <div className="flex items-center gap-3 min-w-[200px] flex-1 sm:flex-initial">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600 flex-shrink-0 shadow-2xs">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Speech-to-Text</span>
                <span className="telemetry-badge text-[9.5px] text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                  Groq LPU
                </span>
              </div>
              <p className="text-[13.5px] font-bold text-slate-900 mt-0.5">
                {activeWhisperObj?.label.split(' (')[0] || whisperModel}
              </p>
            </div>
          </div>

          <div className="hidden lg:block h-9 w-px bg-slate-200/80" />

          {/* Inference Polish */}
          <div className="flex items-center gap-3 min-w-[200px] flex-1 sm:flex-initial">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-600 flex-shrink-0 shadow-2xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Text Polish</span>
                <span className="telemetry-badge text-[9.5px] text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                  {llamaProvider === 'cerebras' ? 'Cerebras Wafer' : 'Groq LPU'}
                </span>
              </div>
              <p className="text-[13.5px] font-bold text-slate-900 mt-0.5">
                {activeLlmObj?.label.split(' (')[0] || llamaModel}
              </p>
            </div>
          </div>

          <div className="hidden lg:block h-9 w-px bg-slate-200/80" />

          {/* Hotkey Trigger */}
          <div className="flex items-center gap-3 min-w-[170px] flex-1 sm:flex-initial">
            <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-700 flex-shrink-0 shadow-2xs">
              <Keyboard className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Global Trigger</span>
                <span className="telemetry-badge text-[9.5px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                  Active
                </span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                {formatHotkeyLabel(hotkey).map((k, i) => (
                  <span key={i} className="keycap text-[11.5px] px-2 py-0.5">{k}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="hidden lg:block h-9 w-px bg-slate-200/80" />

          {/* Credential Vault */}
          <div className="flex items-center gap-3 min-w-[150px] flex-1 sm:flex-initial">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 shadow-2xs ${
              apiKey ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-rose-50 border-rose-200 text-rose-600'
            }`}>
              {apiKey ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">Credential Vault</span>
              <p className="text-[13.5px] font-bold text-slate-900 mt-0.5">
                {apiKey ? (
                  <span className="text-emerald-700 font-bold flex items-center gap-1">Groq Ready</span>
                ) : (
                  <span className="text-rose-600 font-bold flex items-center gap-1">Key Required</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Section 1: Global Shortcut Card */}
      <div className="studio-card p-6 rounded-2xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-indigo-600" />
              <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">Global Dictation Hotkey</h3>
            </div>
            <p className="text-[13.5px] text-slate-600 font-medium mt-0.5">
              Press and hold from any active desktop app to capture voice and paste polished text.
            </p>
          </div>
          <button
            onClick={resetHotkey}
            className="studio-btn px-3 py-1.5 rounded-xl text-[12.5px] font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 self-start sm:self-auto"
            title="Reset to default (Ctrl + Win)"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Default
          </button>
        </div>

        {/* Tactile Hotkey Recorder Box */}
        <div className="space-y-3">
          <div
            tabIndex={0}
            onFocus={() => {
              setCapturedKeys([]);
              capturedKeysRef.current = [];
              setIsRecordingHotkey(true);
            }}
            onBlur={() => {
              setTimeout(() => {
                setCapturedKeys([]);
                capturedKeysRef.current = [];
                setIsRecordingHotkey(false);
              }, 250);
            }}
            onKeyDown={handleHotkeyRecord}
            onKeyUp={handleHotkeyRelease}
            className={`w-full studio-input py-4 text-center cursor-pointer flex flex-col items-center justify-center gap-2 transition-all ${
              isRecordingHotkey 
                ? 'border-indigo-600 ring-4 ring-indigo-500/15 bg-white shadow-inner' 
                : 'hover:border-slate-400 bg-slate-50/70'
            }`}
          >
            {isRecordingHotkey && capturedKeys.length === 0 ? (
              <div className="flex flex-col items-center gap-1">
                <span className="text-[14px] font-semibold text-indigo-600 animate-pulse flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-ping" />
                  Listening for key combo (e.g. Ctrl + Win, Alt + Space)...
                </span>
                <span className="text-[12px] text-slate-500">Press modifier + target key simultaneously</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex items-center gap-2">
                  {keyDisplayParts.map((k, idx) => (
                    <span key={idx} className="keycap text-[14px] px-3 py-1 shadow-sm">{k}</span>
                  ))}
                </div>
                <span className="text-[11.5px] text-slate-500 font-medium">
                  {isRecordingHotkey ? 'Release keys to save' : 'Click here to record a custom shortcut'}
                </span>
              </div>
            )}
          </div>

          {/* Quick Presets Pill Selector */}
          <div>
            <span className="block text-[11.5px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Quick Shortcut Presets
            </span>
            <div className="flex flex-wrap gap-2">
              {HOTKEY_PRESETS.map((preset) => {
                const isActive = hotkey === preset.value;
                return (
                  <button
                    key={preset.value}
                    onClick={() => applyPresetHotkey(preset.value)}
                    className={`px-3 py-1.5 rounded-xl text-[12.5px] font-semibold transition-all flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-300'
                        : 'studio-btn text-slate-700 hover:text-indigo-600 hover:border-indigo-200'
                    }`}
                  >
                    <span>{preset.label}</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {preset.tag}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Section 2 & 3: Model Selection & Inference Engine (2-Column Grid) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Acoustic Whisper Model */}
        <div className="studio-card p-6 rounded-2xl flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Mic className="w-4 h-4 text-amber-500" />
                <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">Acoustic Recognition</h3>
              </div>
              <span className="telemetry-badge text-[11px] text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded border border-amber-200">
                Groq LPU
              </span>
            </div>
            <p className="text-[13.5px] text-slate-600 font-medium">
              Whisper speech-to-text model for instantaneous, sub-second transcription.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <label className="block text-[12px] font-bold text-slate-700 uppercase tracking-wider">
              Whisper Acoustic Model
            </label>
            <div className="relative">
              <select
                value={isCustomWhisperMode ? '__custom__' : whisperModel}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setIsCustomWhisperMode(true);
                  } else {
                    setIsCustomWhisperMode(false);
                    setWhisperModel(e.target.value);
                  }
                }}
                className="studio-select text-[14px]"
              >
                {WHISPER_MODEL_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label} — [{preset.tag}]
                  </option>
                ))}
                <option value="__custom__">Custom Whisper Model ID...</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {isCustomWhisperMode && (
              <div className="animate-fade-in pt-1">
                <label className="block text-[12px] font-semibold text-slate-600 mb-1">Custom Model Identifier</label>
                <input
                  type="text"
                  value={whisperModel}
                  onChange={(e) => setWhisperModel(e.target.value.trim())}
                  placeholder="e.g. whisper-large-v3-turbo"
                  className="studio-input w-full font-mono text-[13px]"
                />
              </div>
            )}

            <div className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/70 text-[12px] text-slate-600 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Recommended: <strong className="text-slate-800">Whisper Turbo</strong> for sub-200ms latency.</span>
            </div>
          </div>
        </div>

        {/* Inference Engine & Provider */}
        <div className="studio-card p-6 rounded-2xl flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">AI Formatting & Polish</h3>
              </div>
              <span className="telemetry-badge text-[11px] text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-200">
                Text Refinement
              </span>
            </div>
            <p className="text-[13.5px] text-slate-600 font-medium">
              Cleans filler words, fixes punctuation, and expands voice snippet triggers.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <label className="block text-[12px] font-bold text-slate-700 uppercase tracking-wider">
              Inference Provider
            </label>

            {/* Provider Switcher */}
            <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100/90 border border-slate-200">
              <button
                type="button"
                onClick={() => handleProviderSwitch('groq')}
                className={`py-2 px-3 rounded-lg text-[13px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                  llamaProvider === 'groq'
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                Groq LPU
              </button>
              <button
                type="button"
                onClick={() => handleProviderSwitch('cerebras')}
                className={`py-2 px-3 rounded-lg text-[13px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                  llamaProvider === 'cerebras'
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-purple-600" />
                Cerebras Wafer
              </button>
            </div>

            {/* Model Selector */}
            <div className="relative pt-1">
              <select
                value={isCustomLlamaMode ? '__custom__' : llamaModel}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setIsCustomLlamaMode(true);
                  } else {
                    setIsCustomLlamaMode(false);
                    setLlamaModel(e.target.value);
                  }
                }}
                className="studio-select text-[14px]"
              >
                {activeLlmPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label} — [{preset.tag}]
                  </option>
                ))}
                <option value="__custom__">Custom Model ID...</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {isCustomLlamaMode && (
              <div className="animate-fade-in pt-1">
                <label className="block text-[12px] font-semibold text-slate-600 mb-1">
                  Custom {llamaProvider === 'cerebras' ? 'Cerebras' : 'Groq'} Model ID
                </label>
                <input
                  type="text"
                  value={llamaModel}
                  onChange={(e) => setLlamaModel(e.target.value.trim())}
                  placeholder={llamaProvider === 'cerebras' ? 'e.g. gemma-4-31b' : 'e.g. openai/gpt-oss-20b'}
                  className="studio-input w-full font-mono text-[13px]"
                />
              </div>
            )}

            <div className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/70 text-[12px] text-slate-600 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              <span>Active: <strong className="text-slate-800">{activeLlmObj?.label.split(' (')[0] || llamaModel}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Provider Credentials Card */}
      <div className="studio-card p-6 rounded-2xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-indigo-600" />
            <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">API Key Credentials Vault</h3>
          </div>
          <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Encrypted Local Store
          </span>
        </div>

        {/* Groq Key */}
        <div className="space-y-2 pt-2 border-t border-slate-200/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold text-slate-900">Groq API Key</span>
              <span className="telemetry-badge text-[10.5px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Required for Speech
              </span>
            </div>
            <button
              onClick={() => openUrl('https://console.groq.com/keys')}
              className="text-[12.5px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline"
            >
              Get Free Key <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="flex-1 relative">
              <input
                type={showGroqKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value.trim())}
                placeholder="gsk_########################################"
                className="studio-input w-full font-mono text-[13.5px] !pr-10"
              />
              <button
                type="button"
                onClick={() => setShowGroqKey(!showGroqKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                title={showGroqKey ? 'Hide key' : 'Show key'}
              >
                {showGroqKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={handleTestGroqKey}
              disabled={!apiKey || groqTestStatus === 'testing'}
              className={`px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all flex items-center justify-center min-w-[130px] ${
                groqTestStatus === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-sm' :
                groqTestStatus === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-300' :
                'studio-btn-primary disabled:opacity-50 disabled:shadow-none'
              }`}
            >
              {groqTestStatus === 'testing' ? <Loader2 className="w-4 h-4 animate-spin" /> :
               groqTestStatus === 'success' ? <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600"/> Verified</span> :
               groqTestStatus === 'error' ? <span className="flex items-center gap-1.5"><XCircle className="w-4 h-4 text-rose-600"/> Failed</span> :
               'Authenticate'}
            </button>
          </div>
          {groqTestStatus === 'error' && groqErrorMsg && (
            <p className="text-[12px] font-semibold text-rose-600 pl-1">{groqErrorMsg}</p>
          )}
        </div>

        {/* Cerebras Key */}
        <div className="space-y-2 pt-4 border-t border-slate-200/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold text-slate-900">Cerebras API Key</span>
              <span className="telemetry-badge text-[10.5px] text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                Optional LLM Provider
              </span>
            </div>
            <button
              onClick={() => openUrl('https://cloud.cerebras.ai/')}
              className="text-[12.5px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline"
            >
              Get Free Key <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="flex-1 relative">
              <input
                type={showCerebrasKey ? 'text' : 'password'}
                value={cerebrasApiKey}
                onChange={(e) => setCerebrasApiKey(e.target.value.trim())}
                placeholder="csk-########################################"
                className="studio-input w-full font-mono text-[13.5px] !pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCerebrasKey(!showCerebrasKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                title={showCerebrasKey ? 'Hide key' : 'Show key'}
              >
                {showCerebrasKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={handleTestCerebrasKey}
              disabled={!cerebrasApiKey || cerebrasTestStatus === 'testing'}
              className={`px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all flex items-center justify-center min-w-[130px] ${
                cerebrasTestStatus === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-sm' :
                cerebrasTestStatus === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-300' :
                'studio-btn-primary disabled:opacity-50 disabled:shadow-none'
              }`}
            >
              {cerebrasTestStatus === 'testing' ? <Loader2 className="w-4 h-4 animate-spin" /> :
               cerebrasTestStatus === 'success' ? <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600"/> Verified</span> :
               cerebrasTestStatus === 'error' ? <span className="flex items-center gap-1.5"><XCircle className="w-4 h-4 text-rose-600"/> Failed</span> :
               'Authenticate'}
            </button>
          </div>
          {cerebrasTestStatus === 'error' && cerebrasErrorMsg && (
            <p className="text-[12px] font-semibold text-rose-600 pl-1">{cerebrasErrorMsg}</p>
          )}
        </div>

        <div className="p-3 rounded-xl bg-slate-50/90 border border-slate-200/80 text-[12px] text-slate-500 font-medium flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>API keys are stored strictly in your local app configuration and never uploaded to third-party servers.</span>
        </div>
      </div>

      {/* Section 5: Software Updates & System Diagnostics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Updates Card */}
        <div className="studio-card p-6 rounded-2xl flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-indigo-600" />
              <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">Software Updates</h3>
            </div>
            <p className="text-[13.5px] text-slate-600 font-medium mt-0.5">
              Check for published releases and desktop installer updates.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2.5">
              <button
                onClick={handleCheckForUpdates}
                disabled={updateStatus === 'checking'}
                className="studio-btn px-4 py-2 rounded-xl text-[13px] font-bold text-slate-700 hover:text-slate-900 flex items-center gap-2"
              >
                {updateStatus === 'checking' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {updateStatus === 'checking' ? 'Checking GitHub...' : 'Check for Updates'}
              </button>

              <button
                onClick={() => openReleasePage()}
                className="studio-btn px-4 py-2 rounded-xl text-[13px] font-semibold text-slate-600 hover:text-slate-900"
              >
                View Changelog
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <p className="text-[13px] text-slate-600 font-medium">
                Installed Version: <span className="font-mono font-bold text-slate-900">v{updateInfo?.currentVersion ?? '0.0.12'}</span>
              </p>

              {updateStatus === 'current' && updateInfo && (
                <p className="text-[12.5px] text-emerald-600 font-bold mt-1.5 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> VoxDrop is up to date ({updateInfo.latestVersion ?? updateInfo.currentVersion}).
                </p>
              )}

              {updateStatus === 'available' && updateInfo && (
                <div className="mt-2 space-y-2">
                  <p className="text-[13px] font-bold text-amber-700">
                    New release available: v{updateInfo.latestVersion}
                  </p>
                  <button
                    onClick={() => openReleasePage(updateInfo.htmlUrl)}
                    className="studio-btn-primary px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold"
                  >
                    Download Release .exe
                  </button>
                </div>
              )}

              {updateStatus === 'error' && (
                <p className="text-[12.5px] font-semibold text-rose-600 mt-1">
                  {updateError || 'Unable to connect to update server.'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Local Storage & Diagnostics */}
        <div className="studio-card p-6 rounded-2xl flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-indigo-600" />
              <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">Diagnostics & Storage</h3>
            </div>
            <p className="text-[13.5px] text-slate-600 font-medium mt-0.5">
              Maintain audit logs and recompute telemetry metrics across past sessions.
            </p>
          </div>

          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-600 font-medium">Logged Transcripts:</span>
                <span className="font-mono font-bold text-slate-900">{history.length} items</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-600 font-medium">Database Health:</span>
                <span className="telemetry-badge text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Optimal
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                onClick={handleRecomputeStats}
                className="studio-btn px-4 py-2 rounded-xl text-[12.5px] font-semibold text-slate-700 hover:text-indigo-600 flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Recompute Stats
              </button>

              {history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className={`px-4 py-2 rounded-xl text-[12.5px] font-bold transition-all flex items-center gap-1.5 ${
                    confirmClearHistory
                      ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-300'
                      : 'studio-btn text-slate-600 hover:text-rose-600 hover:border-rose-200'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {confirmClearHistory ? 'Confirm Clear All' : 'Wipe Audit Log'}
                </button>
              )}
            </div>

            {recomputeNotice && (
              <p className="text-[12px] font-semibold text-emerald-600 animate-fade-in flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Telemetry and streak data recalculated successfully.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

