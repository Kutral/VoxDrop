import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Copy, Search, Trash2, X } from 'lucide-react';
import { useAppStore, type HistoryItem } from '../store';
import { PageHeader, SpeechStrip, dayLabel, formatDuration, formatTime, plural, useCopy, useToast } from './ui';

const wordsOf = (item: HistoryItem) => item.words ?? (item.transcript.trim() ? item.transcript.trim().split(/\s+/).length : 0);

export function HistoryTab() {
  const history = useAppStore((s) => s.history);
  const removeHistoryItem = useAppStore((s) => s.removeHistoryItem);
  const restoreHistory = useAppStore((s) => s.restoreHistory);
  const clearHistory = useAppStore((s) => s.clearHistory);
  const toast = useToast();
  const copy = useCopy();

  const [query, setQuery] = useState('');
  // Filtering 500 rows per keystroke shouldn't make typing lag.
  const deferredQuery = useDeferredValue(query);
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(confirmTimer.current), []);

  const groups = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const items = q ? history.filter((item) => item.transcript.toLowerCase().includes(q)) : history;
    const byDay: { label: string; items: HistoryItem[] }[] = [];
    const now = new Date();
    for (const item of items) {
      const label = dayLabel(item.created_at, now);
      const last = byDay[byDay.length - 1];
      if (last?.label === label) last.items.push(item);
      else byDay.push({ label, items: [item] });
    }
    return { byDay, count: items.length };
  }, [history, deferredQuery]);

  const maxSeconds = useMemo(() => Math.max(30, ...history.map((item) => item.duration_seconds || 0)), [history]);

  const remove = (item: HistoryItem) => {
    removeHistoryItem(item.id);
    toast({ message: 'Dictation deleted', action: { label: 'Undo', run: () => restoreHistory([item]) } });
  };

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      window.clearTimeout(confirmTimer.current);
      confirmTimer.current = window.setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    const snapshot = useAppStore.getState().history;
    clearHistory();
    setConfirmClear(false);
    toast({
      message: `Deleted ${plural(snapshot.length, 'dictation')}`,
      action: { label: 'Undo', run: () => restoreHistory(snapshot) },
    });
  };

  return (
    <div>
      <PageHeader
        title="History"
        aside={
          history.length > 0 ? (
            <button type="button" onClick={handleClear} className={confirmClear ? 'btn bg-brick text-white hover:bg-brick/90' : 'btn-danger'}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {confirmClear ? 'Click again to delete all' : 'Delete all'}
            </button>
          ) : undefined
        }
      >
        Everything you've dictated, saved only on this computer.
      </PageHeader>

      {history.length === 0 ? (
        <p className="text-body text-mist">No dictations yet. They appear here as soon as you make one.</p>
      ) : (
        <>
          <div className="sticky -top-7 z-10 -mx-1 bg-paper px-1 pb-3 pt-1">
            <label className="relative block">
              <span className="sr-only">Search history</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your dictations"
                className="field !pl-9 !pr-9"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                  className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-chip text-mist hover:bg-ink/[0.06] hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </label>
            <p className="mt-2 text-caption text-mist" aria-live="polite">
              {deferredQuery.trim()
                ? `${plural(groups.count, 'match', 'matches')} of ${history.length.toLocaleString()}`
                : plural(history.length, 'dictation')}
            </p>
          </div>

          {groups.count === 0 ? (
            <div className="py-8 text-body text-mist">
              Nothing matches “{deferredQuery.trim()}”.{' '}
              <button type="button" className="font-medium text-ink underline underline-offset-2" onClick={() => setQuery('')}>
                Clear search
              </button>
            </div>
          ) : (
            groups.byDay.map((group) => (
              <section key={group.label} className="mt-5 first:mt-2">
                <h2 className="text-[13px] font-semibold text-mist">{group.label}</h2>
                <ul className="mt-1 divide-y divide-line/10">
                  {group.items.map((item) => (
                    <HistoryRow
                      key={item.id}
                      item={item}
                      maxSeconds={maxSeconds}
                      newest={item.id === history[0]?.id}
                      onCopy={copy}
                      onDelete={remove}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}

const HistoryRow = memo(function HistoryRow({
  item,
  maxSeconds,
  newest,
  onCopy,
  onDelete,
}: {
  item: HistoryItem;
  maxSeconds: number;
  newest: boolean;
  onCopy: (text: string) => void;
  onDelete: (item: HistoryItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const words = wordsOf(item);
  const long = item.transcript.length > 220;

  return (
    // content-visibility lets the browser skip layout and paint for rows
    // that are scrolled out of view: cheap virtualisation.
    <li className="group py-4" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 120px' }}>
      <div className="flex items-start gap-4">
        <span className="w-16 flex-none pt-1 text-caption tabular-nums text-mist">{formatTime(item.created_at)}</span>
        <div className="min-w-0 flex-1">
          <p className={`selectable whitespace-pre-wrap font-serif text-[16px] leading-[25px] ${expanded ? '' : 'line-clamp-4'}`}>
            {item.transcript}
          </p>
          {long && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 inline-flex items-center gap-1 text-caption font-medium text-mist hover:text-ink"
            >
              {expanded ? 'Show less' : 'Show all'}
              <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
          )}
          <div className="mt-2.5">
            <SpeechStrip seconds={item.duration_seconds} words={words} maxSeconds={maxSeconds} newest={newest} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="flex flex-wrap gap-x-4 text-caption text-mist">
              <span>{formatDuration(item.duration_seconds)}</span>
              <span>{plural(words, 'word')}</span>
              {item.method === 'basic' && <span title="AI polish was off or unavailable for this one">Basic cleanup</span>}
            </p>
            <div className="flex gap-1 opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <button type="button" className="btn-quiet" onClick={() => onCopy(item.transcript)}>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy
              </button>
              <button type="button" className="btn-danger" aria-label="Delete this dictation" onClick={() => onDelete(item)}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
});
