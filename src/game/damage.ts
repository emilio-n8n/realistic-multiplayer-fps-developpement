import { PLAYER, WEAPON_STATS, KILLSTREAK_DEFS, KILLSTREAK_LIST } from "./types";
import type { KillstreakType } from "./types";
import * as Sfx from "./sound";
import type { Game } from "./engine";

export class DamageManager {
  constructor(private game: Game) {}

  isFriendly(id1: string, id2: string): boolean {
    const game = this.game;
    if (!game.tdm) return false;
    if (id1 === id2) return true;
    const t1 = id1 === game.selfId ? game.selfTeam : game.netState.get(id1)?.team;
    const t2 = id2 === game.selfId ? game.selfTeam : game.netState.get(id2)?.team;
    return !!t1 && !!t2 && t1 === t2;
  }

  applyDamage(targetId: string, dmg: number, head: boolean, sourceId: string): boolean {
    const game = this.game;
    if (this.isFriendly(sourceId, targetId)) return false;
    if (targetId === game.selfId) {
      this.takeDamage(dmg, sourceId, head);
      return !game.lp.alive;
    }
    const t = game.netState.get(targetId);
    if (!t || !t.alive) return false;
    t.hp -= dmg;
    t.lastHurt = game.now;
    if (t.hp <= 0) {
      t.hp = 0;
      t.alive = false;
      t.deaths++;
      t.killstreak = 0;
      t.respawnAt = game.now + 3;
      if (t.isBot) {
        const tb = t as any;
        const samePos = Math.hypot(t.px - (tb._lastDeathX ?? 0), t.pz - (tb._lastDeathZ ?? 0)) < 10;
        if (samePos && game.now - (tb._lastDeathTime ?? -999) < 30) {
          tb._antiCampCount = (tb._antiCampCount ?? 0) + 1;
        } else {
          tb._antiCampCount = 0;
        }
        tb._lastDeathX = t.px;
        tb._lastDeathZ = t.pz;
        tb._lastDeathTime = game.now;
      }
      this.addKill(sourceId, targetId, head);
      return true;
    }
    if (this.isClient(targetId)) {
      const s = game.netState.get(sourceId);
      const from = s ? [s.px, s.py, s.pz] : [t.px, t.py, t.pz];
      game.net?.sendTo(targetId, { t: "hurt", amount: dmg, from });
    }
    return false;
  }

  private isClient(id: string) {
    const game = this.game;
    return game.mode === "host" && !!game.net?.conns.has(id);
  }

  addKill(sourceId: string, victimId: string, head: boolean) {
    const game = this.game;
    if (sourceId === game.selfId) {
      game.lp.kills++;
      game.lp.killstreak++;
      game.streakKills++;
      this.checkKillstreakUnlocks();
    } else {
      const s = game.netState.get(sourceId);
      if (s) {
        s.kills++;
        s.killstreak++;
      }
    }
    if (game.tdm) {
      const killerTeam = sourceId === game.selfId ? game.selfTeam : game.netState.get(sourceId)?.team;
      if (killerTeam === "red") game.teamKillsRed++;
      else if (killerTeam === "blue") game.teamKillsBlue++;
      this.game.checkGameEnd();
    }
    const victim = game.netState.get(victimId);
    const killerName = sourceId === game.selfId ? game.lp.name : game.netState.get(sourceId)?.name ?? "???";
    const victimName = victim?.name ?? "???";
    const involvesSelf = victimId === game.selfId || sourceId === game.selfId;
    this.handleKillFeed(killerName, victimName, head, involvesSelf);
    game.netHandler.broadcastAll({ t: "kill", killer: killerName, victim: victimName, head, killerId: sourceId, victimId });
    if (sourceId === game.selfId) this.onSelfKill(victimName, head);
  }

