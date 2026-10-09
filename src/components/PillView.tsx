import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { AlertTriangle, Check, Info } from 'lucide-react';
import { useAppStore, whenHydrated } from '../store';
import { DictationError, polish, transcribe, warmUp } from '../lib/api';
import { countWords, expandSnippets } from '../lib/textCleanup';
import { playErrorEarcon, playStartEarcon, playSuccessEarcon, primeAudio } from '../lib/sounds';

type Phase = 'idle' | 'listening' | 'transcribing' | 'polishing' | 'pasting' | 'done' | 'error' | 'notice';

interface View {
  phase: Phase;
  title?: string;
  detail?: string;
}

const BAR_COUNT = 18;
const EXIT_MS = 170;
const STAGES: Phase[] = ['transcribing', 'polishing', 'pasting'];
const STAGE_LABEL: Partial<Record<Phase, string>> = {
  transcribing: 'Transcribing',
  polishing: 'Polishing',
  pasting: 'Pasting',
};

const formatElapsed = (ms: number) => {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** Turn any failure (DictationError, Rust error string, …) into pill copy. */
function describe(err: unknown): { title: string; detail: string } {
  if (err instanceof DictationError) return { title: err.message, detail: err.hint };
  const message = typeof err === 'string' ? err : err instanceof Error ? err.message : '';
  if (/microphone/i.test(message)) return { title: 'Microphone unavailable', detail: 'Check it is connected' };
  return { title: 'Something failed', detail: 'Hold the shortcut and try again' };
}

const hasGroqKey = () => !!useAppStore.getState().apiKey.trim();

function setCapture(enabled: boolean) {
  invoke('set_capture_enabled', { enabled }).catch(() => {});
}

export function PillView() {
  const [view, setView] = useState<View>({ phase: 'idle' });
  const [shown, setShown] = useState(false);

  const phaseRef = useRef<Phase>('idle');
  const startedAt = useRef(0);
  const timers = useRef<number[]>([]);
  const barsRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);

  // Everything below runs from event callbacks, so it reads refs and
  // getState() rather than render-time values.
  const api = useRef({
    clearTimers() {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    },
    show(next: View) {
      api.current.clearTimers();
      phaseRef.current = next.phase;
      setView(next);
      setShown(true);
    },
    hideAfter(ms: number) {
      timers.current.push(
        window.setTimeout(() => {
          setShown(false);
          timers.current.push(
            window.setTimeout(() => {
              phaseRef.current = 'idle';
              setView({ phase: 'idle' });
              emit('pill-hide').catch(() => {});
            }, EXIT_MS),
          );
        }, ms),
      );
    },
    flash(phase: 'error' | 'notice' | 'done', title: string, detail: string, ms: number) {
      api.current.show({ phase, title, detail });
      api.current.hideAfter(ms);
      const { soundEffects } = useAppStore.getState();
      if (soundEffects) (phase === 'done' ? playSuccessEarcon : playErrorEarcon)();
    },
  });

  useEffect(() => {
    const pill = api.current;
    primeAudio();

    whenHydrated().then(() => setCapture(hasGroqKey()));
    // Capture follows the key: no key, no mic and no media pause on press.
    const unsubscribe = useAppStore.subscribe((state, prev) => {
      if (state.apiKey !== prev.apiKey && !STAGES.includes(phaseRef.current)) setCapture(!!state.apiKey.trim());
    });

    const onPress = () => {
      // Rust ignores presses while we work; the pill keeps showing progress.
      if (STAGES.includes(phaseRef.current)) return;
      const state = useAppStore.getState();
      if (!state.apiKey.trim()) {
        pill.flash('notice', 'Add your Groq key to dictate', 'Open VoxDrop from the tray, then Settings', 4500);
        return;
      }
      startedAt.current = Date.now();
      pill.show({ phase: 'listening' });
      if (state.soundEffects) playStartEarcon();
      // Open the connection while the user talks, not after.
      warmUp('groq', state.apiKey);
      if (state.polishEnabled && state.llamaProvider === 'cerebras') warmUp('cerebras', state.cerebrasApiKey);
    };

    const onCancel = () => {
      if (phaseRef.current !== 'listening') return;
      pill.clearTimers();
      pill.hideAfter(0);
    };

    const onRelease = async () => {
      if (phaseRef.current !== 'listening') return;
      const seconds = Math.max((Date.now() - startedAt.current) / 1000, 0.5);
      pill.show({ phase: 'transcribing' });
      setCapture(false);

      try {
        const wav = await invoke<ArrayBuffer>('stop_recording');
        if (!wav || wav.byteLength === 0) {
          pill.flash('notice', "Didn't catch that", 'Hold the shortcut while you speak', 1600);
          return;
        }

        // The dashboard may have changed settings or snippets since we last read.
        await useAppStore.persist.rehydrate();
        const s = useAppStore.getState();
        const raw = await transcribe(wav, s.apiKey, {
          model: s.whisperModel,
          language: s.language,
          vocabulary: s.snippets.map((snippet) => snippet.trigger_phrase),
        });
        if (!raw) {
          pill.flash('notice', "Didn't catch that", 'Speak a little closer to the mic', 1600);
          return;
        }

        if (s.polishEnabled && countWords(raw) > 3) pill.show({ phase: 'polishing' });
        const polished = await polish(raw, {
          enabled: s.polishEnabled,
          provider: s.llamaProvider,
          model: s.llamaModel,
          groqKey: s.apiKey,
          cerebrasKey: s.cerebrasApiKey,
        });
        const text = expandSnippets(polished.text, s.snippets);

        pill.show({ phase: 'pasting' });
        let pasteFailed = false;
        try {
          await invoke('paste_text', { text });
        } catch (err) {
          console.error('[pill] paste failed:', err);
          pasteFailed = true;
        }

        // Save after pasting: the paste is what the user is waiting for.
        useAppStore.getState().addHistoryItem({
          id: Date.now(),
          transcript: text,
          duration_seconds: seconds,
          created_at: new Date().toISOString(),
          method: polished.method,
        });
        emit('history-sync').catch(() => {});

        if (pasteFailed) {
          pill.flash('error', "Couldn't paste", 'Your text is saved in History', 4500);
        } else {
          pill.flash('done', 'Pasted', text.length > 52 ? `${text.slice(0, 50)}…` : text, 1500);
        }
      } catch (err) {
        console.error('[pill] dictation failed:', err);
        const { title, detail } = describe(err);
        pill.flash('error', title, detail, 4500);
      } finally {
        setCapture(hasGroqKey());
      }
    };

    const onMicError = () => {
      pill.flash('error', 'Microphone unavailable', 'Check it is connected and allowed', 4500);
    };

    const subscriptions = [
      listen('shortcut-down', onPress),
      listen('shortcut-up', () => void onRelease()),
      listen('shortcut-cancel', onCancel),
      listen('recording-error', onMicError),
      listen('settings-changed', () => void useAppStore.persist.rehydrate()),
    ];

    return () => {
      unsubscribe();
      pill.clearTimers();
      // listen() resolves asynchronously; unsubscribe whenever it does.
      subscriptions.forEach((pending) => pending.then((unlisten) => unlisten()).catch(() => {}));
    };
  }, []);

  // Level meter and clock. Written straight to the DOM ~30 times a second;
  // routing that through React state re-rendered the whole pill per frame.
  useEffect(() => {
    if (view.phase !== 'listening') return;
    let alive = true;
    let smooth = 0;
    const levels = new Array<number>(BAR_COUNT).fill(0);

    const tick = async () => {
      if (!alive) return;
      let rms = 0;
      try {
        rms = await invoke<number>('get_audio_level');
      } catch {
        /* treat as silence */
      }
      if (!alive) return;
      // Absolute dBFS scale: room noise stays low, speech fills the meter,
      // loud speech doesn't look the same as quiet speech.
      const db = 20 * Math.log10(Math.max(rms, 1e-6));
      const target = Math.min(1, Math.max(0, (db + 54) / 40));
      smooth += (target - smooth) * (target > smooth ? 0.6 : 0.2);
      levels.shift();
      levels.push(smooth);

      const bars = barsRef.current?.children;
      if (bars) {
        for (let i = 0; i < bars.length; i++) {
          (bars[i] as HTMLElement).style.transform = `scaleY(${(0.14 + levels[i] * 0.86).toFixed(3)})`;
        }
      }
      if (clockRef.current) clockRef.current.textContent = formatElapsed(Date.now() - startedAt.current);
      window.setTimeout(tick, 33);
    };
    void tick();
    return () => {
      alive = false;
    };
  }, [view.phase]);

  if (view.phase === 'idle') return <div role="status" aria-live="polite" className="sr-only" />;

  const stageIndex = STAGES.indexOf(view.phase);
  const statusText =
    view.phase === 'listening'
      ? 'Listening'
      : stageIndex >= 0
        ? `${STAGE_LABEL[view.phase]}…`
        : [view.title, view.detail].filter(Boolean).join('. ');

  return (
    <div className="pill-stage">
      <div role="status" aria-live={view.phase === 'error' ? 'assertive' : 'polite'} className="sr-only">
        {statusText}
      </div>

      <div className={`pill ${shown ? 'pill-in' : 'pill-out'}`} data-phase={view.phase} aria-hidden="true">
        {view.phase === 'listening' && (
          <>
            <span className="pill-rec" />
            <div ref={barsRef} className="pill-meter">
              {Array.from({ length: BAR_COUNT }, (_, i) => (
                <span key={i} />
              ))}
            </div>
            <span ref={clockRef} className="pill-clock">
              0:00
            </span>
          </>
        )}

        {stageIndex >= 0 && (
          <>
            <div className="pill-steps">
              {STAGES.map((stage, i) => (
                <span key={stage} data-state={i < stageIndex ? 'done' : i === stageIndex ? 'active' : 'todo'} />
              ))}
            </div>
            <span className="pill-title">{STAGE_LABEL[view.phase]}</span>
          </>
        )}

        {(view.phase === 'done' || view.phase === 'error' || view.phase === 'notice') && (
          <>
            <span className="pill-icon">
              {view.phase === 'done' ? (
                <Check className="h-4 w-4" strokeWidth={2.6} />
              ) : view.phase === 'error' ? (
                <AlertTriangle className="h-4 w-4" strokeWidth={2.2} />
              ) : (
                <Info className="h-4 w-4" strokeWidth={2.2} />
              )}
            </span>
            <span className="pill-text">
              <span className="pill-title">{view.title}</span>
              {view.detail && <span className="pill-detail">{view.detail}</span>}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
