import * as THREE from "three";
import { gunmetalTexture, polymerTexture, woodGrainTexture } from "./textures";

export interface WeaponView {
  group: THREE.Group;
  muzzle: THREE.Object3D;
  flash: THREE.Mesh;
  flashGlow: THREE.Mesh;
  flashLight: THREE.PointLight;
}

export function buildWeaponView(): WeaponView {
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
