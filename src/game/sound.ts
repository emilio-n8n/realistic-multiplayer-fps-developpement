// Lightweight procedural audio engine using the Web Audio API.
// No external files — everything is synthesized at runtime.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let reverbNode: ConvolverNode | null = null;
let enabled = true;
let helicopterOsc: OscillatorNode | null = null;
let helicopterNoise: AudioBufferSourceNode | null = null;

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

// ---------------------------------------------------------------------------
export function attachmentEquip() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = "square";
  o.frequency.setValueAtTime(800, t);
  o.frequency.exponentialRampToValueAtTime(1200, t + 0.05);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.08, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + 0.1);
}

// ---------------------------------------------------------------------------
// SMG SHOT — high-pitched, short pop with minimal sub-bass
// ---------------------------------------------------------------------------
export function smgShot(distance = 0) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const d = Math.max(0, distance);
  const vol = Math.max(0.02, Math.pow(1 - Math.min(d, 60) / 60, 0.7));
  const muffle = Math.min(1, d / 30);

  const out = ctx.createGain();
  out.gain.value = 0.6 * vol;
  out.connect(master!);

  if (muffle > 0.01) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.max(300, 4000 - d * 90);
    out.disconnect();
    out.connect(lp).connect(master!);
  }

  // Pop — noise burst at 3kHz
  const pop = noiseSource(0.05);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 3000;
  bp.Q.value = 4;
  const pg = ctx.createGain();
  pg.gain.setValueAtTime(0.0001, t);
  pg.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.002);
  pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  pop.connect(bp).connect(pg).connect(out);

  // Sub-bass — very minimal
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(100, t);
  sub.frequency.exponentialRampToValueAtTime(50, t + 0.04);
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(0.08 * vol, t + 0.002);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  sub.connect(sg).connect(out);
  sub.start(t);
  sub.stop(t + 0.06);
}

// ---------------------------------------------------------------------------
// SHOTGUN SHOT — deep boom with long reverb tail
// ---------------------------------------------------------------------------
export function shotgunShot(distance = 0) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const d = Math.max(0, distance);
  const vol = Math.max(0.02, Math.pow(1 - Math.min(d, 60) / 60, 0.7));
  const muffle = Math.min(1, d / 30);

  const out = ctx.createGain();
  out.gain.value = 1.0 * vol;
  out.connect(master!);

  if (muffle > 0.01) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.max(150, 2000 - d * 60);
    out.disconnect();
    out.connect(lp).connect(master!);
  }

  // Noise burst at 800Hz
  const ns = noiseSource(0.15);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 800;
  bp.Q.value = 2;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.6 * vol, t + 0.005);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
  ns.connect(bp).connect(ng).connect(out);

  // Low-frequency rumble 60Hz→25Hz
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(60, t);
  osc.frequency.exponentialRampToValueAtTime(25, t + 0.35);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(0.7 * vol, t + 0.005);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  osc.connect(og).connect(out);
  osc.start(t);
  osc.stop(t + 0.45);

  // Reverb tail
  const revG = ctx.createGain();
  revG.gain.value = Math.min(0.15 + muffle * 0.35, 0.4);
  out.connect(revG);
  revG.connect(reverbNode!);
}

