import * as THREE from "three";
import { asphaltTexture, concreteTexture, crateTexture, metalTexture, barrelTexture, sandTexture } from "./textures";

export interface GameMap {
  group: THREE.Group;
  colliders: THREE.Box3[];
  rayMeshes: THREE.Object3D[];
  spawnPoints: THREE.Vector3[];
  teamSpawns: { red: THREE.Vector3[]; blue: THREE.Vector3[] };
  bounds: number;
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ARENA = 47;

export function buildMap(): GameMap {
  const group = new THREE.Group();
  const colliders: THREE.Box3[] = [];
  const rayMeshes: THREE.Object3D[] = [];
  const rng = mulberry32(13371337);

  const groundMat = new THREE.MeshStandardMaterial({
    map: asphaltTexture(28),
    roughness: 0.95,
    metalness: 0.02,
  });
  const dirtMat = new THREE.MeshStandardMaterial({
    map: sandTexture(6),
    roughness: 0.98,
    metalness: 0,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    map: concreteTexture(2),
    roughness: 0.9,
    metalness: 0.03,
  });
  const buildMat = new THREE.MeshStandardMaterial({
    map: concreteTexture(1.5),
    roughness: 0.92,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    map: concreteTexture(3),
    roughness: 0.9,
    color: 0x999999,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    map: concreteTexture(2),
    roughness: 0.95,
    color: 0x777777,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    map: metalTexture(1),
    roughness: 0.45,
    metalness: 0.7,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    map: metalTexture(1),
    roughness: 0.7,
    metalness: 0.5,
    color: 0x555555,
  });
  const crateMat = new THREE.MeshStandardMaterial({
    map: crateTexture(1),
    roughness: 0.85,
  });
  const barrelMat = new THREE.MeshStandardMaterial({
    map: barrelTexture(),
    roughness: 0.6,
    metalness: 0.5,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0.2,
    roughness: 0,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  const sandbagMat = new THREE.MeshStandardMaterial({
    map: sandTexture(1),
    roughness: 0.95,
    metalness: 0,
  });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffdd88,
    emissive: 0xffdd88,
    emissiveIntensity: 0.3,
  });

  function addBox(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, matName = "concrete") {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.material = matName;
    group.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    colliders.push(box);
    rayMeshes.push(mesh);
    return mesh;
  }

  function addGlass(w: number, h: number, x: number, y: number, z: number, ry = 0) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.userData.material = "glass";
    group.add(mesh);
    rayMeshes.push(mesh);
    return mesh;
  }

