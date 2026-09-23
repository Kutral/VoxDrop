import {
  computeCleanupTokenBudget,
  shouldUseRawTranscript,
  supportsReasoningEffort,
} from './textCleanup';

export const DEFAULT_CEREBRAS_MODEL = 'gpt-oss-120b';
const CEREBRAS_BASE_URL = 'https://api.cerebras.ai/v1';

export async function cleanupTextCerebras(
  rawText: string,
  apiKey: string,
  model: string = DEFAULT_CEREBRAS_MODEL
): Promise<string> {
  if (!apiKey || !apiKey.trim()) {
    return rawText;
  }

  const systemPrompt = `You are a DICTATION TEXT FORMATTER. You are NOT a chatbot. You are NOT an assistant. You do NOT answer questions. You do NOT have conversations.

Your ONLY job: Take the raw transcribed speech below and return a cleaned-up version of THE EXACT SAME TEXT the speaker said.

STRICT RULES:
1. NEVER reply to or answer the content. If the speaker says "Hey is it working?" you output "Hey, is it working?" — you do NOT respond with an answer.
2. NEVER add your own words, opinions, greetings, or explanations. Output ONLY what the speaker said.
3. Remove filler words: um, uh, like, you know, basically, actually, literally, so, I mean — unless grammatically essential.
4. Add proper punctuation (commas, periods, question marks) and capitalize sentence starts.
5. If the speaker corrects themselves (e.g. "meet at 2 actually 3"), output only the corrected version ("meet at 3").
6. If numbered items are spoken, format as a numbered list.
7. Preserve the speaker's exact meaning, tone, and intent.

CRITICAL: Your output must contain ONLY the cleaned version of what was spoken. Nothing else. No preamble. No explanation. No "Here's the cleaned text:". Just the cleaned text itself.`;

  const activeModel = model || DEFAULT_CEREBRAS_MODEL;
  // Budget for the rewrite plus reasoning tokens, which are drawn from the same
  // completion allowance. Sizing this for the text alone let the model run out
  // of room mid-sentence and drop the end of the dictation.
  const maxOutputTokens = computeCleanupTokenBudget(rawText);

  const requestBody: Record<string, unknown> = {
    model: activeModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `[DICTATION TO CLEAN]: ${rawText}` },
    ],
    temperature: 0,
    max_completion_tokens: maxOutputTokens,
  };

  // Punctuating speech needs no deliberation, so keep reasoning minimal: it
  // costs latency and competes with the text for the token budget.
  if (supportsReasoningEffort(activeModel)) {
    requestBody.reasoning_effort = 'low';
  }

  try {
    const response = await fetch(`${CEREBRAS_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      console.warn(`Cerebras API returned status ${response.status}: ${response.statusText}`);
      return rawText;
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice || choice.finish_reason === 'length') {
      console.warn('Cerebras cleanup stopped on its output limit; keeping the raw transcript.');
      return rawText.trim();
    }

    const cleanedText = choice.message?.content?.trim() || rawText;
    return shouldUseRawTranscript(rawText, cleanedText) ? rawText.trim() : cleanedText;
  } catch (err) {
    console.error('Error during Cerebras cleanup:', err);
    return rawText;
  }
}

export interface CerebrasKeyValidationResult {
  valid: boolean;
  error?: string;
}

export async function testCerebrasKey(apiKey: string): Promise<CerebrasKeyValidationResult> {
  if (!apiKey || !apiKey.trim()) {
    return { valid: false, error: 'API key is required' };
  }

  try {
    const response = await fetch(`${CEREBRAS_BASE_URL}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
      },
    });

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 401 || response.status === 403) {
      return { valid: false, error: 'Unauthorized (invalid key)' };
    }

    if (response.status === 429) {
      return { valid: false, error: 'Rate limit exceeded' };
    }

    // If /models returns 404, fallback to minimal chat completion check with default model
    if (response.status === 404) {
      const chatRes = await fetch(`${CEREBRAS_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: DEFAULT_CEREBRAS_MODEL,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1,
        }),
      });

      if (chatRes.ok) {
        return { valid: true };
      }
      if (chatRes.status === 401 || chatRes.status === 403) {
        return { valid: false, error: 'Unauthorized (invalid key)' };
      }
    }

    return { valid: false, error: `Error ${response.status}: ${response.statusText}` };
  } catch (err) {
    console.error('Cerebras key verification failed:', err);
    return { valid: false, error: 'Network error' };
  }
}
