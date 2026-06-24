import * as THREE from "three";
import { PLAYER, GRENADE } from "./types";
import * as Sfx from "./sound";
import type { Game } from "./engine";

export interface GrenadeObj {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  timer: number;
  alive: boolean;
  owner: string;
}

export class GrenadeSystem {
  constructor(private game: Game) {}

  throwGrenade() {
    const game = this.game;
    if (game.now - game.lastGrenade < 1) return;
    game.lastGrenade = game.now;
    const lp = game.lp;
    let g = game.grenades.find((x) => !x.alive);
    if (!g) {
      if (game.grenades.length >= GRENADE.poolSize) return;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 })
      );
      mesh.castShadow = true;
      mesh.visible = false;
      game.scene.add(mesh);
      g = { mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), timer: 0, alive: false, owner: "" };
      game.grenades.push(g);
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

  update(dt: number) {
    const game = this.game;
    for (const g of game.grenades) {
      if (!g.alive) continue;
      g.timer -= dt;
      if (g.timer <= 0) {
        this.grenadeExplode(g);
        continue;
      }
      g.vel.y -= GRENADE.gravity * dt;
      g.pos.x += g.vel.x * dt;
      g.pos.z += g.vel.z * dt;
      g.pos.y += g.vel.y * dt;
      this.grenadeCollide(g);
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += dt * 3;
      g.mesh.rotation.z += dt * 4;
    }
  }

  private grenadeCollide(g: GrenadeObj) {
    const game = this.game;
    const r = 0.12;
    for (const b of game.map.colliders) {
      if (g.pos.y + r > b.min.y && g.pos.y - r < b.max.y) {
        const minX = b.min.x - r, maxX = b.max.x + r;
        const minZ = b.min.z - r, maxZ = b.max.z + r;
        if (g.pos.x > minX && g.pos.x < maxX && g.pos.z > minZ && g.pos.z < maxZ) {
          const dxL = g.pos.x - minX, dxR = maxX - g.pos.x;
          const dzL = g.pos.z - minZ, dzR = maxZ - g.pos.z;
          const m = Math.min(dxL, dxR, dzL, dzR);
          if (m === dxL || m === dxR) g.vel.x *= -GRENADE.bounceFactor;
          if (m === dzL || m === dzR) g.vel.z *= -GRENADE.bounceFactor;
          if (m === dxL) g.pos.x = minX;
          else if (m === dxR) g.pos.x = maxX;
          else if (m === dzL) g.pos.z = minZ;
          else g.pos.z = maxZ;
          g.vel.x *= 0.6;
          g.vel.z *= 0.6;
          g.vel.y *= 0.5;
        }
      }
    }
    if (g.pos.y < r) {
      g.pos.y = r;
      g.vel.y = Math.abs(g.vel.y) * GRENADE.bounceFactor;
      g.vel.x *= 0.8;
      g.vel.z *= 0.8;
    }
  }

  private grenadeExplode(g: GrenadeObj) {
    const game = this.game;
    g.alive = false;
    g.mesh.visible = false;
    game.fx.spawnExplosionFx(g.pos);
    Sfx.explosion();
    game.shake = Math.min(0.8, game.shake + 0.5);
    if (game.mode === "host" || game.mode === "solo") {
      this.grenadeAoeDamage(g.pos, g.owner);
      if (game.mode === "host") {
        game.net?.broadcast({ t: "grenade_explode", px: g.pos.x, py: g.pos.y, pz: g.pos.z, owner: g.owner });
      }
    } else if (game.mode === "client") {
      game.net?.send({ t: "grenade_explode", px: g.pos.x, py: g.pos.y, pz: g.pos.z, owner: g.owner });
    }
  }

  grenadeAoeDamage(pos: THREE.Vector3, source: string) {
    const game = this.game;
    const dToSelf = game.lp.pos.distanceTo(pos);
    if (dToSelf < GRENADE.radius) {
      if (!game.damage.isFriendly(source, game.selfId)) {
        const dmg = Math.round(GRENADE.maxDamage * (1 - dToSelf / GRENADE.radius));
        game.damage.takeDamage(Math.max(5, dmg), source, false);
      }
    }
    for (const a of game.remote.values()) {
      if (!a.state.alive) continue;
      const d = new THREE.Vector3(a.state.px, a.state.py + 0.9, a.state.pz).distanceTo(pos);
      if (d < GRENADE.radius) {
        const dmg = Math.round(GRENADE.maxDamage * (1 - d / GRENADE.radius));
        game.damage.applyDamage(a.state.id, Math.max(5, dmg), false, source);
      }
    }
    for (const t of game.netState.values()) {
      if (t.id === game.selfId || t.id === source || !t.alive) continue;
      if (t.isBot) {
        const d = new THREE.Vector3(t.px, t.py + 0.9, t.pz).distanceTo(pos);
        if (d < GRENADE.radius) {
          const dmg = Math.round(GRENADE.maxDamage * (1 - d / GRENADE.radius));
          game.damage.applyDamage(t.id, Math.max(5, dmg), false, source);
        }
      }
    }
  }
}