  function addSandbag(w: number, x: number, z: number, ry = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, 0.7), sandbagMat);
    mesh.position.set(x, 0.35, z);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.material = "concrete";
    group.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    colliders.push(box);
    rayMeshes.push(mesh);
    return mesh;
  }

  function addLamp(x: number, z: number) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.5, 8), metalMat);
    pole.position.set(x, 1.75, z);
    pole.castShadow = true;
    pole.receiveShadow = true;
    pole.userData.material = "metal";
    group.add(pole);
    const poleBox = new THREE.Box3().setFromObject(pole);
    colliders.push(poleBox);
    rayMeshes.push(pole);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lampMat);
    light.position.set(x, 3.6, z);
    light.castShadow = true;
    light.receiveShadow = true;
    group.add(light);
  }

  // ===== GROUND =====
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Dirt path overlays
  const pathData: [number, number, number, number][] = [
    [0, 0, 12, 3.5],
    [10, 14, 4, 3],
    [-11, 10, 4, 3],
    [6, -12, 4, 3],
  ];
  for (const [x, z, w, d] of pathData) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), dirtMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.015, z);
    p.receiveShadow = true;
    group.add(p);
  }

  // ===== BORDER WALLS =====
  const BH = 7;
  addBox(ARENA * 2, BH, 1.5, 0, BH / 2, ARENA, wallMat);
  addBox(ARENA * 2, BH, 1.5, 0, BH / 2, -ARENA, wallMat);
  addBox(1.5, BH, ARENA * 2, ARENA, BH / 2, 0, wallMat);
  addBox(1.5, BH, ARENA * 2, -ARENA, BH / 2, 0, wallMat);

  // ===== CORNER BUILDINGS (solid with windows) =====
  const corners: [number, number][] = [
    [20, 20], [-20, 20], [20, -20], [-20, -20],
  ];
  for (const [x, z] of corners) {
    addBox(9, 7, 9, x, 3.5, z, buildMat);
    const sX = x > 0 ? 1 : -1;
    const sZ = z > 0 ? 1 : -1;
    addGlass(3, 2.5, x + sX * 4.51, 3.5, z, 0);
    addGlass(3, 2.5, x, 3.5, z + sZ * 4.51, Math.PI / 2);
  }

  // ===== CENTRAL TOWER — HOLLOW WITH ROOF ACCESS =====
  const tw = 7, td = 7, th = 7;
  const pill = 0.3;
  addBox(pill, th, pill, -tw / 2 + pill / 2, th / 2, -td / 2 + pill / 2, buildMat);
  addBox(pill, th, pill, tw / 2 - pill / 2, th / 2, -td / 2 + pill / 2, buildMat);
  addBox(pill, th, pill, -tw / 2 + pill / 2, th / 2, td / 2 - pill / 2, buildMat);
  addBox(pill, th, pill, tw / 2 - pill / 2, th / 2, td / 2 - pill / 2, buildMat);

  const wallT = 0.25;
  addBox(tw - 0.6, th, wallT, 0, th / 2, -td / 2, buildMat);
  addBox(wallT, th, td - 0.6, -tw / 2, th / 2, 0, buildMat);
  addBox(wallT, th, td - 0.6, tw / 2, th / 2, 0, buildMat);
  addBox(2.5, th, wallT, -2.5, th / 2, td / 2, buildMat);
  addBox(2.5, th, wallT, 2.5, th / 2, td / 2, buildMat);

  addBox(tw - 0.6, 0.15, td - 0.6, 0, 0.075, 0, floorMat);
  addBox(tw, 0.3, td, 0, th, 0, roofMat);

  for (let i = 0; i < 10; i++) {
    const stepH = 0.65;
    const sz = -1.5 + i * 0.42;
    addBox(1.4, stepH, 0.4, 0, i * stepH + stepH / 2, sz, buildMat);
  }

  addGlass(2.6, 4, 0, 3.5, td / 2 + 0.01, 0);

  // ===== 2-STORY BUILDING at (12, 14) =====
  const bx = 12, bz = 14;
  const bw = 7, bd = 7, storyH = 3;

  addBox(bw, 0.2, bd, bx, 0.1, bz, floorMat);
  addBox(bw, 0.2, bd, bx, storyH, bz, floorMat);
  addBox(bw, 0.2, bd, bx, storyH * 2, bz, roofMat);

  const wT = 0.25;
  addBox(bw, storyH * 2, wT, bx, storyH, bz - bd / 2, buildMat);
  addBox(wT, storyH * 2, bd, bx - bw / 2, storyH, bz, buildMat);
  addBox(wT, storyH * 2, bd, bx + bw / 2, storyH, bz, buildMat);
  addBox(bw * 0.35, storyH, wT, bx - bw * 0.325, storyH / 2, bz + bd / 2, buildMat);
  addBox(bw * 0.35, storyH, wT, bx + bw * 0.325, storyH / 2, bz + bd / 2, buildMat);
  addBox(bw * 0.2, storyH, wT, bx - bw * 0.4, storyH * 1.5, bz + bd / 2, buildMat);
  addBox(bw * 0.2, storyH, wT, bx + bw * 0.4, storyH * 1.5, bz + bd / 2, buildMat);
  addBox(1.5, storyH - 0.8, wT, bx, storyH * 1.5 - 0.2, bz + bd / 2, buildMat);

  for (let i = 0; i < 8; i++) {
    const sh = 0.35;
    const sy = i * sh + sh / 2;
    addBox(0.8, sh, 1, bx + bw / 2 - 0.6, sy, bz - bd / 2 + 0.6 + i * 0.5, buildMat);
  }

  const glassW = 1.8, glassH = 1.2;
  addGlass(glassW, glassH, bx - bw * 0.325, 1.8, bz + bd / 2 + 0.01, 0);
  addGlass(glassW, glassH, bx + bw * 0.325, 1.8, bz + bd / 2 + 0.01, 0);
  addGlass(glassW, glassH, bx - bw * 0.4, 4.2, bz + bd / 2 + 0.01, 0);
  addGlass(glassW, glassH, bx + bw * 0.4, 4.2, bz + bd / 2 + 0.01, 0);
  addGlass(1.5, glassH, bx, 4.2, bz + bd / 2 + 0.01, 0);
  addGlass(2, glassH, bx, 2.5, bz - bd / 2 + 0.01, 0);

  const balW = 5, balD = 1.5;
  addBox(balW, 0.15, balD, bx, storyH + 0.075, bz + bd / 2 + balD / 2, metalMat, "metal");
  addBox(balW, 0.06, 0.06, bx, storyH + 0.8, bz + bd / 2 + balD, metalMat, "metal");
  addBox(balW, 0.06, 0.06, bx, storyH + 0.4, bz + bd / 2 + balD, metalMat, "metal");
  addBox(0.06, 0.8, balD, bx - balW / 2, storyH + 0.4, bz + bd / 2 + balD / 2, metalMat, "metal");
  addBox(0.06, 0.8, balD, bx + balW / 2, storyH + 0.4, bz + bd / 2 + balD / 2, metalMat, "metal");
  addBox(0.1, 0.8, 0.1, bx - balW / 2, storyH + 0.4, bz + bd / 2 + balD, metalMat, "metal");
  addBox(0.1, 0.8, 0.1, bx + balW / 2, storyH + 0.4, bz + bd / 2 + balD, metalMat, "metal");
  addBox(0.1, 0.8, 0.1, bx, storyH + 0.4, bz + bd / 2 + balD, metalMat, "metal");

  // ===== GARAGE / SHELTER at (-12, 10) =====
  const gx = -12, gz = 10, gw = 8, gd = 5, gh = 3.5;
  const pr = 0.4;
  const pillarPositions: [number, number][] = [
    [gx - gw / 2 + 0.5, gz - gd / 2 + 0.5],
    [gx + gw / 2 - 0.5, gz - gd / 2 + 0.5],
    [gx - gw / 2 + 0.5, gz + gd / 2 - 0.5],
    [gx + gw / 2 - 0.5, gz + gd / 2 - 0.5],
  ];
  for (const [px, pz] of pillarPositions) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, gh, 12), buildMat);
    mesh.position.set(px, gh / 2, pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.material = "concrete";
    group.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    colliders.push(box);
    rayMeshes.push(mesh);
  }
  addBox(gw, 0.3, gd, gx, gh, gz, roofMat);

  addSandbag(2.5, gx - gw / 2 - 0.8, gz, 0);
  addSandbag(2.5, gx + gw / 2 + 0.8, gz, 0);
  addSandbag(2.5, gx, gz - gd / 2 - 0.8, Math.PI / 2);

  // ===== BUNKER / TUNNEL at (6, -12) =====
  const ukx = 6, ukz = -12, ukw = 6, ukd = 4, ukh = 2.4;
  addBox(ukw, 0.2, ukd, ukx, 0.1, ukz, floorMat);
  addBox(ukw, 0.3, ukd, ukx, ukh, ukz, roofMat);
  addBox(ukw, ukh, 0.4, ukx, ukh / 2, ukz - ukd / 2, buildMat);
  addBox(0.4, ukh, ukd, ukx - ukw / 2, ukh / 2, ukz, buildMat);
  addBox(0.4, ukh, ukd * 0.5, ukx + ukw / 2, ukh / 2, ukz - ukd * 0.25, buildMat);
  addBox(0.4, ukh, ukd * 0.35, ukx + ukw / 2, ukh / 2, ukz + ukd * 0.325, buildMat);
  addBox(ukw * 0.7, ukh, 0.4, ukx - ukw * 0.15, ukh / 2, ukz + ukd / 2, buildMat);

  addBox(1, 1, 1, ukx - 1.2, 0.5, ukz, crateMat, "wood");
  addBox(1, 1, 1, ukx + 0.5, 0.5, ukz - 0.8, crateMat, "wood");

  // ===== DESTROYED VEHICLE at (-16, -14) =====
  const vx = -16, vz = -14;
  addBox(3.5, 1.2, 2, vx, 0.6, vz, darkMetalMat, "metal");
  addBox(1.5, 0.8, 1.6, vx + 0.3, 1, vz, darkMetalMat, "metal");
  const turret = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 1.2), darkMetalMat);
  turret.position.set(vx - 0.5, 1.2, vz);
  turret.rotation.z = 0.4;
  turret.castShadow = true;
  turret.receiveShadow = true;
  turret.userData.material = "metal";
  group.add(turret);
  const turretBox = new THREE.Box3().setFromObject(turret);
  colliders.push(turretBox);
  rayMeshes.push(turret);

  // ===== SANDBAG POSITIONS =====
  const sandbagGroups: [number, number, number][] = [
    [0, 8, Math.PI / 2],
    [0, -8, Math.PI / 2],
    [10, 0, 0],
    [-10, 0, 0],
    [5, 5, Math.PI / 4],
    [-5, -5, Math.PI / 4],
  ];
  for (const [sx, sz, rot] of sandbagGroups) {
    addSandbag(rng() > 0.5 ? 3 : 2, sx, sz, rot);
  }

  // ===== LAMP POSTS =====
  const lampPositions: [number, number][] = [
    [5, 5], [-5, 5], [5, -5], [-5, -5],
    [15, 0], [-15, 0],
  ];
  for (const [lx, lz] of lampPositions) {
    addLamp(lx, lz);
  }

  // ===== CRATES (strategically placed) =====
  const cratePositions: [number, number, number, number][] = [
    [3, 0, 1.2, 1], [-3, 0, 1.2, 1],
    [0, 3, 1.2, 1], [0, -3, 1.2, 1],
    [8, 14, 1.5, 1], [8, 11, 1, 2],
    [16, 14, 1, 1], [16, 11, 1.2, 1],
    [-16, 10, 1.2, 1], [-16, 7, 1, 2],
    [-8, 10, 1.5, 1],
    [3, -16, 1.2, 1], [10, -16, 1, 2],
    [8, 8, 1.2, 1], [-8, 8, 1.2, 1],
    [8, -8, 1.2, 1], [-8, -8, 1.2, 1],
    [15, 5, 1, 1], [-15, 5, 1.2, 1],
    [15, -5, 1, 2], [-15, -5, 1.2, 1],
    [5, 15, 1.2, 1], [-5, 15, 1, 1],
    [5, -15, 1.2, 1], [-5, -15, 1, 1],
    [12, -5, 1, 1], [-12, -5, 1.2, 1],
    [0, 12, 1.2, 2], [0, -12, 1, 1],
    [-3, 3, 1.2, 1], [3, -3, 1.2, 1],
  ];
  for (const [cx, cz, size, stackCount] of cratePositions) {
    for (let i = 0; i < stackCount; i++) {
      addBox(size, size, size, cx, size / 2 + i * size, cz, crateMat, "wood");
    }
  }

  // ===== BARRELS =====
  const barrelPositions: [number, number][] = [
    [2, 2], [-2, 2], [2, -2], [-2, -2],
    [7, 7], [-7, 7], [7, -7], [-7, -7],
    [10, 10], [-10, 10], [10, -10], [-10, -10],
    [3, 10], [-3, 10], [3, -10], [-3, -10],
    [18, 0], [-18, 0], [0, 18], [0, -18],
    [5, 0], [-5, 0], [0, 5], [0, -5],
    [12, 8], [-12, 8], [12, -8], [-12, -8],
  ];
  for (const [cx, cz] of barrelPositions) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 14), barrelMat);
    mesh.position.set(cx, 0.7, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.material = "metal";
    group.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    colliders.push(box);
    rayMeshes.push(mesh);
  }

  // ===== SPAWN POINTS (22) =====
  const spawnPoints: THREE.Vector3[] = [];

  const perimeter: [number, number][] = [
    [0, 40], [0, -40], [40, 0], [-40, 0],
    [30, 30], [-30, 30], [30, -30], [-30, -30],
    [16, 38], [-16, 38], [16, -38], [-16, -38],
  ];
  for (const [x, z] of perimeter) spawnPoints.push(new THREE.Vector3(x, 0, z));

  const midGround: [number, number][] = [
    [10, 20], [-10, 20], [10, -20], [-10, -20],
  ];
  for (const [x, z] of midGround) spawnPoints.push(new THREE.Vector3(x, 0, z));

  spawnPoints.push(new THREE.Vector3(20, 7, 20));
  spawnPoints.push(new THREE.Vector3(-20, 7, 20));
  spawnPoints.push(new THREE.Vector3(20, 7, -20));
  spawnPoints.push(new THREE.Vector3(-20, 7, -20));

  spawnPoints.push(new THREE.Vector3(12, 6.2, 14));
  spawnPoints.push(new THREE.Vector3(12, 6.2, 11));

  spawnPoints.push(new THREE.Vector3(6, 0, -12));
  spawnPoints.push(new THREE.Vector3(6, 0, -10.5));

  spawnPoints.push(new THREE.Vector3(12, 3.2, 18.5));
  spawnPoints.push(new THREE.Vector3(10, 3.2, 18.5));

  const teamSpawns = {
    red: spawnPoints.filter((_, i) => i < spawnPoints.length / 2),
    blue: spawnPoints.filter((_, i) => i >= spawnPoints.length / 2),
  };

  return { group, colliders, rayMeshes, spawnPoints, teamSpawns, bounds: ARENA };
}
