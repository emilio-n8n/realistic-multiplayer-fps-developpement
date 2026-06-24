import * as THREE from "three";
import { PLAYER } from "./types";
import * as Sfx from "./sound";
import type { Game } from "./engine";

export class LocalPlayerManager {
  constructor(private game: Game) {}

  update(dt: number) {
    const game = this.game;
    const lp = game.lp;
    if (!lp.alive) {
      if (game.mode !== "client" && game.now >= lp.respawnAt) game.damage.handleSelfRespawn(false);
      return;
    }

    const fwd = (game.keys.has("KeyW") ? 1 : 0) - (game.keys.has("KeyS") ? 1 : 0);
    const str = (game.keys.has("KeyD") ? 1 : 0) - (game.keys.has("KeyA") ? 1 : 0);
    const moving = fwd !== 0 || str !== 0;

    const sin = Math.sin(lp.yaw);
    const cos = Math.cos(lp.yaw);
    const dirX = -sin * fwd + cos * str;
    const dirZ = -cos * fwd - sin * str;
    const len = Math.hypot(dirX, dirZ) || 1;

    const wantCrouch = game.keys.has("ControlLeft") || game.keys.has("KeyC");
    const sprinting = game.keys.has("ShiftLeft") && fwd > 0 && !wantCrouch;

    if (sprinting) lp.sprintEnd = game.now + PLAYER.sprintReadyDelay;

    const wasMoving = Math.hypot(lp.vel.x, lp.vel.z) > 1;
    if (!lp.sliding && sprinting && wantCrouch && lp.onGround && wasMoving) {
      lp.sliding = true;
      lp.slideTimer = PLAYER.slideDuration;
      const sDir = new THREE.Vector3(dirX / len, 0, dirZ / len);
      lp.vel.x = sDir.x * PLAYER.slideSpeed;
      lp.vel.z = sDir.z * PLAYER.slideSpeed;
    }

    lp.crouch = wantCrouch || lp.sliding;

    if (lp.sliding) {
      lp.slideTimer -= dt;
      if (lp.slideTimer <= 0) lp.sliding = false;
    }

    let speed = PLAYER.speed;
    if (lp.sliding) speed = PLAYER.slideSpeed;
    else if (sprinting) speed *= PLAYER.sprintMult;
    else if (lp.crouch && !lp.sliding) speed *= PLAYER.crouchMult;
    if (lp.ads) speed *= PLAYER.adsSpeedMult;

    const targetVx = (dirX / len) * speed * (moving ? 1 : 0);
    const targetVz = (dirZ / len) * speed * (moving ? 1 : 0);

    let accel = PLAYER.accel * dt;
    if (!lp.onGround) accel *= PLAYER.airControlMult;
    lp.vel.x += (targetVx - lp.vel.x) * Math.min(1, accel);
    lp.vel.z += (targetVz - lp.vel.z) * Math.min(1, accel);

    if (game.keys.has("Space") && lp.onGround && !lp.sliding) {
      lp.vy = PLAYER.jump;
      lp.onGround = false;
    }
    lp.vy -= PLAYER.gravity * dt;

    lp.pos.x += lp.vel.x * dt;
    lp.pos.z += lp.vel.z * dt;
    lp.pos.y += lp.vy * dt;

    this.collide(lp.pos, lp.vel, lp.crouch ? PLAYER.crouchHeight : PLAYER.height);

    const planarSpeed = Math.hypot(lp.vel.x, lp.vel.z);
    if (lp.onGround && planarSpeed > 1.2) {
      const interval = sprinting ? 0.32 : 0.48;
      if (game.now - lp.lastStep > interval) {
        lp.lastStep = game.now;
        Sfx.footstep(sprinting);
      }
      game.bob += dt * (sprinting ? 16 : 11);
    }

    if (game.mode !== "client" && lp.alive && game.now - lp.lastHurt > PLAYER.regenDelay && lp.hp < PLAYER.maxHp) {
      const regenMax = lp.hp <= PLAYER.bleedThreshold ? PLAYER.bleedMaxRegen : PLAYER.maxHp;
      lp.hp = Math.min(regenMax, lp.hp + PLAYER.regenRate * dt);
    }

    if (lp.reloading && game.now >= lp.reloadEnd) game.weaponSystem.finishReload();
  }

  private collide(pos: THREE.Vector3, vel: THREE.Vector3, height: number) {
    const game = this.game;
    const r = PLAYER.radius;
    const colliders = game.map.colliders;
    const feet = pos.y;
    const head = pos.y + height;
    for (const b of colliders) {
      if (feet < b.max.y && head > b.min.y) {
        const minX = b.min.x - r, maxX = b.max.x + r, minZ = b.min.z - r, maxZ = b.max.z + r;
        if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ) {
          const dxL = pos.x - minX, dxR = maxX - pos.x, dzL = pos.z - minZ, dzR = maxZ - pos.z;
          const m = Math.min(dxL, dxR, dzL, dzR);
          if (m === dxL) pos.x = minX;
          else if (m === dxR) pos.x = maxX;
          else if (m === dzL) pos.z = minZ;
          else pos.z = maxZ;
        }
      }
    }
    if (vel.y <= 0) {
      let best = -Infinity;
      for (const b of colliders) {
        const within = pos.x > b.min.x - r * 0.7 && pos.x < b.max.x + r * 0.7 && pos.z > b.min.z - r * 0.7 && pos.z < b.max.z + r * 0.7;
        if (!within) continue;
        const top = b.max.y;
        if (pos.y <= top + 0.25 && pos.y >= top - 0.6 && top > best) best = top;
      }
      if (best > -Infinity) {
        pos.y = best;
        vel.y = 0;
        game.lp.onGround = true;
      } else if (pos.y <= 0) {
        pos.y = 0;
        vel.y = 0;
        game.lp.onGround = true;
      } else {
        game.lp.onGround = false;
      }
    } else {
      game.lp.onGround = false;
    }
  }
}
