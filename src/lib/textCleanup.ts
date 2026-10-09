/**
 * Local text handling: the regex cleanup used when AI polish is off or
 * unavailable, guards against bad AI rewrites, Whisper hallucination
 * filtering, and snippet expansion. Pure functions, no I/O.
 */

/* ------------------------------------------------------------------ */
/*  Local cleanup                                                      */
/* ------------------------------------------------------------------ */

// Fillers are removed only where they are unambiguous: "um"/"uh" anywhere,
// the rest only when set off by a comma ("so, …", "…, you know, …"), so
// "I like it", "do you know" and "I mean it" survive.
const HESITATIONS = /\b(?:um+|uh+|er+|erm|hmm+)\b[,.]?\s*/gi;
const COMMA_FILLERS = /(^|,\s*)(?:you know|i mean|like|so|basically|actually|literally),\s*/gi;

const QUESTION_START =
  /^(?:what|where|when|why|who|whom|whose|which|how)\b|^(?:is|are|am|was|were|do|does|did|can|could|will|would|should|shall|may|might|have|has|had)\s+(?:i|you|we|they|he|she|it|this|that|there|anyone|someone)\b/i;

function capitalizeSentences(text: string): string {
  return text
    .replace(/(^|[.!?]\s+)([a-z])/g, (_, prefix: string, letter: string) => prefix + letter.toUpperCase())
    .replace(/\bi\b(?=[\s'’.,!?]|$)/g, 'I');
}

export function localCleanupText(rawText: string): string {
  if (!rawText || !rawText.trim()) return rawText;

  let text = rawText.trim();
  text = text.replace(HESITATIONS, '');
  text = text.replace(COMMA_FILLERS, (_, lead: string) => (lead ? ' ' : ''));
  text = text
    .replace(/^[,;\s]+/, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    // Space after , ; ! ? only before a letter, so 10:30, 3.14 and
    // example.com are left alone.
    .replace(/([,;!?])(?=[A-Za-z])/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  text = capitalizeSentences(text);

  if (text && !/[.!?…]$/.test(text)) {
    text += QUESTION_START.test(text) ? '?' : '.';
  }
  return text;
}

/* ------------------------------------------------------------------ */
/*  AI rewrite guards                                                  */
/* ------------------------------------------------------------------ */

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function alphaWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter((word) => /\p{L}/u.test(word));
}

/**
 * Should the AI's rewrite be discarded in favour of the transcript? Catches
 * three failure modes: an empty answer, the model replying to the dictation
 * instead of formatting it, and the model silently dropping content.
 */
export function shouldRejectRewrite(rawText: string, cleanedText: string): boolean {
  const cleaned = cleanedText.trim();
  if (!cleaned) return true;

  // Phrases an assistant opens with but a person dictating rarely does.
  if (/^(sure[,!.]|certainly[,!.]|of course[,!.]|absolutely[,!.]|here('s| is) (the|your|a) |as an ai\b|i'm sorry, but|i cannot\b|i can't help)/i.test(cleaned)) {
    return true;
  }

  const rawWords = alphaWords(rawText);
  const cleanedWords = alphaWords(cleaned);

  // Removing fillers never halves a dictation; a collapse means dropped text.
  if (rawWords.length >= 12 && cleanedWords.length < rawWords.length * 0.4) return true;
  // A rewrite far longer than the input is an answer, not a cleanup.
  if (rawWords.length >= 4 && cleanedWords.length > rawWords.length * 1.8 + 8) return true;

  // Digit-only rewrites ("twenty five percent" → "25%") are legitimate.
  if (!cleanedWords.length) return false;
  const rawSet = new Set(rawWords);
  const overlap = cleanedWords.filter((word) => rawSet.has(word)).length / cleanedWords.length;
  return overlap < 0.45;
}

/* ------------------------------------------------------------------ */
/*  Whisper hallucinations                                             */
/* ------------------------------------------------------------------ */

// What Whisper tends to "hear" in silence or noise, learned from subtitles.
const HALLUCINATIONS = [
  /^(thank you|thanks)( (so|very) much)?( for watching| for listening)?[.!]*$/i,
  /^(please )?(like and )?subscribe[.!]*$/i,
  /^(bye|goodbye|you|okay|ok|so|oh|hmm|huh)[.!?]*$/i,
  /^\[?(blank_audio|silence|music|applause|inaudible)\]?$/i,
  /^\(?(music|silence|applause)\)?$/i,
  /^(subtitles|captions|transcribed) by\b.*$/i,
  /^www\.[\w.]+$/i,
];

export interface WhisperSegment {
  text: string;
  no_speech_prob?: number;
  avg_logprob?: number;
  compression_ratio?: number;
}

/**
 * Drop segments Whisper itself flags as probably-not-speech (the same
 * thresholds openai/whisper uses), and whole transcripts that are a known
 * silence hallucination.
 */
export function filterTranscript(text: string, segments?: WhisperSegment[]): string {
  let result = text.trim();

  if (segments && segments.length) {
    const kept = segments.filter((segment) => {
      const noSpeech = segment.no_speech_prob ?? 0;
      const logprob = segment.avg_logprob ?? 0;
      const compression = segment.compression_ratio ?? 1;
      if (noSpeech > 0.6 && logprob < -1) return false;
      if (compression > 2.4) return false; // repetition loop
      return true;
    });
    result = kept.map((segment) => segment.text.trim()).join(' ').trim();
  }

  if (HALLUCINATIONS.some((pattern) => pattern.test(result))) return '';
  return result;
}

/* ------------------------------------------------------------------ */
/*  Snippets                                                           */
/* ------------------------------------------------------------------ */

export interface SnippetRule {
  trigger_phrase: string;
  expansion: string;
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replace each spoken trigger with its expansion. Triggers match whole words
 * only ("ty" never fires inside "pretty"), ignore case, and tolerate the
 * hyphens and punctuation the AI may add between words.
 */
export function expandSnippets(text: string, snippets: SnippetRule[]): string {
  let result = text;
  for (const snippet of snippets) {
    const words = snippet.trigger_phrase.trim().split(/\s+/).filter(Boolean);
    if (!words.length || !snippet.expansion) continue;
    const body = words.map(escapeRegex).join('[\\s\\-,]+');
    // Dictating only the trigger pastes only the expansion, without the
    // full stop the AI likes to add.
    if (new RegExp(`^${body}[.!?]?$`, 'iu').test(result.trim())) {
      result = snippet.expansion;
      continue;
    }
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'giu');
    // A function replacement keeps "$&" and friends in expansions literal.
    result = result.replace(pattern, () => snippet.expansion);
  }
  return result;
}