// ---------------------------------------------------------------------------
// SNIPER SHOT — loud crack + deep report with long reverb
// ---------------------------------------------------------------------------
export function sniperShot(distance = 0) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const d = Math.max(0, distance);
  const vol = Math.max(0.02, Math.pow(1 - Math.min(d, 60) / 60, 0.7));
  const muffle = Math.min(1, d / 30);

  const out = ctx.createGain();
  out.gain.value = 1.2 * vol;
  out.connect(master!);

  if (muffle > 0.01) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.max(200, 3000 - d * 80);
    out.disconnect();
    out.connect(lp).connect(master!);
  }

  // Sharp transient — bandpass at 4kHz
  const crack = noiseSource(0.03);
  const crackF = ctx.createBiquadFilter();
  crackF.type = "bandpass";
  crackF.frequency.value = 4000;
  crackF.Q.value = 5;
  const crackG = ctx.createGain();
  crackG.gain.setValueAtTime(0.0001, t);
  crackG.gain.exponentialRampToValueAtTime(1.0 * vol, t + 0.001);
  crackG.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
  crack.connect(crackF).connect(crackG).connect(out);

  // Deep report at 200Hz
  const body = noiseSource(0.3);
  const bodyF = ctx.createBiquadFilter();
  bodyF.type = "lowpass";
  bodyF.frequency.value = 400;
  const bodyG = ctx.createGain();
  bodyG.gain.setValueAtTime(0.0001, t);
  bodyG.gain.exponentialRampToValueAtTime(0.6 * vol, t + 0.005);
  bodyG.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  body.connect(bodyF).connect(bodyG).connect(out);

  // Sub-bass
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(200, t);
  sub.frequency.exponentialRampToValueAtTime(50, t + 0.25);
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.005);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  sub.connect(sg).connect(out);
  sub.start(t);
  sub.stop(t + 0.35);

  // Reverb tail
  const revG = ctx.createGain();
  revG.gain.value = Math.min(0.2 + muffle * 0.4, 0.5);
  out.connect(revG);
  revG.connect(reverbNode!);
}

// ---------------------------------------------------------------------------
// PISTOL SHOT — sharp pop, quick transient, short decay
// ---------------------------------------------------------------------------
export function pistolShot(distance = 0) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const d = Math.max(0, distance);
  const vol = Math.max(0.02, Math.pow(1 - Math.min(d, 60) / 60, 0.7));
  const muffle = Math.min(1, d / 30);

  const out = ctx.createGain();
  out.gain.value = 0.7 * vol;
  out.connect(master!);

  if (muffle > 0.01) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.max(300, 3500 - d * 80);
    out.disconnect();
    out.connect(lp).connect(master!);
  }

  // Noise burst at 2kHz
  const ns = noiseSource(0.04);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2000;
  bp.Q.value = 4;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.45 * vol, t + 0.002);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
  ns.connect(bp).connect(ng).connect(out);

  // Sine 200Hz
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(120, t + 0.06);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(0.2 * vol, t + 0.003);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  osc.connect(og).connect(out);
  osc.start(t);
  osc.stop(t + 0.1);
}

// ---------------------------------------------------------------------------
// MELEE SWISH — bandpass noise sweep
// ---------------------------------------------------------------------------
export function meleeSwish() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;

  const ns = noiseSource(0.12);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(500, t);
  bp.frequency.exponentialRampToValueAtTime(200, t + 0.1);
  bp.Q.value = 3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  ns.connect(bp).connect(g).connect(master!);
}

// ---------------------------------------------------------------------------
// MELEE HIT — dull thud + bone crack
// ---------------------------------------------------------------------------
export function meleeHit() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;

  // Dull thud — lowpass noise at 200Hz
  const ns = noiseSource(0.1);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 200;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.35, t + 0.003);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  ns.connect(lp).connect(ng).connect(master!);

  // Bone crack — square wave click at 400Hz
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.value = 400;
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(0.08, t + 0.002);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  osc.connect(og).connect(master!);
  osc.start(t);
  osc.stop(t + 0.05);
}

// ---------------------------------------------------------------------------
// FLASHBANG DETONATE — loud noise burst with metallic ring
// ---------------------------------------------------------------------------
export function flashbangDetonate(distance = 0) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const d = Math.max(0, distance);
  const vol = Math.max(0.02, Math.pow(1 - Math.min(d, 40) / 40, 0.6));

  const out = ctx.createGain();
  out.gain.value = vol;
  out.connect(master!);

  // White noise burst 0.3s
  const ns = noiseSource(0.35);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.9 * vol, t + 0.003);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  ns.connect(ng).connect(out);

  // Metallic ringing tail — sine 3000Hz slow decay
  const ring = ctx.createOscillator();
  ring.type = "sine";
  ring.frequency.value = 3000;
  const rg = ctx.createGain();
  rg.gain.setValueAtTime(0.0001, t + 0.05);
  rg.gain.exponentialRampToValueAtTime(0.25 * vol, t + 0.1);
  rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
  ring.connect(rg).connect(out);
  ring.start(t);
  ring.stop(t + 0.85);
}

