import * as THREE from "three";
import { WEAPON, PLAYER } from "./types";
import * as Sfx from "./sound";
import type { Game } from "./engine";

export class WeaponSystem {
  constructor(private game: Game) {}

  update(dt: number) {
    const game = this.game;
    game.recoil.pitch += (0 - game.recoil.pitch) * Math.min(1, dt * 9);
    game.recoil.yaw += (0 - game.recoil.yaw) * Math.min(1, dt * 9);
    game.sway.x += (0 - game.sway.x) * Math.min(1, dt * 8);
    game.sway.y += (0 - game.sway.y) * Math.min(1, dt * 8);

    const lp = game.lp;
    const planarSpeed = Math.hypot(lp.vel.x, lp.vel.z);
    const bobX = Math.cos(game.bob) * 0.012 * Math.min(1, planarSpeed / 6);
    const bobY = Math.abs(Math.sin(game.bob)) * 0.014 * Math.min(1, planarSpeed / 6);
    const crouchDip = lp.crouch ? 0.05 : 0;
    const adsOffset = lp.ads ? 0.06 : 0;

    const g = game.weapon.group;
    g.position.set(0.17 + game.sway.x + bobX, -0.15 + bobY - crouchDip + game.sway.y, -0.42 - adsOffset);
    g.rotation.set(game.sway.y * 2, Math.PI + game.sway.x * 2, 0);

    const eyeOff = lp.crouch ? PLAYER.eyeHeight - 0.3 : PLAYER.eyeHeight;
    game.camera.position.set(lp.pos.x, lp.pos.y + eyeOff, lp.pos.z);
    game.camera.rotation.y = lp.yaw + game.recoil.yaw;
    game.camera.rotation.x = lp.pitch + game.recoil.pitch;

    const targetFov = lp.ads ? 50 : 78;
    game.camera.fov += (targetFov - game.camera.fov) * Math.min(1, dt * 10);
    game.camera.updateProjectionMatrix();

    if (game.shake > 0) {
      game.shake = Math.max(0, game.shake - dt * 1.6);
      const s = game.shake * 0.04;
      game.camera.position.x += (Math.random() - 0.5) * s;
      game.camera.position.y += (Math.random() - 0.5) * s;
    }
  }

