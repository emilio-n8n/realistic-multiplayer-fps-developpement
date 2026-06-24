import * as THREE from "three";
import { buildMap } from "./map";
import type { GameMap } from "./map";
import { buildWeaponView } from "./weapon";
import type { WeaponView } from "./weapon";
import { makeCharacter } from "./character";
import type { CharacterView } from "./character";
import { COLORS, DEFAULT_LOADOUTS, PLAYER, WEAPON_LIST, WEAPON_STATS } from "./types";
import type { HudState, KillFeedItem, PState, RadarBlip, ScoreRow, EquipmentType, KillstreakType, PerkType, WeaponProgressionData, DomState, SndState, HardcoreSettings, AttachmentType } from "./types";
import * as Sfx from "./sound";
import type { Net } from "../net/net";
import { LocalPlayerManager } from "./local-player";
import { WeaponSystem } from "./weapon-system";
import { DamageManager } from "./damage";
import { BotManager } from "./bot-ai";
import { FxManager } from "./fx";
import { NetHandler } from "./network-handler";
import { EquipmentSystem } from "./equipment";

export type GameMode = "solo" | "host" | "client" | "tdm" | "dom" | "snd";

export interface GameOpts {
  mode: GameMode;
  name: string;
  color: number;
  botCount: number;
  net?: Net | null;
  tdm?: boolean;
  team?: "red" | "blue";
  lobbyPeers?: { id: string; name: string; color: number; team?: "red" | "blue"; loadoutIndex?: number }[];
  loadoutIndex?: number;
  onHud: (s: HudState) => void;
  onLockChange: (locked: boolean) => void;
  onEvent: (e: { type: string; data?: unknown }) => void;
  hardcore?: boolean;
  onCareerStatsUpdate?: (data: { kills: number; deaths: number; headshots: number; timePlayed: number; weapons: WeaponProgressionData; won: boolean; playerXp: number; playerLevel: number }) => void;
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
  onCareerStatsUpdate: ((data: { kills: number; deaths: number; headshots: number; timePlayed: number; weapons: WeaponProgressionData; won: boolean; playerXp: number; playerLevel: number }) => void) | null = null;

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
    maxHp: PLAYER.maxHp,
    alive: true,
    onGround: true,
    crouch: false,
    ammo: WEAPON_STATS.ar15.magSize,
    reserve: WEAPON_STATS.ar15.reserveMax,
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
    sprintStoppedAt: 0,
    sprinting: false,
    flashEnd: 0,
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
  matchPhase: "countdown" | "playing" | "ended" = "countdown";
  countdownStartAt = 0;
  matchStartAt = 0;
  matchTime = 0;
  matchTimeLimit = 600;
  spectating = false;
  spectatorCamPos = new THREE.Vector3(0, 20, 0);
  multiKillMessage: string | null = null;
  multiKillTime = 0;
  headshotTime = 0;

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

  // killstreak state
  uavActive = false;
  uavUntil = 0;
  airstrikePos: THREE.Vector3 | null = null;
  airstrikeMarkerTime = 0;
  helicopterGroup: THREE.Group | null = null;
  helicopterBlades: { mesh: THREE.Mesh; axis: "x" | "y" | "z" }[] | null = null;
  helicopterLastShot = 0;
  minimapShots: { x: number; z: number; time: number }[] = [];

  // equipment state
  equipmentLethal: EquipmentType | null = "frag";
  equipmentTactical: EquipmentType | null = "flash";
  killstreaksReady: KillstreakType[] = [];
  streakKills = 0;

  // loadout / perks / progression
  loadoutIndex = 0;
  activePerks: PerkType[] = [];
  weaponXp: WeaponProgressionData;
  playerXp = 0;
  playerLevel = 1;

  // Domination state
  domState: DomState = { points: [], scoreRed: 0, scoreBlue: 0, scoreLimit: 100 };
  capPointNear: string | null = null;
  capProgress: number = 0;
  domScoreAccum: number = 0;
  capPointMeshes: { group: THREE.Group; base: THREE.Mesh; flag: THREE.Mesh; ring: THREE.Mesh }[] = [];

  // S&D state
  sndState: SndState = { round: 1, phase: "prep", phaseTimer: 0, attackingTeam: "red", bombPlanted: false, bombSite: null, bombTimer: 0, teamScoreRed: 0, teamScoreBlue: 0, roundsToWin: 4, aliveRed: 0, aliveBlue: 0 };
  hasBomb: boolean = false;
  planting: boolean = false;
  defusing: boolean = false;
  plantProgress: number = 0;
  defuseProgress: number = 0;
  sndBombPos: THREE.Vector3 | null = null;
  sndPlantSite: "a" | "b" | null = null;
  bombSiteMeshes: THREE.Mesh[] = [];
  bombPlantedMesh: THREE.Mesh | null = null;
  sndBombIcon: THREE.Mesh | null = null;

  // Hardcore state
  hardcore: HardcoreSettings = { enabled: false, hpMultiplier: 1, friendlyFire: false, noHud: false, noCrosshair: false, noRadar: false, headshotOnly: false };

  // sub-managers
  localPlayer: LocalPlayerManager;
  weaponSystem: WeaponSystem;
  damage: DamageManager;
  botManager: BotManager;
  fx: FxManager;
  netHandler: NetHandler;
  equipment: EquipmentSystem;

