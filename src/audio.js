let ctx = null;
let master, engineOsc, engineSub, engineFilter, engineGain, windGain;
let muted = false;

function noiseBuffer(seconds) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export function initAudio() {
  if (ctx) return;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  engineOsc = ctx.createOscillator();
  engineOsc.type = 'sawtooth';
  engineSub = ctx.createOscillator();
  engineSub.type = 'square';
  engineFilter = ctx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 400;
  engineGain = ctx.createGain();
  engineGain.gain.value = 0.08;
  engineOsc.connect(engineFilter);
  engineSub.connect(engineFilter);
  engineFilter.connect(engineGain).connect(master);
  engineOsc.start();
  engineSub.start();

  const wind = ctx.createBufferSource();
  wind.buffer = noiseBuffer(2);
  wind.loop = true;
  const wf = ctx.createBiquadFilter();
  wf.type = 'bandpass';
  wf.frequency.value = 500;
  wf.Q.value = 0.6;
  windGain = ctx.createGain();
  windGain.gain.value = 0;
  wind.connect(wf).connect(windGain).connect(master);
  wind.start();
}

export function updateEngine(speed, throttle) {
  if (!ctx) return;
  const kmh = Math.abs(speed) * 3.6;
  const gear = Math.min(4, Math.floor(kmh / 32));
  const rpm = 0.25 + ((kmh - gear * 32) / 32) * 0.75;
  const f = 38 + rpm * 70 + gear * 6;
  const t = ctx.currentTime;
  engineOsc.frequency.setTargetAtTime(f, t, 0.05);
  engineSub.frequency.setTargetAtTime(f / 2, t, 0.05);
  engineFilter.frequency.setTargetAtTime(throttle ? 900 : 450, t, 0.1);
  engineGain.gain.setTargetAtTime(throttle ? 0.1 : 0.06, t, 0.1);
}

export function setWind(level) {
  if (!ctx) return;
  windGain.gain.setTargetAtTime(level * 0.35, ctx.currentTime, 0.5);
}

export function hoot() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const [freq, start] of [[415, 0], [349, 0], [415, 0.22], [349, 0.22]]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t + start);
    g.gain.linearRampToValueAtTime(0.09, t + start + 0.01);
    g.gain.setValueAtTime(0.09, t + start + 0.16);
    g.gain.linearRampToValueAtTime(0, t + start + 0.19);
    o.connect(g).connect(master);
    o.start(t + start);
    o.stop(t + start + 0.2);
  }
}

export function crash(strength) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.4);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 600 + strength * 60;
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.min(0.6, strength * 0.04), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export function jingle() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [523, 659, 784, 1047].forEach((freq, i) => {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t + i * 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.25);
    o.connect(g).connect(master);
    o.start(t + i * 0.08);
    o.stop(t + i * 0.08 + 0.3);
  });
}

const SHOUTS = ['Cape Town! Cape Town!', 'Wynberg! Wynberg!', 'Bellville, Bellville!', 'Claremont! Claremont!', 'Mowbray, Mowbray!', 'Sea Point! Sea Point!'];

export function gaartjie() {
  if (!('speechSynthesis' in window)) return null;
  const line = SHOUTS[Math.floor(Math.random() * SHOUTS.length)];
  const u = new SpeechSynthesisUtterance(line);
  u.rate = 1.35;
  u.pitch = 1.1;
  u.volume = muted ? 0 : 1;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  return line;
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}
