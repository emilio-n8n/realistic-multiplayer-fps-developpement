import * as THREE from "three";
import { gunmetalTexture, polymerTexture, woodGrainTexture } from "./textures";
import type { WeaponType } from "./types";

export interface WeaponView {
  group: THREE.Group;
  muzzle: THREE.Object3D;
  flash: THREE.Mesh;
  flashGlow: THREE.Mesh;
  flashLight: THREE.PointLight;
}

function flashAttachments(
  group: THREE.Group,
  upY: number,
  muzzleZ: number,
  scale = 1,
): { flash: THREE.Mesh; flashGlow: THREE.Mesh; flashLight: THREE.PointLight } {
  const flash = new THREE.Mesh(
    new THREE.ConeGeometry(0.22 * scale, 0.50 * scale, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffdd66,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  flash.position.set(0, upY, muzzleZ + 0.18 * scale);
  flash.rotation.x = Math.PI / 2;
  flash.visible = false;

  const pMat = new THREE.MeshBasicMaterial({
    color: 0xff8800,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (let i = 0; i < Math.ceil(7 * scale); i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = (0.07 + Math.random() * 0.08) * scale;
    const p = new THREE.Mesh(
      new THREE.SphereGeometry((0.02 + Math.random() * 0.03) * scale, 4, 3),
      pMat
    );
    p.position.set(Math.cos(a) * r, Math.sin(a) * r, -0.04 - Math.random() * 0.06);
    flash.add(p);
  }
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.045 * scale, 6, 4),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  core.position.set(0, 0, -0.03);
  flash.add(core);
  group.add(flash);

  const flashGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.15 * scale, 8, 6),
    new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  flashGlow.position.set(0, upY, muzzleZ + 0.14 * scale);
  flashGlow.visible = false;
  group.add(flashGlow);

  const flashLight = new THREE.PointLight(0xffdd44, 0, 12, 2);
  flashLight.position.set(0, upY, muzzleZ);
  group.add(flashLight);

  return { flash, flashGlow, flashLight };
}

function mats() {
  const metalTex = gunmetalTexture(2);
  const polymTex = polymerTexture(2);
  const woodTex = woodGrainTexture(2);
  return {
    metal: new THREE.MeshStandardMaterial({ map: metalTex, color: 0x23262b, roughness: 0.45, metalness: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ map: polymTex, color: 0x14161a, roughness: 0.6, metalness: 0.8 }),
    accent: new THREE.MeshStandardMaterial({ map: metalTex, color: 0x2e2f33, roughness: 0.5, metalness: 0.7 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTex, color: 0x3a2a18, roughness: 0.7, metalness: 0.2 }),
    polymer: new THREE.MeshStandardMaterial({ map: polymTex, color: 0x1a1c20, roughness: 0.8, metalness: 0.1 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.6, metalness: 0.3 }),
  };
}

// ─── AR-15 ────────────────────────────────────────────────────────────

function buildAr15(): WeaponView {
  const group = new THREE.Group();

  const metalTex = gunmetalTexture(2);
  const polymTex = polymerTexture(2);
  const woodTex = woodGrainTexture(2);

  const matMetal = new THREE.MeshStandardMaterial({
    map: metalTex, color: 0x23262b, roughness: 0.45, metalness: 0.85,
  });
  const matDark = new THREE.MeshStandardMaterial({
    map: polymTex, color: 0x14161a, roughness: 0.6, metalness: 0.8,
  });
  const matAccent = new THREE.MeshStandardMaterial({
    map: metalTex, color: 0x2e2f33, roughness: 0.5, metalness: 0.7,
  });
  const matWood = new THREE.MeshStandardMaterial({
    map: woodTex, color: 0x3a2a18, roughness: 0.7, metalness: 0.2,
  });
  const matPolymer = new THREE.MeshStandardMaterial({
    map: polymTex, color: 0x1a1c20, roughness: 0.8, metalness: 0.1,
  });
  const matBlack = new THREE.MeshStandardMaterial({
    color: 0x0d0d0f, roughness: 0.6, metalness: 0.3,
  });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };

  // ---------- UPPER RECEIVER ----------
  add(new THREE.BoxGeometry(0.08, 0.08, 0.34), matMetal, 0, 0.06, -0.02);
  add(new THREE.BoxGeometry(0.075, 0.065, 0.08), matMetal, 0, 0.05, 0.17);

  // ---------- BARREL ----------
  const barrel = add(new THREE.CylinderGeometry(0.015, 0.024, 0.48, 12), matMetal, 0, 0.06, 0.50);
  barrel.rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.035, 0.032, 0.025, 8), matDark, 0, 0.06, 0.22);

  // ---------- HANDGUARD ----------
  add(new THREE.BoxGeometry(0.075, 0.075, 0.28), matPolymer, 0, 0.035, 0.32);
  for (let rz = 0.20; rz < 0.48; rz += 0.035) {
    add(new THREE.BoxGeometry(0.02, 0.025, 0.008), matAccent, 0, 0.092, rz);
  }
  for (let sz = 0.24; sz < 0.42; sz += 0.07) {
    add(new THREE.BoxGeometry(0.004, 0.04, 0.025), matBlack, 0.04, 0.035, sz);
    add(new THREE.BoxGeometry(0.004, 0.04, 0.025), matBlack, -0.04, 0.035, sz);
  }

  // ---------- GAS BLOCK / FRONT SIGHT ----------
  add(new THREE.BoxGeometry(0.04, 0.045, 0.03), matDark, 0, 0.08, 0.60);
  add(new THREE.BoxGeometry(0.025, 0.07, 0.015), matDark, 0.025, 0.13, 0.60);
  add(new THREE.BoxGeometry(0.025, 0.07, 0.015), matDark, -0.025, 0.13, 0.60);
  add(new THREE.CylinderGeometry(0.003, 0.003, 0.06, 4), matBlack, 0, 0.16, 0.60);
  add(new THREE.BoxGeometry(0.025, 0.02, 0.015), matDark, 0, 0.02, 0.60);

  // ---------- MAGAZINE ----------
  const magBody = add(new THREE.BoxGeometry(0.065, 0.24, 0.075), matPolymer, 0, -0.13, 0.02);
  magBody.rotation.x = 0.07;
  for (let my = -0.10; my < 0.10; my += 0.035) {
    add(new THREE.BoxGeometry(0.072, 0.004, 0.082), matDark, 0, my - 0.02, 0.02);
  }
  add(new THREE.BoxGeometry(0.07, 0.008, 0.08), matMetal, 0, -0.25, 0.02);

  // ---------- LOWER RECEIVER ----------
  add(new THREE.BoxGeometry(0.075, 0.08, 0.26), matMetal, 0, -0.02, -0.02);
  add(new THREE.BoxGeometry(0.055, 0.015, 0.05), matDark, 0, -0.08, 0.0);
  add(new THREE.BoxGeometry(0.015, 0.065, 0.015), matDark, 0.035, -0.08, 0.0);
  add(new THREE.BoxGeometry(0.015, 0.065, 0.015), matDark, -0.035, -0.08, 0.0);
  add(new THREE.BoxGeometry(0.07, 0.02, 0.02), matAccent, 0, -0.06, 0.04);

  // ---------- PISTOL GRIP ----------
  const grip = add(new THREE.BoxGeometry(0.05, 0.16, 0.075), matPolymer, 0, -0.14, -0.14);
  grip.rotation.x = -0.4;
  for (let gy = -1; gy <= 1; gy += 0.4) {
    const r = add(new THREE.BoxGeometry(0.002, 0.003, 0.08), matBlack, 0.026, gy * 0.04 - 0.06, -0.14);
    r.rotation.x = -0.4;
    const l = add(new THREE.BoxGeometry(0.002, 0.003, 0.08), matBlack, -0.026, gy * 0.04 - 0.06, -0.14);
    l.rotation.x = -0.4;
  }

  // ---------- STOCK ----------
  add(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8), matDark, 0, 0.02, -0.36);
  add(new THREE.BoxGeometry(0.065, 0.08, 0.16), matWood, 0, 0.0, -0.52);
  add(new THREE.BoxGeometry(0.06, 0.03, 0.15), matWood, 0, 0.045, -0.51);
  add(new THREE.BoxGeometry(0.07, 0.09, 0.01), matBlack, 0, 0.0, -0.60);
  add(new THREE.BoxGeometry(0.01, 0.02, 0.01), matMetal, 0.04, 0.02, -0.45);

  // ---------- CARRY HANDLE / REAR SIGHT ----------
  add(new THREE.BoxGeometry(0.04, 0.04, 0.14), matDark, 0, 0.14, -0.08);
  add(new THREE.BoxGeometry(0.025, 0.065, 0.025), matDark, 0, 0.18, -0.13);
  add(new THREE.BoxGeometry(0.025, 0.065, 0.025), matDark, 0, 0.18, -0.03);
  add(new THREE.BoxGeometry(0.025, 0.012, 0.14), matDark, 0, 0.215, -0.08);
  add(new THREE.CylinderGeometry(0.012, 0.014, 0.022, 8), matBlack, 0, 0.17, -0.16);
  add(new THREE.CylinderGeometry(0.004, 0.004, 0.025, 4), matBlack, 0, 0.17, -0.16);

  // ---------- BOLT CARRIER GROUP ----------
  add(new THREE.BoxGeometry(0.004, 0.025, 0.12), matAccent, 0.045, 0.05, 0.02);
  add(new THREE.BoxGeometry(0.018, 0.03, 0.035), matDark, 0, 0.09, -0.18);

  // ---------- FORWARD ASSIST ----------
  add(new THREE.CylinderGeometry(0.008, 0.01, 0.015, 8), matMetal, 0.045, 0.04, 0.06);

  // ---------- SMALL PARTS ----------
  add(new THREE.BoxGeometry(0.015, 0.03, 0.004), matDark, 0, -0.04, 0.0);
  add(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 8), matMetal, 0.045, -0.02, -0.04);
  add(new THREE.BoxGeometry(0.004, 0.02, 0.015), matMetal, 0.045, 0.0, 0.0);
  add(new THREE.BoxGeometry(0.005, 0.015, 0.01), matMetal, 0.045, -0.04, -0.06);
  add(new THREE.BoxGeometry(0.003, 0.025, 0.05), matDark, 0.045, 0.065, 0.06);

  // ---------- MUZZLE REFERENCE ----------
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.06, 0.72);
  group.add(muzzle);

  // ---------- ENHANCED MUZZLE FLASH ----------
  const flash = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.50, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffdd66,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  flash.position.set(0, 0.06, 0.90);
  flash.rotation.x = Math.PI / 2;
  flash.visible = false;

  const pMat = new THREE.MeshBasicMaterial({
    color: 0xff8800,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = 0.07 + Math.random() * 0.08;
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.02 + Math.random() * 0.03, 4, 3),
      pMat
    );
    p.position.set(Math.cos(a) * r, Math.sin(a) * r, -0.04 - Math.random() * 0.06);
    flash.add(p);
  }
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 6, 4),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  core.position.set(0, 0, -0.03);
  flash.add(core);

  group.add(flash);

  const flashGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 8, 6),
    new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  flashGlow.position.set(0, 0.06, 0.86);
  flashGlow.visible = false;
  group.add(flashGlow);

  const flashLight = new THREE.PointLight(0xffdd44, 0, 12, 2);
  flashLight.position.copy(muzzle.position);
  group.add(flashLight);

  return { group, muzzle, flash, flashGlow, flashLight };
}

