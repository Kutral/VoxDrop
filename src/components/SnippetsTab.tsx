import { useState } from 'react';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAppStore, type Snippet } from '../store';
import { PageHeader, useCopy, useToast } from './ui';

export function SnippetsTab() {
  const snippets = useAppStore((s) => s.snippets);
  const addSnippet = useAppStore((s) => s.addSnippet);
  const updateSnippet = useAppStore((s) => s.updateSnippet);
  const removeSnippet = useAppStore((s) => s.removeSnippet);
  const copy = useCopy();
  const toast = useToast();

  const [editing, setEditing] = useState<Snippet | 'new' | null>(null);
  const [phrase, setPhrase] = useState('');
  const [text, setText] = useState('');

  const open = (snippet: Snippet | 'new') => {
    setEditing(snippet);
    setPhrase(snippet === 'new' ? '' : snippet.trigger_phrase);
    setText(snippet === 'new' ? '' : snippet.expansion);
  };
  const close = () => setEditing(null);

  const duplicate = snippets.some(
    (s) => s.trigger_phrase.trim().toLowerCase() === phrase.trim().toLowerCase() && (editing === 'new' || s.id !== editing?.id),
  );
  const canSave = phrase.trim().length > 0 && text.trim().length > 0 && !duplicate;

  const save = () => {
    if (!canSave || !editing) return;
    if (editing === 'new') {
      addSnippet({ id: Date.now(), trigger_phrase: phrase.trim(), expansion: text, created_at: new Date().toISOString() });
      toast({ message: 'Snippet saved' });
    } else {
      updateSnippet(editing.id, { trigger_phrase: phrase.trim(), expansion: text });
      toast({ message: 'Snippet updated' });
    }
    close();
  };

  const remove = (snippet: Snippet) => {
    removeSnippet(snippet.id);
    toast({ message: 'Snippet deleted', action: { label: 'Undo', run: () => addSnippet(snippet) } });
  };

  return (
    <div>
      <PageHeader
        title="Snippets"
        aside={
          editing === null ? (
            <button type="button" className="btn-primary" onClick={() => open('new')}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New snippet
            </button>
          ) : undefined
        }
      >
        Say a short phrase while dictating and VoxDrop types the text you saved for it: a link, an address, a sign-off.
      </PageHeader>

      {editing !== null && (
        <form
          className="mb-8 rounded-panel border border-ink/10 bg-surface p-5"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <h2 className="text-heading">{editing === 'new' ? 'New snippet' : 'Edit snippet'}</h2>
          <div className="mt-4 grid gap-4">
            <div>
              <label htmlFor="snippet-phrase" className="label">
                When you say
              </label>
              <input
                id="snippet-phrase"
                autoFocus
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder="my meeting link"
                className="field mt-1.5"
                aria-describedby="snippet-phrase-hint"
              />
              <p id="snippet-phrase-hint" className={`mt-1.5 text-caption ${duplicate ? 'text-brick' : 'text-mist'}`}>
                {duplicate ? 'You already have a snippet for this phrase.' : 'Two or three distinct words work best. Capitals don’t matter.'}
              </p>
            </div>
            <div>
              <label htmlFor="snippet-text" className="label">
                VoxDrop types
              </label>
              <textarea
                id="snippet-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="https://meet.google.com/abc-defg-hij"
                rows={3}
                className="field mt-1.5 resize-y font-serif text-[15px]"
              />
            </div>
          </div>

          {phrase.trim() && text.trim() && !duplicate && (
            <p className="mt-4 text-caption text-mist">
              “Send me <span className="font-semibold text-ink">{phrase.trim()}</span>” becomes “Send me{' '}
              <span className="font-semibold text-ink">{text.length > 60 ? `${text.slice(0, 58)}…` : text}</span>”
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-quiet" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!canSave}>
              {editing === 'new' ? 'Save snippet' : 'Save changes'}
            </button>
          </div>
        </form>
      )}

      {snippets.length === 0 && editing === null ? (
        <p className="text-body text-mist">No snippets yet. Add one, then say its phrase in any dictation.</p>
      ) : (
        <ul className="divide-y divide-line/10">
          {snippets.map((snippet) => (
            <li key={snippet.id} className="group flex items-start gap-4 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">“{snippet.trigger_phrase}”</p>
                <p className="selectable mt-1 line-clamp-3 whitespace-pre-wrap break-words font-serif text-[15px] leading-6 text-mist">
                  {snippet.expansion}
                </p>
              </div>
              <div className="flex flex-none gap-1 opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button type="button" className="btn-quiet" aria-label={`Copy text for “${snippet.trigger_phrase}”`} onClick={() => copy(snippet.expansion)}>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button type="button" className="btn-quiet" aria-label={`Edit “${snippet.trigger_phrase}”`} onClick={() => open(snippet)}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button type="button" className="btn-danger" aria-label={`Delete “${snippet.trigger_phrase}”`} onClick={() => remove(snippet)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
