import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { DEFAULT_MODEL, DEFAULT_WHISPER_MODEL, type LLMProvider } from './lib/api';
import { countWords } from './lib/textCleanup';

export type { LLMProvider };

export interface Snippet {
  id: number;
  trigger_phrase: string;
  expansion: string;
  created_at: string;
}

export interface HistoryItem {
  id: number;
  transcript: string;
  duration_seconds: number;
  created_at: string;
  words?: number;
  /** How the text was cleaned: by the AI model or by local rules. */
  method?: 'ai' | 'basic';
}

export interface Lifetime {
  words: number;
  seconds: number;
  dictations: number;
}

/** Kept in full; totals and streaks use the lifetime counters instead. */
const MAX_HISTORY_ITEMS = 500;
export const DEFAULT_HOTKEY = 'Control+Super';
const STORAGE_KEY = 'voxdrop-storage';

// Models no longer served (requests against them 404). Old installs that
// picked one are moved to the provider's default.
const RETIRED_MODELS = new Set([
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'llama3-8b-8192',
  'llama3-70b-8192',
  'groq/compound-mini',
  'llama-3.3-70b',
  'llama3.1-8b',
  'qwen/qwen3.6-27b',
  'qwen3.6-27b',
  'gemma-4-31b',
]);

export const getWeekIndex = (dateString: string) => {
  const date = new Date(dateString);
  const sunday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
  return Math.floor(sunday.getTime() / (7 * 24 * 60 * 60 * 1000));
};

/** Enough to tell whether the saved key changed, without storing it twice. */
export const keyFingerprint = (key: string) => {
  const trimmed = key.trim();
  return trimmed ? `${trimmed.length}:${trimmed.slice(-6)}` : '';
};

const wordsOf = (item: HistoryItem) => item.words ?? countWords(item.transcript);

interface AppState {
  apiKey: string;
  cerebrasApiKey: string;
  whisperModel: string;
  /** ISO-639-1 code; '' lets Whisper detect the language. */
  language: string;
  polishEnabled: boolean;
  llamaProvider: LLMProvider;
  llamaModel: string;
  hotkey: string;
  soundEffects: boolean;
  /** Keep the microphone open between dictations, so recording starts on press. */
  instantStart: boolean;
  /** Fingerprints of keys that passed "Test key". */
  verifiedKeys: Partial<Record<LLMProvider, string>>;
  snippets: Snippet[];
  history: HistoryItem[];
  lifetime: Lifetime;
  activeWeeks: number[];

  setApiKey: (key: string) => void;
  setCerebrasApiKey: (key: string) => void;
  setWhisperModel: (model: string) => void;
  setLanguage: (language: string) => void;
  setPolishEnabled: (enabled: boolean) => void;
  setProviderAndModel: (provider: LLMProvider, model: string) => void;
  setLlamaModel: (model: string) => void;
  setHotkey: (hotkey: string) => void;
  setSoundEffects: (enabled: boolean) => void;
  setInstantStart: (enabled: boolean) => void;
  markKeyVerified: (provider: LLMProvider, key: string, ok: boolean) => void;
  addSnippet: (snippet: Snippet) => void;
  updateSnippet: (id: number, snippet: Partial<Snippet>) => void;
  removeSnippet: (id: number) => void;
  addHistoryItem: (item: HistoryItem) => void;
  removeHistoryItem: (id: number) => void;
  restoreHistory: (items: HistoryItem[]) => void;
  clearHistory: () => void;
}

