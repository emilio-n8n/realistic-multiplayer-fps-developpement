import * as THREE from "three";
import { camoTexture } from "./textures";

export interface CharacterView {
  group: THREE.Group;
  head: THREE.Mesh;
  body: THREE.Mesh;
  gun: THREE.Mesh;
  nameSprite: THREE.Sprite;
  nameTex: THREE.CanvasTexture;
  baseColor: number;
  setFiring: (on: boolean, t: number) => void;
  setAlive: (alive: boolean) => void;
  die: () => void;
  setMoving: (moving: boolean, sprinting: boolean) => void;
  updateAnimations: (dt: number) => void;
  dispose: () => void;
}

const skinMat = new THREE.MeshStandardMaterial({ color: 0xc79a6b, roughness: 0.7 });
const helmetMat = new THREE.MeshStandardMaterial({ color: 0x2b2f24, roughness: 0.6, metalness: 0.3 });
const vestMat = new THREE.MeshStandardMaterial({ color: 0x26282c, roughness: 0.6, metalness: 0.4 });
const gunMat = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.5, metalness: 0.8 });
const bootMat = new THREE.MeshStandardMaterial({ color: 0x1a1c1a, roughness: 0.8 });
const visorMat = new THREE.MeshStandardMaterial({
  color: 0x88ccff,
  roughness: 0.2,
  metalness: 0.6,
  transparent: true,
  opacity: 0.25,
});
const flashMat = new THREE.MeshBasicMaterial({
  color: 0xffd27a,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const flashWhiteMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.8,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

const headGeo = new THREE.SphereGeometry(0.16, 12, 10);
const jawGeo = new THREE.SphereGeometry(0.13, 10, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
const noseGeo = new THREE.SphereGeometry(0.025, 6, 6);
const eyeGeo = new THREE.SphereGeometry(0.02, 6, 6);
const helmetGeo = new THREE.SphereGeometry(0.2, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58);
const shouldGeo = new THREE.SphereGeometry(0.1, 8, 8);
const bicepGeo = new THREE.CylinderGeometry(0.075, 0.065, 0.3, 8);
const forearmGeo = new THREE.CylinderGeometry(0.065, 0.055, 0.28, 8);
const handGeo = new THREE.SphereGeometry(0.055, 6, 6);
const thighGeo = new THREE.CylinderGeometry(0.095, 0.075, 0.35, 8);
const shinGeo = new THREE.CylinderGeometry(0.075, 0.06, 0.35, 8);
const flashConeGeo = new THREE.ConeGeometry(0.14, 0.35, 6);
const flashInnerGeo = new THREE.ConeGeometry(0.06, 0.2, 6);

function makeNameTexture(name: string, color: number) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 64);

  const r = 12;
  const w = 256;
  const h = 64;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r);
  ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h);
  ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill();

  ctx.font = "bold 28px 'Segoe UI', 'Arial Black', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const hex = "#" + color.toString(16).padStart(6, "0");
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = hex;
  ctx.fillText(name, 128, 32);

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export function makeCharacter(color: number, name: string): CharacterView {
  const group = new THREE.Group();
  const pivot = new THREE.Group();
  group.add(pivot);

  const camoTex = camoTexture(color);
  const bodyMat = new THREE.MeshStandardMaterial({ map: camoTex, roughness: 0.7, metalness: 0.1 });

  // --- LEGS ---
  const thighL = new THREE.Mesh(thighGeo, bodyMat);
  thighL.position.set(-0.12, 0.2, 0);
  thighL.userData.part = "body";
  const thighR = new THREE.Mesh(thighGeo, bodyMat);
  thighR.position.set(0.12, 0.2, 0);
  thighR.userData.part = "body";
  pivot.add(thighL, thighR);

  const shinL = new THREE.Mesh(shinGeo, bodyMat);
  shinL.position.set(-0.12, 0.55, 0);
  shinL.userData.part = "body";
  const shinR = new THREE.Mesh(shinGeo, bodyMat);
  shinR.position.set(0.12, 0.55, 0);
  shinR.userData.part = "body";
  pivot.add(shinL, shinR);

  const bootGeo = new THREE.BoxGeometry(0.12, 0.1, 0.22);
  const bootL = new THREE.Mesh(bootGeo, bootMat);
  bootL.position.set(-0.12, 0.79, 0.03);
  bootL.userData.part = "body";
  const bootR = new THREE.Mesh(bootGeo, bootMat);
  bootR.position.set(0.12, 0.79, 0.03);
  bootR.userData.part = "body";
  pivot.add(bootL, bootR);

  // --- TORSO ---
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 4, 10), bodyMat);
  body.position.set(0, 1.15, 0);
  body.userData.part = "body";
  body.castShadow = true;
  pivot.add(body);

  const vestBack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.44, 0.05), vestMat);
  vestBack.position.set(0, 1.18, -0.19);
  vestBack.userData.part = "body";
  pivot.add(vestBack);

  const vestFront = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.44, 0.05), vestMat);
  vestFront.position.set(0, 1.18, 0.19);
  vestFront.userData.part = "body";
  pivot.add(vestFront);

  // --- SHOULDERS ---
  const shouldL = new THREE.Mesh(shouldGeo, vestMat);
  shouldL.position.set(-0.33, 1.35, 0);
  shouldL.userData.part = "body";
  const shouldR = new THREE.Mesh(shouldGeo, vestMat);
  shouldR.position.set(0.33, 1.35, 0);
  shouldR.userData.part = "body";
  pivot.add(shouldL, shouldR);

  // --- ARMS ---
  const armUL = new THREE.Mesh(bicepGeo, bodyMat);
  armUL.position.set(-0.36, 1.15, 0.04);
  armUL.rotation.z = 0.15;
  armUL.userData.part = "body";
  const armUR = new THREE.Mesh(bicepGeo, bodyMat);
  armUR.position.set(0.36, 1.15, 0.14);
  armUR.rotation.z = -0.15;
  armUR.userData.part = "body";
  pivot.add(armUL, armUR);

  const armFL = new THREE.Mesh(forearmGeo, bodyMat);
  armFL.position.set(-0.4, 0.87, 0.06);
  armFL.rotation.z = 0.12;
  armFL.userData.part = "body";
  const armFR = new THREE.Mesh(forearmGeo, bodyMat);
  armFR.position.set(0.4, 0.87, 0.18);
  armFR.rotation.z = -0.12;
  armFR.userData.part = "body";
  pivot.add(armFL, armFR);

  const handL = new THREE.Mesh(handGeo, skinMat);
  handL.position.set(-0.41, 0.72, 0.08);
  handL.userData.part = "body";
  const handR = new THREE.Mesh(handGeo, skinMat);
  handR.position.set(0.41, 0.72, 0.2);
  handR.userData.part = "body";
  pivot.add(handL, handR);

  // --- HEAD ---
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.set(0, 1.64, 0);
  head.userData.part = "head";
  head.castShadow = true;
  pivot.add(head);

  const jaw = new THREE.Mesh(jawGeo, skinMat);
  jaw.position.set(0, 1.56, 0.01);
  jaw.userData.part = "head";
  pivot.add(jaw);

  const nose = new THREE.Mesh(noseGeo, skinMat);
  nose.position.set(0, 1.63, 0.16);
  nose.scale.set(1, 0.7, 1);
  nose.userData.part = "head";
  pivot.add(nose);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.07, 1.66, 0.15);
  eyeL.userData.part = "head";
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.07, 1.66, 0.15);
  eyeR.userData.part = "head";
  pivot.add(eyeL, eyeR);

  // --- HELMET ---
  const helmet = new THREE.Mesh(helmetGeo, helmetMat);
  helmet.position.set(0, 1.68, -0.01);
  helmet.userData.part = "head";
  pivot.add(helmet);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.02), visorMat);
  visor.position.set(0, 1.61, 0.17);
  visor.userData.part = "head";
  pivot.add(visor);

  // --- GUN ---
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.5), gunMat);
  gun.position.set(0.22, 1.08, 0.32);
  gun.userData.part = "body";
  pivot.add(gun);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.08, 6), gunMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.22, 1.11, 0.6);
  barrel.userData.part = "body";
  pivot.add(barrel);

  const stockGeo = new THREE.BoxGeometry(0.04, 0.06, 0.08);
  const stock = new THREE.Mesh(stockGeo, gunMat);
  stock.position.set(0.22, 1.06, 0.1);
  stock.userData.part = "body";
  pivot.add(stock);

  // --- MUZZLE FLASH ---
  const flashGrp = new THREE.Group();
  flashGrp.visible = false;

  const flashOuter = new THREE.Mesh(flashConeGeo, flashMat);
  flashOuter.position.set(0, 0.02, 0);
  flashOuter.rotation.x = Math.PI / 2;
  flashGrp.add(flashOuter);

  const flashInner = new THREE.Mesh(flashInnerGeo, flashWhiteMat);
  flashInner.position.set(0, 0, 0);
  flashInner.rotation.x = Math.PI / 2;
  flashGrp.add(flashInner);

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(
      new THREE.ConeGeometry(0.03, 0.12, 4),
      new THREE.MeshBasicMaterial({
        color: 0xffaa44,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    spike.position.set(Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07);
    spike.rotation.x = Math.PI / 2;
    flashGrp.add(spike);
  }

  flashGrp.position.set(0.22, 1.11, 0.68);
  pivot.add(flashGrp);

  // --- NAME TAG ---
  const nameTex = makeNameTexture(name, color);
  const nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTex, depthTest: false, transparent: true }));
  nameSprite.position.set(0, 2.15, 0);
  nameSprite.scale.set(1.7, 0.43, 1);
  nameSprite.renderOrder = 999;
  group.add(nameSprite);

  let flashUntil = 0;
  const setFiring = (on: boolean, t: number) => {
    if (on) {
      flashUntil = t + 0.05;
      flashGrp.rotation.z = Math.random() * Math.PI;
      const s = 0.7 + Math.random() * 0.6;
      flashGrp.scale.setScalar(s);
    }
  };
  const updateFlash = () => {
    const now = performance.now() / 1000;
    flashGrp.visible = now < flashUntil;
    if (flashGrp.visible) {
      const progress = (now - (flashUntil - 0.05)) / 0.05;
      flashMat.opacity = 0.9 * (1 - progress * 0.7);
      flashWhiteMat.opacity = 0.8 * (1 - progress * 0.6);
    }
  };
  group.userData._updateFlash = updateFlash;

  // Death / animation state
  let _alive = true;
  let _deathAnimating = false;
  let _deathStartTime = 0;
  let _moving = false;
  let _sprinting = false;

  const setAlive = (alive: boolean) => {
    if (!alive && _alive && !_deathAnimating) {
      _deathAnimating = true;
      _deathStartTime = performance.now();
    }
    if (alive) {
      _deathAnimating = false;
      group.visible = true;
      nameSprite.visible = true;
      pivot.rotation.x = 0;
      pivot.position.y = 0;
    }
    _alive = alive;
  };

  const die = () => {
    if (!_alive || _deathAnimating) return;
    _deathAnimating = true;
    _deathStartTime = performance.now();
  };

  const setMoving = (moving: boolean, sprinting: boolean) => {
    _moving = moving;
    _sprinting = sprinting;
  };

  const updateAnimations = (dt: number) => {
    if (_deathAnimating) {
      const elapsed = (performance.now() - _deathStartTime) / 1000;
      const fallDur = 0.5;
      if (elapsed < fallDur) {
        const t = elapsed / fallDur;
        const smooth = t * t * (3 - 2 * t);
        pivot.rotation.x = -Math.PI / 2 * smooth;
        pivot.position.y = -t * 0.5;
      } else if (elapsed < fallDur + 0.5) {
        // Hold then fade
        const fadeT = (elapsed - fallDur) / 0.5;
        group.traverse((c) => {
          if (c instanceof THREE.Mesh && c.material) {
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            for (const m of mats) {
              if (m.transparent || m === skinMat || m === helmetMat || m === vestMat || m === gunMat || m === bootMat || m === visorMat) {
                m.transparent = true;
                m.opacity = 1 - fadeT;
              }
            }
          }
        });
      } else {
        _deathAnimating = false;
        group.visible = false;
        // Reset opacity
        group.traverse((c) => {
          if (c instanceof THREE.Mesh && c.material) {
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            for (const m of mats) {
              m.opacity = 1;
            }
          }
        });
      }
      return;
    }
    if (_alive && (_moving || _sprinting)) {
      const speed = _sprinting ? 14 : 10;
      const bobAmount = _sprinting ? 0.03 : 0.015;
      pivot.position.y = Math.sin(performance.now() / 1000 * speed) * bobAmount;
      if (_sprinting) {
        pivot.rotation.x = -0.08;
      } else {
        pivot.rotation.x += (0 - pivot.rotation.x) * Math.min(1, dt * 5);
      }
    } else if (_alive) {
      pivot.position.y += (0 - pivot.position.y) * Math.min(1, dt * 5);
      pivot.rotation.x += (0 - pivot.rotation.x) * Math.min(1, dt * 5);
    }
  };

  const dispose = () => {
    bodyMat.dispose();
    camoTex.dispose();
    nameTex.dispose();
  };

  return { group, head, body, gun, nameSprite, nameTex, baseColor: color, setFiring, setAlive, die, setMoving, updateAnimations, dispose };
}