// ─── SMG (MP5-style PDW) ──────────────────────────────────────────────

function buildSmg(): WeaponView {
  const group = new THREE.Group();
  const M = mats();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };

  // Upper receiver
  add(new THREE.BoxGeometry(0.065, 0.05, 0.22), M.metal, 0, 0.045, -0.04);
  // Lower receiver
  add(new THREE.BoxGeometry(0.065, 0.035, 0.16), M.metal, 0, -0.005, -0.02);

  // Barrel
  const barrel = add(new THREE.CylinderGeometry(0.01, 0.016, 0.26, 8), M.metal, 0, 0.045, 0.26);
  barrel.rotation.x = Math.PI / 2;
  // Flash hider
  const fh = add(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), M.dark, 0, 0.045, 0.42);
  fh.rotation.x = Math.PI / 2;
  // Barrel nut
  const bn = add(new THREE.CylinderGeometry(0.025, 0.023, 0.02, 8), M.dark, 0, 0.045, 0.10);
  bn.rotation.x = Math.PI / 2;

  // Handguard
  add(new THREE.BoxGeometry(0.06, 0.05, 0.14), M.polymer, 0, 0.02, 0.13);
  // Handguard rails
  for (let hz = 0.08; hz < 0.20; hz += 0.035) {
    add(new THREE.BoxGeometry(0.015, 0.02, 0.006), M.accent, 0, 0.05, hz);
  }
  for (let hz = 0.08; hz < 0.20; hz += 0.06) {
    add(new THREE.BoxGeometry(0.004, 0.03, 0.022), M.black, 0.033, 0.02, hz);
    add(new THREE.BoxGeometry(0.004, 0.03, 0.022), M.black, -0.033, 0.02, hz);
  }

  // Magazine well housing
  add(new THREE.BoxGeometry(0.055, 0.04, 0.05), M.metal, 0, -0.02, 0.02);
  // Magazine
  const mag = add(new THREE.BoxGeometry(0.05, 0.16, 0.055), M.polymer, 0, -0.10, 0.03);
  mag.rotation.x = 0.06;
  for (let my = -0.06; my < 0.08; my += 0.03) {
    add(new THREE.BoxGeometry(0.055, 0.003, 0.06), M.dark, 0, my - 0.04, 0.03);
  }
  add(new THREE.BoxGeometry(0.05, 0.006, 0.055), M.metal, 0, -0.18, 0.03);

  // Pistol grip
  const grip = add(new THREE.BoxGeometry(0.035, 0.10, 0.05), M.polymer, 0, -0.10, -0.07);
  grip.rotation.x = -0.35;
  for (let gy = -1; gy <= 1; gy += 0.5) {
    const r = add(new THREE.BoxGeometry(0.002, 0.002, 0.055), M.black, 0.018, gy * 0.03 - 0.05, -0.07);
    r.rotation.x = -0.35;
    const l = add(new THREE.BoxGeometry(0.002, 0.002, 0.055), M.black, -0.018, gy * 0.03 - 0.05, -0.07);
    l.rotation.x = -0.35;
  }

  // Trigger guard
  add(new THREE.BoxGeometry(0.03, 0.018, 0.012), M.metal, 0, -0.035, -0.04);

  // Selector switch
  add(new THREE.CylinderGeometry(0.003, 0.003, 0.008, 6), M.accent, 0.038, -0.015, 0.0);

  // Stock - collapsible (2 rods + buttpad)
  const rod1 = add(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 6), M.dark, 0, 0.035, -0.22);
  rod1.rotation.x = Math.PI / 2;
  const rod2 = add(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 6), M.dark, 0, -0.005, -0.22);
  rod2.rotation.x = Math.PI / 2;
  add(new THREE.BoxGeometry(0.045, 0.05, 0.025), M.polymer, 0, 0.015, -0.32);
  add(new THREE.BoxGeometry(0.045, 0.06, 0.008), M.black, 0, 0.015, -0.34);

  // Red dot sight
  add(new THREE.BoxGeometry(0.018, 0.025, 0.012), M.dark, 0, 0.075, -0.03);
  const dotBody = add(new THREE.CylinderGeometry(0.016, 0.018, 0.025, 8), M.dark, 0, 0.095, -0.03);
  dotBody.rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.013, 0.013, 0.003, 8), M.dark, 0, 0.095, -0.017);
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x4488ff, roughness: 0.1, metalness: 0.2 });
  add(new THREE.CylinderGeometry(0.011, 0.011, 0.002, 8), lensMat, 0, 0.095, -0.016);

  // Rear sight
  const rs = add(new THREE.CylinderGeometry(0.006, 0.008, 0.02, 8), M.dark, 0, 0.065, -0.18);
  rs.rotation.x = Math.PI / 2;

  // Front sight post
  add(new THREE.BoxGeometry(0.008, 0.025, 0.008), M.dark, 0, 0.07, 0.22);
  add(new THREE.CylinderGeometry(0.002, 0.002, 0.02, 4), M.black, 0, 0.085, 0.22);

  // Charging handle
  add(new THREE.CylinderGeometry(0.003, 0.003, 0.025, 4), M.dark, 0.038, 0.055, -0.16);

  // Ejection port
  add(new THREE.BoxGeometry(0.004, 0.022, 0.04), M.black, 0.035, 0.045, 0.02);

  // Small details
  add(new THREE.BoxGeometry(0.01, 0.015, 0.005), M.accent, 0.038, 0.0, -0.04);
  add(new THREE.BoxGeometry(0.008, 0.012, 0.005), M.accent, 0, -0.045, 0.02);
  add(new THREE.CylinderGeometry(0.004, 0.004, 0.006, 6), M.metal, 0.035, 0.035, -0.12);

  // Muzzle reference
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.045, 0.435);
  group.add(muzzle);

  const { flash, flashGlow, flashLight } = flashAttachments(group, 0.045, 0.435);
  return { group, muzzle, flash, flashGlow, flashLight };
}

