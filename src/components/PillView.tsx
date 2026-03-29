import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { useAppStore } from '../store';
import { transcribeAudio, cleanupText } from '../lib/groq';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type PillState = 'hidden' | 'listening' | 'processing' | 'done' | 'error';

const BAR_COUNT = 14;
const POLL_INTERVAL = 33;
const IDLE_BAR_HEIGHT = 4;
const MAX_BAR_HEIGHT = 22;
const NOISE_FLOOR = 0.0025;
const MIN_DYNAMIC_PEAK = 0.018;
const SPEECH_GAIN = 3.4;
const PRESENCE_FLOOR = 0.16;

function hidePillWindow() {
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
  const [barHeights, setBarHeights] = useState<number[]>(
    new Array(BAR_COUNT).fill(IDLE_BAR_HEIGHT)
  );

  const pillStateRef = useRef<PillState>(pillState);
  pillStateRef.current = pillState;

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barHistoryRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  const dynamicPeakRef = useRef(MIN_DYNAMIC_PEAK);

  const resetWaveform = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }

    barHistoryRef.current = new Array(BAR_COUNT).fill(0);
    dynamicPeakRef.current = MIN_DYNAMIC_PEAK;
    setBarHeights(new Array(BAR_COUNT).fill(IDLE_BAR_HEIGHT));
  }, []);

  const updateBars = useCallback((rawLevel: number) => {
    const safeLevel = Number.isFinite(rawLevel) ? Math.max(0, rawLevel) : 0;
    const boostedLevel = safeLevel * SPEECH_GAIN;

    dynamicPeakRef.current = Math.max(
      MIN_DYNAMIC_PEAK,
      boostedLevel,
      dynamicPeakRef.current * 0.975
    );

    const normalizedBase =
      boostedLevel <= NOISE_FLOOR
        ? 0
        : Math.min(
            1,
            Math.pow(
              (boostedLevel - NOISE_FLOOR) /
                Math.max(dynamicPeakRef.current - NOISE_FLOOR, 0.001),
              0.58
            )
          );

    const normalized =
      normalizedBase > 0
        ? Math.min(1, PRESENCE_FLOOR + normalizedBase * (1 - PRESENCE_FLOOR))
        : 0;

    const nextHistory = [...barHistoryRef.current.slice(1), normalized];
    barHistoryRef.current = nextHistory;

    setBarHeights(
      nextHistory.map((sample, index) => {
        const previous = nextHistory[index - 1] ?? sample;
        const upcoming = nextHistory[index + 1] ?? sample;
        const blendedSample = sample * 0.62 + previous * 0.19 + upcoming * 0.19;
        const easedSample = Math.pow(blendedSample, 0.92);
        return IDLE_BAR_HEIGHT + easedSample * (MAX_BAR_HEIGHT - IDLE_BAR_HEIGHT);
      })
    );
  }, []);

  useEffect(() => {
    if (pillState !== 'listening') {
      resetWaveform();
      return undefined;
    }

    let cancelled = false;

    const pollAudioLevel = async () => {
      try {
        const level = await invoke<number>('get_audio_level');
        if (!cancelled) {
          updateBars(level);
        }
      } catch {
        if (!cancelled) {
          updateBars(0);
        }
      } finally {
        if (!cancelled) {
          pollTimeoutRef.current = setTimeout(pollAudioLevel, POLL_INTERVAL);
        }
      }
    };

    pollAudioLevel();

    return () => {
      cancelled = true;
      resetWaveform();
    };
  }, [pillState, resetWaveform, updateBars]);

  useEffect(() => {
    if (pillState === 'hidden') {
      hidePillWindow();
    }
  }, [pillState]);

  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;

    listen('settings-changed', async () => {
      if (cancelled) return;
      await useAppStore.persist.rehydrate();
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenFn = fn;
    });

    return () => {
      cancelled = true;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  useEffect(() => {
    let unlistenDown: (() => void) | null = null;
    let unlistenUp: (() => void) | null = null;
    let unlistenMute: (() => void) | null = null;
    let cancelled = false;
    let didMute = false;

    const setup = async () => {
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

      let recordingStartTime = 0;

      unlistenMute = await listen<boolean>('audio-muted', (event) => {
        didMute = event.payload;
      });

      unlistenDown = await listen('shortcut-down', async () => {
        if (pillStateRef.current === 'listening') return; // Prevent key repeat from resetting the timer
        
        const apiKey = useAppStore.getState().apiKey;

        if (!apiKey) {
          setPillState('error');
          setStatusMsg('API Key missing - set it in Settings');
          setTimeout(() => {
            setPillState('hidden');
          }, 3000);
          return;
        }

        setPillState('listening');
        setStatusMsg('Listening...');
        recordingStartTime = Date.now();

        // Recording and muting are now handled directly in Rust for speed.
      });

      unlistenUp = await listen('shortcut-up', async () => {
        if (pillStateRef.current !== 'listening') return;

        const rawDuration = recordingStartTime > 0 ? (Date.now() - recordingStartTime) / 1000 : 0;
        // Enforce a minimum of 0.5 seconds so extremely short dictations don't evaluate to 0
        const recordingDurationSeconds = Math.max(rawDuration, 0.5);

        setPillState('processing');
        setStatusMsg('Transcribing...');

        invoke('unmute_system', { didMute }).catch(() => {});

        try {
          const base64Audio: string = await invoke('stop_recording');

          const { apiKey, whisperModel, llamaModel } = useAppStore.getState();

          const rawText = await transcribeAudio(base64Audio, apiKey, whisperModel);

          if (!rawText || rawText.trim().length === 0) {
            setPillState('hidden');
            return;
          }

          setStatusMsg('Cleaning up...');
          let cleanText = await cleanupText(rawText, apiKey, llamaModel);

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

          const historyItem = {
            id: Date.now(),
            transcript: cleanText,
            duration_seconds: recordingDurationSeconds,
            created_at: new Date().toISOString(),
          };

          useAppStore.getState().addHistoryItem(historyItem);
          await emit('history-update', historyItem);
          await invoke('paste_text', { text: cleanText });

          setPillState('done');
          setStatusMsg(cleanText.substring(0, 40) + (cleanText.length > 40 ? '...' : ''));
          setTimeout(() => {
            setPillState('hidden');
          }, 1800);
        } catch (err: unknown) {
          setPillState('error');
          setStatusMsg(describeProcessingError(err));
          setTimeout(() => {
            setPillState('hidden');
          }, 3000);
        }
      });
    };

    setup();

    return () => {
      cancelled = true;
      unlistenDown?.();
      unlistenUp?.();
      unlistenMute?.();
    };
  }, []);

  return (
    <AnimatePresence>
      {pillState !== 'hidden' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 400 }}
          className="w-full h-full bg-white/95 backdrop-blur-md flex items-center px-4 gap-3 relative overflow-hidden rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)]"
          style={{ height: '48px', borderRadius: '24px' }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-50/50 via-violet-50/50 to-fuchsia-50/50 rounded-full pointer-events-none" />

          <div className="relative z-10 flex items-center w-full gap-3">
            <div
              className={`flex items-center justify-center shrink-0 border ${
                pillState === 'listening'
                  ? 'h-10 min-w-[78px] rounded-full px-3 border-rose-100 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.8),transparent_55%),linear-gradient(135deg,rgba(244,63,94,0.05),rgba(251,146,60,0.05))] shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_4px_12px_rgba(244,63,94,0.1)]'
                  : 'w-10 h-10 rounded-full bg-gray-50 border-gray-100 shadow-sm'
              }`}
            >
              {pillState === 'listening' && (
                <div className="flex items-center gap-2 h-6 w-full">
                  <motion.div
                    animate={{ opacity: [0.5, 1, 0.5], scale: [0.94, 1, 0.94] }}
                    transition={{ repeat: Infinity, duration: 1.25, ease: 'easeInOut' }}
                    className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)] shrink-0"
                  />

                  <div className="flex items-center gap-[2px] h-6 flex-1">
                    {barHeights.map((height, index) => (
                      <motion.div
                        key={index}
                        animate={{ height: `${height}px`, opacity: 0.48 + (height / MAX_BAR_HEIGHT) * 0.52 }}
                        transition={{ duration: 0.11, ease: [0.22, 1, 0.36, 1] }}
                        className="w-[2px] rounded-full bg-gradient-to-t from-rose-500 to-amber-400 shadow-sm"
                      />
                    ))}
                  </div>
                </div>
              )}

              {pillState === 'processing' && (
                <div className="flex gap-1.5">
                  {[...Array(3)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                      transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                      className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.4)]"
                    />
                  ))}
                </div>
              )}

              {pillState === 'done' && (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 drop-shadow-sm" />
              )}
              {pillState === 'error' && (
                <AlertTriangle className="w-5 h-5 text-rose-500 drop-shadow-sm" />
              )}
            </div>

            <div className="flex-1 min-w-0 pr-2">
              <AnimatePresence mode="wait">
                <motion.span
                  key={statusMsg}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="block text-[15px] font-bold text-gray-800 truncate tracking-wide"
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
