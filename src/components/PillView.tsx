import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { useAppStore } from '../store';
import { transcribeAudio } from '../lib/groq';
import { cleanupTextWithProvider } from '../lib/inference';
import { playStartEarcon, playSuccessEarcon } from '../lib/sounds';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

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
  const [isVisible, setIsVisible] = useState(false);

  const pillStateRef = useRef<PillState>(pillState);
  pillStateRef.current = pillState;

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barHistoryRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  const dynamicPeakRef = useRef(MIN_DYNAMIC_PEAK);
  const didMuteRef = useRef(false);
  const muteEventSeenRef = useRef(false);
  const cleanupOnMuteEventRef = useRef(false);

  // Track text changes for CSS animation
  const [textKey, setTextKey] = useState(0);

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
      // Delay hiding to allow exit animation
      const t = setTimeout(() => setIsVisible(false), 200);
      hidePillWindow();
      return () => clearTimeout(t);
    } else {
      setIsVisible(true);
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

      const unmuteIfNeeded = () => {
        if (!didMuteRef.current) return;
        invoke('unmute_system', { didMute: true }).catch(() => {});
        didMuteRef.current = false;
        cleanupOnMuteEventRef.current = false;
      };

      const cleanupNativeCapture = () => {
        if (!muteEventSeenRef.current) {
          cleanupOnMuteEventRef.current = true;
        }
        invoke('stop_recording').catch(() => {});
        unmuteIfNeeded();
      };

      unlistenMute = await listen<boolean>('audio-muted', (event) => {
        didMute = event.payload;
        didMuteRef.current = event.payload;
        muteEventSeenRef.current = true;

        if (cleanupOnMuteEventRef.current) {
          cleanupOnMuteEventRef.current = false;
          unmuteIfNeeded();
        }
      });

      unlistenDown = await listen('shortcut-down', async () => {
        if (pillStateRef.current !== 'hidden') {
          cleanupNativeCapture();
          return;
        }

        didMute = false;
        didMuteRef.current = false;
        muteEventSeenRef.current = false;
        cleanupOnMuteEventRef.current = false;
        
        const apiKey = useAppStore.getState().apiKey;

        if (!apiKey) {
          cleanupNativeCapture();
          setPillState('error');
          setStatusMsg('API Key missing - set it in Settings');
          setTextKey(k => k + 1);
          setTimeout(() => {
            setPillState('hidden');
          }, 3000);
          return;
        }

        setPillState('listening');
        setStatusMsg('Listening...');
        setTextKey(k => k + 1);
        recordingStartTime = Date.now();
        playStartEarcon();

        // Recording and muting are now handled directly in Rust for speed.
      });

      unlistenUp = await listen('shortcut-up', async () => {
        if (pillStateRef.current !== 'listening') return;

        const rawDuration = recordingStartTime > 0 ? (Date.now() - recordingStartTime) / 1000 : 0;
        // Enforce a minimum of 0.5 seconds so extremely short dictations don't evaluate to 0
        const recordingDurationSeconds = Math.max(rawDuration, 0.5);

        setPillState('processing');
        setStatusMsg('Transcribing...');
        setTextKey(k => k + 1);

        if (!muteEventSeenRef.current) {
          cleanupOnMuteEventRef.current = true;
        }
        invoke('unmute_system', { didMute }).catch(() => {});
        didMute = false;
        didMuteRef.current = false;

        try {
          const base64Audio: string = await invoke('stop_recording');

          const { apiKey, cerebrasApiKey, whisperModel, llamaModel, llamaProvider } = useAppStore.getState();

          const rawText = await transcribeAudio(base64Audio, apiKey, whisperModel);

          if (!rawText || rawText.trim().length === 0) {
            setPillState('hidden');
            return;
          }

          setStatusMsg('Cleaning up...');
          setTextKey(k => k + 1);
          const activeCleanupKey = llamaProvider === 'cerebras' ? cerebrasApiKey : apiKey;
          let cleanText = await cleanupTextWithProvider(rawText, llamaProvider, activeCleanupKey, llamaModel, apiKey);

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
          await emit('history-sync', historyItem);
          await invoke('paste_text', { text: cleanText });

          playSuccessEarcon();
          setPillState('done');
          setStatusMsg(cleanText.substring(0, 40) + (cleanText.length > 40 ? '...' : ''));
          setTextKey(k => k + 1);
          setTimeout(() => {
            setPillState('hidden');
          }, 1800);
        } catch (err: unknown) {
          setPillState('error');
          setStatusMsg(describeProcessingError(err));
          setTextKey(k => k + 1);
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

  if (!isVisible && pillState === 'hidden') return null;

  const exiting = pillState === 'hidden';

  return (
    <div
      className={`w-full h-full flex items-center px-4 gap-3 relative overflow-hidden rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)] transition-all duration-200 ${
        exiting ? 'pill-exit-active' : 'pill-enter-active'
      }`}
      style={{
        height: '48px',
        borderRadius: '24px',
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(16px) saturate(140%)',
        WebkitBackdropFilter: 'blur(16px) saturate(140%)',
      }}
    >
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(139,92,246,0.06) 50%, rgba(217,70,239,0.06) 100%)',
        }}
      />

      <div className="relative z-10 flex items-center w-full gap-3">
        <div
          className={`flex items-center justify-center shrink-0 border transition-all duration-300 ${
            pillState === 'listening'
              ? 'h-10 min-w-[78px] rounded-full px-3 border-rose-200/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_4px_12px_rgba(244,63,94,0.08)]'
              : 'w-10 h-10 rounded-full bg-white/40 border-white/60 shadow-sm'
          }`}
          style={
            pillState === 'listening'
              ? {
                  background:
                    'radial-gradient(circle at top, rgba(255,255,255,0.85), transparent 55%), linear-gradient(135deg, rgba(244,63,94,0.04), rgba(251,146,60,0.04))',
                }
              : undefined
          }
        >
          {pillState === 'listening' && (
            <div className="flex items-center gap-2 h-6 w-full">
              <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)] shrink-0 listening-dot" />

              <div className="flex items-center gap-[2px] h-6 flex-1">
                {barHeights.map((height, index) => (
                  <div
                    key={index}
                    className="w-[2px] rounded-full bg-gradient-to-t from-rose-500 to-amber-400 shadow-sm waveform-bar"
                    style={{
                      height: `${height}px`,
                      opacity: 0.48 + (height / MAX_BAR_HEIGHT) * 0.52,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {pillState === 'processing' && (
            <div className="flex gap-1.5">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.4)] processing-dot"
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

        <div className="flex-1 min-w-0 pr-2 overflow-hidden">
          <span
            key={textKey}
            className="block text-[15px] font-bold text-gray-800 truncate tracking-wide pill-text-enter-active"
          >
            {statusMsg}
          </span>
        </div>
      </div>
    </div>
  );
}
