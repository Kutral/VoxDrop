import { createContext, memo, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/* ------------------------------------------------------------------ */
/*  Formatting                                                         */
/* ------------------------------------------------------------------ */

export const hotkeyParts = (value: string) =>
  value
    .split('+')
    .filter(Boolean)
    .map((part) => (part === 'Control' ? 'Ctrl' : part === 'Super' ? 'Win' : part));

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds % 60)} s`;
}

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function dayLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString([], {
    weekday: days < 7 ? 'long' : undefined,
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`;

/* ------------------------------------------------------------------ */
/*  Keycaps                                                            */
/* ------------------------------------------------------------------ */

export function Keys({ hotkey, className = '' }: { hotkey: string; className?: string }) {
  const parts = hotkeyParts(hotkey);
  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className}`} aria-label={parts.join(' plus ')}>
      {parts.map((part, i) => (
        <kbd key={i} className="keycap">
          {part}
        </kbd>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Controls                                                           */
/* ------------------------------------------------------------------ */

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-10 flex-none items-center rounded-full border transition-colors duration-150 disabled:opacity-50 ${
        checked ? 'border-ink bg-ink' : 'border-field bg-surface'
      }`}
    >
      <span
        className={`h-4 w-4 rounded-full transition-transform duration-150 ${
          checked ? 'translate-x-[19px] bg-on-ink' : 'translate-x-[3px] bg-mist'
        }`}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-control border border-ink/15 p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={option.disabled}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`min-h-[28px] rounded-[6px] px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
              active ? 'bg-ink text-on-ink' : 'text-ink hover:bg-ink/[0.06]'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Speech strip                                                       */
/* ------------------------------------------------------------------ */

const STRIP_W = 600;
const STRIP_H = 14;

/**
 * A dictation drawn as a length of tape: the line's length is how long you
 * spoke (relative to `maxSeconds`), with one tick per word. Words are spaced
 * evenly; there are no per-word timestamps.
 */
export const SpeechStrip = memo(function SpeechStrip({
  seconds,
  words,
  maxSeconds,
  newest = false,
  reveal = false,
}: {
  seconds: number;
  words: number;
  maxSeconds: number;
  newest?: boolean;
  reveal?: boolean;
}) {
  const length = Math.max(0.06, Math.min(1, seconds / Math.max(maxSeconds, 1))) * STRIP_W;
  const ticks = Math.min(Math.max(words, 1), 160);
  const step = length / (ticks + 1);
  let d = '';
  for (let i = 1; i <= ticks; i++) {
    const x = (i * step).toFixed(1);
    // Every fourth tick is taller, like a tape measure, which keeps long
    // dictations readable.
    const top = i % 4 === 0 ? 1 : 4;
    d += `M${x} ${top}V${STRIP_H - top}`;
  }
  return (
    <svg
      viewBox={`0 0 ${STRIP_W} ${STRIP_H}`}
      preserveAspectRatio="none"
      className={`block h-3.5 w-full ${newest ? 'strip-newest' : ''} ${reveal ? 'strip-reveal' : ''}`}
      aria-hidden="true"
    >
      <line x1="0" x2={length} y1={STRIP_H / 2} y2={STRIP_H / 2} stroke="rgb(var(--line) / 0.16)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d={d} className="strip-tick" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
});

/* ------------------------------------------------------------------ */
/*  Toasts                                                             */
/* ------------------------------------------------------------------ */

interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

const ToastContext = createContext<(toast: Omit<Toast, 'id'>) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((next: Omit<Toast, 'id'>) => {
    window.clearTimeout(timer.current);
    setToast({ ...next, id: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), next.action ? 6000 : 2400);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
        {toast && (
          <div
            key={toast.id}
            className="toast-in pointer-events-auto flex items-center gap-3 rounded-full bg-ink py-2 pl-4 pr-2 text-[13px] text-on-ink shadow-[0_8px_24px_-10px_rgb(0_0_0/0.45)]"
          >
            <span>{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                className="rounded-full px-3 py-1 font-semibold text-on-ink underline-offset-2 hover:underline"
                onClick={() => {
                  toast.action?.run();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            ) : (
              <span className="w-2" />
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

/** Copy to the clipboard and report the real outcome. */
export function useCopy() {
  const toast = useToast();
  return useCallback(
    async (text: string, what = 'Copied') => {
      try {
        await navigator.clipboard.writeText(text);
        toast({ message: what });
      } catch {
        toast({ message: "Couldn't copy. Select the text and press Ctrl+C." });
      }
    },
    [toast],
  );
}

/* ------------------------------------------------------------------ */
/*  Layout                                                             */
/* ------------------------------------------------------------------ */

export function PageHeader({ title, children, aside }: { title: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-title text-ink">{title}</h1>
        {children && <p className="mt-1 max-w-[60ch] text-body text-mist">{children}</p>}
      </div>
      {aside}
    </header>
  );
}
