import { transcribeAudio } from './groq';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TranscriptionResult {
  text: string;
  confidence: number;
  durationSeconds: number;
}

export interface TranscriberOptions {
  language?: string;
  /** Groq-specific */
  apiKey?: string;
  whisperModel?: string;
}

/* ------------------------------------------------------------------ */
/*  Native (Web Speech API) — Free tier                                */
/* ------------------------------------------------------------------ */

export function isNativeSpeechAvailable(): boolean {
  return !!(
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition
  );
}

export function nativeTranscribe(
  options: TranscriberOptions = {},
): Promise<TranscriptionResult> {
  return new Promise((resolve, reject) => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      reject(new Error('Speech recognition is not available on this device'));
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = options.language ?? 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    const startTime = Date.now();

    recognition.onresult = (event: any) => {
      const result = event.results[0][0];
      resolve({
        text: result.transcript ?? '',
        confidence: result.confidence ?? 0.8,
        durationSeconds: (Date.now() - startTime) / 1000,
      });
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        resolve({ text: '', confidence: 0, durationSeconds: 0 });
      } else {
        reject(new Error(`Speech recognition error: ${event.error}`));
      }
    };

    recognition.onend = () => {
      // If onresult never fired, resolve empty
      resolve({ text: '', confidence: 0, durationSeconds: (Date.now() - startTime) / 1000 });
    };

    recognition.start();
  });
}

/**
 * Start a native recognition session that can be stopped externally.
 * Returns a controller object with `stop()` and a result promise.
 */
export function startNativeTranscription(options: TranscriberOptions = {}) {
  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    throw new Error('Speech recognition is not available on this device');
  }

  const recognition = new SpeechRecognition();
  recognition.lang = options.language ?? 'en-US';
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  const startTime = Date.now();
  let interimText = '';
  let finalText = '';
  let bestConfidence = 0;
  let resolved = false;

  const resultPromise = new Promise<TranscriptionResult>((resolve) => {
    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
          bestConfidence = Math.max(bestConfidence, result[0].confidence ?? 0.8);
        } else {
          interim += result[0].transcript;
        }
      }

      finalText = final;
      interimText = interim;
    };

    recognition.onend = () => {
      if (!resolved) {
        resolved = true;
        resolve({
          text: (finalText || interimText).trim(),
          confidence: bestConfidence || 0.7,
          durationSeconds: (Date.now() - startTime) / 1000,
        });
      }
    };

    recognition.onerror = (_event: any) => {
      if (!resolved) {
        resolved = true;
        resolve({
          text: (finalText || interimText).trim(),
          confidence: 0,
          durationSeconds: (Date.now() - startTime) / 1000,
        });
      }
    };
  });

  recognition.start();

  return {
    stop: () => {
      try { recognition.stop(); } catch { /* already stopped */ }
    },
    getInterimText: () => interimText || finalText,
    result: resultPromise,
  };
}

/* ------------------------------------------------------------------ */
/*  Groq-powered — Premium tier                                        */
/* ------------------------------------------------------------------ */

/**
 * Transcribe a base64-encoded WAV using the Groq Whisper API.
 * This requires an API key (premium feature).
 */
export async function groqTranscribe(
  base64Audio: string,
  options: TranscriberOptions,
): Promise<TranscriptionResult> {
  if (!options.apiKey) {
    throw new Error('API key is required for Groq transcription');
  }

  const startTime = Date.now();
  const text = await transcribeAudio(
    base64Audio,
    options.apiKey,
    options.whisperModel ?? 'whisper-large-v3-turbo',
  );

  return {
    text: text.trim(),
    confidence: 0.95, // Groq Whisper is high-confidence
    durationSeconds: (Date.now() - startTime) / 1000,
  };
}
