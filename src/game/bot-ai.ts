import * as THREE from "three";
import { PLAYER, WEAPON_STATS } from "./types";
import type { PState } from "./types";
import * as Sfx from "./sound";
import type { Game } from "./engine";

const BOT_PREFIX = "bot_";

export class BotManager {
  constructor(private game: Game) {}

  initBotState(bot: PState) {
    const b = bot as any;
    const idx = parseInt(bot.id.replace(BOT_PREFIX, ""), 10);
    const diffIdx = idx % 3;
    b._difficulty = diffIdx === 0 ? "easy" : diffIdx === 1 ? "medium" : "hard";
    b._awareness = "unaware";
    b._alertDecay = 0;
    b._lastKnownX = 0;
    b._lastKnownZ = 0;
    b._lastSeenEnemy = -999;
    b._searchDir = Math.random() * Math.PI * 2;
    b._lastShot = 0;
    b._fireCd = 0;
    b._fireUntil = 0;
    b._spawnTime = this.game.now;
    b._moveMode = "wander";
    b._coverTarget = null;
    b._nextActionTime = 0;
    b._strafePhase = Math.random() * 100;
    b._wanderAngle = Math.random() * Math.PI * 2;
    b._lastDeathX = 0;
    b._lastDeathZ = 0;
    b._antiCampCount = 0;
    b._lastDeathTime = -999;
    b._noiseX = 0;
    b._noiseZ = 0;
    b._noiseTime = -999;
  }

  update(dt: number) {
    const game = this.game;
    if (game.mode === "client") return;
    game.botAccum += dt;
    const decide = game.botAccum > 0.12;
    if (decide) game.botAccum = 0;

    for (const p of game.netState.values()) {
      if (p.id !== game.selfId && !p.isBot && !p.alive && game.now >= (p.respawnAt ?? 0)) {
        game.respawnActor(p);
      }
    }

    game.botSharedIntel = game.botSharedIntel.filter(i => game.now - i.time < 8);

    for (const bot of game.netState.values()) {
      if (!bot.isBot || !bot.alive) continue;
      const b = bot as any;
      if (b._difficulty === undefined) this.initBotState(bot);
      if (bot.firing) {
        for (const other of game.netState.values()) {
          if (!other.isBot || other.id === bot.id || !other.alive) continue;
          if (Math.hypot(other.px - bot.px, other.pz - bot.pz) < 40) {
            (other as any)._noiseX = bot.px;
            (other as any)._noiseZ = bot.pz;
            (other as any)._noiseTime = game.now;
          }
        }
      }
    }
    if (game.lp.firingTick && game.lp.alive) {
      for (const other of game.netState.values()) {
        if (!other.isBot || !other.alive) continue;
        if (Math.hypot(other.px - game.lp.pos.x, other.pz - game.lp.pos.z) < 40) {
          (other as any)._noiseX = game.lp.pos.x;
          (other as any)._noiseZ = game.lp.pos.z;
          (other as any)._noiseTime = game.now;
        }
      }
    }

    for (const bot of game.netState.values()) {
      if (!bot.isBot) continue;
      if (!bot.alive) {
        if (game.now >= (bot.respawnAt ?? 0)) game.respawnActor(bot);
        continue;
      }

      const b = bot as any;
      bot.firing = game.now < b._fireUntil;

      if ((bot.lastHurt ?? -999) < game.now - 4 && bot.hp < PLAYER.maxHp) {
        bot.hp = Math.min(PLAYER.maxHp, bot.hp + PLAYER.regenRate * dt);
      }

      this.botUpdateAwareness(bot);

      const target = this.botFindTarget(bot);

      if (target) {
        b._lastKnownX = target.px;
        b._lastKnownZ = target.pz;
        b._lastSeenEnemy = game.now;
        game.botSharedIntel.push({ x: target.px, z: target.pz, time: game.now, reporter: bot.id });

        if (decide) {
          this.botDecide(bot, target);
          this.botChooseMoveMode(bot, target);
        }
        this.botMove(bot, target, dt);
      } else if (game.now - b._noiseTime < 4 || b._awareness === "searching") {
        const tx = b._awareness === "searching" ? b._lastKnownX : b._noiseX;
        const tz = b._awareness === "searching" ? b._lastKnownZ : b._noiseZ;
        const d = Math.hypot(tx - bot.px, tz - bot.pz);
        if (d > 2) {
          const sp = this.botDiffMultipliers(b._difficulty).speed * 0.7;
          bot.px += ((tx - bot.px) / d) * dt * sp;
          bot.pz += ((tz - bot.pz) / d) * dt * sp;
          bot.yaw = Math.atan2(tx - bot.px, tz - bot.pz);
          b._moveMode = "investigate";
        }
        b._wanderAngle = Math.atan2(tz - bot.pz, tx - bot.px);
      } else {
        if (decide) b._wanderAngle += (Math.random() - 0.5) * 1.5;
        const sp = this.botDiffMultipliers(b._difficulty).speed * 0.5;
        bot.px += Math.cos(b._wanderAngle) * dt * sp;
        bot.pz += Math.sin(b._wanderAngle) * dt * sp;
        bot.yaw = b._wanderAngle;
        b._moveMode = "wander";
      }

      const B = game.map.bounds - 1.5;
      bot.px = Math.max(-B, Math.min(B, bot.px));
      bot.pz = Math.max(-B, Math.min(B, bot.pz));
    }
  }

