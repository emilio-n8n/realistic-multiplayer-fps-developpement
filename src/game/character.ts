import * as THREE from "three";

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
  dispose: () => void;
}

const skinMat = new THREE.MeshStandardMaterial({ color: 0xc79a6b, roughness: 0.7 });
const helmetMat = new THREE.MeshStandardMaterial({ color: 0x2b2f24, roughness: 0.6, metalness: 0.3 });
const vestMat = new THREE.MeshStandardMaterial({ color: 0x26282c, roughness: 0.6, metalness: 0.4 });
const gunMat = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.5, metalness: 0.8 });
const flashMat = new THREE.MeshBasicMaterial({
  color: 0xffd27a,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

function makeNameTexture(name: string, color: number) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = "bold 30px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillText(name, 130, 34);
  const hex = "#" + color.toString(16).padStart(6, "0");
  ctx.fillStyle = hex;
  ctx.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export function makeCharacter(color: number, name: string): CharacterView {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.15 });

  // legs
  const legGeo = new THREE.BoxGeometry(0.18, 0.8, 0.22);
  const legL = new THREE.Mesh(legGeo, gunMat);
  legL.position.set(-0.13, 0.4, 0);
  legL.userData.part = "body";
  const legR = new THREE.Mesh(legGeo, gunMat);
  legR.position.set(0.13, 0.4, 0);
  legR.userData.part = "body";
  group.add(legL, legR);

  // torso (capsule)
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.55, 4, 10), bodyMat);
  body.position.set(0, 1.12, 0);
  body.userData.part = "body";
  body.castShadow = true;
  group.add(body);

  // vest
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.42), vestMat);
  vest.position.set(0, 1.15, 0);
  vest.userData.part = "body";
  group.add(vest);

  // arms
  const armGeo = new THREE.CapsuleGeometry(0.1, 0.45, 4, 8);
  const armMat = bodyMat.clone();
  const armL = new THREE.Mesh(armGeo, armMat);
  armL.position.set(-0.36, 1.18, 0.12);
  armL.userData.part = "body";
  const armR = new THREE.Mesh(armGeo, armMat);
  armR.position.set(0.36, 1.18, 0.12);
  armR.userData.part = "body";
  group.add(armL, armR);

  // neck + head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), skinMat);
  head.position.set(0, 1.66, 0.02);
  head.userData.part = "head";
  head.castShadow = true;
  group.add(head);

  // helmet
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), helmetMat);
  helmet.position.set(0, 1.7, 0.02);
  helmet.userData.part = "head";
  group.add(helmet);

  // gun in hands
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.62), gunMat);
  gun.position.set(0.22, 1.16, 0.32);
  gun.userData.part = "body";
  group.add(gun);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0.22, 1.2, 0.64);
  group.add(muzzle);

  // enemy muzzle flash
  const flash = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 6), flashMat);
  flash.position.set(0.22, 1.2, 0.78);
  flash.rotation.x = Math.PI / 2;
  flash.visible = false;
  group.add(flash);

  // name tag
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
      flash.rotation.z = Math.random() * Math.PI;
      flash.scale.setScalar(0.7 + Math.random() * 0.6);
    }
  };
  const updateFlash = () => {
    flash.visible = performance.now() / 1000 < flashUntil;
  };
  group.userData._updateFlash = updateFlash;

  const setAlive = (alive: boolean) => {
    group.visible = alive;
    nameSprite.visible = alive;
  };

  const dispose = () => {
    bodyMat.dispose();
    armMat.dispose();
    nameTex.dispose();
  };

  return { group, head, body, gun, nameSprite, nameTex, baseColor: color, setFiring, setAlive, dispose };
}