// ─── Shotgun (Pump-action) ────────────────────────────────────────────

function buildShotgun(): WeaponView {
  const group = new THREE.Group();
  const M = mats();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };

  // Thick barrel
  const barrel = add(new THREE.CylinderGeometry(0.022, 0.032, 0.55, 10), M.metal, 0, 0.055, 0.45);
  barrel.rotation.x = Math.PI / 2;
  // Barrel band near muzzle
  add(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 8), M.dark, 0, 0.055, 0.72);
  // Muzzle bead front sight
  add(new THREE.CylinderGeometry(0.003, 0.003, 0.01, 4), M.black, 0, 0.072, 0.74);

  // Receiver
  add(new THREE.BoxGeometry(0.08, 0.07, 0.22), M.metal, 0, 0.04, 0.04);

  // Tubular magazine under barrel
  const tube = add(new THREE.CylinderGeometry(0.007, 0.007, 0.38, 6), M.metal, 0, 0.01, 0.30);
  tube.rotation.x = Math.PI / 2;
  // Magazine cap
  add(new THREE.CylinderGeometry(0.01, 0.008, 0.015, 6), M.dark, 0, 0.01, 0.50);

  // Pump forend
  add(new THREE.BoxGeometry(0.07, 0.04, 0.10), M.polymer, 0, 0.01, 0.28);
  // Forend texture/grip
  for (let fz = 0.23; fz <= 0.33; fz += 0.015) {
    add(new THREE.BoxGeometry(0.075, 0.003, 0.005), M.dark, 0, 0.045, fz);
  }
  // Action bars connecting pump to receiver
  add(new THREE.BoxGeometry(0.003, 0.008, 0.10), M.metal, 0.035, 0.01, 0.16);
  add(new THREE.BoxGeometry(0.003, 0.008, 0.10), M.metal, -0.035, 0.01, 0.16);

  // Full stock (wood)
  add(new THREE.BoxGeometry(0.075, 0.10, 0.24), M.wood, 0, 0.02, -0.22);
  // Stock comb
  add(new THREE.BoxGeometry(0.06, 0.02, 0.18), M.wood, 0, 0.065, -0.20);
  // Buttplate
  add(new THREE.BoxGeometry(0.075, 0.10, 0.01), M.black, 0, 0.02, -0.34);
  // Stock bolts
  add(new THREE.CylinderGeometry(0.003, 0.003, 0.006, 6), M.metal, 0.03, 0.0, -0.33);
  add(new THREE.CylinderGeometry(0.003, 0.003, 0.006, 6), M.metal, -0.03, 0.0, -0.33);

  // Pistol grip
  const grip = add(new THREE.BoxGeometry(0.04, 0.09, 0.055), M.polymer, 0, -0.05, -0.04);
  grip.rotation.x = -0.25;
  for (let gy = -1; gy <= 1; gy += 0.5) {
    const r = add(new THREE.BoxGeometry(0.002, 0.002, 0.06), M.black, 0.02, gy * 0.025 - 0.02, -0.04);
    r.rotation.x = -0.25;
    const l = add(new THREE.BoxGeometry(0.002, 0.002, 0.06), M.black, -0.02, gy * 0.025 - 0.02, -0.04);
    l.rotation.x = -0.25;
  }

  // Trigger guard
  add(new THREE.BoxGeometry(0.035, 0.02, 0.015), M.metal, 0, -0.02, 0.01);

  // Ejection port
  add(new THREE.BoxGeometry(0.005, 0.025, 0.05), M.black, 0.042, 0.04, 0.04);
  // Loading port
  add(new THREE.BoxGeometry(0.005, 0.015, 0.02), M.black, 0.042, 0.0, 0.06);

  // Small parts
  add(new THREE.CylinderGeometry(0.005, 0.005, 0.008, 6), M.metal, 0.04, 0.01, 0.02);
  add(new THREE.BoxGeometry(0.003, 0.01, 0.03), M.accent, 0.042, 0.055, 0.04);
  add(new THREE.BoxGeometry(0.01, 0.015, 0.005), M.dark, 0, -0.03, -0.12);

  // Muzzle reference
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.055, 0.725);
  group.add(muzzle);

  const { flash, flashGlow, flashLight } = flashAttachments(group, 0.055, 0.725, 0.6);
  return { group, muzzle, flash, flashGlow, flashLight };
}