// ---------------------------------------------------------------------------
// SMOKE DEPLOY — highpass hiss
// ---------------------------------------------------------------------------
export function smokeDeploy() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;

  const ns = noiseSource(0.55);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 4000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  ns.connect(hp).connect(g).connect(master!);
}

// ---------------------------------------------------------------------------
// CLAYMORE BEEP — two quick high-pitched beeps
// ---------------------------------------------------------------------------
export function claymoreBeep() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;

  const beep = (startTime: number) => {
    const osc = ctx!.createOscillator();
    osc.type = "square";
    osc.frequency.value = 2000;
    const g = ctx!.createGain();
    g.gain.setValueAtTime(0.0001, startTime);
    g.gain.exponentialRampToValueAtTime(0.15, startTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.04);
    osc.connect(g).connect(master!);
    osc.start(startTime);
    osc.stop(startTime + 0.05);
  };

  beep(t);
  beep(t + 0.15);
}

// ---------------------------------------------------------------------------
// CLAYMORE EXPLODE — concussive blast
// ---------------------------------------------------------------------------
export function claymoreExplode(distance = 0) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const d = Math.max(0, distance);
  const vol = Math.max(0.02, Math.pow(1 - Math.min(d, 40) / 40, 0.7));

  const out = ctx.createGain();
  out.gain.value = vol;
  out.connect(master!);

  // Low bandpass noise at 100Hz
  const ns = noiseSource(0.3);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 100;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.8 * vol, t + 0.005);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  ns.connect(lp).connect(ng).connect(out);

  // Sub-bass sine 50→20Hz
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(50, t);
  sub.frequency.exponentialRampToValueAtTime(20, t + 0.2);
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(0.6 * vol, t + 0.005);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  sub.connect(sg).connect(out);
  sub.start(t);
  sub.stop(t + 0.3);
}

// ---------------------------------------------------------------------------
// UAV PING — rising sine sweep
// ---------------------------------------------------------------------------
export function uavPing() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(800, t);
  osc.frequency.exponentialRampToValueAtTime(1500, t + 0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  osc.connect(g).connect(master!);
  osc.start(t);
  osc.stop(t + 0.4);
}

// ---------------------------------------------------------------------------
// AIRSTRIKE WHISTLE — descending whistle with distance attenuation
// ---------------------------------------------------------------------------
export function airstrikeWhistle(distance = 0) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const d = Math.max(0, distance);
  const vol = Math.max(0.02, Math.pow(1 - Math.min(d, 80) / 80, 0.6));

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(2000, t);
  osc.frequency.exponentialRampToValueAtTime(300, t + 1.0);

  // Volume increases toward end
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.001 * vol, t + 0.2);
  g.gain.linearRampToValueAtTime(0.12 * vol, t + 0.8);
  g.gain.linearRampToValueAtTime(0.0001, t + 1.05);

  osc.connect(g).connect(master!);
  osc.start(t);
  osc.stop(t + 1.1);
}

// ---------------------------------------------------------------------------
// HELICOPTER LOOP — rhythmic wop-wop, start/stop via stop flag
// ---------------------------------------------------------------------------
export function helicopterLoop(stop = false) {
  if (!ctx || !enabled) return;

  if (stop) {
    if (helicopterOsc) {
      helicopterOsc.stop();
      helicopterOsc.disconnect();
      helicopterOsc = null;
    }
    if (helicopterNoise) {
      helicopterNoise.stop();
      helicopterNoise.disconnect();
      helicopterNoise = null;
    }
    return;
  }

  if (helicopterOsc) return; // already playing

  const t = ctx.currentTime;

  // Looping noise source
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;

  // Bandpass to shape rotor sound
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 60;
  bp.Q.value = 2;

  // Amplitude modulation gain
  const ampGain = ctx.createGain();
  ampGain.gain.value = 0.5;

  // LFO at 4Hz for wop-wop effect
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 4;

  // Scale LFO output to modulation depth
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.45;
  lfo.connect(lfoGain);
  lfoGain.connect(ampGain.gain);

  const out = ctx.createGain();
  out.gain.value = 0.12;

  noise.connect(bp).connect(ampGain).connect(out).connect(master!);
  lfo.start(t);
  noise.start(t);

  helicopterOsc = lfo;
  helicopterNoise = noise;
}
