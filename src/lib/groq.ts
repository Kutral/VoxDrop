import Groq from "groq-sdk";
import {
  computeCleanupTokenBudget,
  shouldUseRawTranscript,
  supportsReasoningEffort,
} from "./textCleanup";

export const DEFAULT_GROQ_CHAT_MODEL = "openai/gpt-oss-20b";
export const DEFAULT_GROQ_WHISPER_MODEL = "whisper-large-v3-turbo";

/**
 * The SDK client is reused across calls so its HTTP connection stays alive.
 * Building a fresh client per request paid for a new TLS handshake on every
 * dictation.
 */
let cachedClient: { apiKey: string; client: Groq } | null = null;

function getGroqClient(apiKey: string): Groq {
  const key = apiKey.trim();
  if (!cachedClient || cachedClient.apiKey !== key) {
    cachedClient = {
      apiKey: key,
      client: new Groq({ apiKey: key, dangerouslyAllowBrowser: true }),
    };
  }
  return cachedClient.client;
}

export async function transcribeAudio(
  base64Audio: string,
  apiKey: string,
  model: string = DEFAULT_GROQ_WHISPER_MODEL
): Promise<string> {
  const groq = getGroqClient(apiKey);

  // Decode straight into a typed array: the previous per-character intermediate
  // `Array` doubled the allocation and the work, on the UI thread.
  const binary = atob(base64Audio);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const file = new File([bytes], "audio.wav", { type: "audio/wav" });

  const transcription = await groq.audio.transcriptions.create({
    file: file,
    model: model || DEFAULT_GROQ_WHISPER_MODEL,
    response_format: "text",
    language: "en",
  });

  return transcription as unknown as string; // GROQ returns raw string when response_format="text"
}

export async function cleanupText(
  rawText: string,
  apiKey: string,
  model: string = DEFAULT_GROQ_CHAT_MODEL
): Promise<string> {
  if (!apiKey || !apiKey.trim()) {
    return rawText;
  }

  const groq = getGroqClient(apiKey);
  const activeModel = model || DEFAULT_GROQ_CHAT_MODEL;

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

  // Budget for the rewrite plus reasoning tokens, which are drawn from the same
  // completion allowance. Sizing this for the text alone let the model run out
  // of room mid-sentence and drop the end of the dictation.
  const maxOutputTokens = computeCleanupTokenBudget(rawText);

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `[DICTATION TO CLEAN]: ${rawText}` },
      ],
      model: activeModel,
      temperature: 0,
      max_completion_tokens: maxOutputTokens,
      // Punctuating speech needs no deliberation, so keep reasoning minimal:
      // it costs latency and competes with the text for the token budget.
      ...(supportsReasoningEffort(activeModel) ? { reasoning_effort: "low" as const } : {}),
    });

    const choice = chatCompletion.choices[0];
    if (!choice || choice.finish_reason === "length") {
      console.warn("Cleanup stopped on its output limit; keeping the raw transcript.");
      return rawText.trim();
    }

    const cleanedText = choice.message?.content?.trim() || rawText;
    return shouldUseRawTranscript(rawText, cleanedText) ? rawText.trim() : cleanedText;
  } catch (err) {
    console.error('Error during Groq cleanup:', err);
    return rawText;
  }
}

export interface KeyValidationResult {
  valid: boolean;
  error?: string;
}

export async function testApiKey(apiKey: string): Promise<KeyValidationResult> {
  if (!apiKey || !apiKey.trim()) {
    return { valid: false, error: 'API key is required' };
  }
  try {
    const groq = getGroqClient(apiKey);
    await groq.models.list();
    return { valid: true };
  } catch (err: any) {
    console.error('Groq key verification failed:', err);
    const status = err?.status || err?.statusCode;
    if (status === 401 || status === 403) {
      return { valid: false, error: 'Unauthorized (invalid key)' };
    }
    if (status === 429) {
      return { valid: false, error: 'Rate limit exceeded' };
    }
    if (err?.message && /network|failed to fetch/i.test(err.message)) {
      return { valid: false, error: 'Network error' };
    }
    return { valid: false, error: err?.message || 'Authentication failed' };
  }
}
