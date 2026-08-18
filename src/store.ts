import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface Snippet {
  id: number;
  trigger_phrase: string;
  expansion: string;
  created_at: string;
}

interface HistoryItem {
  id: number;
  transcript: string;
  duration_seconds: number;
  created_at: string;
}

const MAX_HISTORY_ITEMS = 100;
export const DEFAULT_HOTKEY = 'Control+Super';

export const getWeekIndex = (dateString: string) => {
  const date = new Date(dateString);
  const sunday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
  sunday.setHours(0, 0, 0, 0);
  return Math.floor(sunday.getTime() / (7 * 24 * 60 * 60 * 1000));
};

export type LLMProvider = 'groq' | 'cerebras';

interface AppState {
  apiKey: string;
  cerebrasApiKey: string;
  whisperModel: string;
  llamaModel: string;
  llamaProvider: LLMProvider;
  hotkey: string;
  isRecording: boolean;
  isProcessing: boolean;
  statusMessage: string;
  snippets: Snippet[];
  history: HistoryItem[];
  activeWeeks: number[];
  totalWordsAllTime: number;
  totalDurationAllTime: number;
  
  setApiKey: (key: string) => void;
  setCerebrasApiKey: (key: string) => void;
  setWhisperModel: (model: string) => void;
  setLlamaModel: (model: string) => void;
  setLlamaProvider: (provider: LLMProvider) => void;
  setHotkey: (hotkey: string) => void;
  setIsRecording: (recording: boolean) => void;
  setIsProcessing: (processing: boolean) => void;
  setStatusMessage: (msg: string) => void;
  setSnippets: (snippets: Snippet[]) => void;
  addSnippet: (snippet: Snippet) => void;
  updateSnippet: (id: number, snippet: Partial<Snippet>) => void;
  removeSnippet: (id: number) => void;
  setHistory: (history: HistoryItem[]) => void;
  addHistoryItem: (item: HistoryItem) => void;
  removeHistoryItem: (id: number) => void;
  recomputeStats: () => void;
}

const computeStatsFromHistory = (history: HistoryItem[]) => {
  let words = 0;
  let duration = 0;
  const weekSet = new Set<number>();

  for (const item of history) {
    if (!item.transcript) continue;
    const itemWords = item.transcript.trim().split(/\s+/).filter(w => w.length > 0).length;
    words += itemWords;
    duration += Math.max(Number(item.duration_seconds) || 0, 0);
    if (item.created_at) {
      weekSet.add(getWeekIndex(item.created_at));
    }
  }

  return {
    totalWordsAllTime: words,
    totalDurationAllTime: duration,
    activeWeeks: Array.from(weekSet),
  };
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      apiKey: import.meta.env.VITE_GROQ_API_KEY ?? '',
      cerebrasApiKey: import.meta.env.VITE_CEREBRAS_API_KEY ?? '',
      whisperModel: 'whisper-large-v3-turbo',
      llamaModel: 'openai/gpt-oss-20b',
      llamaProvider: 'groq',
      hotkey: DEFAULT_HOTKEY,
      isRecording: false,
      isProcessing: false,
      statusMessage: '',
      snippets: [],
      history: [],
      activeWeeks: [],
      totalWordsAllTime: 0,
      totalDurationAllTime: 0,

      setApiKey: (key) => set({ apiKey: key }),
      setCerebrasApiKey: (key) => set({ cerebrasApiKey: key }),
      setWhisperModel: (model) => set({ whisperModel: model }),
      setLlamaModel: (model) => set({ llamaModel: model }),
      setLlamaProvider: (provider) => set({ llamaProvider: provider }),
      setHotkey: (hotkey) => set({ hotkey }),
      setIsRecording: (recording) => set({ isRecording: recording }),
      setIsProcessing: (processing) => set({ isProcessing: processing }),
      setStatusMessage: (msg) => set({ statusMessage: msg }),
      setSnippets: (snippets) => set({ snippets }),
      addSnippet: (snippet) => set((state) => ({ snippets: [...state.snippets, snippet] })),
      updateSnippet: (id, updatedSnippet) => set((state) => ({
        snippets: state.snippets.map(s => s.id === id ? { ...s, ...updatedSnippet } : s)
      })),
      removeSnippet: (id) => set((state) => ({ snippets: state.snippets.filter(s => s.id !== id) })),
      setHistory: (history) => set(() => {
        const stats = computeStatsFromHistory(history);
        return {
          history,
          ...stats,
        };
      }),
      removeHistoryItem: (id) => set((state) => {
        const updated = state.history.filter(item => item.id !== id);
        const stats = computeStatsFromHistory(updated);
        return {
          history: updated,
          ...stats,
        };
      }),
      recomputeStats: () => set((state) => {
        const stats = computeStatsFromHistory(state.history);
        return { ...stats };
      }),
      addHistoryItem: (item) => set((state) => {
        const dedupedHistory = state.history.filter((entry) => entry.id !== item.id);
        const newHistory = [item, ...dedupedHistory].slice(0, MAX_HISTORY_ITEMS);
        const stats = computeStatsFromHistory(newHistory);

        return {
          history: newHistory,
          ...stats,
        };
      }),
    }),
    {
      name: 'voxdrop-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        if (
          state.llamaModel === 'llama-3.1-8b-instant' ||
          state.llamaModel === 'llama-3.3-70b-versatile' ||
          state.llamaModel === 'llama3-8b-8192' ||
          state.llamaModel === 'llama3-70b-8192' ||
          state.llamaModel === 'groq/compound-mini' ||
          state.llamaModel === 'llama-3.3-70b' ||
          state.llamaModel === 'llama3.1-8b'
        ) {
          state.llamaModel =
            state.llamaProvider === 'cerebras' ? 'gemma-4-31b' : 'openai/gpt-oss-20b';
        }
        if (!state.llamaProvider) {
          state.llamaProvider = 'groq';
        }

        const recomputed = computeStatsFromHistory(state.history || []);
        state.totalWordsAllTime = recomputed.totalWordsAllTime;
        state.totalDurationAllTime = recomputed.totalDurationAllTime;
        state.activeWeeks = recomputed.activeWeeks;
      },
      partialize: (state) => ({ 
        apiKey: state.apiKey,
        cerebrasApiKey: state.cerebrasApiKey,
        whisperModel: state.whisperModel, 
        llamaModel: state.llamaModel,
        llamaProvider: state.llamaProvider,
        hotkey: state.hotkey,
        snippets: state.snippets,
        history: state.history,
        activeWeeks: state.activeWeeks,
        totalWordsAllTime: state.totalWordsAllTime,
        totalDurationAllTime: state.totalDurationAllTime,
      }),
    }
  )
);
