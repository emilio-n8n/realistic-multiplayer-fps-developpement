import * as THREE from "three";
import type { Game } from "./engine";

export class FxManager {
  constructor(private game: Game) {}

  spawnTracer(from: THREE.Vector3, to: THREE.Vector3) {
    const game = this.game;
    let t = game.tracers.find((x) => x.life <= 0);
    if (!t) {
      if (game.tracers.length > 24) return;
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.025, 1, 6), coreMat);
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.06, 1, 6), glowMat);
      const group = new THREE.Group();
      group.add(glow);
      group.add(core);
      game.scene.add(group);
      t = { group, core, glow, life: 0 };
      game.tracers.push(t);
    }
    const dist = from.distanceTo(to) + 0.3;
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const dir = to.clone().sub(from).normalize();
    t.group.position.copy(mid);
    t.group.scale.set(1, dist, 1);
    t.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    (t.core.material as THREE.MeshBasicMaterial).opacity = 1;
    (t.glow.material as THREE.MeshBasicMaterial).opacity = 0.6;
    t.life = 0.035;
  }

  spawnSparks(at: THREE.Vector3, color: number, count: number, normal?: THREE.Vector3) {
    const game = this.game;
    const isBlood = color === 0xcc1133;
    for (let i = 0; i < count; i++) {
      let s = game.sparks.find((x) => x.life <= 0);
      if (!s) {
        if (game.sparks.length > 60) return;
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), mat);
        game.scene.add(mesh);
        s = { mesh, vel: new THREE.Vector3(), life: 0 };
        game.sparks.push(s);
      }
      (s.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      s.mesh.position.copy(at);
      const baseSpeed = isBlood ? 3.5 : 5;
      if (normal) {
        const up = new THREE.Vector3(0, 1, 0);
        const tangent = new THREE.Vector3().crossVectors(normal, up).normalize();
        if (tangent.length() < 0.01) tangent.set(1, 0, 0);
        const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
        const angle = Math.random() * Math.PI * 2;
        const spread = Math.random() * 0.8 + 0.2;
        const dir = tangent.clone().multiplyScalar(Math.cos(angle)).add(bitangent.clone().multiplyScalar(Math.sin(angle)));
        s.vel.copy(dir.multiplyScalar(spread * baseSpeed));
        if (!isBlood) {
          s.vel.y += Math.random() * 1.5;
        } else {
          s.vel.y += Math.random() * 3 + 1.5;
        }
      } else {
        s.vel.set((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4);
      }
      const sizeMult = isBlood ? 0.6 + Math.random() * 0.8 : 0.3 + Math.random() * 0.5;
      s.mesh.scale.setScalar(sizeMult);
      s.life = isBlood ? 0.5 + Math.random() * 0.4 : 0.3 + Math.random() * 0.3;
    }
  }

  spawnDecal(at: THREE.Vector3, normal: THREE.Vector3) {
    const game = this.game;
    let d = game.decals.find((x) => x.life <= 0);
    if (!d) {
      if (game.decals.length > 20) return;
      const mat = new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.08, 8), mat);
      mesh.frustumCulled = false;
      game.scene.add(mesh);
      d = { mesh, life: 0 };
      game.decals.push(d);
    }
    d.mesh.position.copy(at);
    d.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    (d.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.random() * 0.2;
    d.mesh.scale.setScalar(0.6 + Math.random() * 0.8);
    d.life = 3 + Math.random() * 2;
  }

  spawnCasing() {
    const game = this.game;
    const pos = new THREE.Vector3();
    game.weapon.muzzle.getWorldPosition(pos);
    const side = (Math.random() > 0.5 ? 1 : -1);
    pos.x += Math.sin(game.lp.yaw) * 0.12 * side;
    pos.z += Math.cos(game.lp.yaw) * 0.12 * side;
    pos.y += 0.05;
    let c = game.casings.find((x) => x.life <= 0);
    if (!c) {
      if (game.casings.length > 10) return;
      const mat = new THREE.MeshStandardMaterial({ color: 0xbb8833, metalness: 0.6, roughness: 0.4, transparent: true });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.035, 0.012), mat);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      game.scene.add(mesh);
      c = { mesh, vel: new THREE.Vector3(), angVel: new THREE.Vector3(), rot: new THREE.Euler(), life: 0 };
      game.casings.push(c);
    }
    c.mesh.position.copy(pos);
    c.vel.set(
      -Math.sin(game.lp.yaw) * 1.5 * side + (Math.random() - 0.5) * 0.5,
      1.8 + Math.random() * 1.2,
      -Math.cos(game.lp.yaw) * 1.5 * side + (Math.random() - 0.5) * 0.5
    );
    c.angVel.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
    c.rot.set(0, 0, 0);
    c.life = 2;
  }

  spawnHitRing(at: THREE.Vector3) {
    const game = this.game;
    if (!game.hitRing) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.06, 24), mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      game.scene.add(mesh);
      game.hitRing = mesh;
    }
    game.hitRing.position.copy(at);
    game.hitRing.visible = true;
    game.hitRing.scale.setScalar(0.5);
    (game.hitRing.material as THREE.MeshBasicMaterial).opacity = 0.8;
    game.hitRingTime = performance.now();
  }

  spawnExplosionFx(pos: THREE.Vector3) {
    this.spawnSparks(pos, 0xff6600, 15);
    this.spawnSparks(pos, 0xffcc00, 10);
    this.spawnSparks(pos, 0xff3300, 8);
  }

  createDeathOverlay() {
    const game = this.game;
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), mat);
    mesh.position.set(0, 0, -0.5);
    mesh.renderOrder = 999;
    mesh.frustumCulled = false;
    game.deathOverlay = mesh;
    game.camera.add(mesh);
  }

  update(dt: number) {
    const game = this.game;
    if (game.now < game.flashUntil) {
      game.weapon.flash.visible = true;
      game.weapon.flashGlow.visible = true;
      const t = (game.flashUntil - game.now) / 0.035;
      game.weapon.flashLight.intensity = t * 12;
      (game.weapon.flashGlow.material as THREE.MeshBasicMaterial).opacity = t * 0.35;
    } else {
      game.weapon.flash.visible = false;
      game.weapon.flashGlow.visible = false;
      game.weapon.flashLight.intensity = 0;
    }
    for (const t of game.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        const alpha = Math.max(0, t.life / 0.035);
        (t.core.material as THREE.MeshBasicMaterial).opacity = alpha;
        (t.glow.material as THREE.MeshBasicMaterial).opacity = alpha * 0.6;
        t.group.visible = true;
      } else {
        t.group.visible = false;
      }
    }
    for (const s of game.sparks) {
      if (s.life > 0) {
        s.life -= dt;
        s.vel.y -= 9 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, s.life / 0.5);
        s.mesh.visible = s.life > 0;
      } else {
        s.mesh.visible = false;
      }
    }
    for (const d of game.decals) {
      if (d.life > 0) {
        d.life -= dt;
        (d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, d.life / 5) * 0.6;
        d.mesh.visible = d.life > 0;
      } else {
        d.mesh.visible = false;
      }
    }
    for (const c of game.casings) {
      if (c.life > 0) {
        c.life -= dt;
        c.vel.y -= 9 * dt;
        c.mesh.position.addScaledVector(c.vel, dt);
        c.rot.x += c.angVel.x * dt;
        c.rot.y += c.angVel.y * dt;
        c.rot.z += c.angVel.z * dt;
        c.mesh.rotation.set(c.rot.x, c.rot.y, c.rot.z);
        if (c.mesh.position.y < 0) {
          c.mesh.position.y = 0;
          c.vel.set(0, 0, 0);
          c.angVel.set(0, 0, 0);
        }
        (c.mesh.material as THREE.MeshStandardMaterial).opacity = Math.min(1, c.life);
        c.mesh.visible = c.life > 0;
      } else {
        c.mesh.visible = false;
      }
    }
    if (game.hitRing) {
      if (game.hitRing.visible) {
        const elapsed = (performance.now() - game.hitRingTime) / 1000;
        if (elapsed < 0.3) {
          const t = elapsed / 0.3;
          game.hitRing.scale.setScalar(0.1 + t * 2);
          (game.hitRing.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
          game.hitRing.quaternion.copy(game.camera.quaternion);
        } else {
          game.hitRing.visible = false;
        }
      }
    }
    if (game.deathOverlay) {
      const target = game.lp.alive ? 0 : 0.6;
      const speed = game.lp.alive ? 3 : 2;
      const cur = (game.deathOverlay.material as THREE.MeshBasicMaterial).opacity;
      (game.deathOverlay.material as THREE.MeshBasicMaterial).opacity = cur + (target - cur) * Math.min(1, dt * speed);
    }
  }
}
