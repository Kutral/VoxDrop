  let audioCtx: AudioContext | null = null;
  
  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }
  
  export function playStartEarcon() {
    try {
      const ctx = getAudioContext();
      const t = ctx.currentTime;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      // Crisp upward sweep for "activation"
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.05);
      
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      
      osc.start(t);
      osc.stop(t + 0.07);
    } catch (e) {
      console.error('Failed to play start earcon', e);
    }
  }
  
  export function playSuccessEarcon() {
    try {
      const ctx = getAudioContext();
      const t = ctx.currentTime;
      
      // Cheerful "Success" two-tone chime (G5 -> C6)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(783.99, t); // G5
      
      gain1.gain.setValueAtTime(0, t);
      gain1.gain.linearRampToValueAtTime(0.08, t + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1046.50, t + 0.12); // C6
  
      gain2.gain.setValueAtTime(0, t + 0.12);
      gain2.gain.linearRampToValueAtTime(0.08, t + 0.14);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      
      osc1.start(t);
      osc1.stop(t + 0.2);
      
      osc2.start(t + 0.12);
      osc2.stop(t + 0.4);
    } catch (e) {
      console.error('Failed to play success earcon', e);
    }
  }
