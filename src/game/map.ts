import * as THREE from "three";
import { asphaltTexture, concreteTexture, crateTexture, metalTexture, barrelTexture } from "./textures";

export interface GameMap {
  group: THREE.Group;
  colliders: THREE.Box3[]; // for movement collision (AABBs)
  rayMeshes: THREE.Object3D[]; // for line-of-sight & bullet raycasts
  spawnPoints: THREE.Vector3[];
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
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const wallTex = concreteTexture(2);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, metalness: 0.03 });
  const buildMat = new THREE.MeshStandardMaterial({ map: concreteTexture(1.5), roughness: 0.92 });
  const metalMat = new THREE.MeshStandardMaterial({ map: metalTexture(1), roughness: 0.45, metalness: 0.7 });
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(1), roughness: 0.85 });
  const barrelMat = new THREE.MeshStandardMaterial({ map: barrelTexture(), roughness: 0.6, metalness: 0.5 });

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

  // Border walls
  const BH = 7;
  addBox(ARENA * 2, BH, 1.5, 0, BH / 2, ARENA, wallMat);
  addBox(ARENA * 2, BH, 1.5, 0, BH / 2, -ARENA, wallMat);
  addBox(1.5, BH, ARENA * 2, ARENA, BH / 2, 0, wallMat);
  addBox(1.5, BH, ARENA * 2, -ARENA, BH / 2, 0, wallMat);

  // Corner buildings
  const corners = [
    [20, 20],
    [-20, 20],
    [20, -20],
    [-20, -20],
  ];
  for (const [x, z] of corners) {
    addBox(9, 7, 9, x, 3.5, z, buildMat);
  }
  // Central tower (with parapet) — tall cover
  addBox(7, 9, 7, 0, 4.5, 0, buildMat);

  // Low cover walls forming lanes
  const covers: [number, number, number, number][] = [
    [0, 14, 10, 0.6],
    [0, -14, 10, 0.6],
    [14, 0, 0.6, 10],
    [-14, 0, 0.6, 10],
    [9, 9, 0.6, 7],
    [-9, -9, 0.6, 7],
    [9, -9, 7, 0.6],
    [-9, 9, 7, 0.6],
  ];
  for (const [x, z, w, d] of covers) {
    addBox(w, 2.3, d, x, 1.15, z, metalMat, "metal");
  }

  // Scattered crates (some stacked)
  let placed = 0;
  let attempts = 0;
  while (placed < 34 && attempts < 400) {
    attempts++;
    const x = (rng() * 2 - 1) * (ARENA - 6);
    const z = (rng() * 2 - 1) * (ARENA - 6);
    // avoid center spawn
    if (Math.hypot(x, z) < 6) continue;
    const s = 1.6 + rng() * 1.0;
    const stack = rng() < 0.28 ? 2 : 1;
    for (let i = 0; i < stack; i++) {
      addBox(s, s, s, x, s / 2 + i * s, z, crateMat, "wood");
    }
    placed++;
  }

  // Barrels
  let bp = 0;
  let ba = 0;
  while (bp < 18 && ba < 300) {
    ba++;
    const x = (rng() * 2 - 1) * (ARENA - 5);
    const z = (rng() * 2 - 1) * (ARENA - 5);
    if (Math.hypot(x, z) < 5) continue;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 14), barrelMat);
    mesh.position.set(x, 0.7, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.material = "metal";
    group.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    colliders.push(box);
    rayMeshes.push(mesh);
    bp++;
  }

  // Spawn points around the perimeter
  const spawnPoints: THREE.Vector3[] = [];
  const ring = [
    [0, 40], [0, -40], [40, 0], [-40, 0],
    [30, 30], [-30, 30], [30, -30], [-30, -30],
    [16, 38], [-16, 38], [16, -38], [-16, -38],
  ];
  for (const [x, z] of ring) spawnPoints.push(new THREE.Vector3(x, 0, z));

  return { group, colliders, rayMeshes, spawnPoints, bounds: ARENA };
}
