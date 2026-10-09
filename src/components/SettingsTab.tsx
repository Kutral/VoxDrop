import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Check, ExternalLink, Eye, EyeOff, Loader2, RotateCcw } from 'lucide-react';
import { DEFAULT_HOTKEY, keyFingerprint, useAppStore, type LLMProvider } from '../store';
import { DEFAULT_MODEL, POLISH_MODELS, WHISPER_MODELS, checkKey } from '../lib/api';
import { checkForGitHubUpdate, getInstalledVersion, RELEASES_PAGE_URL, type ReleaseCheckResult } from '../lib/updates';
import { Keys, PageHeader, Segmented, Toggle, hotkeyParts } from './ui';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: '', label: 'Detect automatically' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'nl', label: 'Dutch' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
];

const HOTKEY_PRESETS = ['Control+Super', 'Control+Shift+Space', 'Control+Alt+Space', 'Alt+Shift+D'];

export function SettingsTab() {
  return (
    <div>
      <PageHeader title="Settings">Changes save as you make them.</PageHeader>
      <div className="space-y-10">
        <KeysSection />
        <ShortcutSection />
        <SpeechSection />
        <PolishSection />
        <Section title="Sounds">
          <SoundsRow />
        </Section>
        <UpdatesSection />
        <p className="max-w-[62ch] border-t hairline pt-5 text-caption text-mist">
          Keys and history stay on this computer. Recordings are sent to Groq to be transcribed, and the text to your
          polish provider to be cleaned up. Nothing else leaves your machine.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children, description }: { title: string; children: ReactNode; description?: ReactNode }) {
  return (
    <section>
      <h2 className="text-heading">{title}</h2>
      {description && <p className="mt-1 max-w-[62ch] text-body text-mist">{description}</p>}
      <div className="mt-4 space-y-5">{children}</div>
    </section>
  );
}