// ─── Sniper Rifle (Bolt-action) ───────────────────────────────────────

function buildSniper(): WeaponView {
  const group = new THREE.Group();
  const M = mats();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };

  // Very long barrel
  const barrel = add(new THREE.CylinderGeometry(0.016, 0.026, 0.75, 10), M.metal, 0, 0.05, 0.55);
  barrel.rotation.x = Math.PI / 2;
  // Barrel muzzle crown detail
  add(new THREE.CylinderGeometry(0.014, 0.018, 0.015, 10), M.dark, 0, 0.05, 0.92);
  add(new THREE.CylinderGeometry(0.028, 0.028, 0.01, 8), M.metal, 0, 0.05, 0.16);

  // Receiver
  add(new THREE.BoxGeometry(0.075, 0.07, 0.24), M.metal, 0, 0.04, 0.02);

  // Scope
  const scope = add(new THREE.CylinderGeometry(0.016, 0.016, 0.22, 10), M.dark, 0, 0.13, -0.01);
  scope.rotation.x = Math.PI / 2;
  // Scope objective bell
  const obj = add(new THREE.CylinderGeometry(0.026, 0.016, 0.03, 10), M.dark, 0, 0.13, 0.13);
  obj.rotation.x = Math.PI / 2;
  // Scope lens (blue tint)
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x3377dd, roughness: 0.1, metalness: 0.3 });
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.004, 10), lensMat, 0, 0.13, 0.145);
  // Scope eyepiece
  const eye = add(new THREE.CylinderGeometry(0.022, 0.018, 0.025, 10), M.dark, 0, 0.13, -0.125);
  eye.rotation.x = Math.PI / 2;
  // Scope mount rings
  add(new THREE.BoxGeometry(0.02, 0.04, 0.02), M.metal, 0, 0.095, 0.10);
  add(new THREE.BoxGeometry(0.02, 0.04, 0.02), M.metal, 0, 0.095, -0.08);
  // Scope adjustment turrets
  add(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 8), M.accent, 0, 0.155, -0.01);
  add(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 8), M.accent, 0.025, 0.13, -0.01);

  // Bolt handle (right side)
  const bolt = add(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 6), M.metal, 0.045, 0.04, -0.04);
  bolt.rotation.z = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.008, 0.008, 0.008, 8), M.black, 0.058, 0.04, -0.04);

  // Large magazine
  add(new THREE.BoxGeometry(0.06, 0.15, 0.075), M.polymer, 0, -0.08, 0.04);
  add(new THREE.BoxGeometry(0.065, 0.006, 0.08), M.metal, 0, -0.155, 0.04);
  for (let my = -0.06; my < 0.08; my += 0.035) {
    add(new THREE.BoxGeometry(0.065, 0.003, 0.08), M.dark, 0, my - 0.02, 0.04);
  }

  // Heavy stock
  add(new THREE.BoxGeometry(0.075, 0.12, 0.26), M.wood, 0, 0.02, -0.26);
  // Cheek rest (asymmetric, on top left)
  add(new THREE.BoxGeometry(0.05, 0.03, 0.16), M.wood, 0, 0.08, -0.24);
  // Buttplate with pad
  add(new THREE.BoxGeometry(0.075, 0.13, 0.01), M.black, 0, 0.02, -0.39);
  add(new THREE.BoxGeometry(0.07, 0.11, 0.008), M.dark, 0, 0.02, -0.38);
  // Stock hardware
  add(new THREE.CylinderGeometry(0.004, 0.004, 0.008, 6), M.metal, 0.03, -0.04, -0.37);
  add(new THREE.CylinderGeometry(0.004, 0.004, 0.008, 6), M.metal, -0.03, -0.04, -0.37);

  // Bipod
  add(new THREE.BoxGeometry(0.025, 0.008, 0.02), M.metal, 0, -0.02, 0.35);
  const bipodL = add(new THREE.CylinderGeometry(0.003, 0.003, 0.12, 4), M.dark, -0.025, -0.07, 0.35);
  bipodL.rotation.z = 0.2;
  const bipodR = add(new THREE.CylinderGeometry(0.003, 0.003, 0.12, 4), M.dark, 0.025, -0.07, 0.35);
  bipodR.rotation.z = -0.2;
  // Bipod feet
  add(new THREE.BoxGeometry(0.005, 0.003, 0.005), M.black, -0.025, -0.13, 0.35);
  add(new THREE.BoxGeometry(0.005, 0.003, 0.005), M.black, 0.025, -0.13, 0.35);
  // Bipod pivot
  add(new THREE.CylinderGeometry(0.005, 0.005, 0.006, 6), M.accent, 0, -0.016, 0.35);

  // Trigger guard
  add(new THREE.BoxGeometry(0.035, 0.02, 0.015), M.metal, 0, -0.02, -0.02);

  // Floor plate
  add(new THREE.BoxGeometry(0.065, 0.003, 0.08), M.accent, 0, -0.005, 0.04);

  // Small details
  add(new THREE.BoxGeometry(0.01, 0.02, 0.005), M.accent, 0.04, 0.01, 0.02);
  add(new THREE.BoxGeometry(0.003, 0.012, 0.03), M.black, 0.04, 0.04, -0.06);
  add(new THREE.CylinderGeometry(0.002, 0.002, 0.015, 4), M.black, 0.035, 0.06, 0.06);

  // Muzzle reference
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.05, 0.925);
  group.add(muzzle);

  const { flash, flashGlow, flashLight } = flashAttachments(group, 0.05, 0.925);
  return { group, muzzle, flash, flashGlow, flashLight };
}

