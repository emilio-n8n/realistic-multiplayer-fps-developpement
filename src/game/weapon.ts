import * as THREE from "three";

export interface WeaponView {
  group: THREE.Group;
  muzzle: THREE.Object3D;
  flash: THREE.Mesh;
  flashLight: THREE.PointLight;
}

const gunMetal = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.45, metalness: 0.85 });
const gunDark = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.6, metalness: 0.8 });
const gunAccent = new THREE.MeshStandardMaterial({ color: 0x2e2f33, roughness: 0.5, metalness: 0.7 });
const wood = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.7, metalness: 0.2 });

export function buildWeaponView(): WeaponView {
  const group = new THREE.Group();

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };

  // lower receiver
  add(new THREE.BoxGeometry(0.1, 0.12, 0.5), gunMetal, 0, 0, -0.1);
  // upper receiver / body
  add(new THREE.BoxGeometry(0.09, 0.11, 0.62), gunAccent, 0, 0.06, -0.12);
  // handguard
  add(new THREE.BoxGeometry(0.085, 0.09, 0.42), gunDark, 0, 0.05, 0.18);
  // barrel
  const barrel = add(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 12), gunMetal, 0, 0.07, 0.45);
  barrel.rotation.x = Math.PI / 2;
  // muzzle / front sight
  add(new THREE.BoxGeometry(0.03, 0.06, 0.03), gunDark, 0, 0.12, 0.66);
  // magazine (curved-ish: two boxes)
  add(new THREE.BoxGeometry(0.07, 0.22, 0.1), gunDark, 0, -0.16, 0.02);
  add(new THREE.BoxGeometry(0.07, 0.14, 0.1), gunDark, 0, -0.24, -0.04);
  // pistol grip
  const grip = add(new THREE.BoxGeometry(0.06, 0.18, 0.08), gunDark, 0, -0.13, -0.28);
  grip.rotation.x = -0.35;
  // stock
  const stock = add(new THREE.BoxGeometry(0.07, 0.1, 0.28), wood, 0, -0.01, -0.5);
  stock.position.z = -0.48;
  // rear sight
  add(new THREE.BoxGeometry(0.05, 0.04, 0.04), gunDark, 0, 0.14, -0.32);
  // optic rail accent
  add(new THREE.BoxGeometry(0.06, 0.02, 0.3), gunAccent, 0, 0.13, 0.0);

  // muzzle reference
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.07, 0.72);
  group.add(muzzle);

  // muzzle flash
  const flash = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.34, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  flash.position.set(0, 0.07, 0.86);
  flash.rotation.x = Math.PI / 2;
  flash.visible = false;
  group.add(flash);

  const flashLight = new THREE.PointLight(0xffb347, 0, 8, 2);
  flashLight.position.copy(muzzle.position);
  group.add(flashLight);

  return { group, muzzle, flash, flashLight };
}
