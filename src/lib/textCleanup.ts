/**
 * Local text cleanup for the free tier.
 * Uses regex-based heuristics instead of an LLM.
 */

const FILLER_WORDS = [
  '\\bum\\b',
  '\\buh\\b',
  '\\blike\\b(?=\\s+(?:uh|um|you know))',
  '\\byou know\\b',
  '\\bbasically\\b',
  '\\bactually\\b',
  '\\bliterally\\b',
  '\\bi mean\\b',
  '\\bso\\b(?=\\s*,)',
];

const FILLER_REGEX = new RegExp(
  FILLER_WORDS.join('|'),
  'gi',
);

/**
 * Remove common filler words from transcribed speech.
 */
function removeFillers(text: string): string {
  return text
    .replace(FILLER_REGEX, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Capitalize the first letter of each sentence.
 */
function capitalizeSentences(text: string): string {
  return text.replace(/(^|[.!?]\s+)([a-z])/g, (_, prefix, letter) => {
    return prefix + letter.toUpperCase();
  });
}

/**
 * Ensure the text ends with proper punctuation.
 */
function ensureEndPunctuation(text: string): string {
  if (!text) return text;
  const lastChar = text[text.length - 1];
  if (!['.', '!', '?'].includes(lastChar)) {
    // If it ends with a question-like word pattern, add question mark
    if (/\b(what|where|when|why|who|how|is it|are you|can you|do you|did you|will you|would you)\b/i.test(text)) {
      return text + '?';
    }
    return text + '.';
  }
  return text;
}

/**
 * Remove duplicate consecutive words (e.g. "the the" → "the").
 */
function removeDuplicateWords(text: string): string {
  return text.replace(/\b(\w+)\s+\1\b/gi, '$1');
}

/**
 * Clean up extra whitespace and normalize spacing around punctuation.
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\s+([,.\?!;:])/g, '$1')  // Remove space before punctuation
    .replace(/([,.\?!;:])\s*/g, '$1 ')  // Ensure space after punctuation
    .replace(/\s{2,}/g, ' ')            // Collapse multiple spaces
    .trim();
}

/* ------------------------------------------------------------------ */
/*  Shared helpers for LLM-based cleanup (Groq + Cerebras)             */
/* ------------------------------------------------------------------ */

/**
 * Words that must be reserved for the model's reasoning tokens on top of the
 * rewritten text. Reasoning tokens are billed against the same completion
 * budget as the answer, so a budget sized only for the output text lets the
 * model run out of room mid-sentence and silently drop the tail.
 */
const CLEANUP_REASONING_HEADROOM_TOKENS = 1024;
const CLEANUP_MIN_TOKENS = 1024;
const CLEANUP_MAX_TOKENS = 8192;

/**
 * Completion budget for a cleanup request: enough for a verbatim rewrite of the
 * transcript (roughly 3 tokens per word) plus reasoning headroom.
 */
export function computeCleanupTokenBudget(rawText: string): number {
  const wordCount = rawText.split(/\s+/).filter(Boolean).length;
  const textTokens = Math.ceil(wordCount * 3);
  return Math.min(
    Math.max(textTokens + CLEANUP_REASONING_HEADROOM_TOKENS, CLEANUP_MIN_TOKENS),
    CLEANUP_MAX_TOKENS,
  );
}

/**
 * Only reasoning-capable models accept `reasoning_effort`. Sending it to any
 * other model makes the request fail, which would cost a whole dictation.
 */
export function supportsReasoningEffort(model: string): boolean {
  return /gpt-oss|qwen3/i.test(model);
}

export function normalizeForComparison(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Decide whether the model's rewrite should be discarded in favor of the raw
 * transcript. Guards against three separate failure modes: an empty response,
 * the model answering the dictation instead of formatting it, and the model
 * dropping part of the transcript without reporting a length stop.
 */
export function shouldUseRawTranscript(rawText: string, cleanedText: string): boolean {
  const rawWords = normalizeForComparison(rawText);
  const cleanedWords = normalizeForComparison(cleanedText);

  if (!cleanedWords.length) {
    return true;
  }

  // A rewrite should stay close to the transcript length. Removing filler words
  // never halves a dictation, so a large collapse means content was dropped.
  if (rawWords.length >= 12 && cleanedWords.length < rawWords.length * 0.4) {
    return true;
  }

  const rawWordSet = new Set(rawWords);
  const overlapCount = cleanedWords.filter((word) => rawWordSet.has(word)).length;
  const overlapRatio = overlapCount / Math.max(cleanedWords.length, 1);
  const looksLikeAssistantReply = /^(sure|absolutely|yes|no|here('| i)?s|the answer|i can|i'm|let me)\b/i.test(
    cleanedText.trim()
  );

  return looksLikeAssistantReply || overlapRatio < 0.45;
}

/**
 * Perform local text cleanup without any API calls.
 * This is the free-tier alternative to Groq LLM cleanup.
 */
export function localCleanupText(rawText: string): string {
  if (!rawText || !rawText.trim()) return rawText;

  let text = rawText.trim();

  text = removeFillers(text);
  text = removeDuplicateWords(text);
  text = capitalizeSentences(text);
  text = ensureEndPunctuation(text);
  text = normalizeWhitespace(text);

  return text;
}
