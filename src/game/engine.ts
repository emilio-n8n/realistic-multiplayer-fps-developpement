import * as THREE from "three";
import { buildMap } from "./map";
import type { GameMap } from "./map";
import { buildWeaponView } from "./weapon";
import type { WeaponView } from "./weapon";
import { makeCharacter } from "./character";
import type { CharacterView } from "./character";
import { COLORS, PLAYER, WEAPON } from "./types";
import type { HudState, KillFeedItem, PState, RadarBlip, ScoreRow } from "./types";
import * as Sfx from "./sound";
import type { Net } from "../net/net";
import { LocalPlayerManager } from "./local-player";
import { WeaponSystem } from "./weapon-system";
import { DamageManager } from "./damage";
import { BotManager } from "./bot-ai";
import { FxManager } from "./fx";
import { NetHandler } from "./network-handler";
import { GrenadeSystem } from "./grenade";
import type { GrenadeObj } from "./grenade";

export type GameMode = "solo" | "host" | "client" | "tdm";

export interface GameOpts {
  mode: GameMode;
  name: string;
  color: number;
  botCount: number;
  net?: Net | null;
  tdm?: boolean;
  team?: "red" | "blue";
  lobbyPeers?: { id: string; name: string; color: number; team?: "red" | "blue" }[];
  onHud: (s: HudState) => void;
  onLockChange: (locked: boolean) => void;
  onEvent: (e: { type: string; data?: unknown }) => void;
}

interface RemoteActor {
  id: string;
  view: CharacterView;
  curPos: THREE.Vector3;
  curYaw: number;
  state: PState;
  prevFiring: boolean;
}

const BOT_PREFIX = "bot_";

export class Game {
  // --- public state (accessed by sub-managers) ---
  mode: GameMode;
  tdm: boolean = false;
  selfTeam: "red" | "blue" = "red";
  teamKillsRed = 0;
  teamKillsBlue = 0;
  gameEnded = false;
  gameStartTime = 0;
  net: Net | null;
  onHud: (s: HudState) => void;
  onLockChange: (locked: boolean) => void;
  onEvent: (e: { type: string; data?: unknown }) => void;

  renderer!: THREE.WebGLRenderer;
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  clock = new THREE.Clock();
  map!: GameMap;
  weapon!: WeaponView;
  raycaster = new THREE.Raycaster();

  // local player state
  selfId: string;
  lp = {
    name: "Player",
    color: 0x4f9bff,
    pos: new THREE.Vector3(0, 0, 40),
    vel: new THREE.Vector3(),
    vy: 0,
    yaw: 0,
    pitch: 0,
    hp: PLAYER.maxHp,
    alive: true,
    onGround: true,
    crouch: false,
    ammo: WEAPON.magSize,
    reserve: WEAPON.reserveMax,
    reloading: false,
    reloadEnd: 0,
    lastShot: 0,
    lastHurt: -99,
    lastStep: 0,
    kills: 0,
    deaths: 0,
    killstreak: 0,
    respawnAt: 0,
    firingTick: false,
    ads: false,
    sliding: false,
    slideTimer: 0,
    sprintEnd: 0,
  };

  remote = new Map<string, RemoteActor>();
  netState = new Map<string, PState>();
  selfState: PState | null = null;

  // fx state
  tracers: {
    group: THREE.Group;
    core: THREE.Mesh;
    glow: THREE.Mesh;
    life: number;
  }[] = [];
  sparks: {
    mesh: THREE.Mesh;
    vel: THREE.Vector3;
    life: number;
  }[] = [];
  decals: {
    mesh: THREE.Mesh;
    life: number;
  }[] = [];
  casings: {
    mesh: THREE.Mesh;
    vel: THREE.Vector3;
    angVel: THREE.Vector3;
    rot: THREE.Euler;
    life: number;
  }[] = [];
  flashUntil = 0;
  shake = 0;
  recoil = { pitch: 0, yaw: 0 };
  bob = 0;
  sway = new THREE.Vector2();
  damageDir: number | null = null;
  damageTime = 0;
  hitmarker = 0;
  killmarker = 0;
  grenades: GrenadeObj[] = [];
  lastGrenade = 0;
  hitRing: THREE.Mesh | null = null;
  hitRingTime = 0;
  deathOverlay: THREE.Mesh | null = null;