function Row({ label, hint, htmlFor, children }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <div className="min-w-[200px] flex-1">
        <label htmlFor={htmlFor} className="label">
          {label}
        </label>
        {hint && <p className="hint mt-0.5">{hint}</p>}
      </div>
      <div className="flex-none">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  API keys                                                           */
/* ------------------------------------------------------------------ */

function KeysSection() {
  const apiKey = useAppStore((s) => s.apiKey);
  const setApiKey = useAppStore((s) => s.setApiKey);
  const cerebrasKey = useAppStore((s) => s.cerebrasApiKey);
  const setCerebrasKey = useAppStore((s) => s.setCerebrasApiKey);

  return (
    <Section title="API keys" description="VoxDrop uses your own keys. Groq has a free tier that covers everyday dictation.">
      <KeyField
        provider="groq"
        label="Groq key"
        required
        value={apiKey}
        onChange={setApiKey}
        placeholder="gsk_…"
        consoleUrl="https://console.groq.com/keys"
        consoleLabel="Get a free key from Groq"
      />
      <KeyField
        provider="cerebras"
        label="Cerebras key"
        value={cerebrasKey}
        onChange={setCerebrasKey}
        placeholder="csk-…"
        consoleUrl="https://cloud.cerebras.ai/"
        consoleLabel="Get a key from Cerebras"
        note="Optional. Only used for polish when you choose Cerebras below. Speech always uses Groq."
      />
    </Section>
  );
}

function KeyField({
  provider,
  label,
  value,
  onChange,
  placeholder,
  consoleUrl,
  consoleLabel,
  required,
  note,
}: {
  provider: LLMProvider;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  consoleUrl: string;
  consoleLabel: string;
  required?: boolean;
  note?: string;
}) {
  const id = useId();
  const verified = useAppStore((s) => s.verifiedKeys[provider]);
  const markKeyVerified = useAppStore((s) => s.markKeyVerified);
  const [visible, setVisible] = useState(false);
  const [testing, setTesting] = useState(false);
  const [failure, setFailure] = useState('');

  const isVerified = !!value.trim() && verified === keyFingerprint(value);

  const test = async (key = value) => {
    setTesting(true);
    setFailure('');
    const result = await checkKey(provider, key);
    // The field may have changed while we waited.
    if (useAppStore.getState()[provider === 'groq' ? 'apiKey' : 'cerebrasApiKey'] !== key) {
      setTesting(false);
      return;
    }
    markKeyVerified(provider, key, result.ok);
    setFailure(result.ok ? '' : result.message);
    setTesting(false);
  };

  // Test a newly pasted key automatically, once it stops changing.
  const lastAuto = useRef('');
  useEffect(() => {
    const key = value.trim();
    if (key.length < 20 || isVerified || lastAuto.current === key) return;
    const timer = window.setTimeout(() => {
      lastAuto.current = key;
      void test(key);
    }, 700);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isVerified]);

  const status = testing ? (
    <span className="inline-flex items-center gap-1.5 text-mist">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Testing…
    </span>
  ) : failure ? (
    <span className="text-brick">{failure}</span>
  ) : isVerified ? (
    <span className="inline-flex items-center gap-1.5 text-moss">
      <Check className="h-3.5 w-3.5" aria-hidden="true" /> Key works
    </span>
  ) : value.trim() ? (
    <span className="text-mist">Not tested yet</span>
  ) : required ? (
    <span className="text-mist">Required to dictate</span>
  ) : null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="label">
          {label}
        </label>
        <button type="button" onClick={() => openUrl(consoleUrl)} className="inline-flex min-h-[24px] items-center gap-1 text-caption font-medium text-mist hover:text-ink">
          {consoleLabel} <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-1.5 flex gap-2">
        <div className="relative flex-1">
          <input
            id={id}
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => {
              setFailure('');
              onChange(e.target.value.trim());
            }}
            placeholder={placeholder}
            spellCheck={false}
            autoComplete="off"
            className="field !pr-10 font-mono text-[13px]"
            aria-describedby={`${id}-status`}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? `Hide ${label}` : `Show ${label}`}
            aria-pressed={visible}
            className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-chip text-mist hover:text-ink"
          >
            {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
        <button type="button" className="btn-outline min-h-[38px]" onClick={() => void test()} aria-disabled={!value.trim() || testing} disabled={!value.trim()}>
          Test key
        </button>
      </div>
      <p id={`${id}-status`} className="mt-1.5 min-h-[16px] text-caption" aria-live="polite">
        {status}
      </p>
      {note && <p className="hint">{note}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shortcut                                                           */
/* ------------------------------------------------------------------ */

const MODIFIERS = ['Control', 'Alt', 'Shift', 'Super'] as const;

function keyName(key: string, code: string): string | null {
  if (key === 'Control' || key === 'Alt' || key === 'Shift') return key;
  if (key === 'Meta' || key === 'OS') return 'Super';
  if (code === 'Space') return 'Space';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(key)) return key;
  return null;
}

const sortParts = (parts: Iterable<string>) => {
  const set = new Set(parts);
  return [...MODIFIERS.filter((m) => set.has(m)), ...[...set].filter((p) => !(MODIFIERS as readonly string[]).includes(p))];
};

function ShortcutSection() {
  const hotkey = useAppStore((s) => s.hotkey);
  const setHotkey = useAppStore((s) => s.setHotkey);
  const [recording, setRecording] = useState(false);
  const [held, setHeld] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const pressed = useRef(new Set<string>());
  const peak = useRef<string[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  const apply = async (next: string) => {
    setError('');
    setSaving(true);
    try {
      await invoke('update_hotkey', { newHotkey: next });
      setHotkey(next);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const stop = () => {
    setRecording(false);
    setHeld([]);
    pressed.current.clear();
    peak.current = [];
  };

  const start = () => {
    setError('');
    setRecording(true);
    boxRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!recording) return;
    if (e.key === 'Tab') return stop(); // never trap keyboard focus
    e.preventDefault();
    if (e.key === 'Escape') return stop();
    if (e.repeat) return;
    const name = keyName(e.key, e.code);
    if (!name) {
      setError('That key can’t be used. Use letters, numbers, Space or F1–F12 with modifiers.');
      return;
    }
    pressed.current.add(name);
    const parts = sortParts(pressed.current);
    setHeld(parts);
    if (parts.length > peak.current.length) peak.current = parts;
  };

  const onKeyUp = (e: React.KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    const name = keyName(e.key, e.code);
    if (name) pressed.current.delete(name);
    if (pressed.current.size > 0) return;
    // Everything released: the most keys held at once is the combo.
    const combo = peak.current;
    const modifiers = combo.filter((p) => (MODIFIERS as readonly string[]).includes(p));
    stop();
    if (combo.length < 2 || modifiers.length === 0) {
      setError('Use at least two keys, including Ctrl, Alt, Shift or Win.');
      return;
    }
    if (combo.length - modifiers.length > 1) {
      setError('Use one key plus modifiers, or modifiers only (like Ctrl + Win).');
      return;
    }
    void apply(combo.join('+'));
  };

  return (
    <Section
      title="Shortcut"
      description={
        <>
          Hold it in any app to dictate, let go to paste. Modifier-only shortcuts like <Keys hotkey="Control+Super" /> don’t clash
          with app shortcuts.
        </>
      }
    >
      <div
        ref={boxRef}
        role="button"
        tabIndex={0}
        aria-label={recording ? 'Recording a new shortcut. Press keys, or Escape to cancel.' : `Shortcut is ${hotkeyParts(hotkey).join(' plus ')}. Press Enter to change it.`}
        onClick={() => (recording ? null : start())}
        onKeyDown={(e) => {
          if (!recording && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            start();
            return;
          }
          onKeyDown(e);
        }}
        onKeyUp={onKeyUp}
        onBlur={stop}
        className={`flex min-h-[64px] cursor-pointer flex-wrap items-center justify-between gap-3 rounded-panel border px-4 py-3 transition-colors ${
          recording ? 'border-signal bg-signal/[0.06]' : 'border-ink/15 hover:border-ink/30'
        }`}
      >
        {recording ? (
          <>
            <span className="flex items-center gap-2">
              {held.length ? <Keys hotkey={held.join('+')} /> : <span className="text-body text-ink">Press your new shortcut…</span>}
            </span>
            <span className="text-caption text-mist">Esc to cancel</span>
          </>
        ) : (
          <>
            <Keys hotkey={hotkey} />
            <span className="inline-flex items-center gap-2 text-caption font-medium text-mist">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Click to change
            </span>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="-mt-2 text-caption text-brick">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {HOTKEY_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={hotkey === preset}
            onClick={() => void apply(preset)}
            className={`rounded-control border px-2 py-1.5 transition-colors ${
              hotkey === preset ? 'border-ink bg-ink/[0.06]' : 'border-ink/12 hover:border-ink/30'
            }`}
          >
            <Keys hotkey={preset} />
          </button>
        ))}
        {hotkey !== DEFAULT_HOTKEY && (
          <button type="button" className="btn-quiet" onClick={() => void apply(DEFAULT_HOTKEY)}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset
          </button>
        )}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Speech & polish                                                    */
/* ------------------------------------------------------------------ */

function ModelSelect({
  id,
  value,
  options,
  onChange,
  customPlaceholder,
}: {
  id: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
  customPlaceholder: string;
}) {
  const isPreset = options.some((o) => o.id === value);
  const [custom, setCustom] = useState(!isPreset);
  const showCustom = custom || !isPreset;
  return (
    <div className="flex w-[260px] max-w-full flex-col gap-2">
      <select
        id={id}
        className="field cursor-pointer"
        value={showCustom ? '__custom__' : value}
        onChange={(e) => {
          if (e.target.value === '__custom__') {
            setCustom(true);
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
        <option value="__custom__">Other model…</option>
      </select>
      {showCustom && (
        <input
          aria-label="Model name"
          className="field font-mono text-[13px]"
          value={value}
          placeholder={customPlaceholder}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value.trim())}
        />
      )}
    </div>
  );
}

function SpeechSection() {
  const whisperModel = useAppStore((s) => s.whisperModel);
  const setWhisperModel = useAppStore((s) => s.setWhisperModel);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const hint = WHISPER_MODELS.find((m) => m.id === whisperModel)?.hint ?? 'A custom Groq speech model.';

  return (
    <Section title="Speech recognition">
      <Row label="Model" hint={hint} htmlFor="whisper-model">
        <ModelSelect id="whisper-model" value={whisperModel} options={WHISPER_MODELS} onChange={setWhisperModel} customPlaceholder="whisper-large-v3-turbo" />
      </Row>
      <Row label="Language" hint="Choosing your language is faster and more accurate than detection." htmlFor="language">
        <select id="language" className="field w-[260px] max-w-full cursor-pointer" value={language} onChange={(e) => setLanguage(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.code || 'auto'} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </Row>
    </Section>
  );
}

function PolishSection() {
  const enabled = useAppStore((s) => s.polishEnabled);
  const setEnabled = useAppStore((s) => s.setPolishEnabled);
  const provider = useAppStore((s) => s.llamaProvider);
  const model = useAppStore((s) => s.llamaModel);
  const setModel = useAppStore((s) => s.setLlamaModel);
  const setProviderAndModel = useAppStore((s) => s.setProviderAndModel);
  const cerebrasKey = useAppStore((s) => s.cerebrasApiKey);
  const options = POLISH_MODELS[provider];
  const hint = options.find((m) => m.id === model)?.hint ?? 'A custom model. If it fails, VoxDrop falls back to the default.';

  return (
    <Section
      title="Polish"
      description="An AI pass that removes ums, fixes punctuation and applies spoken corrections, without changing what you said."
    >
      <Row
        label="Clean up with AI"
        hint={enabled ? 'Very short dictations skip this step to stay instant.' : 'Off: basic local cleanup only. Nothing is sent for polishing.'}
      >
        <Toggle checked={enabled} onChange={setEnabled} label="Clean up with AI" />
      </Row>
      {enabled && (
        <>
          <Row label="Provider" hint={provider === 'cerebras' && !cerebrasKey.trim() ? 'Add a Cerebras key above to use Cerebras.' : undefined}>
            <Segmented
              label="Polish provider"
              value={provider}
              onChange={(next) => setProviderAndModel(next, DEFAULT_MODEL[next])}
              options={[
                { value: 'groq', label: 'Groq' },
                {
                  value: 'cerebras',
                  label: 'Cerebras',
                  disabled: !cerebrasKey.trim() && provider !== 'cerebras',
                  title: cerebrasKey.trim() ? undefined : 'Add a Cerebras key first',
                },
              ]}
            />
          </Row>
          <Row label="Model" hint={hint} htmlFor="polish-model">
            <ModelSelect key={provider} id="polish-model" value={model} options={options} onChange={setModel} customPlaceholder={DEFAULT_MODEL[provider]} />
          </Row>
        </>
      )}
    </Section>
  );
}

function SoundsRow() {
  const soundEffects = useAppStore((s) => s.soundEffects);
  const setSoundEffects = useAppStore((s) => s.setSoundEffects);
  return (
    <Row label="Play sounds" hint="A short tone when recording starts and when text is pasted.">
      <Toggle checked={soundEffects} onChange={setSoundEffects} label="Play sounds" />
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/*  Updates                                                            */
/* ------------------------------------------------------------------ */

function UpdatesSection() {
  const [version, setVersion] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<ReleaseCheckResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getInstalledVersion().then(setVersion).catch(() => {});
  }, []);

  const check = async () => {
    setState('checking');
    setError('');
    try {
      setResult(await checkForGitHubUpdate());
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check for updates.');
      setState('error');
    }
  };

  const open = (url: string) => openUrl(url).catch(() => setError('Could not open the browser.'));

  return (
    <Section title="Updates">
      <Row
        label={version ? `VoxDrop ${version}` : 'VoxDrop'}
        hint={
          <span aria-live="polite">
            {state === 'checking' && 'Checking GitHub…'}
            {state === 'error' && <span className="text-brick">{error}</span>}
            {state === 'done' && result && !result.hasUpdate && 'You have the latest version.'}
            {state === 'done' && result?.hasUpdate && (
              <span className="font-medium text-ink">Version {result.latestVersion?.replace(/^v/, '')} is available.</span>
            )}
          </span>
        }
      >
        <div className="flex gap-2">
          {state === 'done' && result?.hasUpdate ? (
            <button type="button" className="btn-primary" onClick={() => open(result.htmlUrl)}>
              Download update <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className="btn-outline" onClick={() => void check()} disabled={state === 'checking'}>
              {state === 'checking' && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Check for updates
            </button>
          )}
          <button type="button" className="btn-quiet" onClick={() => open(RELEASES_PAGE_URL)}>
            Release notes
          </button>
        </div>
      </Row>
    </Section>
  );
}