  private checkKillstreakUnlocks() {
    const game = this.game;
    for (const ks of KILLSTREAK_LIST) {
      const def = KILLSTREAK_DEFS[ks];
      if (game.streakKills >= def.kills && !game.killstreaksReady.includes(ks)) {
        game.killstreaksReady.push(ks);
        this.flashMessage(`${def.name} PRÊT (B pour utiliser)`);
      }
    }
  }

  useKillstreak(type: KillstreakType) {
    const game = this.game;
    game.killstreaksReady = game.killstreaksReady.filter(k => k !== type);
    switch (type) {
      case "uav": game.activateUAV(); break;
      case "airstrike": game.activateAirstrike(); break;
      case "helicopter": game.activateHelicopter(); break;
    }
  }

  takeDamage(dmg: number, sourceId: string, head: boolean) {
    const game = this.game;
    const lp = game.lp;
    if (!lp.alive) return;
    lp.hp -= dmg;
    lp.lastHurt = game.now;
    this.triggerHurtVisual(sourceId);
    if (lp.hp <= 0) {
      lp.hp = 0;
      lp.deaths++;
      lp.killstreak = 0;
      this.addKill(sourceId, game.selfId, head);
      this.handleSelfDeath();
    }
  }

  private triggerHurtVisual(sourceId: string) {
    const game = this.game;
    const s = game.netState.get(sourceId);
    if (s) {
      const dx = s.px - game.lp.pos.x;
      const dz = s.pz - game.lp.pos.z;
      const worldAng = Math.atan2(dx, dz);
      const fwdAng = Math.atan2(-Math.sin(game.lp.yaw), -Math.cos(game.lp.yaw));
      let rel = worldAng - fwdAng;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      game.damageDir = rel;
    }
    game.damageTime = performance.now();
    game.shake = Math.min(0.6, game.shake + 0.3);
    Sfx.hurtSound();
    game.pushHud(true);
  }

  handleKillFeed(killer: string, victim: string, head: boolean, involvesSelf: boolean) {
    const game = this.game;
    const wName = WEAPON_STATS[game.weaponSystem.weaponType].name;
    game.killfeed.push({ id: game.kfId++, killer, victim, weapon: wName, head, self: involvesSelf, time: performance.now() });
    if (game.killfeed.length > 6) game.killfeed.shift();
  }

  onSelfKill(victim: string, head: boolean) {
    const game = this.game;
    game.killmarker = performance.now();
    let msg = head ? "TIR À LA TÊTE" : `${victim.toUpperCase()} ÉLIMINÉ`;
    if (game.lp.killstreak >= 3) msg = `${game.lp.killstreak} ÉLIMINATIONS D'AFFILÉE`;
    this.flashMessage(msg);
    Sfx.hitMarker();
  }

  handleSelfDeath() {
    const game = this.game;
    if (!game.lp.alive) return;
    game.lp.alive = false;
    game.lp.respawnAt = game.now + 3;
    game.streakKills = 0;
    game.killstreaksReady = [];
    Sfx.deathSound();
    this.flashMessage("VOUS ÊTES MORT");
    game.pushHud(true);
  }

  handleSelfRespawn(fromWorld: boolean) {
    const game = this.game;
    const lp = game.lp;
    if (lp.alive) return;
    if (fromWorld && game.selfState) {
      lp.pos.set(game.selfState.px, game.selfState.py, game.selfState.pz);
      lp.yaw = game.selfState.yaw;
    } else {
      const sp = game.pickSpawn(lp.pos, game.tdm ? game.selfTeam : undefined);
      lp.pos.copy(sp);
    }
    lp.hp = PLAYER.maxHp;
    lp.alive = true;
    lp.vel.set(0, 0, 0);
    lp.vy = 0;
    lp.ammo = WEAPON_STATS[game.weaponSystem.weaponType].magSize;
    lp.reloading = false;
    this.flashMessage("PRÊT AU COMBAT");
    game.pushHud(true);
  }

  flashMessage(msg: string) {
    const game = this.game;
    game.message = msg;
    game.messageTime = performance.now();
  }
}
