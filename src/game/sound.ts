// Lightweight procedural audio engine using the Web Audio API.
// No external files — everything is synthesized at runtime.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let enabled = true;

export function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.6;
  master.connect(ctx.destination);

  // pre-bake white noise buffer
  const len = ctx.sampleRate * 1.0;
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
}

export function resumeAudio() {
  if (ctx && ctx.state === "suspended") ctx.resume();
}

export function setAudioEnabled(on: boolean) {
  enabled = on;
  if (master) master.gain.value = on ? 0.6 : 0;
}

export function isAudioEnabled() {
  return enabled;
}

function noiseSource(dur: number) {
  const src = ctx!.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  src.start();
  src.stop(ctx!.currentTime + dur);
  return src;
}

/** Sharp rifle crack: noise burst + body thump. */
export function gunshot(distance = 0) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const vol = Math.max(0.05, 1 - distance / 60);

  const out = ctx.createGain();
  out.gain.value = 0.9 * vol;
  out.connect(master!);

  // crack — filtered noise
  const ns = noiseSource(0.18);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1200;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(1.0, t + 0.005);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  ns.connect(hp).connect(ng).connect(out);

  // body — low sine punch
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(0.8, t + 0.006);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  osc.connect(og).connect(out);
  osc.start(t);
  osc.stop(t + 0.2);
}

export function dryFire() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  osc.connect(g).connect(master!);
  osc.start(t);
  osc.stop(t + 0.06);
}

export function reloadSound() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  // mag out
  click(420, t, 0.18);
  // mag in
  click(260, t + 0.55, 0.3);
  // charging handle
  click(700, t + 1.15, 0.35);
}

function click(freq: number, t: number, vol: number) {
  if (!ctx) return;
  const ns = noiseSource(0.05);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = 6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  ns.connect(bp).connect(g).connect(master!);
}

/** Short metallic hit marker ping. */
export function hitMarker() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(1400, t);
  osc.frequency.exponentialRampToValueAtTime(900, t + 0.05);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.18, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  osc.connect(g).connect(master!);
  osc.start(t);
  osc.stop(t + 0.09);
}

export function hurtSound() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const ns = noiseSource(0.25);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  ns.connect(lp).connect(g).connect(master!);
}

export function footstep(running: boolean) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const ns = noiseSource(0.08);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = running ? 380 : 260;
  const g = ctx.createGain();
  g.gain.setValueAtTime(running ? 0.12 : 0.07, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  ns.connect(lp).connect(g).connect(master!);
}

export function deathSound() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.4, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  osc.connect(g).connect(master!);
  osc.start(t);
  osc.stop(t + 1.0);
}

export function uiClick() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(660, t);
  osc.frequency.exponentialRampToValueAtTime(880, t + 0.05);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.1, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  osc.connect(g).connect(master!);
  osc.start(t);
  osc.stop(t + 0.11);
}