  private botDiffMultipliers(d: string) {
    switch (d) {
      case "easy": return { acc: 0.4, reaction: 0.35, speed: 3.0, hs: 0.04, strafe: 0 };
      case "medium": return { acc: 0.7, reaction: 0.2, speed: 4.6, hs: 0.12, strafe: 1 };
      case "hard": return { acc: 0.95, reaction: 0.1, speed: 5.8, hs: 0.2, strafe: 2 };
      default: return { acc: 0.7, reaction: 0.2, speed: 4.6, hs: 0.12, strafe: 1 };
    }
  }

  private botHasLOS(bot: PState, tx: number, tz: number): boolean {
    const game = this.game;
    const eye = new THREE.Vector3(bot.px, 1.5, bot.pz);
    const targ = new THREE.Vector3(tx, 1.5, tz);
    const dir = targ.clone().sub(eye);
    const dist = dir.length();
    if (dist < 1) return true;
    dir.normalize();
    game.raycaster.set(eye, dir);
    game.raycaster.far = dist;
    return game.raycaster.intersectObjects(game.map.rayMeshes, false).length === 0;
  }

  private botUpdateAwareness(bot: PState) {
    const game = this.game;
    const b = bot as any;
    let seesEnemy = false;
    for (const p of game.netState.values()) {
      if (p.id === bot.id || !p.alive) continue;
      if (Math.hypot(p.px - bot.px, p.pz - bot.pz) < 50 && this.botHasLOS(bot, p.px, p.pz)) {
        seesEnemy = true; break;
      }
    }
    if (game.lp.alive && Math.hypot(game.lp.pos.x - bot.px, game.lp.pos.z - bot.pz) < 50 &&
        this.botHasLOS(bot, game.lp.pos.x, game.lp.pos.z)) seesEnemy = true;
    if (seesEnemy) {
      b._awareness = "alert";
      b._alertDecay = game.now + 6;
    } else if (game.now - b._lastSeenEnemy < 3) {
      b._awareness = "searching";
    } else if (game.now - b._noiseTime < 4) {
      b._awareness = "alert";
      b._alertDecay = game.now + 3;
    } else if (game.now > b._alertDecay) {
      b._awareness = "unaware";
    }
  }

