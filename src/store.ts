import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

interface AppState {
  apiKey: string;
  whisperModel: string;
  llamaModel: string;
  hotkey: string;
  isRecording: boolean;
  isProcessing: boolean;
  statusMessage: string;
  snippets: Snippet[];
  history: HistoryItem[];
  
  setApiKey: (key: string) => void;
  setWhisperModel: (model: string) => void;
  setLlamaModel: (model: string) => void;
  setHotkey: (hotkey: string) => void;
  setIsRecording: (recording: boolean) => void;
  setIsProcessing: (processing: boolean) => void;
  setStatusMessage: (msg: string) => void;
  setSnippets: (snippets: Snippet[]) => void;
  addSnippet: (snippet: Snippet) => void;
  removeSnippet: (id: number) => void;
  setHistory: (history: HistoryItem[]) => void;
  addHistoryItem: (item: HistoryItem) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      apiKey: import.meta.env.VITE_GROQ_API_KEY ?? '',
      whisperModel: 'whisper-large-v3-turbo',
      llamaModel: 'llama-3.1-8b-instant',
      hotkey: 'Control+Shift+Space',
      isRecording: false,
      isProcessing: false,
      statusMessage: '',
      snippets: [],
      history: [],

      setApiKey: (key) => set({ apiKey: key }),
      setWhisperModel: (model) => set({ whisperModel: model }),
      setLlamaModel: (model) => set({ llamaModel: model }),
      setHotkey: (hotkey) => set({ hotkey }),
      setIsRecording: (recording) => set({ isRecording: recording }),
      setIsProcessing: (processing) => set({ isProcessing: processing }),
      setStatusMessage: (msg) => set({ statusMessage: msg }),
      setSnippets: (snippets) => set({ snippets }),
      addSnippet: (snippet) => set((state) => ({ snippets: [...state.snippets, snippet] })),
      removeSnippet: (id) => set((state) => ({ snippets: state.snippets.filter(s => s.id !== id) })),
      setHistory: (history) => set({ history }),
      addHistoryItem: (item) => set((state) => ({ history: [item, ...state.history] })),
    }),
    {
      name: 'voxdrop-storage',
      partialize: (state) => ({ 
        apiKey: state.apiKey, 
        whisperModel: state.whisperModel, 
        llamaModel: state.llamaModel,
        snippets: state.snippets,
      }),
    }
  )
);
