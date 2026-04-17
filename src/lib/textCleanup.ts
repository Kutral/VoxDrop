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