// ─── Pistol (Semi-auto) ───────────────────────────────────────────────

function buildPistol(): WeaponView {
  const group = new THREE.Group();
  const M = mats();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };

  // Barrel
  const barrel = add(new THREE.CylinderGeometry(0.008, 0.012, 0.16, 8), M.metal, 0, 0.02, 0.18);
  barrel.rotation.x = Math.PI / 2;

  // Slide
  add(new THREE.BoxGeometry(0.05, 0.035, 0.16), M.metal, 0, 0.02, 0.02);
  // Slide serrations (rear)
  for (let sx = -0.02; sx <= 0.02; sx += 0.008) {
    add(new THREE.BoxGeometry(0.003, 0.018, 0.025), M.black, sx, 0.025, -0.05);
  }
  // Ejection port
  add(new THREE.BoxGeometry(0.004, 0.02, 0.04), M.black, 0.028, 0.02, 0.04);

  // Frame
  add(new THREE.BoxGeometry(0.05, 0.025, 0.12), M.polymer, 0, -0.015, -0.02);

  // Grip
  const grip = add(new THREE.BoxGeometry(0.045, 0.10, 0.05), M.polymer, 0, -0.07, -0.07);
  grip.rotation.x = -0.15;
  // Grip texture
  for (let gy = -0.04; gy < 0.06; gy += 0.015) {
    add(new THREE.BoxGeometry(0.002, 0.004, 0.055), M.dark, 0.022, gy - 0.03, -0.07);
    add(new THREE.BoxGeometry(0.002, 0.004, 0.055), M.dark, -0.022, gy - 0.03, -0.07);
  }

  // Magazine
  add(new THREE.BoxGeometry(0.04, 0.09, 0.045), M.metal, 0, -0.14, -0.05);
  add(new THREE.BoxGeometry(0.04, 0.004, 0.045), M.dark, 0, -0.185, -0.05);
  // Magazine floor plate
  add(new THREE.BoxGeometry(0.044, 0.005, 0.05), M.polymer, 0, -0.19, -0.05);

  // Trigger guard
  add(new THREE.BoxGeometry(0.002, 0.018, 0.015), M.metal, 0.015, -0.035, 0.04);
  add(new THREE.BoxGeometry(0.002, 0.018, 0.015), M.metal, -0.015, -0.035, 0.04);
  add(new THREE.BoxGeometry(0.032, 0.002, 0.015), M.metal, 0, -0.044, 0.04);

  // Trigger
  add(new THREE.BoxGeometry(0.005, 0.012, 0.004), M.accent, 0, -0.03, 0.04);

  // Front sight
  add(new THREE.BoxGeometry(0.005, 0.01, 0.005), M.black, 0, 0.04, 0.10);
  // Rear sight
  add(new THREE.BoxGeometry(0.015, 0.008, 0.005), M.black, 0, 0.04, -0.06);

  // Hammer
  add(new THREE.BoxGeometry(0.008, 0.012, 0.006), M.metal, 0, 0.025, -0.08);

  // Slide release lever
  add(new THREE.BoxGeometry(0.002, 0.008, 0.015), M.metal, 0.028, -0.005, 0.02);

  // Small details
  add(new THREE.CylinderGeometry(0.003, 0.003, 0.004, 6), M.metal, 0.028, 0.01, -0.04);
  add(new THREE.BoxGeometry(0.005, 0.004, 0.004), M.accent, 0, -0.015, -0.10);
  add(new THREE.BoxGeometry(0.002, 0.015, 0.002), M.black, 0.026, 0.04, 0.02);

  // Muzzle reference
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, 0.26);
  group.add(muzzle);

  const { flash, flashGlow, flashLight } = flashAttachments(group, 0.02, 0.26);
  return { group, muzzle, flash, flashGlow, flashLight };
}