  // internal
  private container: HTMLElement;
  private raf = 0;
  private disposed = false;
  private lastHudPush = 0;

  constructor(container: HTMLElement, opts: GameOpts) {
    this.container = container;
    this.mode = opts.mode;
    this.tdm = opts.mode === "tdm" || opts.tdm === true || opts.mode === "dom" || opts.mode === "snd";
    this.selfTeam = opts.team || "red";
    this.net = opts.net ?? null;
    this.onHud = opts.onHud;
    this.onLockChange = opts.onLockChange;
    this.onEvent = opts.onEvent;
    this.selfId = this.net?.selfId || (opts.mode === "solo" ? "you" : "host");
    this.lp.name = opts.name || "Player";
    this.lp.color = opts.color;
    this.onCareerStatsUpdate = opts.onCareerStatsUpdate ?? null;

    // instantiate sub-managers
    this.localPlayer = new LocalPlayerManager(this);
    this.weaponSystem = new WeaponSystem(this);
    this.damage = new DamageManager(this);
    this.botManager = new BotManager(this);
    this.fx = new FxManager(this);
    this.netHandler = new NetHandler(this);
    this.equipment = new EquipmentSystem(this);

    // Init weapon progression
    this.weaponXp = {} as WeaponProgressionData;
    for (const w of WEAPON_LIST) {
      this.weaponXp[w] = { level: 1, xp: 0, xpToNext: 100, kills: 0, headshots: 0 };
    }

    // Apply loadout
    this.loadoutIndex = opts.loadoutIndex ?? 0;
    const loadout = DEFAULT_LOADOUTS[this.loadoutIndex];
    this.activePerks = loadout.perks;
    this.equipmentLethal = loadout.lethal;
    this.equipmentTactical = loadout.tactical;
    this.weaponSystem.attachments = Object.keys(loadout.attachments).filter(k => (loadout.attachments as any)[k]) as AttachmentType[];
    if (this.activePerks.includes("tank")) {
      this.lp.maxHp = PLAYER.maxHp + 25;
      this.lp.hp = this.lp.maxHp;
    }
    // Set weapon system to loadout primary
    const primaryIdx = WEAPON_LIST.indexOf(loadout.primary);
    if (primaryIdx >= 0) {
      this.weaponSystem.weaponIndex = primaryIdx;
      this.weaponSystem.weaponType = loadout.primary;
      this.weaponSystem.loadAmmo();
    }

    // Domination mode init
    if (this.mode === "dom") {
      this.domState = {
        points: [
          { id: "a", x: -10, z: -10, radius: 4, team: null, progress: 0, contesting: false },
          { id: "b", x: 0, z: 0, radius: 4, team: null, progress: 0, contesting: false },
          { id: "c", x: 10, z: 10, radius: 4, team: null, progress: 0, contesting: false },
        ],
        scoreRed: 0,
        scoreBlue: 0,
        scoreLimit: 100,
      };
      this.domScoreAccum = 0;
    }

    // S&D mode init
    if (this.mode === "snd") {
      this.sndState = {
        round: 1,
        phase: "prep",
        phaseTimer: 15,
        attackingTeam: "red",
        bombPlanted: false,
        bombSite: null,
        bombTimer: 0,
        teamScoreRed: 0,
        teamScoreBlue: 0,
        roundsToWin: 4,
        aliveRed: 0,
        aliveBlue: 0,
      };
      this.plantProgress = 0;
      this.defuseProgress = 0;
      this.planting = false;
      this.defusing = false;
      this.sndBombPos = null;
    }

    // Hardcore mode
    if (opts.hardcore) {
      this.hardcore = {
        enabled: true,
        hpMultiplier: 0.3,
        friendlyFire: true,
        noHud: true,
        noCrosshair: true,
        noRadar: true,
        headshotOnly: false,
      };
      this.lp.maxHp = Math.round(PLAYER.maxHp * 0.3);
      this.lp.hp = this.lp.maxHp;
    }

    this.initScene();
    this.initMap();
    this.initWeapon();
    this.bindInput();

    if (this.mode === "solo" || this.mode === "host" || this.mode === "tdm" || this.mode === "dom" || this.mode === "snd") {
      this.initBots(opts.botCount);
      this.netHandler.syncSelfToNet();
    }
    if (this.mode === "snd") this.startSndRound();
    if (this.net) this.netHandler.attachNet();
    if (opts.lobbyPeers) {
      for (const p of opts.lobbyPeers) {
        this.netHandler.registerLobbyPeer(p.id, p.name, p.color, p.team, p.loadoutIndex);
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

    // Capture point visuals (Domination)
    if (this.mode === "dom") {
      for (const p of this.domState.points) {
        const group = new THREE.Group();
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.35 });
        const base = new THREE.Mesh(new THREE.CylinderGeometry(p.radius, p.radius, 0.15, 24), baseMat);
        base.position.set(p.x, 0.075, p.z);
        base.receiveShadow = true;
        group.add(base);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6), new THREE.MeshStandardMaterial({ color: 0xcccccc }));
        pole.position.set(p.x, 0.82, p.z);
        group.add(pole);
        const flagMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
        const flag = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), flagMat);
        flag.position.set(p.x, 1.6, p.z);
        group.add(flag);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(new THREE.RingGeometry(p.radius * 0.3, p.radius * 0.35, 24), ringMat);
        ring.position.set(p.x, 0.2, p.z);
        ring.rotation.x = -Math.PI / 2;
        group.add(ring);
        this.scene.add(group);
        this.capPointMeshes.push({ group, base, flag, ring });
      }
    }

    // Bomb site markers (S&D)
    if (this.mode === "snd") {
      const sitePositions = [[-10, 10], [10, -10]];
      for (let i = 0; i < 2; i++) {
        const [sx, sz] = sitePositions[i];
        const siteMat = new THREE.MeshStandardMaterial({ color: 0xff6600, transparent: true, opacity: 0.2 });
        const siteMesh = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.1, 24), siteMat);
        siteMesh.position.set(sx, 0.05, sz);
        siteMesh.receiveShadow = true;
        this.scene.add(siteMesh);
        this.bombSiteMeshes.push(siteMesh);
        // Label sphere
        const labelMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.3 });
        const label = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), labelMat);
        label.position.set(sx, 2, sz);
        this.scene.add(label);
        this.bombSiteMeshes.push(label);
      }
    }
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
    this.weapon = buildWeaponView(this.weaponSystem.weaponType, this.weaponSystem.attachments);
    this.weapon.group.position.set(0.17, -0.15, -0.42);
    this.weapon.group.rotation.y = Math.PI;
    this.camera.add(this.weapon.group);
    this.scene.add(this.camera);
    this.fx.createDeathOverlay();
  }

  rebuildWeapon(type: import("./types").WeaponType, attachments?: import("./types").AttachmentType[]) {
    this.camera.remove(this.weapon.group);
    this.weapon = buildWeaponView(type, attachments);
    this.weapon.group.position.set(0.17, -0.15, -0.42);
    this.weapon.group.rotation.y = Math.PI;
    this.camera.add(this.weapon.group);
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
    if (e.code === "KeyV" && this.lp.alive) this.weaponSystem.melee();
    if (e.code === "KeyB" && this.lp.alive) {
      if (this.killstreaksReady.length > 0) {
        const ks = this.killstreaksReady[0];
        this.damage.useKillstreak(ks);
        this.killstreaksReady = this.killstreaksReady.filter(k => k !== ks);
      }
    }
    if (e.code === "KeyG" && this.lp.alive && this.equipmentLethal) {
      this.equipment.useLethal(this.equipmentLethal);
    }
    if (e.code === "KeyQ" && this.lp.alive && this.equipmentTactical) {
      this.equipment.useTactical(this.equipmentTactical);
    }
    // Weapon switching 1-5
    const digitMatch = e.code.match(/^Digit(\d)$/);
    if (digitMatch) {
      const idx = parseInt(digitMatch[1], 10) - 1;
      if (idx >= 0 && idx < WEAPON_LIST.length) {
        this.weaponSystem.switchWeapon(idx);
      }
    }
    // S&D — bomb plant/defuse
    if (e.code === "KeyF" && this.mode === "snd" && this.sndState.phase === "active" && this.lp.alive) {
      if (this.sndState.bombPlanted && this.sndBombPos) {
        const d = this.lp.pos.distanceTo(this.sndBombPos);
        if (d < 3 && this.selfTeam !== this.sndState.attackingTeam) {
          this.defusing = true;
          this.defuseProgress = 0;
        }
      } else if (this.hasBomb) {
        const siteA = new THREE.Vector3(-10, 0, 10);
        const siteB = new THREE.Vector3(10, 0, -10);
        const dA = this.lp.pos.distanceTo(siteA);
        const dB = this.lp.pos.distanceTo(siteB);
        if (dA < 4) {
          this.planting = true;
          this.sndPlantSite = "a";
          this.plantProgress = 0;
        } else if (dB < 4) {
          this.planting = true;
          this.sndPlantSite = "b";
          this.plantProgress = 0;
        }
      }
    }

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === "KeyF") {
      this.planting = false;
      this.defusing = false;
      this.plantProgress = 0;
      this.defuseProgress = 0;
    }
  };

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
    this.countdownStartAt = 0;
    this.matchStartAt = 0;
    this.matchTime = 0;
    this.matchPhase = "countdown";
    this.spectating = false;
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
      if (this.matchPhase === "countdown") {
        if (this.countdownStartAt === 0) this.countdownStartAt = this.now;
        const elapsed = this.now - this.countdownStartAt;
        if (elapsed >= 3.5) {
          this.matchPhase = "playing";
          this.matchStartAt = this.now;
          this.damage.flashMessage("GO!");
          this.pushHud(true);
        }
      } else if (this.matchPhase === "playing") {
        if (this.spectating) {
          this.updateSpectator(dt);
        } else {
          this.localPlayer.update(dt);
          this.weaponSystem.update(dt);
          if (this.mouseDown) this.weaponSystem.tryFire();
          this.equipment.update(dt);
          if (this.mode === "dom") this.updateDomination(dt);
          if (this.mode === "snd") this.updateSnd(dt);
        }
        // Match time tracking
        this.matchTime = this.now - this.matchStartAt;
        if (this.matchTime >= this.matchTimeLimit) {
          this.endMatchDueToTimeLimit();
        }
        // Bomb icon on local player (only when not spectating)
        if (this.mode === "snd" && !this.spectating) {
          if (this.hasBomb && !this.sndBombIcon) {
            const bombMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x444400, emissiveIntensity: 0.3 });
            const icon = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.05), bombMat);
            icon.position.set(0.1, -0.12, -0.35);
            this.camera.add(icon);
            this.sndBombIcon = icon;
          } else if (!this.hasBomb && this.sndBombIcon) {
            this.camera.remove(this.sndBombIcon);
            this.sndBombIcon = null;
          }
        }
      }
    }
    // Killstreak timers
    if (this.uavActive && this.now > this.uavUntil) {
      this.uavActive = false;
    }
    if (this.airstrikePos && this.now > this.airstrikeMarkerTime + 0.5) {
      this.activateAirstrikeBombs();
    }
    this.updateHelicopter(dt);
    this.updateActors(dt);
    this.botManager.update(dt);
    this.fx.update(dt);
    this.netHandler.update(dt);
    if (!this.matchOver) this.checkMatchOver();
    if (this.tdm && !this.gameEnded && this.mode !== "dom" && this.mode !== "snd") this.checkGameEnd();
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

    // Filter minimap pings
    const pings = this.minimapShots.filter((p) => now - p.time < 2000).map((p) => ({
      x: p.x, z: p.z, time: p.time,
    }));

    const ws = WEAPON_STATS[this.weaponSystem.weaponType];
    const state: HudState = {
      hp: Math.round(hp),
      maxHp: this.lp.maxHp,
      alive,
      ammo: lp.ammo,
      mag: ws.magSize,
      reserve: lp.reserve,
      reloading: lp.reloading,
      reloadProgress: lp.reloading ? Math.min(1, 1 - (lp.reloadEnd - this.now) / ws.reloadTime) : 0,
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
      weaponName: ws.name,
      fireMode: ws.auto ? "auto" : "semi",
      lastDamageDealt: this.lastDamageDealt,
      lastDamageDealtTime: this.lastDamageDealtTime,
      ping: 30,
      yaw: this.lp.yaw,
      teamKillsRed: this.teamKillsRed,
      teamKillsBlue: this.teamKillsBlue,
      tdm: this.tdm,
      team: this.tdm ? this.selfTeam : "red",
      weaponType: this.weaponSystem.weaponType,
      weaponIndex: this.weaponSystem.weaponIndex,
      weaponList: WEAPON_LIST,
      streakKills: this.streakKills,
      killstreaksReady: this.killstreaksReady,
      uavActive: this.uavActive,
      equipmentLethal: this.equipmentLethal,
      equipmentTactical: this.equipmentTactical,
      minimapPings: pings,
      loadoutName: DEFAULT_LOADOUTS[this.loadoutIndex].name,
      perks: this.activePerks,
      weaponProgression: this.weaponXp,
      playerLevel: this.playerLevel,
      domState: this.mode === "dom" ? { ...this.domState, points: this.domState.points.map(p => ({ ...p })) } : null,
      capturePointNear: this.capPointNear,
      captureProgress: this.capProgress,
      sndState: this.mode === "snd" ? { ...this.sndState } : null,
      bombCarrier: this.hasBomb,
      planting: this.planting,
      plantProgress: this.plantProgress,
      defusing: this.defusing,
      defuseProgress: this.defuseProgress,
      hardcore: { ...this.hardcore },
      matchPhase: this.matchPhase,
      countdownLeft: this.matchPhase === "countdown" && this.countdownStartAt > 0
        ? Math.max(0, 3 - (this.now - this.countdownStartAt))
        : 0,
      matchTime: this.matchPhase === "playing" ? this.now - this.matchStartAt : 0,
      matchTimeLimit: this.matchTimeLimit,
      mapName: "FRONTLINE ARENA",
      spectating: this.spectating,
      multiKillMessage: this.multiKillMessage,
      multiKillTime: this.multiKillTime,
      headshotTime: this.headshotTime,
      attachments: this.weaponSystem.attachments,
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
      const scoutPerk = this.activePerks.includes("scout");
      if (isEnemy && !p.firing && d > 12 && !this.uavActive && !scoutPerk) continue;
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

  // ---------------- spectator ----------------
  private updateSpectator(dt: number) {
    const spd = 15;
    const fwd = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
    const str = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
    if (fwd !== 0 || str !== 0) {
      const sin = Math.sin(this.lp.yaw);
      const cos = Math.cos(this.lp.yaw);
      const dx = (-sin * fwd + cos * str) * spd * dt;
      const dz = (-cos * fwd - sin * str) * spd * dt;
      this.camera.position.x += dx;
      this.camera.position.z += dz;
    }
    // Up/down with Q/E
    if (this.keys.has("KeyE")) this.camera.position.y += spd * dt;
    if (this.keys.has("KeyQ")) this.camera.position.y -= spd * dt;
    // Mouse look
    this.camera.rotation.y = this.lp.yaw;
    this.camera.rotation.x = this.lp.pitch;
    // Space to respawn
    if (this.keys.has("Space")) {
      this.keys.delete("Space");
      this.damage.handleSelfRespawn(false);
      this.spectating = false;
    }
  }

  private endMatchDueToTimeLimit() {
    if (this.matchOver) return;
    this.matchOver = true;
    this.gameEnded = true;
    this.matchPhase = "ended";
    if (this.tdm) {
      const winner = this.teamKillsRed > this.teamKillsBlue ? "Rouge" :
                     this.teamKillsBlue > this.teamKillsRed ? "Bleu" : "Match nul";
      this.matchResult = { winner, stats: this.buildScoreboard(), teamKillsRed: this.teamKillsRed, teamKillsBlue: this.teamKillsBlue };
    } else if (this.mode === "dom") {
      const winner = this.domState.scoreRed > this.domState.scoreBlue ? "Rouge" :
                     this.domState.scoreBlue > this.domState.scoreRed ? "Bleu" : "Match nul";
      this.matchResult = { winner, stats: this.buildScoreboard(), teamKillsRed: this.domState.scoreRed, teamKillsBlue: this.domState.scoreBlue };
    } else {
      const allStats = this.buildScoreboard();
      const winner = allStats.length > 0 ? allStats[0].name : "Personne";
      this.matchResult = { winner, stats: allStats };
    }
    this.damage.flashMessage("TEMPS ÉCOULÉ!");
    this.pushHud(true);
    this.emitCareerStats(this.matchResult?.winner === (this.tdm ? (this.selfTeam === "red" ? "Rouge" : "Bleu") : this.lp.name));
  }

  // ---------------- match flow ----------------
  private checkMatchOver() {
    if (this.matchOver) return;

    // Domination and S&D have their own end conditions
    if (this.mode === "dom") {
      if (this.domState.scoreRed >= this.domState.scoreLimit || this.domState.scoreBlue >= this.domState.scoreLimit) {
        this.matchOver = true;
        const winner = this.domState.scoreRed >= this.domState.scoreLimit ? "Rouge" : "Bleu";
        this.matchResult = { winner, stats: this.buildScoreboard(), teamKillsRed: this.domState.scoreRed, teamKillsBlue: this.domState.scoreBlue };
        this.damage.flashMessage(`${winner} GAGNE!`);
        this.pushHud(true);
        this.emitCareerStats(winner === (this.selfTeam === "red" ? "Rouge" : "Bleu"));
      }
      return;
    }
    if (this.mode === "snd") return;

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
      this.emitCareerStats(true);
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
        this.emitCareerStats(this.matchResult?.winner === this.lp.name);
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
      this.emitCareerStats(winner === this.selfTeam);
    }
  }

  // ---------------- Domination ----------------
  private updateDomination(dt: number) {
    if (this.matchOver) return;
    // Check players in each capture point
    const allPlayers: { id: string; team: "red" | "blue"; x: number; z: number }[] = [];
    allPlayers.push({ id: this.selfId, team: this.selfTeam, x: this.lp.pos.x, z: this.lp.pos.z });
    for (const a of this.remote.values()) {
      if (!a.state.alive) continue;
      allPlayers.push({ id: a.state.id, team: a.state.team, x: a.state.px, z: a.state.pz });
    }

    this.capPointNear = null;
    this.capProgress = 0;

    for (let i = 0; i < this.domState.points.length; i++) {
      const p = this.domState.points[i];
      const redIn = allPlayers.filter(pl => pl.team === "red" && Math.hypot(pl.x - p.x, pl.z - p.z) < p.radius);
      const blueIn = allPlayers.filter(pl => pl.team === "blue" && Math.hypot(pl.x - p.x, pl.z - p.z) < p.radius);

      p.contesting = redIn.length > 0 && blueIn.length > 0;

      // Check local player proximity
      const localD = Math.hypot(this.lp.pos.x - p.x, this.lp.pos.z - p.z);
      if (localD < p.radius) {
        this.capPointNear = p.id;
      }

      if (p.contesting) continue; // contested — no progress

      if (redIn.length > 0 && blueIn.length === 0) {
        p.progress = Math.min(100, p.progress + 2 * dt);
      } else if (blueIn.length > 0 && redIn.length === 0) {
        p.progress = Math.max(0, p.progress - 2 * dt);
      }

      // Capture
      if (p.progress >= 100 && p.team !== "red") {
        p.team = "red";
        p.progress = 100;
      } else if (p.progress <= 0 && p.team !== "blue") {
        p.team = "blue";
        p.progress = 0;
      }

      // Update mesh colors
      if (i < this.capPointMeshes.length) {
        const m = this.capPointMeshes[i];
        const color = p.team === "red" ? 0xef4444 : p.team === "blue" ? 0x3b82f6 : 0x888888;
        (m.flag.material as THREE.MeshBasicMaterial).color.setHex(color);
        (m.base.material as THREE.MeshStandardMaterial).color.setHex(color);
        (m.base.material as THREE.MeshStandardMaterial).opacity = p.team ? 0.5 : 0.35;
      }

      // Local player capture progress
      if (this.capPointNear === p.id) {
        if (this.selfTeam === "red" && p.team !== "red") {
          this.capProgress = p.progress;
        } else if (this.selfTeam === "blue" && p.team !== "blue") {
          this.capProgress = 100 - p.progress;
        }
      }
    }

    // Score ticks every 2 seconds
    this.domScoreAccum += dt;
    if (this.domScoreAccum >= 2) {
      this.domScoreAccum -= 2;
      for (const p of this.domState.points) {
        if (p.team === "red") this.domState.scoreRed++;
        else if (p.team === "blue") this.domState.scoreBlue++;
      }
    }
  }

  // ---------------- Search & Destroy ----------------
  private updateSnd(dt: number) {
    const s = this.sndState;
    if (this.matchOver) return;

    // Count alive per team
    s.aliveRed = (this.selfTeam === "red" && this.lp.alive ? 1 : 0);
    s.aliveBlue = (this.selfTeam === "blue" && this.lp.alive ? 1 : 0);
    for (const a of this.remote.values()) {
      if (!a.state.alive) continue;
      if (a.state.team === "red") s.aliveRed++;
      else s.aliveBlue++;
    }
    // Count bots
    for (const p of this.netState.values()) {
      if (!p.isBot || !p.alive) continue;
      if (p.team === "red") s.aliveRed++;
      else s.aliveBlue++;
    }

    s.phaseTimer -= dt;
    if (s.phaseTimer <= 0) s.phaseTimer = 0;

    if (s.phase === "prep") {
      if (s.phaseTimer <= 0) {
        s.phase = "active";
        s.phaseTimer = Infinity;
      }
    } else if (s.phase === "active") {
      // Bomb plant progress
      if (this.planting) {
        this.plantProgress += dt;
        if (this.plantProgress >= 3) {
          this.plantProgress = 3;
          s.bombPlanted = true;
          s.bombSite = this.sndPlantSite;
          s.bombTimer = 45;
          this.sndBombPos = this.lp.pos.clone();
          this.sndBombPos.y = 0;
          this.planting = false;
          this.hasBomb = false;
          // Create bomb mesh
          if (this.bombPlantedMesh) this.scene.remove(this.bombPlantedMesh);
          const bombMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, emissive: 0x000000 });
          const bombMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.15, 8), bombMat);
          bombMesh.position.copy(this.sndBombPos);
          bombMesh.position.y = 0.1;
          this.scene.add(bombMesh);
          this.bombPlantedMesh = bombMesh;
        }
      }

      // Defuse progress
      if (this.defusing && s.bombPlanted) {
        this.defuseProgress += dt;
        if (this.defuseProgress >= 7) {
          this.defuseProgress = 7;
          s.bombPlanted = false;
          s.bombTimer = 0;
          this.defusing = false;
          // Remove bomb mesh
          if (this.bombPlantedMesh) {
            this.scene.remove(this.bombPlantedMesh);
            this.bombPlantedMesh = null;
          }
          // Defending team wins the round
          this.endSndRound(s.attackingTeam === "red" ? "blue" : "red");
          return;
        }
      }

      // Bomb timer
      if (s.bombPlanted) {
        s.bombTimer -= dt;
        if (s.bombTimer <= 0) {
          s.bombTimer = 0;
          // Bomb explodes — attacking team wins
          if (this.sndBombPos) {
            this.fx.spawnExplosionFx(this.sndBombPos);
            this.shake = Math.min(0.8, this.shake + 0.5);
          }
          if (this.bombPlantedMesh) {
            this.scene.remove(this.bombPlantedMesh);
            this.bombPlantedMesh = null;
          }
          this.endSndRound(s.attackingTeam);
          return;
        }
      }

      // Elimination check
      if (s.aliveRed === 0) {
        this.endSndRound("blue");
        return;
      }
      if (s.aliveBlue === 0) {
        this.endSndRound("red");
        return;
      }
    } else if (s.phase === "post") {
      if (s.phaseTimer <= 0) {
        // Next round
        s.round++;
        s.attackingTeam = s.attackingTeam === "red" ? "blue" : "red";
        if (s.teamScoreRed >= s.roundsToWin || s.teamScoreBlue >= s.roundsToWin) {
          this.matchOver = true;
          const winner = s.teamScoreRed >= s.roundsToWin ? "Rouge" : "Bleu";
          this.matchResult = { winner, stats: this.buildScoreboard() };
          this.damage.flashMessage(`${winner} GAGNE LA PARTIE!`);
          this.pushHud(true);
          this.emitCareerStats(winner === (this.selfTeam === "red" ? "Rouge" : "Bleu"));
          return;
        }
        this.startSndRound();
      }
    }
  }

  private startSndRound() {
    const s = this.sndState;
    s.phase = "prep";
    s.phaseTimer = 15;
    s.bombPlanted = false;
    s.bombSite = null;
    s.bombTimer = 0;
    this.sndBombPos = null;
    this.planting = false;
    this.defusing = false;
    this.plantProgress = 0;
    this.defuseProgress = 0;

    // Remove bomb mesh
    if (this.bombPlantedMesh) {
      this.scene.remove(this.bombPlantedMesh);
      this.bombPlantedMesh = null;
    }

    // Respawn all players
    this.lp.hp = this.hardcore.enabled ? Math.round(PLAYER.maxHp * 0.3) : this.lp.maxHp;
    const sp = this.pickSpawn(this.lp.pos, s.attackingTeam === this.selfTeam ? this.selfTeam : (this.selfTeam === "red" ? "blue" : "red"));
    this.lp.pos.set(sp.x, 0, sp.z);
    this.lp.vel.set(0, 0, 0);
    this.lp.vy = 0;
    this.lp.alive = true;
    this.lp.ammo = WEAPON_STATS[this.weaponSystem.weaponType].magSize;

    for (const p of this.netState.values()) {
      const sp2 = this.pickSpawn(new THREE.Vector3(), p.team);
      p.px = sp2.x;
      p.py = 0;
      p.pz = sp2.z;
      p.hp = this.hardcore.enabled ? Math.round(PLAYER.maxHp * 0.3) : PLAYER.maxHp;
      p.alive = true;
      p.killstreak = 0;
      p.respawnAt = 0;
      if (p.isBot) this.botManager.initBotState(p);
    }

    // Assign bomb to random attacker
    this.hasBomb = false;
    const attackers: string[] = [];
    if (this.selfTeam === s.attackingTeam) attackers.push(this.selfId);
    for (const p of this.netState.values()) {
      if (p.team === s.attackingTeam && p.alive) attackers.push(p.id);
    }
    if (attackers.length > 0) {
      const carrier = attackers[Math.floor(Math.random() * attackers.length)];
      if (carrier === this.selfId) {
        this.hasBomb = true;
        this.damage.flashMessage("VOUS AVEZ LA BOMBE!");
      }
    }

    this.damage.flashMessage(`RONDE ${s.round} — ${s.attackingTeam === "red" ? "ATTAQUE" : "DÉFENSE"}`);
    this.pushHud(true);
  }

  private endSndRound(winnerTeam: "red" | "blue") {
    const s = this.sndState;
    s.phase = "post";
    s.phaseTimer = 5;
    if (winnerTeam === "red") s.teamScoreRed++;
    else s.teamScoreBlue++;
    this.damage.flashMessage(`ÉQUIPE ${winnerTeam === "red" ? "ROUGE" : "BLEUE"} GAGNE LA RONDE!`);

    // Clean up bomb
    if (this.bombPlantedMesh) {
      this.scene.remove(this.bombPlantedMesh);
      this.bombPlantedMesh = null;
    }
    this.planting = false;
    this.defusing = false;
    this.hasBomb = false;
    this.pushHud(true);
  }

  private emitCareerStats(won: boolean) {
    if (!this.onCareerStatsUpdate) return;
    let headshots = 0;
    for (const w of WEAPON_LIST) {
      headshots += this.weaponXp[w]?.headshots ?? 0;
    }
    this.onCareerStatsUpdate({
      kills: this.lp.kills,
      deaths: this.lp.deaths,
      headshots,
      timePlayed: this.matchTime,
      weapons: { ...this.weaponXp },
      won,
      playerXp: this.playerXp,
      playerLevel: this.playerLevel,
    });
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

    this.lp.hp = this.lp.maxHp;
    this.lp.alive = true;
    this.lp.kills = 0;
    this.lp.deaths = 0;
    this.lp.killstreak = 0;
    this.lp.respawnAt = 0;
    this.lp.ammo = WEAPON_STATS[this.weaponSystem.weaponType].magSize;
    this.lp.reserve = WEAPON_STATS[this.weaponSystem.weaponType].reserveMax;
    this.lp.reloading = false;
    this.lp.flashEnd = 0;
    this.streakKills = 0;
    this.killstreaksReady = [];
    this.uavActive = false;
    this.uavUntil = 0;
    this.airstrikePos = null;
    if (this.helicopterGroup) {
      this.scene.remove(this.helicopterGroup);
      this.helicopterGroup = null;
    }
    this.helicopterBlades = null;
    this.minimapShots = [];
    Sfx.helicopterLoop(true);

    const sp = this.pickSpawn(this.lp.pos, this.tdm ? this.selfTeam : undefined);
    this.lp.pos.set(sp.x, 0, sp.z);
    this.lp.vel.set(0, 0, 0);
    this.lp.vy = 0;

    // Reset Domination state
    if (this.mode === "dom") {
      this.domState.points.forEach(p => { p.team = null; p.progress = 0; p.contesting = false; });
      this.domState.scoreRed = 0;
      this.domState.scoreBlue = 0;
      this.domScoreAccum = 0;
      this.capPointNear = null;
      this.capProgress = 0;
    }

    // Reset S&D state
    if (this.mode === "snd") {
      this.sndState.round = 1;
      this.sndState.phase = "prep";
      this.sndState.phaseTimer = 15;
      this.sndState.attackingTeam = "red";
      this.sndState.bombPlanted = false;
      this.sndState.bombSite = null;
      this.sndState.bombTimer = 0;
      this.sndState.teamScoreRed = 0;
      this.sndState.teamScoreBlue = 0;
      this.sndState.aliveRed = 0;
      this.sndState.aliveBlue = 0;
      this.hasBomb = false;
      this.planting = false;
      this.defusing = false;
      this.plantProgress = 0;
      this.defuseProgress = 0;
      this.sndBombPos = null;
      if (this.bombPlantedMesh) {
        this.scene.remove(this.bombPlantedMesh);
        this.bombPlantedMesh = null;
      }
    }

    this.matchPhase = "countdown";
    this.countdownStartAt = 0;
    this.matchStartAt = 0;
    this.matchTime = 0;
    this.spectating = false;
    this.multiKillMessage = null;
    this.multiKillTime = 0;
    this.headshotTime = 0;

    this.damage.flashMessage("NOUVELLE PARTIE");
    this.pushHud(true);
  }

  // ---------------- killstreaks ----------------
  activateUAV() {
    this.uavActive = true;
    this.uavUntil = this.now + 10;
    this.damage.flashMessage("UAV ACTIF");
    this.pushHud(true);
  }

  activateAirstrike() {
    // Get the position at the reticle (center of screen)
    const center = new THREE.Vector2(0, 0);
    this.raycaster.setFromCamera(center, this.camera);
    const dir = this.raycaster.ray.direction.clone();
    const origin = this.camera.position.clone();
    const far = 80;
    const end = origin.clone().add(dir.clone().multiplyScalar(far));

    // Find where the ray hits the ground
    const targets = [...this.map.rayMeshes];
    this.raycaster.far = far;
    const hits = this.raycaster.intersectObjects(targets, true);
    let pos: THREE.Vector3;
    if (hits.length > 0) {
      pos = hits[0].point.clone();
      pos.y = 0;
    } else {
      pos = end.clone();
      pos.y = 0;
    }

    this.airstrikePos = pos;
    this.airstrikeMarkerTime = this.now;
    this.fx.spawnAirstrikeMark(pos);
    Sfx.airstrikeWhistle();
    this.damage.flashMessage("APPUI AÉRIEN EN COURS");
    this.pushHud(true);
  }

  private activateAirstrikeBombs() {
    if (!this.airstrikePos) return;
    const pos = this.airstrikePos;
    this.airstrikePos = null;

    // Spawn bombs along a line perpendicular to the player's view
    const fwd = new THREE.Vector3(-Math.sin(this.lp.yaw), 0, -Math.cos(this.lp.yaw));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    for (let i = -2; i <= 2; i++) {
      const offset = right.clone().multiplyScalar(i * 3);
      const bombPos = pos.clone().add(offset);
      bombPos.y = 0;
      setTimeout(() => {
        this.fx.spawnAirstrikeBomb(bombPos);
        this.fx.spawnExplosionFx(bombPos);
        Sfx.explosion();
        // Damage in area
        for (const a of this.remote.values()) {
          if (!a.state.alive) continue;
          const d = new THREE.Vector3(a.state.px, 0, a.state.pz).distanceTo(bombPos);
          if (d < 5) {
            this.damage.applyDamage(a.state.id, 60, false, this.selfId);
          }
        }
        if (this.lp.alive) {
          const d = new THREE.Vector3(this.lp.pos.x, 0, this.lp.pos.z).distanceTo(bombPos);
          if (d < 5 && !this.damage.isFriendly(this.selfId, this.selfId)) {
            this.damage.takeDamage(60, this.selfId, false);
          }
        }
      }, i * 100 + 100);
    }
  }

  activateHelicopter() {
    if (this.helicopterGroup) return;
    const group = new THREE.Group();

    // Body
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a3a2a, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.9), bodyMat);
    body.position.y = 0;
    group.add(body);

    // Tail
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.6), bodyMat);
    tail.position.set(0, 0.05, -0.65);
    group.add(tail);

    // Blades (two crossed planes)
    const bladeMat = new THREE.MeshBasicMaterial({
      color: 0x555555, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false,
    });
    const blade1 = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.15), bladeMat);
    blade1.position.y = 0.2;
    const blade2 = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.15), bladeMat);
    blade2.position.y = 0.2;
    blade2.rotation.y = Math.PI / 2;
    group.add(blade1);
    group.add(blade2);

    // Tail rotor
    const tailRotor = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.04), bladeMat);
    tailRotor.position.set(0, 0.1, -0.95);
    group.add(tailRotor);

    group.position.set(this.lp.pos.x + 15, 8, this.lp.pos.z + 15);
    this.scene.add(group);
    this.helicopterGroup = group;
    this.helicopterBlades = [{ mesh: blade1, axis: "y" }, { mesh: blade2, axis: "y" }];
    this.helicopterLastShot = 0;

    Sfx.helicopterLoop();
    this.damage.flashMessage("HÉLICOPTÈRE D'ATTAQUE DÉPLOYÉ");
    this.pushHud(true);
  }

  private updateHelicopter(dt: number) {
    if (!this.helicopterGroup) return;
    const group = this.helicopterGroup;

    // Circle the map
    const radius = 25;
    const speed = 0.3;
    const angle = this.now * speed;
    group.position.x = Math.cos(angle) * radius;
    group.position.z = Math.sin(angle) * radius;
    group.position.y = 8 + Math.sin(this.now * 0.5) * 0.5;
    group.lookAt(0, 0, 0);

    // Rotate blades
    if (this.helicopterBlades) {
      for (const b of this.helicopterBlades) {
        b.mesh.rotation.y += dt * 30;
      }
    }

    // Shoot at nearest enemy
    let nearest: PState | null = null;
    let nearestD = Infinity;
    for (const a of this.remote.values()) {
      if (!a.state.alive) continue;
      const d = Math.hypot(a.state.px - group.position.x, a.state.pz - group.position.z);
      if (d < nearestD) { nearestD = d; nearest = a.state; }
    }
    if (this.lp.alive) {
      const d = Math.hypot(this.lp.pos.x - group.position.x, this.lp.pos.z - group.position.z);
      if (d < nearestD && !this.damage.isFriendly("helicopter", this.selfId)) {
        nearest = null as any; // Don't shoot self
      }
    }
    if (nearest && this.now - this.helicopterLastShot > 0.5) {
      this.helicopterLastShot = this.now;
      this.damage.applyDamage(nearest.id, 25, false, this.selfId);
    }
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
    if (this.sndBombIcon) { this.scene.remove(this.sndBombIcon); this.sndBombIcon = null; }
    if (this.bombPlantedMesh) { this.scene.remove(this.bombPlantedMesh); this.bombPlantedMesh = null; }
    if (this.helicopterGroup) {
      this.scene.remove(this.helicopterGroup);
    }
    Sfx.helicopterLoop(true);
    try {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    } catch {
      /* ignore */
    }
  }
}
