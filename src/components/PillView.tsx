import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { useAppStore } from '../store';
import { transcribeAudio, cleanupText } from '../lib/groq';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type PillState = 'hidden' | 'listening' | 'processing' | 'done' | 'error';

function hidePillWindow() {
  // Emit event to Rust so IT hides the window — more reliable than JS window.hide()
  emit('pill-hide').catch(() => {});
}

function describeProcessingError(err: unknown): string {
  if (!(err instanceof Error)) {
    return 'Processing failed';
  }

  const message = err.message.trim();
  if (!message) {
    return 'Processing failed';
  }

  if (message.includes('429')) return 'Rate limit hit';
  if (/401|invalid api key|unauthorized/i.test(message)) return 'Invalid API key';
  if (/failed to fetch|networkerror|network request failed/i.test(message)) return 'Network error';

  return message.length > 56 ? `${message.slice(0, 53)}...` : message;
}

export function PillView() {
  const [pillState, setPillState] = useState<PillState>('hidden');
  const [statusMsg, setStatusMsg] = useState('');
  
  // Use a ref so event listeners always see the latest state
  const pillStateRef = useRef<PillState>(pillState);
  pillStateRef.current = pillState;

  // Hide window whenever state becomes hidden
  useEffect(() => {
    if (pillState === 'hidden') {
      hidePillWindow();
    }
  }, [pillState]);

  // Listen for settings changes from the main window and rehydrate store
  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;
    
    listen('settings-changed', async () => {
      if (cancelled) return;
      // Force zustand persist to pull fresh data from localStorage
      await useAppStore.persist.rehydrate();
    }).then(fn => {
      if (cancelled) fn();
      else unlistenFn = fn;
    });

    return () => {
      cancelled = true;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  // Set up event listeners ONCE — but only AFTER the persisted store has rehydrated
  useEffect(() => {
    let unlistenDown: (() => void) | null = null;
    let unlistenUp: (() => void) | null = null;
    let cancelled = false;

    const setup = async () => {
      // Wait for zustand-persist to finish loading from localStorage
      await new Promise<void>((resolve) => {
        if (useAppStore.persist.hasHydrated()) {
          resolve();
        } else {
          const unsub = useAppStore.persist.onFinishHydration(() => {
            unsub();
            resolve();
          });
        }
      });

      if (cancelled) return;

      // Now listeners are safe — apiKey will be available via getState()
      unlistenDown = await listen('shortcut-down', async () => {
        const apiKey = useAppStore.getState().apiKey;
        
        if (!apiKey) {
          setPillState('error');
          setStatusMsg('API Key missing — set it in Settings');
          setTimeout(() => { setPillState('hidden'); }, 3000);
          return;
        }
        
        setPillState('listening');
        setStatusMsg('Listening...');
        
        try {
          await invoke('start_recording');
        } catch (e) {
          setPillState('error');
          setStatusMsg('Mic error');
          setTimeout(() => { setPillState('hidden'); }, 3000);
        }
      });

      unlistenUp = await listen('shortcut-up', async () => {
        // Use ref to get latest state — avoids stale closure
        if (pillStateRef.current !== 'listening') return;
        
        setPillState('processing');
        setStatusMsg('Transcribing...');
        
        try {
          const base64Audio: string = await invoke('stop_recording');
          
          const { apiKey, whisperModel, llamaModel } = useAppStore.getState();
          
          // Transcription
          const rawText = await transcribeAudio(base64Audio, apiKey, whisperModel);
          
          if (!rawText || rawText.trim().length === 0) {
            setPillState('hidden');
            return;
          }

          // Cleanup
          setStatusMsg('Cleaning up...');
          let cleanText = await cleanupText(rawText, apiKey, llamaModel);
          
          // Snippet Expansion — case-insensitive, handles hyphens/periods from cleanup
          const snippets = useAppStore.getState().snippets;
          for (const snippet of snippets) {
            const trigger = snippet.trigger_phrase.toLowerCase();
            const normalizedText = cleanText.toLowerCase().replace(/-/g, '');
            const normalizedTrigger = trigger.replace(/-/g, '');
            if (normalizedText.includes(normalizedTrigger)) {
              const escapedTrigger = snippet.trigger_phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const flexPattern = escapedTrigger.split('').join('-?');
              cleanText = cleanText.replace(new RegExp(flexPattern, 'gi'), snippet.expansion);
            }
          }
          
          // Create history item
          const historyItem = {
            id: Date.now(),
            transcript: cleanText,
            duration_seconds: 0,
            created_at: new Date().toISOString()
          };

          useAppStore.getState().addHistoryItem(historyItem);
          await emit('history-update', historyItem);
          await invoke('paste_text', { text: cleanText });

          setPillState('done');
          setStatusMsg(cleanText.substring(0, 40) + (cleanText.length > 40 ? '...' : ''));
          setTimeout(() => { setPillState('hidden'); }, 1800);

        } catch (err: unknown) {
          setPillState('error');
          setStatusMsg(describeProcessingError(err));
          setTimeout(() => { setPillState('hidden'); }, 3000);
        }
      });
    };

    setup();

    return () => {
      cancelled = true;
      unlistenDown?.();
      unlistenUp?.();
    };
  }, []); // Empty deps — listeners set up once, use refs/getState for current values

  return (
    <AnimatePresence>
      {pillState !== 'hidden' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 400 }}
          className="w-full h-full bg-[#09090b]/90 backdrop-blur-md flex items-center px-4 gap-3 relative overflow-hidden rounded-full shadow-[0_0_40px_rgba(99,102,241,0.15)]"
          style={{ height: '48px', borderRadius: '24px' }}
        >
          {/* Subtle gradient behind the pill text instead of heavy blur */}
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-violet-500/5 to-fuchsia-500/5 rounded-full pointer-events-none" />

          <div className="relative z-10 flex items-center w-full gap-3">
            {/* Status Icon Area */}
            <div className="w-10 h-10 rounded-full bg-white/5 border border-white/5 flex items-center justify-center shrink-0 shadow-inner">
              {pillState === 'listening' && (
                <div className="flex gap-1 items-center h-4">
                  {[...Array(4)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ height: ['4px', '14px', '4px'] }}
                      transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15, ease: "easeInOut" }}
                      className="w-1 bg-red-400 rounded-full shadow-[0_0_10px_rgba(248,113,113,0.6)]" 
                    />
                  ))}
                </div>
              )}
              
              {pillState === 'processing' && (
                <div className="flex gap-1.5">
                  {[...Array(3)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                      transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                      className="w-2 h-2 rounded-full bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.6)]"
                    />
                  ))}
                </div>
              )}

              {pillState === 'done' && <CheckCircle2 className="w-5 h-5 text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]" />}
              {pillState === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400 drop-shadow-[0_0_10px_rgba(251,113,133,0.5)]" />}
            </div>

            {/* Text Area */}
            <div className="flex-1 min-w-0 pr-2">
              <AnimatePresence mode="wait">
                <motion.span 
                  key={statusMsg}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="block text-[15px] font-bold text-zinc-100 truncate tracking-wide"
                >
                  {statusMsg}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
