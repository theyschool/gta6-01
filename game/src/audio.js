// All sound is synthesized with WebAudio — no audio files, no network. Engine hum, sirens,
// gunshots, pickups and a small bass-and-hats loop are built from oscillators and noise.
// Everything is guarded: with no user gesture yet (or no audio device) every call is a no-op.

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let musicTimer = null;
  let muted = false;
  let musicOn = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
    } catch {
      return false;
    }
    return true;
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(freq, dur, type, volume, slideTo) {
    if (!ensure()) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    } catch { /* audio is decoration, never a crash */ }
  }

  function noiseBurst(dur, volume, lowpass) {
    if (!ensure()) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(dur);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass || 3000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    } catch { /* audio is decoration, never a crash */ }
  }

  /** A 16-step loop: low bass line plus hats, scheduled a bar ahead. */
  const BASS = [55, 0, 55, 65.4, 0, 55, 0, 82.4, 55, 0, 55, 65.4, 49, 0, 58.3, 0];
  function scheduleMusic() {
    if (!ctx || !musicOn) return;
    const stepDur = 60 / 112 / 2;
    let step = 0;
    const tick = () => {
      if (!musicOn || !ctx) return;
      const freq = BASS[step % 16];
      if (freq > 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + stepDur * 1.8);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start();
        osc.stop(ctx.currentTime + stepDur * 2);
      }
      if (step % 2 === 0) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(0.03);
        const gain = ctx.createGain();
        gain.gain.value = step % 8 === 4 ? 0.25 : 0.1;
        src.connect(gain);
        gain.connect(musicGain);
        src.start();
      }
      step += 1;
      musicTimer = window.setTimeout(tick, stepDur * 1000);
    };
    tick();
  }

  return {
    /** Call from a user gesture (or any key press): creates the context and starts music. */
    enable() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (!musicOn) {
        musicOn = true;
        scheduleMusic();
      }
    },
    toggleMute() {
      muted = !muted;
      if (master && ctx) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() { return muted; },
    click() { blip(660, 0.07, 'square', 0.15); },
    pickup() { blip(880, 0.09, 'sine', 0.25); window.setTimeout(() => blip(1318, 0.12, 'sine', 0.2), 70); },
    cash() { blip(988, 0.08, 'triangle', 0.25); window.setTimeout(() => blip(1318, 0.14, 'triangle', 0.25), 80); },
    punch() { noiseBurst(0.08, 0.35, 900); },
    shot() { noiseBurst(0.14, 0.5, 2400); blip(160, 0.1, 'sawtooth', 0.3, 60); },
    explosion() { noiseBurst(0.7, 0.7, 700); blip(70, 0.6, 'sine', 0.5, 30); },
    mission() { [523, 659, 784, 1046].forEach((f, i) => window.setTimeout(() => blip(f, 0.16, 'triangle', 0.28), i * 95)); },
    fail() { [392, 330, 262].forEach((f, i) => window.setTimeout(() => blip(f, 0.2, 'sawtooth', 0.2), i * 120)); },
    siren(on) {
      if (on === false) {
        if (sirenTimer) { window.clearInterval(sirenTimer); sirenTimer = null; }
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      if (!ensure() || sirenTimer) return;
      try {
        sirenOsc = ctx.createOscillator();
        sirenGain = ctx.createGain();
        sirenOsc.type = 'sine';
        sirenOsc.frequency.value = 700;
        sirenGain.gain.value = 0.05;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        let high = false;
        sirenTimer = window.setInterval(() => {
          if (!sirenOsc) return;
          high = !high;
          sirenOsc.frequency.setValueAtTime(high ? 950 : 700, ctx.currentTime);
        }, 420);
      } catch { /* siren is decoration */ }
    },
    /** Engine hum follows the car's speed (0..1); off when on foot. */
    engine(speed01) {
      if (!ensure()) return;
      try {
        if (speed01 <= 0.02) {
          if (engineGain) engineGain.gain.value = 0;
          return;
        }
        if (!engineOsc) {
          engineOsc = ctx.createOscillator();
          engineGain = ctx.createGain();
          engineOsc.type = 'sawtooth';
          engineOsc.frequency.value = 60;
          engineGain.gain.value = 0;
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 500;
          engineOsc.connect(filter);
          filter.connect(engineGain);
          engineGain.connect(master);
          engineOsc.start();
        }
        engineOsc.frequency.setValueAtTime(55 + speed01 * 140, ctx.currentTime);
        engineGain.gain.setValueAtTime(0.045 + speed01 * 0.05, ctx.currentTime);
      } catch { /* engine hum is decoration */ }
    },
  };
}