  private botFindCoverPos(bot: PState, threatX: number, threatZ: number): { x: number; z: number } | null {
    const game = this.game;
    const tdx = threatX - bot.px;
    const tdz = threatZ - bot.pz;
    if (Math.hypot(tdx, tdz) < 1) return null;
    const dirToThreat = new THREE.Vector3(tdx, 0, tdz).normalize();
    let best: { x: number; z: number } | null = null;
    let bestScore = -Infinity;
    for (const col of game.map.colliders) {
      const cx = (col.min.x + col.max.x) / 2;
      const cz = (col.min.z + col.max.z) / 2;
      const d = Math.hypot(cx - bot.px, cz - bot.pz);
      if (d > 20 || d < 2) continue;
      const toCover = new THREE.Vector3(cx - bot.px, 0, cz - bot.pz).normalize();
      const dot = dirToThreat.dot(toCover);
      if (dot > 0.3) {
        const behind = { x: cx + (cx - threatX) * 0.8, z: cz + (cz - threatZ) * 0.8 };
        const score = dot * 6 - d * 0.3;
        if (score > bestScore) { bestScore = score; best = behind; }
      }
    }
    return best;
  }

  private botChooseMoveMode(bot: PState, target: PState) {
    const game = this.game;
    const b = bot as any;
    const diff = b._difficulty;
    const dist = Math.hypot(target.px - bot.px, target.pz - bot.pz);
    const ideal = 13;
    if (game.now - b._spawnTime < 2) {
      b._moveMode = dist < 20 ? "retreat" : "approach";
      return;
    }
    if (b._antiCampCount >= 2 && dist < 30 && game.now - b._lastDeathTime < 8) {
      b._moveMode = "flank";
      return;
    }
    if (bot.hp < 25) {
      b._moveMode = "retreatHeal";
      return;
    }
    if ((bot.lastHurt ?? -999) > game.now - 2) {
      const cover = this.botFindCoverPos(bot, target.px, target.pz);
      if (cover) { b._moveMode = "cover"; b._coverTarget = cover; return; }
      b._moveMode = "retreat"; return;
    }
    if (dist > 35) {
      b._moveMode = diff === "hard" && Math.random() < 0.35 ? "flank" : "ambush";
      return;
    }
    if (dist > ideal + 5) b._moveMode = "approach";
    else if (dist < ideal - 4) b._moveMode = "retreat";
    else b._moveMode = "strafe";
  }