  // killfeed
  killfeed: KillFeedItem[] = [];
  kfId = 0;

  // match state
  matchOver = false;
  matchResult: { winner: string; stats: ScoreRow[]; teamKillsRed?: number; teamKillsBlue?: number } | null = null;
  lastDamageDealt = 0;
  lastDamageDealtTime = 0;

  // input
  keys = new Set<string>();
  mouseDown = false;
  locked = false;
  paused = true;

  // timing
  netAccum = 0;
  hudAccum = 0;
  botAccum = 0;
  now = 0;
  botSharedIntel: { x: number; z: number; time: number; reporter: string }[] = [];

  // message
  message: string | null = null;
  messageTime = 0;

  // sub-managers
  localPlayer: LocalPlayerManager;
  weaponSystem: WeaponSystem;
  damage: DamageManager;
  botManager: BotManager;
  fx: FxManager;
  netHandler: NetHandler;
  grenadeSystem: GrenadeSystem;

  // internal
  private container: HTMLElement;
  private raf = 0;
  private disposed = false;
  private lastHudPush = 0;

  constructor(container: HTMLElement, opts: GameOpts) {
    this.container = container;
    this.mode = opts.mode;
    this.tdm = opts.mode === "tdm" || opts.tdm === true;
    this.selfTeam = opts.team || "red";
    this.net = opts.net ?? null;
    this.onHud = opts.onHud;
    this.onLockChange = opts.onLockChange;
    this.onEvent = opts.onEvent;
    this.selfId = this.net?.selfId || (opts.mode === "solo" ? "you" : "host");
    this.lp.name = opts.name || "Player";
    this.lp.color = opts.color;

    // instantiate sub-managers
    this.localPlayer = new LocalPlayerManager(this);
    this.weaponSystem = new WeaponSystem(this);
    this.damage = new DamageManager(this);
    this.botManager = new BotManager(this);
    this.fx = new FxManager(this);
    this.netHandler = new NetHandler(this);
    this.grenadeSystem = new GrenadeSystem(this);

    this.initScene();
    this.initMap();
    this.initWeapon();
    this.bindInput();

    if (this.mode === "solo" || this.mode === "host" || this.mode === "tdm") {
      this.initBots(opts.botCount);
      this.netHandler.syncSelfToNet();
    }
    if (this.net) this.netHandler.attachNet();
    if (opts.lobbyPeers) {
      for (const p of opts.lobbyPeers) {
        this.netHandler.registerLobbyPeer(p.id, p.name, p.color, p.team);
      }
    }
  }

