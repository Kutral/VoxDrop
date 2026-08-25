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
  const snippets = useAppStore(state => state.snippets);
  const llamaProvider = useAppStore(state => state.llamaProvider);
  const recomputeStats = useAppStore(state => state.recomputeStats);

  // Primitive signature: re-renders the shell only when a synced setting changes
  const settingsSignature = useAppStore(s =>
    `${s.apiKey}|${s.cerebrasApiKey}|${s.whisperModel}|${s.llamaModel}|${s.llamaProvider}|${s.hotkey}|${s.snippets.length}`
  );

  // Ensure stats are recomputed on mount
  useEffect(() => {
    recomputeStats();
    getInstalledVersion().then(setInstalledVer).catch(() => {});
  }, [recomputeStats]);

  // Track settings changes and broadcast to pill window so it can rehydrate
  useEffect(() => {
    const timer = setTimeout(() => {
      emit('settings-changed').catch(console.error);
    }, 300);
    return () => clearTimeout(timer);
  }, [settingsSignature]);

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
        className={`nav-item relative w-full flex items-center justify-between pl-4 pr-3 py-2.5 rounded-xl transition-all duration-150 ${
          active
            ? 'nav-item-active bg-indigo-50/90 text-indigo-700 font-semibold'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/45 font-medium'
        }`}
      >
        <div className="flex items-center gap-3">
          <Icon className={`w-4 h-4 ${active ? 'text-indigo-600' : 'text-slate-400'}`} strokeWidth={active ? 2.2 : 2} />
          <span className="text-[13.5px] tracking-tight">{label}</span>
        </div>
        {badgeCount !== undefined && badgeCount > 0 && (
          <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full ${
            active ? 'bg-indigo-100/80 text-indigo-700' : 'bg-slate-200/70 text-slate-500'
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
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[60%] rounded-full bg-indigo-200/25 blur-[130px]" />
        <div className="absolute top-[40%] -right-[15%] w-[45%] h-[50%] rounded-full bg-blue-100/30 blur-[140px]" />
      </div>

      {/* Sidebar — floating dock */}
      <aside className="w-[246px] h-[calc(100vh-24px)] my-3 ml-3 flex flex-col bg-white/85 border border-slate-200/70 rounded-[20px] shadow-[0_12px_40px_-20px_rgba(15,23,42,0.18)] backdrop-blur-xl p-3 flex-shrink-0 z-20">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-2 py-3 mb-5">
          <div className="w-8 h-8 rounded-[10px] overflow-hidden flex items-center justify-center shadow-sm border border-slate-200/70 bg-white p-1">
            <img src="/app-icon.png" alt="VoxDrop Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[15px] font-extrabold tracking-tight text-slate-900 leading-none">VoxDrop</span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200/70">
                v{installedVer}
              </span>
            </div>
            <span className="text-[10.5px] font-medium text-slate-500 tracking-wider uppercase block mt-0.5">
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
        <div className="mx-1 mb-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 mb-1">
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" />
            </span>
            <span>Active Engine</span>
          </div>
          <p className="font-mono text-[10px] text-slate-500 truncate pl-4">
            {llamaProvider === 'cerebras' ? 'Cerebras Wafer' : 'Groq LPU'} • Whisper
          </p>
        </div>

        {/* Settings button */}
        <div className="flex flex-col gap-1 w-full pt-2 border-t border-slate-100">
          {navItem('settings', Settings, 'Preferences')}
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 h-full relative z-10 overflow-hidden flex flex-col">
        <div className="content-scroll flex-1 overflow-y-auto px-5 sm:px-7 lg:px-9 py-5 relative">
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
    if (wpm >= 170) speedTier = 'Turbo Velocity';
    else if (wpm >= 130) speedTier = 'High Speed';
    else if (wpm >= 90) speedTier = 'Conversational';
    else if (wpm > 0) speedTier = 'Steady';

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

  // Signature sparkline: last 14 days of dictation volume as a smooth area chart
  const sparkline = useMemo(() => {
    const now = new Date();
    const dailyWords: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dateStr = day.toDateString();
      let words = 0;
      for (const item of history) {
        if (item.created_at && new Date(item.created_at).toDateString() === dateStr) {
          words += item.transcript.trim().split(/\s+/).filter(Boolean).length;
        }
      }
      dailyWords.push(words);
    }

    const w = 600;
    const h = 56;
    const max = Math.max(...dailyWords, 1);
    const stepX = w / (dailyWords.length - 1);
    const pts = dailyWords.map((v, i) => ({
      x: i * stepX,
      y: h - 6 - (v / max) * (h - 18),
    }));

    let line = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const mx = (p0.x + p1.x) / 2;
      line += ` Q ${mx},${p0.y} ${mx},${(p0.y + p1.y) / 2} Q ${mx},${p1.y} ${p1.x},${p1.y}`;
    }
    const area = `${line} L ${w},${h} L 0,${h} Z`;
    const last = pts[pts.length - 1];

    return { line, area, lastX: last.x, lastY: last.y, hasData: dailyWords.some(v => v > 0) };
  }, [history]);

  const handleCopy = (item: any) => {
    navigator.clipboard.writeText(item.transcript);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const keyParts = formatHotkeyLabel(hotkey);

  return (
    <div className="pb-12 space-y-7 animate-fade-in">
      {/* Aurora hero */}
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-500 px-7 pt-7 pb-6 shadow-[0_20px_50px_-24px_rgba(79,70,229,0.55)]">
        {/* Soft light blooms */}
        <div className="absolute -top-24 -right-16 w-80 h-80 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-28 -left-12 w-80 h-80 rounded-full bg-sky-400/20 blur-3xl pointer-events-none" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="text-[10.5px] font-mono font-bold uppercase tracking-[0.14em] text-indigo-100/80 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              Acoustic Intelligence Hub
            </span>
            {apiKey && (
              <span className="text-[10.5px] font-mono font-semibold text-white bg-white/15 px-2 py-0.5 rounded-full flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                Live
              </span>
            )}
          </div>

          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mt-3.5">
            <div>
              <h1 className="text-[32px] font-extrabold tracking-[-0.03em] text-white leading-[1.08]">
                {greeting}, ready to dictate
              </h1>
              <p className="text-indigo-100/85 text-[14.5px] mt-2 font-medium max-w-xl leading-relaxed">
                High-velocity speech capture, auto-formatted and instantly pasted into your active app.
              </p>
            </div>

            {/* Global trigger switch */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/10 ring-1 ring-white/20 self-start lg:self-auto backdrop-blur-sm">
              <div className="w-8 h-8 rounded-[10px] bg-white/15 flex items-center justify-center text-white">
                <Mic className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-[9.5px] font-mono font-bold uppercase tracking-[0.14em] text-indigo-100/80">Global Trigger</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[12px] font-semibold text-indigo-100">Hold</span>
                  {keyParts.map((k, i) => (
                    <span key={i} className="keycap text-[12px]">{k}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Signature: your last 14 days as a voiceprint */}
          <div className="mt-7" aria-hidden="true">
            <svg viewBox="0 0 600 56" preserveAspectRatio="none" className="w-full h-14 block">
              <defs>
                <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.30" />
                  <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path d={sparkline.area} fill="url(#sparkFill)" />
              <path
                d={sparkline.line}
                fill="none"
                stroke="rgba(255,255,255,0.9)"
                strokeWidth="2"
                strokeLinecap="round"
                pathLength={1}
                className="sparkline-line"
              />
              <circle cx={sparkline.lastX} cy={sparkline.lastY} r="8" fill="rgba(255,255,255,0.25)" />
              <circle cx={sparkline.lastX} cy={sparkline.lastY} r="3.5" fill="#FFFFFF" />
            </svg>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.12em] text-indigo-100/60">14 days ago</span>
              <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.12em] text-indigo-100/80">
                {sparkline.hasData ? 'Today' : 'Start dictating to shape your waveform'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats — editorial spec strip: one panel, hairline dividers */}
      <div className="studio-card rounded-[20px] grid grid-cols-2 lg:grid-cols-4 overflow-hidden animate-fade-in">
        {/* Speaking speed */}
        <div className="p-5 lg:p-6">
          <span className="studio-eyebrow">Speaking speed</span>
          <div className="flex items-baseline gap-1.5 mt-3">
            <span className="text-[34px] font-extrabold text-slate-900 tracking-[-0.03em] leading-none">
              {stats.averageWpm > 0 ? stats.averageWpm : '—'}
            </span>
            <span className="text-[13px] font-semibold text-slate-400">wpm</span>
          </div>
          <div className="mt-4 h-1 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(6, (stats.averageWpm / 200) * 100))}%` }}
            />
          </div>
          <p className="mt-3 text-[12.5px] text-slate-500 font-medium leading-snug">
            {stats.averageWpm > 0
              ? <><span className="text-slate-700 font-semibold">{stats.speedTier}</span> — {stats.speedMultiplier} faster than typing</>
              : 'Hold the hotkey to take your first measurement'}
          </p>
        </div>

        {/* Time saved */}
        <div className="p-5 lg:p-6 border-l border-t lg:border-t-0 border-slate-100">
          <span className="studio-eyebrow">Time saved</span>
          <div className="flex items-baseline gap-1.5 mt-3">
            <span className="text-[34px] font-extrabold text-slate-900 tracking-[-0.03em] leading-none">
              {stats.timeSavedMinutes >= 60 ? (stats.timeSavedMinutes / 60).toFixed(1) : stats.timeSavedMinutes}
            </span>
            <span className="text-[13px] font-semibold text-slate-400">{stats.timeSavedMinutes >= 60 ? 'hrs' : 'mins'}</span>
          </div>
          <div className="mt-4 h-1 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-blue-500" style={{ width: '75%' }} />
          </div>
          <p className="mt-3 text-[12.5px] text-slate-500 font-medium leading-snug">
            ~75% less effort than keyboard typing
          </p>
        </div>

        {/* Words captured */}
        <div className="p-5 lg:p-6 border-t lg:border-t-0 lg:border-l border-slate-100">
          <span className="studio-eyebrow">Words captured</span>
          <div className="flex items-baseline gap-1.5 mt-3">
            <span className="text-[34px] font-extrabold text-slate-900 tracking-[-0.03em] leading-none">
              {stats.totalWords.toLocaleString()}
            </span>
          </div>
          <div className="mt-4 h-1 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(6, (stats.totalWords / 2000) * 100))}%` }}
            />
          </div>
          <p className="mt-3 text-[12.5px] text-slate-500 font-medium leading-snug">
            {stats.totalWords > 0
              ? <>+{stats.wordsToday} today · ~{stats.pagesCount} written page{stats.pagesCount > 1 ? 's' : ''}</>
              : 'Every word you dictate lands here'}
          </p>
        </div>

        {/* Weekly streak */}
        <div className="p-5 lg:p-6 border-l border-t lg:border-t-0 border-slate-100">
          <span className="studio-eyebrow">Weekly streak</span>
          <div className="flex items-baseline gap-1.5 mt-3">
            <span className="text-[34px] font-extrabold text-slate-900 tracking-[-0.03em] leading-none">
              {weeklyStreak}
            </span>
            <span className="text-[13px] font-semibold text-slate-400">{weeklyStreak === 1 ? 'week' : 'weeks'}</span>
          </div>
          <div className="mt-4 h-1 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(6, weeklyStreak * 25))}%` }}
            />
          </div>
          <p className="mt-3 text-[12.5px] text-slate-500 font-medium leading-snug">
            {weeklyStreak > 0
              ? <>{history.length} captures · {weeklyStreak}{getOrdinalSuffix(weeklyStreak)} week in a row</>
              : 'Dictate this week to start a streak'}
          </p>
        </div>
      </div>

      {/* 7-Day Activity Rhythm Bar */}
      <div className="studio-card p-5 rounded-[20px] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-500" />
            <h3 className="text-[15.5px] font-bold text-slate-900 tracking-tight">Weekly Dictation Rhythm</h3>
          </div>
          <span className="telemetry-badge text-[11px] text-slate-500">
            {stats.todayCount > 0
              ? `${stats.todayCount} capture${stats.todayCount > 1 ? 's' : ''} today · ${stats.wordsToday} words`
              : 'No captures yet today'}
          </span>
        </div>

        {/* 7-Day waveform grid — bar height encodes words captured */}
        <div className="grid grid-cols-7 gap-2 pt-1">
          {(() => {
            const maxDayWords = Math.max(...weekDays.map(d => d.wordsOnDay), 1);
            return weekDays.map((day, idx) => {
              const rel = day.wordsOnDay > 0 ? day.wordsOnDay / maxDayWords : 0;
              const barHeight = day.hasActivity ? Math.max(10, Math.round(8 + rel * 26)) : 5;
              return (
                <div
                  key={idx}
                  className={`p-3 rounded-2xl flex flex-col items-center justify-center transition-all duration-150 ${
                    day.isToday
                      ? 'bg-indigo-50/80 ring-1 ring-indigo-200'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <span className={`text-[10.5px] font-mono font-bold uppercase tracking-wider ${
                    day.isToday ? 'text-indigo-600' : 'text-slate-400'
                  }`}>
                    {day.dayLabel}
                  </span>

                  <span className={`text-[16px] font-extrabold tracking-tight mt-0.5 leading-none ${
                    day.isToday ? 'text-indigo-900' : day.hasActivity ? 'text-slate-800' : 'text-slate-300'
                  }`}>
                    {day.dateNumber}
                  </span>

                  {/* Volume waveform bar */}
                  <div className="h-9 flex items-end mt-2.5" title={day.hasActivity ? `${day.wordsOnDay} words captured` : undefined}>
                    <div
                      className={`w-7 rounded-full transition-all duration-500 ${
                        day.isToday
                          ? 'bg-gradient-to-t from-indigo-600 to-indigo-400'
                          : day.hasActivity
                          ? 'bg-gradient-to-t from-slate-300 to-slate-200'
                          : 'bg-slate-200/60'
                      }`}
                      style={{ height: `${barHeight}px` }}
                    />
                  </div>

                  <span className={`text-[10px] font-mono font-semibold mt-1.5 h-4 ${
                    day.hasActivity ? (day.isToday ? 'text-indigo-600' : 'text-slate-400') : 'text-transparent'
                  }`}>
                    {day.hasActivity ? `${day.wordsOnDay}w` : '·'}
                  </span>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Recent Transcripts Feed & Quick Actions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent Stream */}
        <div className="lg:col-span-2 studio-card p-6 rounded-[20px] space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-500" />
                <h2 className="text-[16px] font-bold text-slate-900 tracking-tight">Recent Activity Stream</h2>
              </div>
              <button
                onClick={() => onNavigate('history')}
                className="text-[13px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 group"
              >
                View all ({history.length}) <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            {recentItems.length === 0 ? (
              <div className="py-12 text-center bg-slate-50/70 rounded-2xl mt-4">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center mx-auto mb-2 text-indigo-500 shadow-sm">
                  <Mic className="w-5 h-5" />
                </div>
                <p className="text-slate-800 font-bold text-[14px]">No dictations recorded yet</p>
                <p className="text-slate-500 text-[12.5px] mt-1 max-w-xs mx-auto font-medium">
                  Hold down <kbd className="keycap text-[11px] mx-1">{keyParts.join(' + ')}</kbd> anywhere on your computer to capture voice instantly.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 mt-4">
                {recentItems.map(item => {
                  const words = item.transcript.trim().split(/\s+/).filter(w => w.length > 0).length;
                  const durationSec = Number(item.duration_seconds) || 0;
                  const sessionWpm = durationSec > 0.5 && words > 1 ? Math.round(words / (durationSec / 60)) : 0;

                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-2xl bg-white border border-slate-100 hover:border-indigo-200 hover:shadow-[0_10px_28px_-16px_rgba(15,23,42,0.18)] transition-all duration-150 flex items-start justify-between gap-4 group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="telemetry-badge text-[10.5px] text-slate-500">
                            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-[10.5px] font-mono font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                            {words} words
                          </span>
                          {durationSec > 0 && (
                            <span className="telemetry-badge text-[10.5px] text-slate-400">
                              {durationSec.toFixed(1)}s
                            </span>
                          )}
                          {sessionWpm > 0 && (
                            <span className="text-[10.5px] font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                              {sessionWpm} WPM
                            </span>
                          )}
                        </div>
                        <p className="text-[14px] text-slate-700 font-medium line-clamp-2 leading-relaxed select-text">
                          {item.transcript}
                        </p>
                      </div>

                      <button
                        onClick={() => handleCopy(item)}
                        className="shrink-0 studio-btn px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1 mt-0.5"
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
          <div className="studio-card p-5 rounded-[20px] space-y-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-[14.5px] tracking-tight">
              <TrendingUp className="w-4 h-4 text-indigo-500" />
              <span>Acoustic Telemetry</span>
            </div>

            <div className="space-y-2.5 pt-1 text-[13px]">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Audio captured</span>
                <span className="telemetry-badge text-slate-900">{stats.totalSpokenFormatted}</span>
              </div>
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Avg words / capture</span>
                <span className="telemetry-badge text-slate-900">{stats.averageWordsPerSession}</span>
              </div>
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Peak speed</span>
                <span className="telemetry-badge text-emerald-700">
                  {stats.peakWpm > 0 ? `${stats.peakWpm} WPM` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Active provider</span>
                <span className="text-[10.5px] font-mono font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                  {llamaProvider === 'cerebras' ? 'Cerebras' : 'Groq LPU'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Voice Snippets CTA */}
          <div className="studio-card p-5 rounded-[20px] space-y-3 bg-gradient-to-br from-indigo-50/70 to-violet-50/50">
            <div className="flex items-center gap-2 text-indigo-950 font-bold text-[14.5px] tracking-tight">
              <Command className="w-4 h-4 text-indigo-500" />
              <span>Voice Snippets</span>
            </div>
            <p className="text-[12.5px] text-slate-600 font-medium leading-relaxed">
              Create instant spoken triggers to expand links, templates, and code blocks.
            </p>
            <button
              onClick={() => onNavigate('snippets')}
              className="w-full studio-btn px-3 py-2 rounded-xl text-[12.5px] font-bold text-indigo-700 bg-white/80 flex items-center justify-center gap-1.5"
            >
              <span>Manage Voice Snippets</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Preferences CTA */}
          <button
            onClick={() => onNavigate('settings')}
            className="w-full studio-card-interactive p-4 rounded-[20px] text-left flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[13.5px] font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">
                  Studio Preferences
                </p>
                <span className="text-[11.5px] text-slate-400 font-medium">Models, hotkeys, & API keys</span>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
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
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2">
        <div>
          <span className="studio-eyebrow">Audit Trail</span>
          <h1 className="text-[32px] font-extrabold tracking-[-0.03em] text-slate-900 mt-2 leading-[1.08]">
            Activity Log
          </h1>
          <p className="text-slate-500 text-[14.5px] mt-1.5 font-medium">
            Every audio capture refined and safely preserved locally on your device.
          </p>
        </div>

        {history.length > 0 && (
          <button
            onClick={handleClearAll}
            className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all flex items-center gap-1.5 ${
              confirmClear
                ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-300'
                : 'studio-btn text-slate-500 hover:text-rose-600 hover:border-rose-200'
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
          <div className="py-20 text-center studio-card rounded-[20px] border-dashed">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-3 text-indigo-500">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-[17px] font-bold text-slate-900">No transcripts yet</h3>
            <p className="text-[14px] text-slate-500 mt-1 max-w-sm mx-auto font-medium">
              Hold down your dictation shortcut in any app to record and see your words captured here.
            </p>
          </div>
        ) : sortedFilteredHistory.length === 0 ? (
          <div className="py-12 text-center studio-card rounded-[20px]">
            <p className="text-slate-500 font-semibold">No results matching "{searchQuery}"</p>
          </div>
        ) : (
          sortedFilteredHistory.map(item => {
            const words = item.transcript.trim().split(/\s+/).filter(w => w.length > 0).length;
            const durationSec = Number(item.duration_seconds) || 0;
            const sessionWpm = durationSec > 0.5 && words > 1 ? Math.round(words / (durationSec / 60)) : 0;

            return (
              <div
                key={item.id}
                className="studio-card-interactive p-5 rounded-[20px] group relative"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="telemetry-badge text-[11px] text-slate-500">
                      {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-[10.5px] font-mono font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                      {words} words
                    </span>
                    {durationSec > 0 && (
                      <span className="telemetry-badge text-[11px] text-slate-400">
                        {durationSec.toFixed(1)}s
                      </span>
                    )}
                    {sessionWpm > 0 && (
                      <span className="text-[10.5px] font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        {sessionWpm} WPM
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleCopy(item)}
                      className="studio-btn px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1"
                    >
                      {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId === item.id ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      onClick={() => removeHistoryItem(item.id)}
                      className="studio-btn px-2 py-1.5 rounded-lg text-[12px] font-semibold text-slate-500 hover:text-rose-600 hover:border-rose-200 flex items-center"
                      title="Delete entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-[15px] text-slate-700 leading-relaxed font-medium select-text">
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
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2">
        <div>
          <span className="studio-eyebrow">Acoustic Expansion</span>
          <h1 className="text-[32px] font-extrabold tracking-[-0.03em] text-slate-900 mt-2 leading-[1.08]">
            Voice Snippets
          </h1>
          <p className="text-slate-500 text-[14.5px] mt-1.5 font-medium">
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
              ? 'studio-btn text-slate-600'
              : 'studio-btn-primary'
          }`}
        >
          {showForm ? 'Cancel' : <><Plus className="w-4 h-4"/> New Snippet</>}
        </button>
      </div>

      {/* Snippet Form Drawer */}
      {showForm && (
        <div className="studio-card p-6 rounded-[20px] space-y-5 ring-1 ring-indigo-100">
          <div className="flex items-center justify-between">
            <h3 className="text-[16px] font-bold text-slate-900 tracking-tight">
              {editingId ? 'Edit Spoken Snippet' : 'Configure New Snippet'}
            </h3>
            <span className="text-[11px] font-mono text-slate-400">Case-insensitive trigger matching</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="studio-eyebrow !text-[10px] block mb-2">
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
              <p className="text-[11.5px] text-slate-400 mt-1.5 font-medium">What you say during dictation.</p>
            </div>

            <div>
              <label className="studio-eyebrow !text-[10px] block mb-2">
                Expansion Output
              </label>
              <textarea
                value={expansion}
                onChange={e => setExpansion(e.target.value)}
                placeholder="e.g. https://meet.google.com/abc-defg-hij"
                rows={2}
                className="studio-input w-full resize-none font-medium text-[13.5px]"
              />
              <p className="text-[11.5px] text-slate-400 mt-1.5 font-medium">What gets pasted into the active application.</p>
            </div>
          </div>

          {/* Interactive Preview */}
          {trigger.trim() && expansion.trim() && (
            <div className="p-3 rounded-xl bg-slate-50 text-[12.5px] flex items-center gap-2">
              <span className="font-semibold text-slate-400">Preview</span>
              <span className="font-mono font-bold text-indigo-700 bg-white px-2 py-0.5 rounded-md border border-indigo-100">"{trigger.trim()}"</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
              <span className="font-mono text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200 truncate max-w-md">{expansion.trim()}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
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
          <div className="col-span-full py-16 text-center studio-card rounded-[20px] border-dashed">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-3 text-indigo-500">
              <ClipboardList className="w-6 h-6" />
            </div>
            <h3 className="text-[17px] font-bold text-slate-900">No voice snippets created yet</h3>
            <p className="text-[14px] text-slate-500 mt-1 max-w-sm mx-auto font-medium">
              Create instant shortcuts for links, email signatures, boilerplate text, or code templates.
            </p>
          </div>
        ) : filteredSnippets.length === 0 ? (
          <div className="col-span-full py-8 text-center studio-card rounded-[20px]">
            <p className="text-slate-500 font-semibold">No snippets matching "{searchQuery}"</p>
          </div>
        ) : (
          filteredSnippets.map(snippet => (
            <div key={snippet.id} className="studio-card-interactive p-5 rounded-[20px] flex flex-col justify-between group relative space-y-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[12.5px] font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg">
                  "{snippet.trigger_phrase}"
                </span>

                <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleCopy(snippet)}
                    className="studio-btn px-2 py-1 rounded-lg text-[12px] font-semibold text-slate-500 hover:text-indigo-600"
                    title="Copy expansion"
                  >
                    {copiedId === snippet.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => handleEdit(snippet)}
                    className="studio-btn px-2 py-1 rounded-lg text-[12px] font-semibold text-slate-500 hover:text-indigo-600"
                    title="Edit snippet"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => removeSnippet(snippet.id)}
                    className="studio-btn px-2 py-1 rounded-lg text-[12px] font-semibold text-slate-500 hover:text-rose-600 hover:border-rose-200"
                    title="Delete snippet"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <p className="text-[14px] text-slate-600 font-mono bg-slate-50 p-2.5 rounded-xl break-all line-clamp-3">
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
  const apiKey = useAppStore(s => s.apiKey);
  const setApiKey = useAppStore(s => s.setApiKey);
  const cerebrasApiKey = useAppStore(s => s.cerebrasApiKey);
  const setCerebrasApiKey = useAppStore(s => s.setCerebrasApiKey);
  const whisperModel = useAppStore(s => s.whisperModel);
  const setWhisperModel = useAppStore(s => s.setWhisperModel);
  const llamaModel = useAppStore(s => s.llamaModel);
  const setLlamaModel = useAppStore(s => s.setLlamaModel);
  const llamaProvider = useAppStore(s => s.llamaProvider);
  const setLlamaProvider = useAppStore(s => s.setLlamaProvider);
  const hotkey = useAppStore(s => s.hotkey);
  const setHotkey = useAppStore(s => s.setHotkey);
  const recomputeStats = useAppStore(s => s.recomputeStats);
  const history = useAppStore(s => s.history);
  const setHistory = useAppStore(s => s.setHistory);

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
      <div className="pb-2">
        <span className="studio-eyebrow">
          <Sliders className="w-3.5 h-3.5 text-indigo-500" />
          Studio Control Center
        </span>
        <h1 className="text-[32px] font-extrabold tracking-[-0.03em] text-slate-900 mt-2 leading-[1.08]">
          Preferences & Hardware
        </h1>
        <p className="text-slate-500 text-[14.5px] mt-1.5 font-medium">
          Configure acoustic speech recognition, real-time AI formatting, API credentials, and global triggers.
        </p>
      </div>

      {/* Studio Engine Readiness & Telemetry Bar */}
      <div className="studio-card p-5 rounded-[20px]">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          {/* Speech-to-Text Acoustic Engine */}
          <div className="flex items-center gap-3 min-w-[200px] flex-1 sm:flex-initial">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 flex-shrink-0">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <span className="studio-eyebrow !text-[9.5px]">Speech-to-Text</span>
              <p className="text-[13.5px] font-bold text-slate-900 mt-0.5 tracking-tight">
                {activeWhisperObj?.label.split(' (')[0] || whisperModel}
              </p>
            </div>
          </div>

          <div className="hidden lg:block h-9 w-px bg-slate-100" />

          {/* Inference Polish */}
          <div className="flex items-center gap-3 min-w-[200px] flex-1 sm:flex-initial">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 flex-shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="studio-eyebrow !text-[9.5px]">Text Polish</span>
              <p className="text-[13.5px] font-bold text-slate-900 mt-0.5 tracking-tight">
                {activeLlmObj?.label.split(' (')[0] || llamaModel}
              </p>
            </div>
          </div>

          <div className="hidden lg:block h-9 w-px bg-slate-100" />

          {/* Hotkey Trigger */}
          <div className="flex items-center gap-3 min-w-[170px] flex-1 sm:flex-initial">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-indigo-500 flex-shrink-0">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <span className="studio-eyebrow !text-[9.5px]">Global Trigger</span>
              <div className="flex items-center gap-1 mt-1">
                {formatHotkeyLabel(hotkey).map((k, i) => (
                  <span key={i} className="keycap text-[11px] px-2 py-0.5">{k}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="hidden lg:block h-9 w-px bg-slate-100" />

          {/* Credential Vault */}
          <div className="flex items-center gap-3 min-w-[150px] flex-1 sm:flex-initial">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              apiKey ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'
            }`}>
              {apiKey ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            </div>
            <div>
              <span className="studio-eyebrow !text-[9.5px]">Credential Vault</span>
              <p className="text-[13.5px] font-bold mt-0.5 tracking-tight">
                {apiKey ? (
                  <span className="text-emerald-600">Groq Ready</span>
                ) : (
                  <span className="text-rose-500">Key Required</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Section 1: Global Shortcut Card */}
      <div className="studio-card p-6 rounded-[20px] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-indigo-500" />
              <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">Global Dictation Hotkey</h3>
            </div>
            <p className="text-[13.5px] text-slate-500 font-medium mt-0.5">
              Press and hold from any active desktop app to capture voice and paste polished text.
            </p>
          </div>
          <button
            onClick={resetHotkey}
            className="studio-btn px-3 py-1.5 rounded-xl text-[12.5px] font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1 self-start sm:self-auto"
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
            className={`w-full py-5 text-center cursor-pointer flex flex-col items-center justify-center gap-2 rounded-2xl border transition-all duration-150 ${
              isRecordingHotkey
                ? 'border-indigo-500 ring-4 ring-indigo-500/10 bg-white shadow-[inset_0_1px_3px_rgba(15,23,42,0.04)]'
                : 'border-dashed border-slate-300 hover:border-slate-400 bg-slate-50/60'
            }`}
          >
            {isRecordingHotkey && capturedKeys.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-[14px] font-semibold text-indigo-600 flex items-center gap-2">
                  <span className="relative flex w-2.5 h-2.5">
                    <span className="absolute inline-flex w-full h-full rounded-full bg-indigo-400 opacity-60 animate-ping" />
                    <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-indigo-600" />
                  </span>
                  Listening for key combo...
                </span>
                <span className="text-[12px] text-slate-400 font-medium">Press modifier + target key simultaneously</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2">
                  {keyDisplayParts.map((k, idx) => (
                    <span key={idx} className="keycap text-[14px] px-3 py-1">{k}</span>
                  ))}
                </div>
                <span className="text-[11.5px] text-slate-400 font-medium">
                  {isRecordingHotkey ? 'Release keys to save' : 'Click here to record a custom shortcut'}
                </span>
              </div>
            )}
          </div>

          {/* Quick Presets Pill Selector */}
          <div>
            <span className="studio-eyebrow !text-[10px] block mb-2">
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
                        ? 'bg-indigo-600 text-white shadow-[0_2px_8px_rgba(79,70,229,0.3)]'
                        : 'studio-btn text-slate-600 hover:text-indigo-600'
                    }`}
                  >
                    <span>{preset.label}</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'
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
        <div className="studio-card p-6 rounded-[20px] flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Mic className="w-4 h-4 text-amber-500" />
                <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">Acoustic Recognition</h3>
              </div>
              <span className="text-[10px] font-mono font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                Groq LPU
              </span>
            </div>
            <p className="text-[13.5px] text-slate-500 font-medium">
              Whisper speech-to-text model for instantaneous, sub-second transcription.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <label className="studio-eyebrow !text-[10px] block">
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
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {isCustomWhisperMode && (
              <div className="animate-fade-in pt-1">
                <label className="block text-[12px] font-semibold text-slate-500 mb-1">Custom Model Identifier</label>
                <input
                  type="text"
                  value={whisperModel}
                  onChange={(e) => setWhisperModel(e.target.value.trim())}
                  placeholder="e.g. whisper-large-v3-turbo"
                  className="studio-input w-full font-mono text-[13px]"
                />
              </div>
            )}

            <div className="p-2.5 rounded-xl bg-slate-50 text-[12px] text-slate-500 font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              <span>Recommended: <strong className="text-slate-700">Whisper Turbo</strong> for sub-200ms latency.</span>
            </div>
          </div>
        </div>

        {/* Inference Engine & Provider */}
        <div className="studio-card p-6 rounded-[20px] flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">AI Formatting & Polish</h3>
              </div>
              <span className="text-[10px] font-mono font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                Text Refinement
              </span>
            </div>
            <p className="text-[13.5px] text-slate-500 font-medium">
              Cleans filler words, fixes punctuation, and expands voice snippet triggers.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <label className="studio-eyebrow !text-[10px] block">
              Inference Provider
            </label>

            {/* Provider Switcher */}
            <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100/80">
              <button
                type="button"
                onClick={() => handleProviderSwitch('groq')}
                className={`py-2 px-3 rounded-lg text-[13px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                  llamaProvider === 'groq'
                    ? 'bg-white text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,0.08)]'
                    : 'text-slate-500 hover:text-slate-800'
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
                    ? 'bg-white text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,0.08)]'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-violet-500" />
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
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {isCustomLlamaMode && (
              <div className="animate-fade-in pt-1">
                <label className="block text-[12px] font-semibold text-slate-500 mb-1">
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

            <div className="p-2.5 rounded-xl bg-slate-50 text-[12px] text-slate-500 font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
              <span>Active: <strong className="text-slate-700">{activeLlmObj?.label.split(' (')[0] || llamaModel}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Provider Credentials Card */}
      <div className="studio-card p-6 rounded-[20px] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-indigo-500" />
            <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">API Key Credentials Vault</h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Encrypted Local Store
          </span>
        </div>

        {/* Groq Key */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold text-slate-900">Groq API Key</span>
              <span className="text-[10px] font-mono font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                Required for Speech
              </span>
            </div>
            <button
              onClick={() => openUrl('https://console.groq.com/keys')}
              className="text-[12.5px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
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
        <div className="space-y-2 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold text-slate-900">Cerebras API Key</span>
              <span className="text-[10px] font-mono font-semibold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full">
                Optional LLM Provider
              </span>
            </div>
            <button
              onClick={() => openUrl('https://cloud.cerebras.ai/')}
              className="text-[12.5px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
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

        <div className="p-3 rounded-xl bg-slate-50 text-[12px] text-slate-500 font-medium flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <span>API keys are stored strictly in your local app configuration and never uploaded to third-party servers.</span>
        </div>
      </div>

      {/* Section 5: Software Updates & System Diagnostics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Updates Card */}
        <div className="studio-card p-6 rounded-[20px] flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-indigo-500" />
              <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">Software Updates</h3>
            </div>
            <p className="text-[13.5px] text-slate-500 font-medium mt-0.5">
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
                className="studio-btn px-4 py-2 rounded-xl text-[13px] font-semibold text-slate-500 hover:text-slate-900"
              >
                View Changelog
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50">
              <p className="text-[13px] text-slate-500 font-medium">
                Installed Version: <span className="telemetry-badge text-slate-900">v{updateInfo?.currentVersion ?? '0.0.12'}</span>
              </p>

              {updateStatus === 'current' && updateInfo && (
                <p className="text-[12.5px] text-emerald-600 font-bold mt-1.5 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> VoxDrop is up to date ({updateInfo.latestVersion ?? updateInfo.currentVersion}).
                </p>
              )}

              {updateStatus === 'available' && updateInfo && (
                <div className="mt-2 space-y-2">
                  <p className="text-[13px] font-bold text-amber-600">
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
                <p className="text-[12.5px] font-semibold text-rose-500 mt-1">
                  {updateError || 'Unable to connect to update server.'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Local Storage & Diagnostics */}
        <div className="studio-card p-6 rounded-[20px] flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-indigo-500" />
              <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">Diagnostics & Storage</h3>
            </div>
            <p className="text-[13.5px] text-slate-500 font-medium mt-0.5">
              Maintain audit logs and recompute telemetry metrics across past sessions.
            </p>
          </div>

          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-slate-50 space-y-2.5">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-500 font-medium">Logged Transcripts:</span>
                <span className="telemetry-badge text-slate-900">{history.length} items</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-500 font-medium">Database Health:</span>
                <span className="text-[10.5px] font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                  Optimal
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                onClick={handleRecomputeStats}
                className="studio-btn px-4 py-2 rounded-xl text-[12.5px] font-semibold text-slate-600 hover:text-indigo-600 flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Recompute Stats
              </button>

              {history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className={`px-4 py-2 rounded-xl text-[12.5px] font-bold transition-all flex items-center gap-1.5 ${
                    confirmClearHistory
                      ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-300'
                      : 'studio-btn text-slate-500 hover:text-rose-600 hover:border-rose-200'
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

