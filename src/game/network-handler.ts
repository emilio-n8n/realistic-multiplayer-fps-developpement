import * as THREE from "three";
import type { PState } from "./types";
import { COLORS, WEAPON_STATS } from "./types";
import type { NetMsg } from "../net/net";
import * as Sfx from "./sound";
import type { Game } from "./engine";

export class NetHandler {
  constructor(private game: Game) {}

  attachNet() {
    const game = this.game;
    if (!game.net) return;
    const net = game.net;
    net.cb = {
      onStatus: (s) => {
        game.onEvent({ type: "status", data: s });
        game.pushHud(true);
      },
      onCodeReady: (code) => game.onEvent({ type: "code", data: code }),
      onJoined: (id) => {
        game.selfId = id;
        game.onEvent({ type: "joined" });
      },
      onPeerJoin: (id, name) => {
        if (game.mode === "host") {
          const color = COLORS[Math.floor(Math.random() * COLORS.length)];
          const team = game.tdm ? game.assignTeam() : "red";
          const sp = game.pickSpawn(game.lp.pos, team);
          const st: PState = {
            id, name, color,
            px: sp.x, py: 0, pz: sp.z, yaw: 0, pitch: 0,
            hp: 100, alive: true, isBot: false, firing: false,
            kills: 0, deaths: 0, killstreak: 0, respawnAt: 0, lastHurt: -99,
            team: game.tdm ? team : "red",
            loadoutIndex: 0,
          };
          game.netState.set(id, st);
          const welcome: Record<string, unknown> = { t: "welcome", you: id, players: this.snapshot() };
          if (game.tdm) { welcome.teamKillsRed = game.teamKillsRed; welcome.teamKillsBlue = game.teamKillsBlue; }
          net.sendTo(id, welcome as NetMsg);
          game.onEvent({ type: "status", data: `${name} a rejoint la partie` });
          game.pushHud(true);
        }
      },
      onPeerLeave: (id) => {
        game.netState.delete(id);
        const a = game.remote.get(id);
        if (a) {
          game.scene.remove(a.view.group);
          a.view.dispose();
          game.remote.delete(id);
        }
        game.pushHud(true);
      },
      onData: (from, msg) => this.onNetData(from, msg),
      onError: (m) => game.onEvent({ type: "error", data: m }),
    };
  }

  private onNetData(_from: string, msg: NetMsg) {
    const game = this.game;
    switch (msg.t) {
      case "welcome":
        if (game.mode === "client") {
          game.selfId = String(msg.you);
          const players = (msg.players as PState[]) ?? [];
          for (const p of players) this.applyWorldEntry(p);
          if (msg.teamKillsRed !== undefined) game.teamKillsRed = Number(msg.teamKillsRed);
          if (msg.teamKillsBlue !== undefined) game.teamKillsBlue = Number(msg.teamKillsBlue);
        }
        break;
      case "world":
        if (game.mode === "client") {
          const players = (msg.players as PState[]) ?? [];
          for (const p of players) this.applyWorldEntry(p);
          if (msg.teamKillsRed !== undefined) game.teamKillsRed = Number(msg.teamKillsRed);
          if (msg.teamKillsBlue !== undefined) game.teamKillsBlue = Number(msg.teamKillsBlue);
          if (msg.domState) game.domState = msg.domState as any;
          if (msg.sndState) game.sndState = msg.sndState as any;
          if (msg.hasBomb !== undefined) game.hasBomb = Boolean(msg.hasBomb);
        }
        break;
      case "me":
        if (game.mode === "host") {
          const t = game.netState.get(_from);
          if (t) {
            t.px = Number(msg.px);
            t.py = Number(msg.py);
            t.pz = Number(msg.pz);
            t.yaw = Number(msg.yaw);
            t.pitch = Number(msg.pitch);
            t.firing = Boolean(msg.firing);
          }
        }
        break;
      case "fire":
        if (game.mode === "host") {
          const target = String(msg.target);
          const head = Boolean(msg.head);
          const wStats = WEAPON_STATS.ar15;
          const dmg = head ? Math.round(wStats.damage * wStats.headMult) : wStats.damage;
          game.damage.applyDamage(target, dmg, head, _from);
        }
        break;
      case "hurt":
        if (game.mode === "client") {
          game.lp.lastHurt = game.now;
          const from = msg.from as number[] | undefined;
          if (from) {
            const dx = from[0] - game.lp.pos.x;
            const dz = from[2] - game.lp.pos.z;
            const fwdAng = Math.atan2(-Math.sin(game.lp.yaw), -Math.cos(game.lp.yaw));
            let rel = Math.atan2(dx, dz) - fwdAng;
            while (rel > Math.PI) rel -= Math.PI * 2;
            while (rel < -Math.PI) rel += Math.PI * 2;
            game.damageDir = rel;
          }
          game.damageTime = performance.now();
          game.shake = Math.min(0.6, game.shake + 0.3);
          Sfx.hurtSound();
          game.pushHud(true);
        }
        break;
      case "kill":
        if (game.mode === "client") {
          const killer = String(msg.killer);
          const victim = String(msg.victim);
          const head = Boolean(msg.head);
          const killerId = String(msg.killerId);
          const victimId = String(msg.victimId);
          const involvesSelf = victimId === game.selfId || killerId === game.selfId;
          game.damage.handleKillFeed(killer, victim, head, involvesSelf);
          if (killerId === game.selfId) {
            game.killmarker = performance.now();
            game.damage.flashMessage(head ? "TIR À LA TÊTE" : "ENNEMI ÉLIMINÉ");
            Sfx.hitMarker();
          }
          if (victimId === game.selfId) game.damage.handleSelfDeath();
        }
        break;
      case "grenade_explode":
        {
          const px = Number(msg.px);
          const py = Number(msg.py);
          const pz = Number(msg.pz);
          const pos = new THREE.Vector3(px, py, pz);
          game.fx.spawnExplosionFx(pos);
          Sfx.explosion();
          if (game.mode === "host") {
            const source = String(msg.owner || game.selfId);
            game.equipment.grenadeAoeDamage(pos, source);
            game.net?.broadcast({ t: "grenade_explode", px: msg.px, py: msg.py, pz: msg.pz, owner: msg.owner }, _from);
          }
        }
        break;
    }
  }

