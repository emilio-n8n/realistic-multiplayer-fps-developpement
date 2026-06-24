import * as THREE from "three";
import { PLAYER, GRENADE } from "./types";
import type { Game } from "./engine";
import type { EquipmentType } from "./types";
import * as Sfx from "./sound";

interface EquipmentProjectile {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  timer: number;
  alive: boolean;
  owner: string;
  type: "frag" | "flash";
}

interface SmokeCloud {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  timer: number;
  duration: number;
  life: number;
}

interface Claymore {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  yaw: number;
  alive: boolean;
  owner: string;
  timer: number;
}

export class EquipmentSystem {
  game: Game;
  projectiles: EquipmentProjectile[] = [];
  smokeClouds: SmokeCloud[] = [];
  claymores: Claymore[] = [];

  constructor(game: Game) {
    this.game = game;
  }

  useLethal(type: EquipmentType) {
    switch (type) {
      case "frag": this.throwFrag(); break;
      case "claymore": this.placeClaymore(); break;
      default: break;
    }
  }

  useTactical(type: EquipmentType) {
    switch (type) {
      case "flash": this.throwFlash(); break;
      case "smoke": this.deploySmoke(); break;
      default: break;
    }
  }

  throwFrag() {
    const game = this.game;
    if (game.now - game.lastGrenade < 1) return;
    game.lastGrenade = game.now;
    const lp = game.lp;
    let g = this.projectiles.find((x) => !x.alive && x.type === "frag");
    if (!g) {
      if (this.projectiles.filter((x) => x.type === "frag").length >= GRENADE.poolSize) return;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 })
      );
      mesh.castShadow = true;
      mesh.visible = false;
      game.scene.add(mesh);
      g = { mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), timer: 0, alive: false, owner: "", type: "frag" };
      this.projectiles.push(g);
    }
    const eye = new THREE.Vector3(lp.pos.x, lp.pos.y + PLAYER.eyeHeight, lp.pos.z);
    const sin = Math.sin(lp.yaw);
    const cos = Math.cos(lp.yaw);
    const fwd = new THREE.Vector3(-sin, 0, -cos);
    g.pos.copy(eye).add(fwd.clone().multiplyScalar(0.8));
    g.vel.set(fwd.x * GRENADE.throwSpeed, 4.5, fwd.z * GRENADE.throwSpeed);
    g.timer = GRENADE.cookTime;
    g.alive = true;
    g.owner = game.selfId;
    g.mesh.position.copy(g.pos);
    g.mesh.visible = true;
    Sfx.grenadeCook();
  }

  throwFlash() {
    const game = this.game;
    if (game.now - game.lastGrenade < 0.8) return;
    game.lastGrenade = game.now;
    const lp = game.lp;
    let p = this.projectiles.find((x) => !x.alive && x.type === "flash");
    if (!p) {
      if (this.projectiles.filter((x) => x.type === "flash").length >= 4) return;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.3, emissive: 0x444444 })
      );
      mesh.castShadow = true;
      mesh.visible = false;
      game.scene.add(mesh);
      p = { mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), timer: 0, alive: false, owner: "", type: "flash" };
      this.projectiles.push(p);
    }
    const eye = new THREE.Vector3(lp.pos.x, lp.pos.y + PLAYER.eyeHeight, lp.pos.z);
    const sin = Math.sin(lp.yaw);
    const cos = Math.cos(lp.yaw);
    const fwd = new THREE.Vector3(-sin, 0, -cos);
    p.pos.copy(eye).add(fwd.clone().multiplyScalar(0.8));
    p.vel.set(fwd.x * GRENADE.throwSpeed, 4.5, fwd.z * GRENADE.throwSpeed);
    p.timer = 0.8;
    p.alive = true;
    p.owner = game.selfId;
    p.mesh.position.copy(p.pos);
    p.mesh.visible = true;
  }

  deploySmoke() {
    const game = this.game;
    const lp = game.lp;
    const pos = lp.pos.clone();
    pos.y = 0;

    let sc = this.smokeClouds.find((x) => x.life <= 0);
    if (!sc) {
      if (this.smokeClouds.length >= 4) return;
      const mat = new THREE.MeshBasicMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), mat);
      mesh.visible = false;
      game.scene.add(mesh);
      sc = { mesh, pos: new THREE.Vector3(), timer: 0, duration: 5, life: 0 };
      this.smokeClouds.push(sc);
    }
    sc.mesh.position.copy(pos);
    sc.mesh.scale.setScalar(0.1);
    sc.mesh.visible = true;
    sc.pos.copy(pos);
    sc.timer = 5;
    sc.life = 5;
    sc.duration = 5;

    Sfx.smokeDeploy();
  }

  placeClaymore() {
    const game = this.game;
    const lp = game.lp;
    const pos = lp.pos.clone();
    pos.y = 0.05;

    let c = this.claymores.find((x) => !x.alive);
    if (!c) {
      if (this.claymores.length >= 3) return;
      const mat = new THREE.MeshStandardMaterial({ color: 0x2a3a2a, roughness: 0.7 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.04), mat);
      mesh.castShadow = true;
      mesh.visible = false;
      game.scene.add(mesh);
      c = { mesh, pos: new THREE.Vector3(), yaw: 0, alive: false, owner: "", timer: 0 };
      this.claymores.push(c);
    }
    c.mesh.position.copy(pos);
    c.mesh.rotation.y = lp.yaw;
    c.mesh.visible = true;
    c.pos.copy(pos);
    c.yaw = lp.yaw;
    c.alive = true;
    c.owner = game.selfId;
    c.timer = 0.5;

    Sfx.claymoreBeep();
  }

  update(dt: number) {
    const game = this.game;
    // Update projectiles
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.timer -= dt;
      if (p.timer <= 0) {
        this.explodeProjectile(p);
        continue;
      }
      p.vel.y -= GRENADE.gravity * dt;
      p.pos.x += p.vel.x * dt;
      p.pos.z += p.vel.z * dt;
      p.pos.y += p.vel.y * dt;
      this.collideProjectile(p);
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.x += dt * 3;
      p.mesh.rotation.z += dt * 4;
    }

    // Update smoke clouds
    for (const sc of this.smokeClouds) {
      if (sc.life <= 0) {
        sc.mesh.visible = false;
        continue;
      }
      sc.life -= dt;
      sc.timer -= dt;
      const t = 1 - sc.timer / sc.duration;
      const s = 0.1 + t * 2.5;
      sc.mesh.scale.setScalar(s);
      (sc.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, sc.timer / sc.duration) * 0.3;
    }

    // Update claymores
    for (const c of this.claymores) {
      if (!c.alive) continue;
      if (c.timer > 0) c.timer -= dt;
      // Check for enemies
      let trigger = false;
      const checkTarget = (px: number, _py: number, pz: number, targetId: string) => {
        const d = Math.hypot(px - c.pos.x, pz - c.pos.z);
        if (d > 2.5) return;
        if (game.damage.isFriendly(c.owner, targetId)) return;
        // Check if in front (180-degree cone)
        const dx = px - c.pos.x;
        const dz = pz - c.pos.z;
        const angToTarget = Math.atan2(dx, dz);
        let diff = angToTarget - c.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) < Math.PI / 2) {
          trigger = true;
        }
      };
      for (const a of game.remote.values()) {
        if (!a.state.alive) continue;
        checkTarget(a.state.px, a.state.py, a.state.pz, a.state.id);
      }
      if (game.lp.alive && c.owner !== game.selfId) {
        checkTarget(game.lp.pos.x, game.lp.pos.y, game.lp.pos.z, game.selfId);
      }
      if (trigger) {
        this.explodeClaymore(c);
      }
    }
  }

  private collideProjectile(p: EquipmentProjectile) {
    const game = this.game;
    const r = 0.12;
    for (const b of game.map.colliders) {
      if (p.pos.y + r > b.min.y && p.pos.y - r < b.max.y) {
        const minX = b.min.x - r, maxX = b.max.x + r;
        const minZ = b.min.z - r, maxZ = b.max.z + r;
        if (p.pos.x > minX && p.pos.x < maxX && p.pos.z > minZ && p.pos.z < maxZ) {
          const dxL = p.pos.x - minX, dxR = maxX - p.pos.x;
          const dzL = p.pos.z - minZ, dzR = maxZ - p.pos.z;
          const m = Math.min(dxL, dxR, dzL, dzR);
          if (m === dxL || m === dxR) p.vel.x *= -GRENADE.bounceFactor;
          if (m === dzL || m === dzR) p.vel.z *= -GRENADE.bounceFactor;
          if (m === dxL) p.pos.x = minX;
          else if (m === dxR) p.pos.x = maxX;
          else if (m === dzL) p.pos.z = minZ;
          else p.pos.z = maxZ;
          p.vel.x *= 0.6;
          p.vel.z *= 0.6;
          p.vel.y *= 0.5;
        }
      }
    }
    if (p.pos.y < r) {
      p.pos.y = r;
      p.vel.y = Math.abs(p.vel.y) * GRENADE.bounceFactor;
      p.vel.x *= 0.8;
      p.vel.z *= 0.8;
    }
  }

  private explodeProjectile(p: EquipmentProjectile) {
    const game = this.game;
    p.alive = false;
    p.mesh.visible = false;
    if (p.type === "frag") {
      game.fx.spawnExplosionFx(p.pos);
      Sfx.explosion();
      game.shake = Math.min(0.8, game.shake + 0.5);
      this.grenadeAoeDamage(p.pos, p.owner);
    } else if (p.type === "flash") {
      this.flashbangEffect(p.pos, p.owner);
    }
  }

  private flashbangEffect(pos: THREE.Vector3, owner: string) {
    const game = this.game;
    const maxDist = 15;
    const blindDuration = 2.0;

    const dToSelf = game.lp.pos.distanceTo(new THREE.Vector3(pos.x, 0, pos.z));
    if (dToSelf < maxDist && !game.damage.isFriendly(owner, game.selfId)) {
      const factor = 1 - dToSelf / maxDist;
      game.lp.flashEnd = game.now + blindDuration * factor;
    }
    for (const a of game.remote.values()) {
      if (!a.state.alive) continue;
      const d = new THREE.Vector3(a.state.px, 0, a.state.pz).distanceTo(new THREE.Vector3(pos.x, 0, pos.z));
      if (d < maxDist && !game.damage.isFriendly(owner, a.state.id)) {
        const factor = 1 - d / maxDist;
        (a.state as any).flashEnd = game.now + blindDuration * factor;
      }
    }
    game.fx.spawnSparks(pos, 0xffffff, 20);
    Sfx.flashbangDetonate();
    game.shake = Math.min(0.5, game.shake + 0.3);

    if (game.mode === "host") {
      game.net?.broadcast({ t: "flashbang", px: pos.x, py: pos.y, pz: pos.z, owner });
    } else if (game.mode === "client") {
      game.net?.send({ t: "flashbang", px: pos.x, py: pos.y, pz: pos.z, owner });
    }
  }

  private explodeClaymore(c: Claymore) {
    const game = this.game;
    c.alive = false;
    c.mesh.visible = false;
    game.fx.spawnExplosionFx(c.pos);
    Sfx.claymoreExplode();
    game.shake = Math.min(0.6, game.shake + 0.4);

    // Cone damage: 180 degrees, 5 unit range, 100 damage
    const coneRange = 5;
    const halfAngle = Math.PI / 2;
    const dmg = 100;

    // Self damage check
    const selfDx = game.lp.pos.x - c.pos.x;
    const selfDz = game.lp.pos.z - c.pos.z;
    const selfDist = Math.hypot(selfDx, selfDz);
    if (selfDist < coneRange && !game.damage.isFriendly(c.owner, game.selfId)) {
      const selfAng = Math.atan2(selfDx, selfDz);
      let diff = selfAng - c.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < halfAngle) {
        game.damage.takeDamage(dmg, c.owner, false);
      }
    }

    for (const a of game.remote.values()) {
      if (!a.state.alive) continue;
      const dx = a.state.px - c.pos.x;
      const dz = a.state.pz - c.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < coneRange && !game.damage.isFriendly(c.owner, a.state.id)) {
        const ang = Math.atan2(dx, dz);
        let diff = ang - c.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) < halfAngle) {
          game.damage.applyDamage(a.state.id, dmg, false, c.owner);
        }
      }
    }

    if (game.mode === "host") {
      game.net?.broadcast({ t: "claymore_explode", px: c.pos.x, py: c.pos.y, pz: c.pos.z, owner: c.owner });
    }
  }

  grenadeAoeDamage(pos: THREE.Vector3, source: string) {
    const game = this.game;
    let radius = GRENADE.radius;
    if (source === game.selfId && game.activePerks.includes("demolition")) radius *= 1.25;
    const dToSelf = game.lp.pos.distanceTo(pos);
    if (dToSelf < radius) {
      if (!game.damage.isFriendly(source, game.selfId)) {
        const dmg = Math.round(GRENADE.maxDamage * (1 - dToSelf / radius));
        game.damage.takeDamage(Math.max(5, dmg), source, false);
      }
    }
    for (const a of game.remote.values()) {
      if (!a.state.alive) continue;
      const d = new THREE.Vector3(a.state.px, a.state.py + 0.9, a.state.pz).distanceTo(pos);
      if (d < radius) {
        const dmg = Math.round(GRENADE.maxDamage * (1 - d / radius));
        game.damage.applyDamage(a.state.id, Math.max(5, dmg), false, source);
      }
    }
    for (const t of game.netState.values()) {
      if (t.id === game.selfId || t.id === source || !t.alive) continue;
      if (t.isBot) {
        const d = new THREE.Vector3(t.px, t.py + 0.9, t.pz).distanceTo(pos);
        if (d < radius) {
          const dmg = Math.round(GRENADE.maxDamage * (1 - d / radius));
          game.damage.applyDamage(t.id, Math.max(5, dmg), false, source);
        }
      }
    }
  }
}
