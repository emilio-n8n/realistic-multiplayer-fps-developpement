// Lightweight procedural audio engine using the Web Audio API.
// No external files — everything is synthesized at runtime.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let reverbNode: ConvolverNode | null = null;
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

  // Build synthetic convolution reverb impulse response
  const irLen = Math.floor(ctx.sampleRate * 0.45);
  const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const chData = ir.getChannelData(ch);
    const earlyLen = Math.floor(ctx.sampleRate * 0.03);
    for (let i = 0; i < earlyLen; i++) {
      const t = i / ctx.sampleRate;
      chData[i] = (Math.random() * 2 - 1) * Math.exp(-t * 45);
    }
    for (let i = earlyLen; i < irLen; i++) {
      const t = i / ctx.sampleRate;
      chData[i] =
        (Math.random() * 2 - 1) *
        Math.exp(-t * 6) *
        (0.8 + 0.2 * Math.sin(t * 137 * (1 + ch * 0.07)));
    }
  }
  reverbNode = ctx.createConvolver();
  reverbNode.buffer = ir;
  reverbNode.connect(master);
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

// ---------------------------------------------------------------------------
// GUNSHOT — 5-layer attack with distance simulation and reverb tail
// ---------------------------------------------------------------------------
export function gunshot(distance = 0) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const d = Math.max(0, distance);
  const vol = Math.max(0.02, Math.pow(1 - Math.min(d, 60) / 60, 0.7));
  const muffle = Math.min(1, d / 30);

  const out = ctx.createGain();
  out.gain.value = 0.9 * vol;
  out.connect(master!);

  // --- CRACK BUS: high-frequency content preserved at distance -----------
  const crackBus = ctx.createGain();
  crackBus.gain.value = 0.5;
  crackBus.connect(out);

  // Layer 1 — attack transient (initial spike)
  const spike = noiseSource(0.02);
  const spikeF = ctx.createBiquadFilter();
  spikeF.type = "bandpass";
  spikeF.frequency.value = 2500;
  spikeF.Q.value = 3;
  const spikeG = ctx.createGain();
  spikeG.gain.setValueAtTime(0.0001, t);
  spikeG.gain.exponentialRampToValueAtTime(1.0, t + 0.001);
  spikeG.gain.exponentialRampToValueAtTime(0.0001, t + 0.015);
  spike.connect(spikeF).connect(spikeG).connect(crackBus);

  // Layer 2 — crack (highpass noise burst)
  const crack = noiseSource(0.08);
  const crackF = ctx.createBiquadFilter();
  crackF.type = "highpass";
  crackF.frequency.value = 3000;
  const crackG = ctx.createGain();
  crackG.gain.setValueAtTime(0.0001, t);
  crackG.gain.exponentialRampToValueAtTime(0.5, t + 0.003);
  crackG.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  crack.connect(crackF).connect(crackG).connect(crackBus);

  // Layer 3 — supersonic crack (oscillator sweep)
  const sc = ctx.createOscillator();
  sc.type = "sawtooth";
  sc.frequency.setValueAtTime(10000, t);
  sc.frequency.exponentialRampToValueAtTime(2000, t + 0.025);
  const scF = ctx.createBiquadFilter();
  scF.type = "highpass";
  scF.frequency.value = 5000;
  const scG = ctx.createGain();
  scG.gain.setValueAtTime(0.0001, t);
  scG.gain.exponentialRampToValueAtTime(0.12, t + 0.002);
  scG.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
  sc.connect(scF).connect(scG).connect(crackBus);
  sc.start(t);
  sc.stop(t + 0.03);

  // --- BODY BUS: low-mid content, muffled at distance --------------------
  const bodyBus = ctx.createGain();
  bodyBus.gain.value = 0.6;
  if (muffle > 0.01) {
    const bodyLP = ctx.createBiquadFilter();
    bodyLP.type = "lowpass";
    bodyLP.frequency.value = Math.max(200, 2500 - d * 70);
    bodyBus.connect(bodyLP).connect(out);
  } else {
    bodyBus.connect(out);
  }

  // Layer 4 — body noise (lowpass)
  const body = noiseSource(0.18);
  const bodyF = ctx.createBiquadFilter();
  bodyF.type = "lowpass";
  bodyF.frequency.value = 600;
  const bodyG = ctx.createGain();
  bodyG.gain.setValueAtTime(0.0001, t);
  bodyG.gain.exponentialRampToValueAtTime(0.7, t + 0.004);
  bodyG.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
  body.connect(bodyF).connect(bodyG).connect(bodyBus);

  // Layer 5 — sub-bass thump (sine)
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(80, t);
  sub.frequency.exponentialRampToValueAtTime(30, t + 0.12);
  const subG = ctx.createGain();
  subG.gain.setValueAtTime(0.0001, t);
  subG.gain.exponentialRampToValueAtTime(0.7, t + 0.004);
  subG.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
  sub.connect(subG).connect(bodyBus);
  sub.start(t);
  sub.stop(t + 0.16);

  // --- Reverb tail (more send for distant shots — simulates environmental echo)
  const revG = ctx.createGain();
  revG.gain.value = Math.min(0.1 + muffle * 0.3, 0.35);
  out.connect(revG);
  revG.connect(reverbNode!);
}