  private botFindTarget(bot: PState): PState | null {
    const game = this.game;
    let best: PState | null = null;
    let bestScore = -Infinity;
    for (const p of game.netState.values()) {
      if (p.id === bot.id || !p.alive) continue;
      const d = Math.hypot(p.px - bot.px, p.pz - bot.pz);
      if (d > 55) continue;
      let score = 100 - d;
      if (p.firing) score += 25;
      if (this.botHasLOS(bot, p.px, p.pz)) score += 40;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  private botDecide(bot: PState, target: PState) {
    const game = this.game;
    const b = bot as any;
    const mult = this.botDiffMultipliers(b._difficulty);
    const dx = target.px - bot.px;
    const dz = target.pz - bot.pz;
    const dist = Math.hypot(dx, dz);
    bot.yaw = Math.atan2(dx, dz);

    if (game.now - b._spawnTime < 1) return;
    if (game.now - b._lastSeenEnemy < mult.reaction) return;

    const hasLOS = this.botHasLOS(bot, target.px, target.pz);
    const campPenalty = b._antiCampCount >= 2 ? 0.2 : 1;

    if (hasLOS && dist < 38) {
      const fireInterval = 0.16 + mult.reaction * 0.6 + Math.random() * 0.08;
      if (game.now - b._lastShot > fireInterval) {
        b._lastShot = game.now;
        bot.firing = true;
        b._fireUntil = game.now + 0.08;

        const dToHost = Math.hypot(game.lp.pos.x - bot.px, game.lp.pos.z - bot.pz);
        Sfx.gunshot(dToHost);

        const hitChance = Math.max(0.15, 0.85 - dist / 60) * mult.acc * campPenalty;
        if (Math.random() < hitChance) {
          const head = Math.random() < mult.hs;
          const ws = WEAPON_STATS.ar15;
          const dmg = head ? Math.round(ws.damage * ws.headMult) : ws.damage;
          if (target.id === game.selfId) game.damage.takeDamage(dmg, bot.id, head);
          else game.damage.applyDamage(target.id, dmg, head, bot.id);
        }
      }
    } else if (dist < 38 && game.now - b._lastSeenEnemy < 3 && Math.random() < 0.3 * mult.acc) {
      if (game.now - b._lastShot > 0.35 + mult.reaction * 0.8) {
        b._lastShot = game.now;
        bot.firing = true;
        b._fireUntil = game.now + 0.06;

        const dToHost = Math.hypot(game.lp.pos.x - bot.px, game.lp.pos.z - bot.pz);
        Sfx.gunshot(dToHost);
      }
    }
  }

  private botMove(bot: PState, target: PState, dt: number) {
    const game = this.game;
    const b = bot as any;
    const mult = this.botDiffMultipliers(b._difficulty);
    const dx = target.px - bot.px;
    const dz = target.pz - bot.pz;
    const dist = Math.hypot(dx, dz);
    const mode = b._moveMode;
    let mvx = 0, mvz = 0;

    switch (mode) {
      case "approach":
        if (dist > 0.5) { mvx = dx / dist; mvz = dz / dist; }
        break;
      case "retreat":
        if (dist > 0.5) { mvx = -dx / dist; mvz = -dz / dist; }
        break;
      case "retreatHeal": {
        let awayX = 0, awayZ = 0, nearest = Infinity;
        for (const p of game.netState.values()) {
          if (p.id === bot.id || !p.alive) continue;
          const pd = Math.hypot(p.px - bot.px, p.pz - bot.pz);
          if (pd < nearest) { nearest = pd; awayX = bot.px - p.px; awayZ = bot.pz - p.pz; }
        }
        if (game.lp.alive) {
          const pd = Math.hypot(game.lp.pos.x - bot.px, game.lp.pos.z - bot.pz);
          if (pd < nearest) { awayX = bot.px - game.lp.pos.x; awayZ = bot.pz - game.lp.pos.z; }
        }
        const aLen = Math.hypot(awayX, awayZ) || 1;
        mvx = awayX / aLen; mvz = awayZ / aLen;
        break;
      }
      case "strafe":
        if (dist > 0.5) {
          const s = mult.strafe >= 2
            ? Math.sin(game.now * 1.2 + b._strafePhase) + Math.sin(game.now * 0.7 + b._strafePhase * 2)
            : (Math.sin(game.now * (0.6 + mult.strafe * 0.2) + b._strafePhase) > 0 ? 1 : -1);
          mvx = (-dz / dist) * Math.sign(s);
          mvz = (dx / dist) * Math.sign(s);
        }
        break;
      case "cover":
        if (b._coverTarget) {
          const cx = b._coverTarget.x - bot.px;
          const cz = b._coverTarget.z - bot.pz;
          const cd = Math.hypot(cx, cz) || 1;
          mvx = cx / cd; mvz = cz / cd;
        } else if (dist > 0.5) { mvx = dx / dist; mvz = dz / dist; }
        break;
      case "flank":
        if (dist > 0.5) {
          const side = Math.sin(game.now * 0.3 + b._strafePhase) > 0 ? 1 : -1;
          mvx = (-dz / dist) * side + (dx / dist) * 0.5;
          mvz = (dx / dist) * side + (dz / dist) * 0.5;
          const fl = Math.hypot(mvx, mvz) || 1;
          mvx /= fl; mvz /= fl;
        }
        break;
      case "ambush": {
        const s = Math.sin(game.now * 0.5 + b._strafePhase) * 0.3;
        if (dist > 0.5) { mvx = (-dz / dist) * s; mvz = (dx / dist) * s; }
        break;
      }
      default:
        if (dist > 0.5) { mvx = dx / dist; mvz = dz / dist; }
    }

    const sp = mult.speed;
    const pos = new THREE.Vector3(bot.px, 0, bot.pz);
    pos.x += mvx * sp * dt;
    pos.z += mvz * sp * dt;
    const tmp = new THREE.Vector3();
    this.collideBot(pos, tmp);
    bot.px = pos.x;
    bot.pz = pos.z;
  }

  private collideBot(pos: THREE.Vector3, _vel: THREE.Vector3) {
    const game = this.game;
    const r = PLAYER.radius;
    const feet = 0, head = PLAYER.height;
    for (const b of game.map.colliders) {
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
  }
}