  private applyWorldEntry(p: PState) {
    const game = this.game;
    if (p.id === game.selfId) {
      const wasAlive = game.selfState?.alive ?? true;
      game.selfState = p;
      if (game.lp.alive && !p.alive) {
        game.damage.handleSelfDeath();
      } else if (!game.lp.alive && p.alive) {
        game.damage.handleSelfRespawn(true);
      } else {
        game.lp.hp = p.hp;
      }
      void wasAlive;
      return;
    }
    const a = game.ensureActor(p);
    Object.assign(a.state, p);
    if (!p.alive && p.respawnAt) a.state.respawnAt = p.respawnAt;
  }

  broadcastAll(msg: NetMsg) {
    const game = this.game;
    if (game.mode === "host") game.net?.broadcast(msg);
  }

  private snapshot(): PState[] {
    const game = this.game;
    const arr: PState[] = [];
    for (const p of game.netState.values()) arr.push({ ...p });
    return arr;
  }

  syncSelfToNet() {
    const game = this.game;
    if (game.mode === "client") return;
    const lp = game.lp;
    game.netState.set(game.selfId, {
      id: game.selfId,
      name: lp.name,
      color: lp.color,
      px: lp.pos.x,
      py: lp.pos.y,
      pz: lp.pos.z,
      yaw: lp.yaw,
      pitch: lp.pitch,
      hp: lp.hp,
      alive: lp.alive,
      isBot: false,
      firing: lp.firingTick,
      kills: lp.kills,
      deaths: lp.deaths,
      killstreak: lp.killstreak,
      respawnAt: lp.respawnAt,
      lastHurt: lp.lastHurt,
      team: game.selfTeam,
      loadoutIndex: game.loadoutIndex,
    });
    lp.firingTick = false;
  }

  update(dt: number) {
    const game = this.game;
    game.netAccum += dt;
    if (game.netAccum < 0.055) return;
    game.netAccum = 0;

    if (game.mode === "client") {
      game.net?.send({
        t: "me",
        px: game.lp.pos.x,
        py: game.lp.pos.y,
        pz: game.lp.pos.z,
        yaw: game.lp.yaw,
        pitch: game.lp.pitch,
        firing: game.lp.firingTick,
      });
      game.lp.firingTick = false;
    } else {
      this.syncSelfToNet();
      if (game.mode === "host" || game.mode === "dom" || game.mode === "snd") {
        const world: Record<string, unknown> = { t: "world", players: this.snapshot() };
        if (game.tdm) { world.teamKillsRed = game.teamKillsRed; world.teamKillsBlue = game.teamKillsBlue; }
        if (game.mode === "dom") world.domState = game.domState;
        if (game.mode === "snd") {
          world.sndState = game.sndState;
          world.hasBomb = game.hasBomb;
        }
        game.net?.broadcast(world as NetMsg);
      }
    }
  }

  registerLobbyPeer(id: string, name: string, color: number, team?: "red" | "blue", loadoutIndex?: number) {
    const game = this.game;
    if (game.mode !== "host") return;
    const t = game.tdm ? (team || game.assignTeam()) : "red";
    const sp = game.pickSpawn(game.lp.pos, t);
    const st: PState = {
      id, name, color,
      px: sp.x, py: 0, pz: sp.z, yaw: 0, pitch: 0,
      hp: 100, alive: true, isBot: false, firing: false,
      kills: 0, deaths: 0, killstreak: 0, respawnAt: 0, lastHurt: -99,
      team: game.tdm ? t : "red",
      loadoutIndex: loadoutIndex ?? 0,
    };
    game.netState.set(id, st);
    game.ensureActor(st);
    const welcome: Record<string, unknown> = { t: "welcome", you: id, players: this.snapshot() };
    if (game.tdm) { welcome.teamKillsRed = game.teamKillsRed; welcome.teamKillsBlue = game.teamKillsBlue; }
    game.net?.sendTo(id, welcome as NetMsg);
    game.onEvent({ type: "status", data: `${name} a rejoint la partie` });
    game.pushHud(true);
  }
}