// ─── Entry point ──────────────────────────────────────────────────────

function addAttachments(group: THREE.Group, type: WeaponType, attachments: import("./types").AttachmentType[]) {
  if (type !== "ar15" && type !== "smg") return;
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.45, metalness: 0.85 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.6, metalness: 0.8 });
  const matRed = new THREE.MeshBasicMaterial({ color: 0xff0000 });

  for (const a of attachments) {
    switch (a) {
      case "optic_reddot": {
        const mount = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.015, 0.015), matDark);
        mount.position.set(0, type === "ar15" ? 0.16 : 0.10, type === "ar15" ? -0.04 : 0.0);
        group.add(mount);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.03, 8), matDark);
        body.position.set(0, type === "ar15" ? 0.19 : 0.13, type === "ar15" ? -0.04 : 0.0);
        body.rotation.x = Math.PI / 2;
        group.add(body);
        const lensMat = new THREE.MeshStandardMaterial({ color: 0x4488ff, roughness: 0.1, metalness: 0.2 });
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.015, 8), lensMat);
        lens.position.set(0, type === "ar15" ? 0.19 : 0.13, type === "ar15" ? -0.028 : 0.012);
        group.add(lens);
        break;
      }
      case "suppressor": {
        const supp = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.12, 10), matDark);
        supp.rotation.x = Math.PI / 2;
        supp.position.set(0, type === "ar15" ? 0.06 : 0.045, type === "ar15" ? 0.78 : 0.48);
        group.add(supp);
        break;
      }
      case "grip": {
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.035), matDark);
        grip.position.set(0, type === "ar15" ? -0.01 : -0.01, type === "ar15" ? 0.34 : 0.14);
        group.add(grip);
        break;
      }
      case "laser": {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.06, 6), matMetal);
        body.rotation.x = Math.PI / 2;
        body.position.set(0, type === "ar15" ? 0.01 : 0.01, type === "ar15" ? 0.55 : 0.30);
        group.add(body);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.004, 4, 4), matRed);
        dot.position.set(0, type === "ar15" ? 0.01 : 0.01, type === "ar15" ? 0.75 : 0.44);
        group.add(dot);
        break;
      }
    }
  }
}

export function buildWeaponView(type: WeaponType, attachments?: import("./types").AttachmentType[]): WeaponView {
  let view: WeaponView;
  switch (type) {
    case "ar15": view = buildAr15(); break;
    case "smg": view = buildSmg(); break;
    case "shotgun": view = buildShotgun(); break;
    case "sniper": view = buildSniper(); break;
    case "pistol": view = buildPistol(); break;
    default: view = buildAr15(); break;
  }
  if (attachments && attachments.length > 0) {
    addAttachments(view.group, type, attachments);
  }
  return view;
}
