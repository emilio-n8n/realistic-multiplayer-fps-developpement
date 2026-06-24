import * as THREE from "three";

function createCanvas(size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

/** Fill with base color then add per-pixel noise. */
function applyNoise(
  ctx: CanvasRenderingContext2D,
  size: number,
  base: [number, number, number],
  variance: number
) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * variance;
    d[i] = Math.max(0, Math.min(255, base[0] + n));
    d[i + 1] = Math.max(0, Math.min(255, base[1] + n));
    d[i + 2] = Math.max(0, Math.min(255, base[2] + n));
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function makeTexture(canvas: HTMLCanvasElement, repeat = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** Concrete wall: gray, noisy, with subtle cracks. */
export function concreteTexture(repeat = 1) {
  const size = 256;
  const c = createCanvas(size);
  const ctx = c.getContext("2d")!;
  applyNoise(ctx, size, [120, 120, 120], 40);
  // cracks
  ctx.strokeStyle = "rgba(40,40,40,0.5)";
  for (let i = 0; i < 14; i++) {
    ctx.lineWidth = Math.random() * 1.5 + 0.4;
    ctx.beginPath();
    let x = Math.random() * size;
    let y = Math.random() * size;
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += (Math.random() - 0.5) * 50;
      y += (Math.random() - 0.5) * 50;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // blotches
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(${Math.random() * 60},${Math.random() * 60},${Math.random() * 60},0.15)`;
    const r = Math.random() * 30 + 8;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return makeTexture(c, repeat);
}

/** Asphalt ground: dark with grit. */
export function asphaltTexture(repeat = 1) {
  const size = 256;
  const c = createCanvas(size);
  const ctx = c.getContext("2d")!;
  applyNoise(ctx, size, [55, 56, 60], 30);
  for (let i = 0; i < 1200; i++) {
    const v = Math.random() * 50 + 30;
    ctx.fillStyle = `rgba(${v},${v},${v + 4},0.25)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  return makeTexture(c, repeat);
}

/** Brushed metal panel. */
export function metalTexture(repeat = 1) {
  const size = 256;
  const c = createCanvas(size);
  const ctx = c.getContext("2d")!;
  applyNoise(ctx, size, [90, 95, 102], 18);
  // vertical brushed lines
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 400; i++) {
    ctx.strokeStyle = Math.random() > 0.5 ? "#cfd4da" : "#5a606a";
    ctx.beginPath();
    const x = Math.random() * size;
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (Math.random() - 0.5) * 6, size);
    ctx.stroke();
  }
  // rivets
  ctx.globalAlpha = 0.6;
  for (let y = 16; y < size; y += 48) {
    for (let x = 16; x < size; x += 48) {
      ctx.fillStyle = "#3a3f47";
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c9ced5";
      ctx.beginPath();
      ctx.arc(x - 0.7, y - 0.7, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  return makeTexture(c, repeat);
}

/** Wooden crate with planks. */
export function crateTexture(repeat = 1) {
  const size = 256;
  const c = createCanvas(size);
  const ctx = c.getContext("2d")!;
  applyNoise(ctx, size, [150, 105, 60], 28);
  // planks
  ctx.strokeStyle = "rgba(70,45,20,0.85)";
  ctx.lineWidth = 4;
  for (let y = 0; y <= size; y += size / 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  // border frame
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(60,38,18,0.9)";
  ctx.strokeRect(5, 5, size - 10, size - 10);
  // wood grain
  ctx.globalAlpha = 0.2;
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = "#5a3a18";
    ctx.beginPath();
    const y = Math.random() * size;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.3, y + (Math.random() - 0.5) * 12, size * 0.6, y + (Math.random() - 0.5) * 12, size, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return makeTexture(c, repeat);
}

/** Red/white hazard barrel stripe. */
export function barrelTexture() {
  const size = 128;
  const c = createCanvas(size);
  const ctx = c.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, size, 0);
  grad.addColorStop(0, "#7a0d0d");
  grad.addColorStop(0.5, "#c41616");
  grad.addColorStop(1, "#7a0d0d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  // hazard stripes
  ctx.fillStyle = "#e8e8e8";
  for (let y = 20; y < size; y += 40) {
    for (let x = -size; x < size; x += 40) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-6, -20, 12, 40);
      ctx.restore();
    }
  }
  return makeTexture(c, 1);
}

/** Sandbag / burlap camo. */
export function sandTexture(repeat = 1) {
  const size = 256;
  const c = createCanvas(size);
  const ctx = c.getContext("2d")!;
  applyNoise(ctx, size, [176, 156, 112], 30);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(120,100,60,${Math.random() * 0.25})`;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, Math.random() * 18 + 6, 0, Math.PI * 2);
    ctx.fill();
  }
  return makeTexture(c, repeat);
}

/** Military camouflage pattern tinted to the given color. */
export function camoTexture(color: number, repeat = 1) {
  const size = 256;
  const c = createCanvas(size);
  const ctx = c.getContext("2d")!;
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  applyNoise(ctx, size, [r, g, b], 55);

  for (let i = 0; i < 28; i++) {
    const dr = Math.random() > 0.5 ? 35 : -30;
    const dg = Math.random() > 0.5 ? 35 : -30;
    const db = Math.random() > 0.5 ? 35 : -30;
    ctx.fillStyle = `rgba(${Math.max(0, Math.min(255, r + dr))},${Math.max(0, Math.min(255, g + dg))},${Math.max(0, Math.min(255, b + db))},0.35)`;
    ctx.beginPath();
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const rx = Math.random() * 38 + 14;
    const ry = Math.random() * 28 + 10;
    ctx.ellipse(cx, cy, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  return makeTexture(c, repeat);
}

/** Gunmetal: dark gray with subtle horizontal wear scratches. */
export function gunmetalTexture(repeat = 1) {
  const size = 256;
  const c = createCanvas(size);
  const ctx = c.getContext("2d")!;
  applyNoise(ctx, size, [42, 45, 50], 15);
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 200; i++) {
    ctx.strokeStyle = Math.random() > 0.5 ? "#5a606a" : "#2a2e33";
    ctx.beginPath();
    const y = Math.random() * size;
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (Math.random() - 0.5) * 3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return makeTexture(c, repeat);
}

/** Polymer: very dark, slightly rough surface with micro-texture. */
export function polymerTexture(repeat = 1) {
  const size = 256;
  const c = createCanvas(size);
  const ctx = c.getContext("2d")!;
  applyNoise(ctx, size, [25, 27, 30], 10);
  for (let i = 0; i < 500; i++) {
    const v = Math.random() * 15 + 20;
    ctx.fillStyle = `rgba(${v},${v + 2},${v + 4},0.15)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 3, 3);
  }
  return makeTexture(c, repeat);
}

/** Wood grain: warm brown with flowing grain lines. */
export function woodGrainTexture(repeat = 1) {
  const size = 256;
  const c = createCanvas(size);
  const ctx = c.getContext("2d")!;
  applyNoise(ctx, size, [80, 55, 30], 15);
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < 25; i++) {
    ctx.strokeStyle = "#5a3a18";
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    const y = Math.random() * size;
    ctx.moveTo(0, y);
    for (let x = 0; x < size; x += 8) {
      ctx.lineTo(x, y + Math.sin(x * 0.05 + i * 1.3) * 4 + (Math.random() - 0.5) * 3);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = "#4a2a10";
    ctx.lineWidth = 2 + Math.random() * 2;
    ctx.beginPath();
    const knotX = Math.random() * size;
    const knotY = Math.random() * size;
    ctx.ellipse(knotX, knotY, 6 + Math.random() * 8, 4 + Math.random() * 6, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return makeTexture(c, repeat);
}