  // ---------------- setup ----------------
  private initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8a93a3);
    this.scene.add(this.makeSky());
    this.scene.fog = new THREE.Fog(0x7d8794, 35, 95);

    this.camera = new THREE.PerspectiveCamera(78, this.container.clientWidth / this.container.clientHeight, 0.05, 500);
    this.camera.rotation.order = "YXZ";
    this.camera.position.set(this.lp.pos.x, this.lp.pos.y + PLAYER.eyeHeight, this.lp.pos.z);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";

    const hemi = new THREE.HemisphereLight(0xbfd0e0, 0x40382c, 0.7);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.0);
    sun.position.set(40, 60, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    const s = 60;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    const amb = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(amb);
  }

  private makeSky() {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#2c3a52");
    g.addColorStop(0.45, "#5a6c84");
    g.addColorStop(0.8, "#9aa6b4");
    g.addColorStop(1, "#b8bcc2");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 256);
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.SphereGeometry(260, 24, 16);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
    return new THREE.Mesh(geo, mat);
  }

  private initMap() {
    this.map = buildMap();
    this.scene.add(this.map.group);
  }

  private initWeapon() {
    this.weapon = buildWeaponView();
    this.weapon.group.position.set(0.17, -0.15, -0.42);
    this.weapon.group.rotation.y = Math.PI;
    this.camera.add(this.weapon.group);
    this.scene.add(this.camera);
    this.fx.createDeathOverlay();
  }

  private initBots(n: number) {
    let redCount = this.tdm ? (this.selfTeam === "red" ? 1 : 0) : 0;
    let blueCount = this.tdm ? (this.selfTeam === "blue" ? 1 : 0) : 0;
    for (let i = 0; i < n; i++) {
      const id = BOT_PREFIX + i;
      const team: "red" | "blue" = this.tdm
        ? (redCount <= blueCount ? (redCount++, "red") : (blueCount++, "blue"))
        : "red";
      const sp = this.pickSpawn(this.lp.pos, this.tdm ? team : undefined);
      const st: PState = {
        id,
        name: this.botName(i),
        color: COLORS[(i + 2) % COLORS.length],
        px: sp.x,
        py: 0,
        pz: sp.z,
        yaw: 0,
        pitch: 0,
        hp: PLAYER.maxHp,
        alive: true,
        isBot: true,
        firing: false,
        kills: 0,
        deaths: 0,
        killstreak: 0,
        respawnAt: 0,
        lastHurt: -99,
        team: this.tdm ? team : "red",
      };
      this.netState.set(id, st);
      this.ensureActor(st);
      this.botManager.initBotState(st);
    }
  }

  private botName(i: number) {
    const names = ["Reaper", "Ghost", "Viper", "Havoc", "Specter", "Ronin", "Falcon", "Bandit", "Wraith", "Nomad"];
    return names[i % names.length];
  }

  // ---------------- input ----------------
  private bindInput() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);
    const el = this.renderer.domElement;
    el.addEventListener("mousedown", this.onMouseDown);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    document.addEventListener("mousemove", this.onMouseMove);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (e.code === "KeyR") this.weaponSystem.startReload();
    if (e.code === "KeyG" && this.lp.alive) this.grenadeSystem.throwGrenade();
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);

  private onMouseDown = (e: MouseEvent) => {
    if (!this.locked) {
      this.requestLock();
      return;
    }
    if (e.button === 0) this.mouseDown = true;
    if (e.button === 2) this.lp.ads = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = false;
    if (e.button === 2) this.lp.ads = false;
  };

  private onPointerLockChange = () => {
    this.locked = document.pointerLockElement === this.renderer.domElement;
    this.paused = !this.locked;
    this.onLockChange(this.locked);
    if (this.locked) Sfx.resumeAudio();
    else this.keys.clear();
    this.pushHud(true);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    const sens = 0.0022;
    this.lp.yaw -= e.movementX * sens;
    this.lp.pitch -= e.movementY * sens;
    this.lp.pitch = Math.max(-1.45, Math.min(1.45, this.lp.pitch));
    this.sway.x += e.movementX * 0.0004;
    this.sway.y += e.movementY * 0.0004;
  };

  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  requestLock() {
    this.renderer.domElement.requestPointerLock?.();
  }

  // ---------------- lifecycle ----------------
  start() {
    this.clock.start();
    this.gameStartTime = this.clock.elapsedTime;
    this.loop();
    this.pushHud(true);
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.now = this.clock.elapsedTime;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number) {
    if (!this.paused) {
      this.localPlayer.update(dt);
      this.weaponSystem.update(dt);
      if (this.mouseDown) this.weaponSystem.tryFire();
      this.grenadeSystem.update(dt);
    }
    this.updateActors(dt);
    this.botManager.update(dt);
    this.fx.update(dt);
    this.netHandler.update(dt);
    if (!this.matchOver) this.checkMatchOver();
    if (this.tdm && !this.gameEnded) this.checkGameEnd();
    this.pushHud(false);
  }

  // ---------------- actors ----------------
  ensureActor(st: PState) {
    let a = this.remote.get(st.id);
    if (!a) {
      const view = makeCharacter(st.color, st.name);
      view.group.userData.actorId = st.id;
      view.setAlive(st.alive);
      this.scene.add(view.group);
      a = { id: st.id, view, curPos: new THREE.Vector3(st.px, st.py, st.pz), curYaw: st.yaw, state: st, prevFiring: false };
      this.remote.set(st.id, a);
    }
    return a;
  }

  private updateActors(dt: number) {
    if (this.mode !== "client") {
      for (const t of this.netState.values()) {
        if (!t.isBot && t.alive && this.now - (t.lastHurt ?? -99) > PLAYER.regenDelay && t.hp < PLAYER.maxHp) {
          t.hp = Math.min(PLAYER.maxHp, t.hp + PLAYER.regenRate * dt);
        }
      }
    }

    for (const a of this.remote.values()) {
      const st = a.state;
      const lerp = Math.min(1, dt * 14);
      a.curPos.x += (st.px - a.curPos.x) * lerp;
      a.curPos.y += (st.py - a.curPos.y) * lerp;
      a.curPos.z += (st.pz - a.curPos.z) * lerp;
      let dy = st.yaw - a.curYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      a.curYaw += dy * lerp;
      a.view.group.position.set(a.curPos.x, a.curPos.y, a.curPos.z);
      a.view.group.rotation.y = a.curYaw;
      a.view.setAlive(st.alive);
      if (a.view.group.userData._updateFlash) (a.view.group.userData._updateFlash as () => void)();
      if (st.firing && !a.prevFiring) {
        a.view.setFiring(true, this.now);
        const d = Math.hypot(a.curPos.x - this.lp.pos.x, a.curPos.z - this.lp.pos.z);
        Sfx.gunshot(d);
      }
      a.prevFiring = st.firing;
    }
  }

  respawnActor(t: PState) {
    const sp = this.pickSpawn(new THREE.Vector3(this.lp.pos.x, 0, this.lp.pos.z), t.team);
    t.px = sp.x;
    t.py = 0;
    t.pz = sp.z;
    t.hp = PLAYER.maxHp;
    t.alive = true;
    t.killstreak = 0;
    if (t.isBot) this.botManager.initBotState(t);
  }

  pickSpawn(avoid: THREE.Vector3, team?: "red" | "blue"): THREE.Vector3 {
    const pts = this.tdm && team ? this.map.teamSpawns[team] : this.map.spawnPoints;
    let best = pts[0], bestD = -1;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[(i + Math.floor(Math.random() * pts.length)) % pts.length];
      const d = Math.hypot(p.x - avoid.x, p.z - avoid.z);
      if (d > bestD) { bestD = d; best = p; }
    }
    return best.clone();
  }

  assignTeam(): "red" | "blue" {
    let red = 0, blue = 0;
    for (const p of this.netState.values()) {
      if (p.team === "red") red++;
      else if (p.team === "blue") blue++;
    }
    return red <= blue ? "red" : "blue";
  }

  // ---------------- HUD ----------------
  pushHud(force: boolean) {
    this.hudAccum += 0;
    this.throttledHud(force);
  }

  private throttledHud(force: boolean) {
    const t = performance.now();
    if (!force && t - this.lastHudPush < 80) return;
    this.lastHudPush = t;

    const lp = this.lp;
    const hp = this.mode === "client" && this.selfState ? this.selfState.hp : lp.hp;
    const kills = this.mode === "client" && this.selfState ? this.selfState.kills : lp.kills;
    const deaths = this.mode === "client" && this.selfState ? this.selfState.deaths : lp.deaths;
    const ks = this.mode === "client" && this.selfState ? this.selfState.killstreak : lp.killstreak;
    const alive = this.mode === "client" && this.selfState ? this.selfState.alive : lp.alive;

    const now = performance.now();
    const feed = this.killfeed.filter((k) => now - k.time < 5500);

    const radar = this.buildRadar();
    const scoreboard = this.buildScoreboard();

    const msg = this.message && now - this.messageTime < 1600 ? this.message : null;

    const state: HudState = {
      hp: Math.round(hp),
      maxHp: PLAYER.maxHp,
      alive,
      ammo: lp.ammo,
      mag: WEAPON.magSize,
      reserve: lp.reserve,
      reloading: lp.reloading,
      reloadProgress: lp.reloading ? Math.min(1, 1 - (lp.reloadEnd - this.now) / WEAPON.reloadTime) : 0,
      kills,
      deaths,
      killstreak: ks,
      spread: this.weaponSystem.crosshairGap(),
      hitmarker: this.hitmarker,
      killmarker: this.killmarker,
      damageDir: now - this.damageTime < 1200 ? this.damageDir : null,
      damageTime: this.damageTime,
      lowHp: hp < 35,
      killfeed: feed,
      scoreboard,
      radar,
      message: msg,
      messageTime: this.messageTime,
      respawnIn: !alive ? Math.max(0, lp.respawnAt - this.now) : -1,
      paused: this.paused,
      connected: this.mode === "solo" ? true : !!this.net,
      playerCount: this.playerCount(),
      matchOver: this.matchOver,
      matchResult: this.matchResult,
      weaponName: WEAPON.name,
      fireMode: WEAPON.auto ? "auto" : "semi",
      lastDamageDealt: this.lastDamageDealt,
      lastDamageDealtTime: this.lastDamageDealtTime,
      ping: 30,
      yaw: this.lp.yaw,
      teamKillsRed: this.teamKillsRed,
      teamKillsBlue: this.teamKillsBlue,
      tdm: this.tdm,
      team: this.tdm ? this.selfTeam : "red",
    };
    this.onHud(state);
  }

  private playerCount() {
    if (this.mode === "client") return this.remote.size + 1;
    let n = 1;
    for (const p of this.netState.values()) if (!p.isBot && p.id !== this.selfId) n++;
    return n;
  }

  private buildRadar(): RadarBlip[] {
    const blips: RadarBlip[] = [];
    const sin = Math.sin(this.lp.yaw);
    const cos = Math.cos(this.lp.yaw);
    const fwd = new THREE.Vector3(-sin, 0, -cos);
    const right = new THREE.Vector3(cos, 0, -sin);
    const states: PState[] = [];
    if (this.mode === "client") {
      this.remote.forEach((a) => states.push(a.state));
    } else {
      this.netState.forEach((p) => states.push(p));
    }
    for (const p of states) {
      if (p.id === this.selfId || !p.alive) continue;
      const dx = p.px - this.lp.pos.x;
      const dz = p.pz - this.lp.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 45) continue;
      const isEnemy = this.tdm ? !this.damage.isFriendly(this.selfId, p.id) : true;
      if (isEnemy && !p.firing && d > 12) continue;
      const f = dx * fwd.x + dz * fwd.z;
      const r = dx * right.x + dz * right.z;
      blips.push({ x: r, z: f, enemy: isEnemy, firing: p.firing });
    }
    return blips;
  }

  private buildScoreboard(): ScoreRow[] {
    const rows: ScoreRow[] = [];
    if (this.mode === "client") {
      rows.push({
        name: this.lp.name + " (toi)",
        kills: this.selfState?.kills ?? 0,
        deaths: this.selfState?.deaths ?? 0,
        isBot: false,
        color: this.lp.color,
        alive: this.selfState?.alive ?? true,
        self: true,
        team: this.selfState?.team ?? null,
      });
      this.remote.forEach((a) =>
        rows.push({
          name: a.state.name,
          kills: a.state.kills,
          deaths: a.state.deaths,
          isBot: a.state.isBot,
          color: a.state.color,
          alive: a.state.alive,
          self: false,
          team: a.state.team ?? null,
        })
      );
    } else {
      rows.push({
        name: this.lp.name + " (toi)",
        kills: this.lp.kills,
        deaths: this.lp.deaths,
        isBot: false,
        color: this.lp.color,
        alive: this.lp.alive,
        self: true,
        team: this.selfTeam,
      });
      this.netState.forEach((p) => {
        if (p.id === this.selfId) return;
        rows.push({
          name: p.name,
          kills: p.kills,
          deaths: p.deaths,
          isBot: p.isBot,
          color: p.color,
          alive: p.alive,
          self: false,
          team: p.team ?? null,
        });
      });
    }
    rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    return rows;
  }

  // ---------------- match flow ----------------
  private checkMatchOver() {
    if (this.matchOver) return;

    let aliveBots = 0;
    let totalBots = 0;
    for (const p of this.netState.values()) {
      if (!p.isBot) continue;
      totalBots++;
      if (p.alive) aliveBots++;
    }

    if (totalBots > 0 && aliveBots === 0) {
      this.matchOver = true;
      this.matchResult = { winner: this.lp.name, stats: this.buildScoreboard() };
      for (const p of this.netState.values()) if (p.isBot) p.respawnAt = 1e12;
      this.damage.flashMessage("PARTIE TERMINÉE");
      this.pushHud(true);
      return;
    }

    if (totalBots === 0) {
      let aliveHumans = this.lp.alive ? 1 : 0;
      let lastAlive = this.selfId;
      for (const p of this.netState.values()) {
        if (!p.isBot && p.alive) { aliveHumans++; lastAlive = p.id; }
      }
      const humanTotal = this.netState.size + 1;
      if (aliveHumans <= 1 && humanTotal > 1) {
        this.matchOver = true;
        this.matchResult = {
          winner: aliveHumans === 1
            ? (lastAlive === this.selfId ? this.lp.name : (this.netState.get(lastAlive)?.name ?? "???"))
            : "Personne",
          stats: this.buildScoreboard(),
        };
        this.damage.flashMessage("PARTIE TERMINÉE");
        this.pushHud(true);
      }
    }
  }

  checkGameEnd() {
    if (this.gameEnded) return;
    let winner: "red" | "blue" | null = null;
    if (this.teamKillsRed >= 50) {
      winner = "red";
    } else if (this.teamKillsBlue >= 50) {
      winner = "blue";
    } else if (this.gameStartTime > 0 && this.now - this.gameStartTime > 600) {
      winner = this.teamKillsRed > this.teamKillsBlue ? "red" : this.teamKillsBlue > this.teamKillsRed ? "blue" : null;
    }
    if (winner) {
      this.gameEnded = true;
      this.matchOver = true;
      this.matchResult = { winner: winner === "red" ? "Rouge" : "Bleu", stats: this.buildScoreboard(), teamKillsRed: this.teamKillsRed, teamKillsBlue: this.teamKillsBlue };
      this.damage.flashMessage(`ÉQUIPE ${winner === "red" ? "ROUGE" : "BLEUE"} GAGNE!`);
      this.pushHud(true);
    }
  }

  restartMatch() {
    this.matchOver = false;
    this.matchResult = null;
    this.gameEnded = false;
    this.teamKillsRed = 0;
    this.teamKillsBlue = 0;
    this.gameStartTime = this.now;
    this.killfeed = [];
    this.kfId = 0;
    this.lastDamageDealt = 0;
    this.lastDamageDealtTime = 0;
    this.message = null;

    for (const p of this.netState.values()) {
      p.hp = PLAYER.maxHp;
      p.alive = true;
      p.kills = 0;
      p.deaths = 0;
      p.killstreak = 0;
      p.respawnAt = 0;
      if (p.isBot) {
        this.botManager.initBotState(p);
        const sp = this.pickSpawn(new THREE.Vector3(this.lp.pos.x, 0, this.lp.pos.z), p.team);
        p.px = sp.x;
        p.pz = sp.z;
      }
    }

    this.lp.hp = PLAYER.maxHp;
    this.lp.alive = true;
    this.lp.kills = 0;
    this.lp.deaths = 0;
    this.lp.killstreak = 0;
    this.lp.respawnAt = 0;
    this.lp.ammo = WEAPON.magSize;
    this.lp.reserve = WEAPON.reserveMax;
    this.lp.reloading = false;

    const sp = this.pickSpawn(this.lp.pos, this.tdm ? this.selfTeam : undefined);
    this.lp.pos.set(sp.x, 0, sp.z);
    this.lp.vel.set(0, 0, 0);
    this.lp.vy = 0;

    this.damage.flashMessage("NOUVELLE PARTIE");
    this.pushHud(true);
  }

  // ---------------- teardown ----------------
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    document.removeEventListener("mousemove", this.onMouseMove);
    if (document.pointerLockElement) document.exitPointerLock();
    this.remote.forEach((a) => {
      this.scene.remove(a.view.group);
      a.view.dispose();
    });
    this.remote.clear();
    try {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    } catch {
      /* ignore */
    }
  }
}
