import { useMemo } from 'react';
import { Copy } from 'lucide-react';
import { getWeekIndex, useAppStore, type HistoryItem } from '../store';
import type { Tab } from './MainView';
import { Keys, SpeechStrip, dayLabel, formatDuration, formatTime, plural, useCopy } from './ui';

/** Typing speed the "time saved" figure compares against. */
const TYPING_WPM = 40;

const wordsOf = (item: HistoryItem) => item.words ?? (item.transcript.trim() ? item.transcript.trim().split(/\s+/).length : 0);

export function HomeTab({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const hotkey = useAppStore((s) => s.hotkey);
  const apiKey = useAppStore((s) => s.apiKey);
  const history = useAppStore((s) => s.history);
  const lifetime = useAppStore((s) => s.lifetime);
  const activeWeeks = useAppStore((s) => s.activeWeeks);
  const copy = useCopy();

  const latest = history[0];
  const recent = history.slice(1, 6);
  const maxSeconds = useMemo(
    () => Math.max(30, ...history.slice(0, 6).map((item) => item.duration_seconds || 0)),
    [history],
  );

  const stats = useMemo(() => {
    // Speaking speed from takes long enough to measure; very short or very
    // long holds are mostly silence and skew the average.
    let words = 0;
    let minutes = 0;
    for (const item of history) {
      const w = wordsOf(item);
      const s = item.duration_seconds || 0;
      if (w >= 3 && s >= 1 && s <= 300) {
        words += w;
        minutes += s / 60;
      }
    }
    const wpm = minutes > 0 ? Math.round(words / minutes) : 0;
    // Time it would have taken to type, minus the time spent speaking.
    const savedMinutes = Math.max(0, Math.round(lifetime.words / TYPING_WPM - lifetime.seconds / 60));
    return { wpm, savedMinutes };
  }, [history, lifetime]);

  const streak = useMemo(() => {
    const weeks = new Set(activeWeeks);
    let week = getWeekIndex(new Date().toISOString());
    if (!weeks.has(week)) week -= 1; // this week isn't over yet
    let count = 0;
    while (weeks.has(week)) {
      count++;
      week--;
    }
    return count;
  }, [activeWeeks]);

  const week = useMemo(() => weekActivity(history), [history]);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-title">
          Hold <Keys hotkey={hotkey} className="mx-0.5 -translate-y-px" /> and speak.
        </h1>
        <p className="mt-1.5 text-body text-mist">Let go, and the text is typed wherever your cursor is.</p>

        {!apiKey.trim() && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-panel border border-signal/30 bg-signal/[0.07] px-4 py-3">
            <p className="text-body">
              <span className="font-semibold">One step left:</span> add a free Groq API key so VoxDrop can transcribe.
            </p>
            <button type="button" className="btn-primary" onClick={() => onNavigate('settings')}>
              Add key
            </button>
          </div>
        )}
      </section>

      <section aria-labelledby="latest-heading">
        <h2 id="latest-heading" className="text-heading">
          Latest dictation
        </h2>
        {latest ? (
          <article className="mt-3">
            <div className="flex items-center justify-between gap-3">
              <p className="flex flex-wrap gap-x-4 text-caption text-mist">
                <span className="font-medium text-ink">
                  {dayLabel(latest.created_at)}, {formatTime(latest.created_at)}
                </span>
                <span>{formatDuration(latest.duration_seconds)}</span>
                <span>{plural(wordsOf(latest), 'word')}</span>
              </p>
              <button type="button" className="btn-quiet -mr-2" onClick={() => copy(latest.transcript)}>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy
              </button>
            </div>
            <p className="selectable mt-2 max-w-[62ch] whitespace-pre-wrap font-serif text-transcript text-ink">
              {latest.transcript}
            </p>
            <div className="mt-3">
              <SpeechStrip seconds={latest.duration_seconds} words={wordsOf(latest)} maxSeconds={maxSeconds} newest reveal />
            </div>
          </article>
        ) : (
          <p className="mt-3 max-w-[56ch] text-body text-mist">
            Nothing yet. Open any app, put the cursor where the text should go, then hold <Keys hotkey={hotkey} /> while you
            talk.
          </p>
        )}
      </section>

      {lifetime.dictations > 0 && (
        <section aria-labelledby="numbers-heading">
          <h2 id="numbers-heading" className="sr-only">
            Your numbers
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y hairline py-5 sm:grid-cols-4">
            <Metric value={stats.wpm ? stats.wpm.toLocaleString() : 'n/a'} label="words per minute" title="Your average speaking speed" />
            <Metric
              value={stats.savedMinutes.toLocaleString()}
              label="minutes saved"
              title={`Compared with typing at ${TYPING_WPM} words per minute`}
            />
            <Metric value={lifetime.words.toLocaleString()} label="words dictated" title={plural(lifetime.dictations, 'dictation')} />
            <Metric value={String(streak)} label={streak === 1 ? 'week in a row' : 'weeks in a row'} title="Weeks with at least one dictation" />
          </dl>

          <div className="mt-5">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[13px] font-medium">This week</h3>
              <span className="text-caption text-mist">{plural(week.total, 'word')}</span>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-2" role="list">
              {week.days.map((day) => (
                <div key={day.label} role="listitem" className="flex flex-col items-center gap-1.5" title={plural(day.words, 'word')}>
                  <div className="flex h-10 w-full items-end justify-center border-b hairline">
                    <div
                      className={`w-1.5 rounded-t-full ${day.isToday ? 'bg-ink' : 'bg-ink/30'}`}
                      style={{ height: day.words ? `${Math.max(10, day.share * 100)}%` : 0 }}
                    />
                  </div>
                  <span className={`text-caption ${day.isToday ? 'font-semibold text-ink' : 'text-mist'}`}>{day.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section aria-labelledby="recent-heading">
          <div className="flex items-baseline justify-between">
            <h2 id="recent-heading" className="text-heading">
              Earlier
            </h2>
            <button type="button" className="btn-quiet -mr-2" onClick={() => onNavigate('history')}>
              All history
            </button>
          </div>
          <ul className="mt-2 divide-y divide-line/10">
            {recent.map((item) => (
              <li key={item.id} className="group flex items-start gap-4 py-3">
                <span className="w-16 flex-none pt-0.5 text-caption tabular-nums text-mist">{formatTime(item.created_at)}</span>
                <div className="min-w-0 flex-1">
                  <p className="selectable line-clamp-2 font-serif text-[16px] leading-6">{item.transcript}</p>
                  <div className="mt-2">
                    <SpeechStrip seconds={item.duration_seconds} words={wordsOf(item)} maxSeconds={maxSeconds} />
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-quiet opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label="Copy this dictation"
                  onClick={() => copy(item.transcript)}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Metric({ value, label, title }: { value: string; label: string; title: string }) {
  return (
    <div title={title}>
      <dd className="text-metric tabular-nums">{value}</dd>
      <dt className="mt-0.5 text-caption text-mist">{label}</dt>
    </div>
  );
}

/** Words per day for the current Monday-to-Sunday week, in one pass. */
function weekActivity(history: HistoryItem[]) {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const words = new Array<number>(7).fill(0);
  for (const item of history) {
    const created = new Date(item.created_at);
    const index = Math.floor((created.getTime() - monday.getTime()) / 86_400_000);
    if (index >= 0 && index < 7) words[index] += wordsOf(item);
    // History is newest first; once we're before Monday we're done.
    if (index < 0) break;
  }
  const max = Math.max(...words, 1);
  const todayIndex = (now.getDay() + 6) % 7;
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return {
    total: words.reduce((a, b) => a + b, 0),
    days: labels.map((label, i) => ({ label, words: words[i], share: words[i] / max, isToday: i === todayIndex })),
  };
}
