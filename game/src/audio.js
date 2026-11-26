// audio.js — WebAudio synth only, no files: engine drone, wind noise, ring
// chime, touchdown thud, crash burst, UI click. Starts on first user gesture.
export function createAudio() {
  let ctx = null, master = null, engOsc = null, engOsc2 = null, engGain = null;
  let windSrc = null, windGain = null, windFilter = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned saws through a lowpass.
      engOsc = ctx.createOscillator(); engOsc.type = 'sawtooth'; engOsc.frequency.value = 55;
      engOsc2 = ctx.createOscillator(); engOsc2.type = 'sawtooth'; engOsc2.frequency.value = 83;
      const engFilter = ctx.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 420;
      engGain = ctx.createGain(); engGain.gain.value = 0;
      engOsc.connect(engFilter); engOsc2.connect(engFilter);
      engFilter.connect(engGain); engGain.connect(master);
      engOsc.start(); engOsc2.start();
      // Wind: looped noise buffer through a bandpass.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      windSrc = ctx.createBufferSource(); windSrc.buffer = buf; windSrc.loop = true;
      windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 600; windFilter.Q.value = 0.6;
      windGain = ctx.createGain(); windGain.gain.value = 0;
      windSrc.connect(windFilter); windFilter.connect(windGain); windGain.connect(master);
      windSrc.start();
      return true;
    } catch (e) { return false; }
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  return {
    start() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    setEngine(throttle, speed) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const rpm = 50 + throttle * 90 + speed * 0.5;
      engOsc.frequency.setTargetAtTime(rpm, t, 0.08);
      engOsc2.frequency.setTargetAtTime(rpm * 1.5, t, 0.08);
      engGain.gain.setTargetAtTime(0.05 + throttle * 0.11, t, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.22, speed * 0.0022), t, 0.15);
      windFilter.frequency.setTargetAtTime(400 + speed * 9, t, 0.15);
    },
    chime() { blip(880, 0.35, 'sine', 0.35); blip(1318, 0.5, 'sine', 0.3, 0.09); },
    thud() { blip(70, 0.3, 'sine', 0.6); blip(45, 0.4, 'triangle', 0.5, 0.02); },
    crash() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const len = ctx.sampleRate * 0.7;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const g = ctx.createGain(); g.gain.value = 0.8;
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t);
      blip(55, 0.6, 'sine', 0.5);
    },
    click() { blip(660, 0.08, 'square', 0.12); },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    get muted() { return muted; },
  };
}