  tryFire() {
    const game = this.game;
    const lp = game.lp;
    if (game.paused || !lp.alive || lp.reloading) return;
    if (game.now - lp.lastShot < WEAPON.fireRate) return;
    if (lp.ammo <= 0) {
      lp.lastShot = game.now;
      Sfx.dryFire();
      this.startReload();
      return;
    }
    lp.lastShot = game.now;
    lp.ammo--;
    lp.firingTick = true;

    game.recoil.pitch += WEAPON.recoil * (0.85 + Math.random() * 0.4);
    game.recoil.yaw += (Math.random() - 0.5) * WEAPON.recoil * 0.9;
    game.shake = Math.min(0.5, game.shake + 0.12);

    game.flashUntil = game.now + 0.035;
    game.weapon.flash.rotation.z = Math.random() * Math.PI;
    game.weapon.flash.scale.setScalar(1.2 + Math.random() * 1.2);
    game.weapon.flashGlow.scale.setScalar(1.0 + Math.random() * 1.0);
    game.fx.spawnCasing();
    Sfx.gunshot(0);

    game.raycaster.setFromCamera(new THREE.Vector2((Math.random() - 0.5) * 0.001, (Math.random() - 0.5) * 0.001), game.camera);
    const dir = game.raycaster.ray.direction.clone();
    const sp = this.currentSpread();
    dir.x += (Math.random() - 0.5) * sp;
    dir.y += (Math.random() - 0.5) * sp;
    dir.normalize();
    game.raycaster.ray.direction.copy(dir);
    game.raycaster.far = WEAPON.range;

    const targets: THREE.Object3D[] = [...game.map.rayMeshes];
    game.remote.forEach((a) => {
      if (a.state.alive) targets.push(a.view.group);
    });
    const hits = game.raycaster.intersectObjects(targets, true);

    const muzzlePos = new THREE.Vector3();
    game.weapon.muzzle.getWorldPosition(muzzlePos);
    let end = muzzlePos.clone().add(dir.clone().multiplyScalar(WEAPON.range));
    let hitActor = false;

    if (hits.length) {
      let currentDmg = WEAPON.damage;
      let penCount = 0;
      let finalPoint = end.clone();

      for (const h of hits) {
        let o: THREE.Object3D | null = h.object;
        while (o && o.userData.actorId === undefined) o = o.parent;

        if (o && o.userData.actorId !== undefined) {
          const targetId = o.userData.actorId as string;
          const head = h.object.userData.part === "head";
          const hitY = h.point.y;
          const actor = game.mode === "client" ? null : game.netState.get(targetId);
          const actorY = actor ? actor.py : (game.remote.get(targetId)?.state.py ?? 0);
          const limbDmg = this.calcLimbDmg(currentDmg, head, hitY, actorY);
          hitActor = true;
          const normal = h.normal ?? new THREE.Vector3(0, 1, 0);
          game.fx.spawnSparks(h.point, 0xcc1133, head ? 9 : 5, normal);
          game.fx.spawnHitRing(h.point);
          game.hitmarker = performance.now();
          game.lastDamageDealt = limbDmg.dmg;
          game.lastDamageDealtTime = performance.now();
          if (game.mode === "client") {
            game.net?.send({ t: "fire", target: targetId, head });
          } else {
            const killed = game.damage.applyDamage(targetId, limbDmg.dmg, head, game.selfId);
            if (killed) game.killmarker = performance.now();
          }
          finalPoint = h.point.clone();
          break;
        }

        const mat = h.object.userData.material as string | undefined;
        if (mat === "glass") {
          const normal = h.normal ?? new THREE.Vector3(0, 1, 0);
          game.fx.spawnSparks(h.point, 0x88ccff, 3, normal);
          continue;
        }
        if (mat === "wood" && penCount < 1) {
          penCount++;
          currentDmg = Math.round(currentDmg * WEAPON.penDmgMult);
          const normal = h.normal ?? new THREE.Vector3(0, 1, 0);
          game.fx.spawnSparks(h.point, 0x888844, 4, normal);
          continue;
        }

        const normal = h.normal ?? new THREE.Vector3(0, 1, 0);
        game.fx.spawnSparks(h.point, 0xbbbbbb, 4, normal);
        game.fx.spawnDecal(h.point, normal);
        finalPoint = h.point.clone();
        break;
      }

      end = finalPoint;
    }
    game.fx.spawnTracer(muzzlePos, end);
    void hitActor;
    game.pushHud(true);
  }

  currentSpread() {
    const game = this.game;
    const lp = game.lp;
    const planar = Math.hypot(lp.vel.x, lp.vel.z);
    let sp = WEAPON.spread + (planar / PLAYER.speed) * WEAPON.moveSpread * 0.5;
    if (lp.crouch) sp *= 0.6;
    if (lp.ads) sp *= WEAPON.adsSpreadMult;
    if (game.now < lp.sprintEnd) sp *= 1.8;
    if (game.now - lp.lastShot < 0.2) sp += 0.01;
    return sp;
  }

  crosshairGap() {
    const game = this.game;
    const lp = game.lp;
    const planar = Math.hypot(lp.vel.x, lp.vel.z);
    let g = 6 + (planar / PLAYER.speed) * 10;
    if (lp.crouch) g *= 0.6;
    if (lp.ads) g *= 0.25;
    if (game.now - lp.lastShot < 0.15) g += 8;
    return g;
  }

  startReload() {
    const game = this.game;
    const lp = game.lp;
    if (lp.reloading || !lp.alive) return;
    if (lp.ammo >= WEAPON.magSize || lp.reserve <= 0) return;
    lp.reloading = true;
    lp.reloadEnd = game.now + WEAPON.reloadTime;
    Sfx.reloadSound();
    game.pushHud(true);
  }

  finishReload() {
    const game = this.game;
    const lp = game.lp;
    const need = WEAPON.magSize - lp.ammo;
    const take = Math.min(need, lp.reserve);
    lp.ammo += take;
    lp.reserve -= take;
    lp.reloading = false;
    game.pushHud(true);
  }

  private calcLimbDmg(baseDmg: number, head: boolean, hitY: number, actorY: number): { dmg: number } {
    let mult = 1;
    let armored = false;
    if (head) {
      mult = WEAPON.headMult;
    } else {
      const relY = hitY - actorY;
      if (relY > 0.85) {
        mult = 1;
        armored = true;
      } else {
        mult = WEAPON.limbDmgLeg;
      }
    }
    let dmg = Math.round(baseDmg * mult);
    if (armored) dmg = Math.round(dmg * (1 - WEAPON.vestDR));
    return { dmg };
  }
}