// ---------------------------------------------------------------------------
// OTHER EXISTING SOUNDS
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
export function reloadSound() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const r = 0.92 + Math.random() * 0.16;

  // Mag release button click
  click(900 * r, t, 0.08);
  // Mag out (longer, lower)
  click(350 * r, t + 0.12, 0.2);

  // Magazine insertion thump
  const thump = ctx!.createOscillator();
  thump.type = "triangle";
  thump.frequency.setValueAtTime(120, t + 0.5);
  thump.frequency.exponentialRampToValueAtTime(60, t + 0.6);
  const thumpG = ctx!.createGain();
  thumpG.gain.setValueAtTime(0.0001, t + 0.5);
  thumpG.gain.exponentialRampToValueAtTime(0.25, t + 0.505);
  thumpG.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  thump.connect(thumpG).connect(master!);
  thump.start(t + 0.5);
  thump.stop(t + 0.65);

  // Mag catch click
  click(600 * r, t + 0.7, 0.15);
  // Charging handle rack
  click(750 * r, t + 1.1, 0.35);
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

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// FOOTSTEP — surface variation + multi-layer impact
// ---------------------------------------------------------------------------
export function footstep(running: boolean) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const surface = Math.floor(Math.random() * 3);

  const baseVol = running ? 0.12 : 0.06;
  const baseFreq = running ? 380 : 200;

  const out = ctx.createGain();
  out.gain.value = baseVol;
  out.connect(master!);

  // Main footstep thud (noise layer)
  const ns = noiseSource(0.08);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  switch (surface) {
    case 0: lp.frequency.value = baseFreq * 1.2; break; // concrete
    case 1: lp.frequency.value = baseFreq * 1.8; break; // metal
    default: lp.frequency.value = baseFreq * 0.7; break; // dirt
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(1, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  ns.connect(lp).connect(g).connect(out);

  // Impact click for hard surfaces
  if (surface === 0 || surface === 1) {
    const clickOsc = ctx.createOscillator();
    clickOsc.type = "triangle";
    clickOsc.frequency.value = surface === 1 ? 1500 : 800;
    const clickG = ctx.createGain();
    clickG.gain.setValueAtTime(0.0001, t);
    clickG.gain.exponentialRampToValueAtTime(running ? 0.08 : 0.04, t + 0.003);
    clickG.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    clickOsc.connect(clickG).connect(out);
    clickOsc.start(t);
    clickOsc.stop(t + 0.03);
  }
}

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
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

export function grenadeCook() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const ns = noiseSource(0.05);
  const bp = ctx.createBiquadFilter();
  bp.type = "highpass";
  bp.frequency.value = 3000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.15, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  ns.connect(bp).connect(g).connect(master!);
}

export function explosion() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(80, t);
  osc.frequency.exponentialRampToValueAtTime(20, t + 0.6);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(0.8, t + 0.02);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
  osc.connect(og).connect(master!);
  osc.start(t);
  osc.stop(t + 0.85);
  const ns = noiseSource(0.5);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(6000, t);
  lp.frequency.exponentialRampToValueAtTime(200, t + 0.5);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(1.0, t + 0.01);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  ns.connect(lp).connect(ng).connect(master!);
}

// ---------------------------------------------------------------------------
// NEW SOUNDS
// ---------------------------------------------------------------------------

/** Bullet whiz/snap — fast frequency sweep simulating supersonic projectile passing near. */
export function bulletWhiz(distance: number) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const vol = Math.max(0, 1 - distance / 25);
  if (vol < 0.01) return;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(6000, t);
  osc.frequency.exponentialRampToValueAtTime(200, t + 0.15);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol * 0.08, t + 0.02);
  g.gain.exponentialRampToValueAtTime(vol * 0.04, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);

  osc.connect(g).connect(master!);
  osc.start(t);
  osc.stop(t + 0.16);
}

/** Metallic scrape and spring release for a grenade pin pull. */
export function grenadePinPull() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;

  // Metallic scrape
  const ns = noiseSource(0.3);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(2000, t);
  bp.frequency.exponentialRampToValueAtTime(4000, t + 0.2);
  bp.Q.value = 3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.04, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  ns.connect(bp).connect(g).connect(master!);

  // Spring release
  const spring = ctx.createOscillator();
  spring.type = "triangle";
  spring.frequency.setValueAtTime(300, t + 0.25);
  spring.frequency.exponentialRampToValueAtTime(800, t + 0.35);
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.0001, t + 0.25);
  sg.gain.exponentialRampToValueAtTime(0.03, t + 0.26);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  spring.connect(sg).connect(master!);
  spring.start(t + 0.25);
  spring.stop(t + 0.42);
}

/** Subtle UI hover accent. */
export function uiHover() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(400, t);
  osc.frequency.exponentialRampToValueAtTime(500, t + 0.04);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.02, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  osc.connect(g).connect(master!);
  osc.start(t);
  osc.stop(t + 0.07);
}
