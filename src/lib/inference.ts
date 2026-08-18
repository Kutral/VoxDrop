import { cleanupText as cleanupGroqText, testApiKey as testGroqApiKey, DEFAULT_GROQ_CHAT_MODEL } from './groq';
import { cleanupTextCerebras, testCerebrasKey, DEFAULT_CEREBRAS_MODEL } from './cerebras';
import { localCleanupText } from './textCleanup';

export type LLMProvider = 'groq' | 'cerebras';

export const GROQ_MODEL_PRESETS = [
  { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B (Fast & Accurate)', tag: 'Recommended' },
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B (Flagship)', tag: 'Versatile' },
  { id: 'qwen/qwen3.6-27b', label: 'Qwen 3.6 27B', tag: 'Reasoning' },
  { id: 'allam-2-7b', label: 'ALLaM 2 7B V1', tag: 'Multilingual' },
];

export const CEREBRAS_MODEL_PRESETS = [
  { id: 'gemma-4-31b', label: 'Gemma 4 31B (Cerebras Ultra-Fast)', tag: 'Recommended' },
  { id: 'gpt-oss-120b', label: 'GPT-OSS 120B (Cerebras Flagship)', tag: 'Flagship' },
];

export const WHISPER_MODEL_PRESETS = [
  { id: 'whisper-large-v3-turbo', label: 'Whisper Turbo (Near-Instant)', tag: 'Recommended' },
  { id: 'whisper-large-v3', label: 'Whisper Large V3 (Accurate)', tag: 'Max Quality' },
];

export async function cleanupTextWithProvider(
  rawText: string,
  provider: LLMProvider,
  apiKey: string,
  model: string,
  fallbackGroqKey?: string
): Promise<string> {
  if (!rawText || !rawText.trim()) return rawText;

  // If no primary API key is provided
  if (!apiKey || !apiKey.trim()) {
    // If Cerebras was selected without a key but Groq key is present, fallback to Groq
    if (provider === 'cerebras' && fallbackGroqKey && fallbackGroqKey.trim()) {
      try {
        const groqRes = await cleanupGroqText(rawText, fallbackGroqKey, DEFAULT_GROQ_CHAT_MODEL);
        return groqRes || localCleanupText(rawText);
      } catch {
        return localCleanupText(rawText);
      }
    }
    return localCleanupText(rawText);
  }

  try {
    if (provider === 'cerebras') {
      const activeModel = model || DEFAULT_CEREBRAS_MODEL;
      const res = await cleanupTextCerebras(rawText, apiKey, activeModel);
      if (res && res !== rawText) return res;

      // If Cerebras cleanup returned rawText (e.g. API error), try fallback Groq if available
      if (fallbackGroqKey && fallbackGroqKey.trim()) {
        try {
          const fallbackRes = await cleanupGroqText(rawText, fallbackGroqKey, DEFAULT_GROQ_CHAT_MODEL);
          if (fallbackRes) return fallbackRes;
        } catch {
          // ignore fallback error
        }
      }
      return localCleanupText(rawText);
    } else {
      const activeModel = model || DEFAULT_GROQ_CHAT_MODEL;
      const res = await cleanupGroqText(rawText, apiKey, activeModel);
      return res || localCleanupText(rawText);
    }
  } catch (err) {
    console.warn(`Provider [${provider}] cleanup failed, attempting fallback:`, err);
    if (provider === 'cerebras' && fallbackGroqKey && fallbackGroqKey.trim()) {
      try {
        const fallbackRes = await cleanupGroqText(rawText, fallbackGroqKey, DEFAULT_GROQ_CHAT_MODEL);
        if (fallbackRes) return fallbackRes;
      } catch {
        // ignore
      }
    }
    return localCleanupText(rawText);
  }
}

export interface ProviderKeyValidationResult {
  valid: boolean;
  error?: string;
}

export async function testKeyWithProvider(
  provider: LLMProvider,
  apiKey: string
): Promise<ProviderKeyValidationResult> {
  if (!apiKey || !apiKey.trim()) {
    return { valid: false, error: 'API key is required' };
  }

  if (provider === 'cerebras') {
    return testCerebrasKey(apiKey);
  }
  return testGroqApiKey(apiKey);
}