/** localStorage can throw (quota, disabled storage); never let that break a dictation. */
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch (err) {
      console.error('[store] could not save:', err);
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Dev convenience only: a key in .env must never be baked into a release.
      apiKey: import.meta.env.DEV ? (import.meta.env.VITE_GROQ_API_KEY ?? '') : '',
      cerebrasApiKey: import.meta.env.DEV ? (import.meta.env.VITE_CEREBRAS_API_KEY ?? '') : '',
      whisperModel: DEFAULT_WHISPER_MODEL,
      language: 'en',
      polishEnabled: true,
      llamaProvider: 'groq',
      llamaModel: DEFAULT_MODEL.groq,
      hotkey: DEFAULT_HOTKEY,
      soundEffects: true,
      instantStart: false,
      verifiedKeys: {},
      snippets: [],
      history: [],
      lifetime: { words: 0, seconds: 0, dictations: 0 },
      activeWeeks: [],

      setApiKey: (apiKey) => set({ apiKey }),
      setCerebrasApiKey: (cerebrasApiKey) => set({ cerebrasApiKey }),
      setWhisperModel: (whisperModel) => set({ whisperModel }),
      setLanguage: (language) => set({ language }),
      setPolishEnabled: (polishEnabled) => set({ polishEnabled }),
      setProviderAndModel: (llamaProvider, llamaModel) => set({ llamaProvider, llamaModel }),
      setLlamaModel: (llamaModel) => set({ llamaModel }),
      setHotkey: (hotkey) => set({ hotkey }),
      setSoundEffects: (soundEffects) => set({ soundEffects }),
      setInstantStart: (instantStart) => set({ instantStart }),
      markKeyVerified: (provider, key, ok) =>
        set((state) => ({
          verifiedKeys: { ...state.verifiedKeys, [provider]: ok ? keyFingerprint(key) : undefined },
        })),

      addSnippet: (snippet) => set((state) => ({ snippets: [...state.snippets, snippet] })),
      updateSnippet: (id, patch) =>
        set((state) => ({ snippets: state.snippets.map((s) => (s.id === id ? { ...s, ...patch } : s)) })),
      removeSnippet: (id) => set((state) => ({ snippets: state.snippets.filter((s) => s.id !== id) })),

      addHistoryItem: (item) =>
        set((state) => {
          if (state.history.some((entry) => entry.id === item.id)) return {};
          const words = wordsOf(item);
          const week = getWeekIndex(item.created_at);
          return {
            history: [{ ...item, words }, ...state.history].slice(0, MAX_HISTORY_ITEMS),
            lifetime: {
              words: state.lifetime.words + words,
              seconds: state.lifetime.seconds + Math.max(0, item.duration_seconds || 0),
              dictations: state.lifetime.dictations + 1,
            },
            activeWeeks: state.activeWeeks.includes(week) ? state.activeWeeks : [...state.activeWeeks, week],
          };
        }),
      // Deleting a transcript is about privacy, not rewriting the past:
      // lifetime totals and streaks keep counting it.
      removeHistoryItem: (id) => set((state) => ({ history: state.history.filter((item) => item.id !== id) })),
      restoreHistory: (items) =>
        set((state) => {
          const present = new Set(state.history.map((entry) => entry.id));
          const missing = items.filter((item) => !present.has(item.id));
          if (!missing.length) return {};
          return {
            history: [...state.history, ...missing].sort((a, b) => b.id - a.id).slice(0, MAX_HISTORY_ITEMS),
          };
        }),
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: STORAGE_KEY,
      version: 3,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        apiKey: state.apiKey,
        cerebrasApiKey: state.cerebrasApiKey,
        whisperModel: state.whisperModel,
        language: state.language,
        polishEnabled: state.polishEnabled,
        llamaProvider: state.llamaProvider,
        llamaModel: state.llamaModel,
        hotkey: state.hotkey,
        soundEffects: state.soundEffects,
        instantStart: state.instantStart,
        verifiedKeys: state.verifiedKeys,
        snippets: state.snippets,
        history: state.history,
        lifetime: state.lifetime,
        activeWeeks: state.activeWeeks,
      }),
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Record<string, any>;
        if (version < 2) {
          const history: HistoryItem[] = Array.isArray(state.history) ? state.history : [];
          state.history = history.map((item) => ({ ...item, words: wordsOf(item) }));
          state.lifetime = {
            words: Math.max(Number(state.totalWordsAllTime) || 0, history.reduce((n, i) => n + wordsOf(i), 0)),
            seconds: Math.max(
              Number(state.totalDurationAllTime) || 0,
              history.reduce((n, i) => n + Math.max(0, Number(i.duration_seconds) || 0), 0),
            ),
            dictations: history.length,
          };
          const weeks = new Set<number>(Array.isArray(state.activeWeeks) ? state.activeWeeks : []);
          history.forEach((item) => item.created_at && weeks.add(getWeekIndex(item.created_at)));
          state.activeWeeks = [...weeks];
          delete state.totalWordsAllTime;
          delete state.totalDurationAllTime;
        }
        // gpt-oss-20b was the old default; users who never chose it get the faster model.
        if (version < 3 && state.llamaProvider !== 'cerebras' && (!state.llamaModel || state.llamaModel === 'openai/gpt-oss-20b')) {
          state.llamaModel = DEFAULT_MODEL.groq;
        }
        const provider: LLMProvider = state.llamaProvider === 'cerebras' ? 'cerebras' : 'groq';
        state.llamaProvider = provider;
        if (!state.llamaModel || RETIRED_MODELS.has(state.llamaModel)) state.llamaModel = DEFAULT_MODEL[provider];
        return state as AppState;
      },
      // migrate only runs when the stored version changes, so a retired model
      // saved under the current version is caught here. Mutate in place: calling
      // setState during rehydration stalls startup on the splash screen.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (RETIRED_MODELS.has(state.llamaModel)) state.llamaModel = DEFAULT_MODEL[state.llamaProvider];
      },
    },
  ),
);

/**
 * The dashboard and the pill are separate webviews with separate copies of
 * this store over one localStorage entry. Re-read whenever the other window
 * writes, so neither saves a stale copy over the other's changes.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) void useAppStore.persist.rehydrate();
  });
}

/** Resolves once persisted state is loaded (bounded, in case storage is broken). */
export function whenHydrated(): Promise<void> {
  if (useAppStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, 1500);
    const unsubscribe = useAppStore.persist.onFinishHydration(() => {
      window.clearTimeout(timer);
      unsubscribe();
      resolve();
    });
  });
}
