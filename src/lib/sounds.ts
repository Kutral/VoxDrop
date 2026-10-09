/**
 * Short synthesized earcons. Oscillators are generated on the fly, so there
 * is nothing to decode or load.
 */
let audioCtx: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    audioCtx ??= new AudioContext({ latencyHint: 'interactive' });
    if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => {});
    return audioCtx;
  } catch {
    return null;
  }
}

/** Create the context ahead of the first press so that tone isn't late. */
export function primeAudio() {
  context();
}

function tone(frequency: number, start: number, length: number, peak: number, endFrequency?: number) {
  const ctx = context();
  if (!ctx) return;
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, t);
  if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, t + length * 0.8);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t + length);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

/** Rising blip: the mic is open. */
export function playStartEarcon() {
  tone(440, 0, 0.06, 0.12, 880);
}

/** Two-note chime: text pasted. */
export function playSuccessEarcon() {
  tone(783.99, 0, 0.15, 0.08);
  tone(1046.5, 0.12, 0.23, 0.08);
}

/** Low falling note: something needs attention. */
export function playErrorEarcon() {
  tone(330, 0, 0.18, 0.09, 220);
}
