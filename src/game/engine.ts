import * as THREE from "three";
import { buildMap } from "./map";
import type { GameMap } from "./map";
import { buildWeaponView } from "./weapon";
import type { WeaponView } from "./weapon";
import { makeCharacter } from "./character";
import type { CharacterView } from "./character";
import { COLORS, PLAYER, WEAPON, GRENADE } from "./types";
import type { HudState, KillFeedItem, PState, RadarBlip, ScoreRow } from "./types";
import * as Sfx from "./sound";
import type { Net, NetMsg } from "../net/net";

export type GameMode = "solo" | "host" | "client";

export interface GameOpts {
  mode: GameMode;
  name: string;
  color: number;
  botCount: number;
  net?: Net | null;
  lobbyPeers?: { id: string; name: string; color: number }[];
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

interface Tracer {
  group: THREE.Group;
  core: THREE.Mesh;
  glow: THREE.Mesh;
  life: number;
}
interface Spark {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}
interface Grenade {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  timer: number;
  alive: boolean;
  owner: string;
}
interface Decal {
  mesh: THREE.Mesh;
  life: number;
}
interface Casing {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  rot: THREE.Euler;
  life: number;
}

const BOT_PREFIX = "bot_";

export class Game {
  private container: HTMLElement;
  private mode: GameMode;
  private net: Net | null;
  private onHud: (s: HudState) => void;
  private onLockChange: (locked: boolean) => void;
  private onEvent: (e: { type: string; data?: unknown }) => void;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;

  private map!: GameMap;
  private weapon!: WeaponView;
  private raycaster = new THREE.Raycaster();

  // local player
  private selfId: string;
  private lp = {
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

  private remote = new Map<string, RemoteActor>();
  private netState = new Map<string, PState>(); // authoritative (solo/host)
  private selfState: PState | null = null; // client mirror of self

  // fx
  private tracers: Tracer[] = [];
  private sparks: Spark[] = [];
  private decals: Decal[] = [];
  private casings: Casing[] = [];
  private flashUntil = 0;
  private shake = 0;
  private recoil = { pitch: 0, yaw: 0 };
  private bob = 0;
  private sway = new THREE.Vector2();
  private damageDir: number | null = null;
  private damageTime = 0;
  private hitmarker = 0;
  private killmarker = 0;
  private grenades: Grenade[] = [];
  private lastGrenade = 0;
  private hitRing: THREE.Mesh | null = null;
  private hitRingTime = 0;
  private deathOverlay: THREE.Mesh | null = null;

  // killfeed
  private killfeed: KillFeedItem[] = [];
  private kfId = 0;

  // input
  private keys = new Set<string>();
  private mouseDown = false;
  private locked = false;
  private paused = true;

  // timing
  private netAccum = 0;
  private hudAccum = 0;
  private botAccum = 0;
  private now = 0;
  private botSharedIntel: { x: number; z: number; time: number; reporter: string }[] = [];

  constructor(container: HTMLElement, opts: GameOpts) {
    this.container = container;
    this.mode = opts.mode;
    this.net = opts.net ?? null;
    this.onHud = opts.onHud;
    this.onLockChange = opts.onLockChange;
    this.onEvent = opts.onEvent;
    this.selfId = this.net?.selfId || (opts.mode === "solo" ? "you" : "host");
    this.lp.name = opts.name || "Player";
    this.lp.color = opts.color;

    this.initScene();
    this.initMap();
    this.initWeapon();
    this.bindInput();

    if (this.mode === "solo" || this.mode === "host") {
      this.initBots(opts.botCount);
      // seed authoritative self entry
      this.syncSelfToNet();
    }
    if (this.net) this.attachNet();
    // register peers that connected during the lobby phase
    if (opts.lobbyPeers) {
      for (const p of opts.lobbyPeers) {
        this.addLobbyPeer(p.id, p.name, p.color);
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
    this.createDeathOverlay();
  }

  private createDeathOverlay() {
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
    this.deathOverlay = mesh;
    this.camera.add(mesh);
  }

  private initBots(n: number) {
    for (let i = 0; i < n; i++) {
      const id = BOT_PREFIX + i;
      const sp = this.pickSpawn(this.lp.pos);
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
      };
      this.netState.set(id, st);
      this.ensureActor(st);
      this.initBotState(st);
    }
  }

  private botName(i: number) {
    const names = ["Reaper", "Ghost", "Viper", "Havoc", "Specter", "Ronin", "Falcon", "Bandit", "Wraith", "Nomad"];
    return names[i % names.length];
  }

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

  private attachNet() {
    if (!this.net) return;
    const net = this.net;
    net.cb = {
      onStatus: (s) => {
        this.onEvent({ type: "status", data: s });
        this.pushHud(true);
      },
      onCodeReady: (code) => this.onEvent({ type: "code", data: code }),
      onJoined: (id) => {
        this.selfId = id;
        this.onEvent({ type: "joined" });
      },
      onPeerJoin: (id, name) => {
        if (this.mode === "host") {
          const color = COLORS[Math.floor(Math.random() * COLORS.length)];
          const sp = this.pickSpawn(this.lp.pos);
          const st: PState = {
            id,
            name,
            color,
            px: sp.x,
            py: 0,
            pz: sp.z,
            yaw: 0,
            pitch: 0,
            hp: PLAYER.maxHp,
            alive: true,
            isBot: false,
            firing: false,
            kills: 0,
            deaths: 0,
            killstreak: 0,
            respawnAt: 0,
            lastHurt: -99,
          };
          this.netState.set(id, st);
          // send current world snapshot to the new client
          net.sendTo(id, { t: "welcome", you: id, players: this.snapshot() });
          this.onEvent({ type: "status", data: `${name} a rejoint la partie` });
          this.pushHud(true);
        }
      },
      onPeerLeave: (id) => {
        this.netState.delete(id);
        const a = this.remote.get(id);
        if (a) {
          this.scene.remove(a.view.group);
          a.view.dispose();
          this.remote.delete(id);
        }
        this.pushHud(true);
      },
      onData: (from, msg) => this.onNetData(from, msg),
      onError: (m) => this.onEvent({ type: "error", data: m }),
    };
  }

  // ---------------- input handlers ----------------
  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (e.code === "KeyR") this.startReload();
    if (e.code === "KeyG" && this.lp.alive) this.throwGrenade();
    if (e.code === "Escape") {
      // browser exits pointer lock; handled by lock change
    }
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
    // weapon sway
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
      this.updateLocalPlayer(dt);
      this.updateWeapon(dt);
      if (this.mouseDown) this.tryFire();
      this.updateGrenades(dt);
    }
    this.updateActors(dt);
    this.updateBots(dt);
    this.updateFx(dt);
    this.updateNet(dt);
    this.pushHud(false);
  }

  // ---------------- local player ----------------
  private updateLocalPlayer(dt: number) {
    const lp = this.lp;
    if (!lp.alive) {
      if (this.mode !== "client" && this.now >= lp.respawnAt) this.handleSelfRespawn(false);
      return;
    }

    const fwd = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
    const str = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
    const moving = fwd !== 0 || str !== 0;

    const sin = Math.sin(lp.yaw);
    const cos = Math.cos(lp.yaw);
    const dirX = -sin * fwd + cos * str;
    const dirZ = -cos * fwd - sin * str;
    const len = Math.hypot(dirX, dirZ) || 1;

    // crouch
    const wantCrouch = this.keys.has("ControlLeft") || this.keys.has("KeyC");
    const sprinting = this.keys.has("ShiftLeft") && fwd > 0 && !wantCrouch;

    // sprint ready penalty
    if (sprinting) lp.sprintEnd = this.now + PLAYER.sprintReadyDelay;

    // slide trigger
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

    // accelerate / friction with air control
    let accel = PLAYER.accel * dt;
    if (!lp.onGround) accel *= PLAYER.airControlMult;
    lp.vel.x += (targetVx - lp.vel.x) * Math.min(1, accel);
    lp.vel.z += (targetVz - lp.vel.z) * Math.min(1, accel);

    // jump
    if (this.keys.has("Space") && lp.onGround && !lp.sliding) {
      lp.vy = PLAYER.jump;
      lp.onGround = false;
    }
    lp.vy -= PLAYER.gravity * dt;

    // integrate
    lp.pos.x += lp.vel.x * dt;
    lp.pos.z += lp.vel.z * dt;
    lp.pos.y += lp.vy * dt;

    // collisions
    this.collide(lp.pos, lp.vel, lp.crouch ? PLAYER.crouchHeight : PLAYER.height);

    // footstep audio + bob
    const planarSpeed = Math.hypot(lp.vel.x, lp.vel.z);
    if (lp.onGround && planarSpeed > 1.2) {
      const interval = sprinting ? 0.32 : 0.48;
      if (this.now - lp.lastStep > interval) {
        lp.lastStep = this.now;
        Sfx.footstep(sprinting);
      }
      this.bob += dt * (sprinting ? 16 : 11);
    }

    // health regen with bleeding cap
    if (this.mode !== "client" && lp.alive && this.now - lp.lastHurt > PLAYER.regenDelay && lp.hp < PLAYER.maxHp) {
      const regenMax = lp.hp <= PLAYER.bleedThreshold ? PLAYER.bleedMaxRegen : PLAYER.maxHp;
      lp.hp = Math.min(regenMax, lp.hp + PLAYER.regenRate * dt);
    }

    // reload completion
    if (lp.reloading && this.now >= lp.reloadEnd) this.finishReload();
  }

  private collide(pos: THREE.Vector3, vel: THREE.Vector3, height: number) {
    const r = PLAYER.radius;
    const colliders = this.map.colliders;
    // horizontal
    const feet = pos.y;
    const head = pos.y + height;
    for (const b of colliders) {
      if (feet < b.max.y && head > b.min.y) {
        const minX = b.min.x - r,
          maxX = b.max.x + r,
          minZ = b.min.z - r,
          maxZ = b.max.z + r;
        if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ) {
          const dxL = pos.x - minX,
            dxR = maxX - pos.x,
            dzL = pos.z - minZ,
            dzR = maxZ - pos.z;
          const m = Math.min(dxL, dxR, dzL, dzR);
          if (m === dxL) pos.x = minX;
          else if (m === dxR) pos.x = maxX;
          else if (m === dzL) pos.z = minZ;
          else pos.z = maxZ;
        }
      }
    }
    // vertical (support)
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
        this.lp.onGround = true;
      } else if (pos.y <= 0) {
        pos.y = 0;
        vel.y = 0;
        this.lp.onGround = true;
      } else {
        this.lp.onGround = false;
      }
    } else {
      this.lp.onGround = false;
    }
  }

  private updateWeapon(dt: number) {
    // recoil recovery
    this.recoil.pitch += (0 - this.recoil.pitch) * Math.min(1, dt * 9);
    this.recoil.yaw += (0 - this.recoil.yaw) * Math.min(1, dt * 9);
    // sway recovery
    this.sway.x += (0 - this.sway.x) * Math.min(1, dt * 8);
    this.sway.y += (0 - this.sway.y) * Math.min(1, dt * 8);

    const planarSpeed = Math.hypot(this.lp.vel.x, this.lp.vel.z);
    const bobX = Math.cos(this.bob) * 0.012 * Math.min(1, planarSpeed / 6);
    const bobY = Math.abs(Math.sin(this.bob)) * 0.014 * Math.min(1, planarSpeed / 6);
    const crouchDip = this.lp.crouch ? 0.05 : 0;
    const adsOffset = this.lp.ads ? 0.06 : 0;

    const g = this.weapon.group;
    g.position.set(0.17 + this.sway.x + bobX, -0.15 + bobY - crouchDip + this.sway.y, -0.42 - adsOffset);
    g.rotation.set(this.sway.y * 2, Math.PI + this.sway.x * 2, 0);

    // camera transform
    const eyeOff = this.lp.crouch ? PLAYER.eyeHeight - 0.3 : PLAYER.eyeHeight;
    this.camera.position.set(this.lp.pos.x, this.lp.pos.y + eyeOff, this.lp.pos.z);
    this.camera.rotation.y = this.lp.yaw + this.recoil.yaw;
    this.camera.rotation.x = this.lp.pitch + this.recoil.pitch;

    // ADS FOV transition
    const targetFov = this.lp.ads ? 50 : 78;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
    this.camera.updateProjectionMatrix();

    // shake
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      const s = this.shake * 0.04;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
  }

  // ---------------- shooting ----------------
  private tryFire() {
    const lp = this.lp;
    if (this.paused || !lp.alive || lp.reloading) return;
    if (this.now - lp.lastShot < WEAPON.fireRate) return;
    if (lp.ammo <= 0) {
      lp.lastShot = this.now;
      Sfx.dryFire();
      this.startReload();
      return;
    }
    lp.lastShot = this.now;
    lp.ammo--;
    lp.firingTick = true;

    this.recoil.pitch += WEAPON.recoil * (0.85 + Math.random() * 0.4);
    this.recoil.yaw += (Math.random() - 0.5) * WEAPON.recoil * 0.9;
    this.shake = Math.min(0.5, this.shake + 0.12);

    this.flashUntil = this.now + 0.035;
    this.weapon.flash.rotation.z = Math.random() * Math.PI;
    this.weapon.flash.scale.setScalar(1.2 + Math.random() * 1.2);
    this.weapon.flashGlow.scale.setScalar(1.0 + Math.random() * 1.0);
    this.spawnCasing();
    Sfx.gunshot(0);

    // ray from screen center with spread
    this.raycaster.setFromCamera(new THREE.Vector2((Math.random() - 0.5) * 0.001, (Math.random() - 0.5) * 0.001), this.camera);
    const dir = this.raycaster.ray.direction.clone();
    const sp = this.currentSpread();
    dir.x += (Math.random() - 0.5) * sp;
    dir.y += (Math.random() - 0.5) * sp;
    dir.normalize();
    this.raycaster.ray.direction.copy(dir);
    this.raycaster.far = WEAPON.range;

    const targets: THREE.Object3D[] = [...this.map.rayMeshes];
    this.remote.forEach((a) => {
      if (a.state.alive) targets.push(a.view.group);
    });
    const hits = this.raycaster.intersectObjects(targets, true);

    const muzzlePos = new THREE.Vector3();
    this.weapon.muzzle.getWorldPosition(muzzlePos);
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
          const actor = this.mode === "client" ? null : this.netState.get(targetId);
          const actorY = actor ? actor.py : (this.remote.get(targetId)?.state.py ?? 0);
          const limbDmg = this.calcLimbDmg(currentDmg, head, hitY, actorY);
          hitActor = true;
          const normal = h.normal ?? new THREE.Vector3(0, 1, 0);
          this.spawnSparks(h.point, 0xcc1133, head ? 9 : 5, normal);
          this.spawnHitRing(h.point);
          this.hitmarker = performance.now();
          if (this.mode === "client") {
            this.net?.send({ t: "fire", target: targetId, head });
          } else {
            const killed = this.applyDamage(targetId, limbDmg.dmg, head, this.selfId);
            if (killed) this.killmarker = performance.now();
          }
          finalPoint = h.point.clone();
          break;
        }

        // Environment hit — check penetration
        const mat = h.object.userData.material as string | undefined;
        if (mat === "wood" && penCount < 1) {
          penCount++;
          currentDmg = Math.round(currentDmg * WEAPON.penDmgMult);
          const normal = h.normal ?? new THREE.Vector3(0, 1, 0);
          this.spawnSparks(h.point, 0x888844, 4, normal);
          continue;
        }

        // Non-penetrable surface
        const normal = h.normal ?? new THREE.Vector3(0, 1, 0);
        this.spawnSparks(h.point, 0xbbbbbb, 4, normal);
        this.spawnDecal(h.point, normal);
        finalPoint = h.point.clone();
        break;
      }

      end = finalPoint;
    }
    this.spawnTracer(muzzlePos, end);
    void hitActor;
    this.pushHud(true);
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

  private currentSpread() {
    const planar = Math.hypot(this.lp.vel.x, this.lp.vel.z);
    let sp = WEAPON.spread + (planar / PLAYER.speed) * WEAPON.moveSpread * 0.5;
    if (this.lp.crouch) sp *= 0.6;
    if (this.lp.ads) sp *= WEAPON.adsSpreadMult;
    if (this.now < this.lp.sprintEnd) sp *= 1.8;
    if (this.now - this.lp.lastShot < 0.2) sp += 0.01;
    return sp;
  }

  private crosshairGap() {
    const planar = Math.hypot(this.lp.vel.x, this.lp.vel.z);
    let g = 6 + (planar / PLAYER.speed) * 10;
    if (this.lp.crouch) g *= 0.6;
    if (this.lp.ads) g *= 0.25;
    if (this.now - this.lp.lastShot < 0.15) g += 8;
    return g;
  }

  private startReload() {
    const lp = this.lp;
    if (lp.reloading || !lp.alive) return;
    if (lp.ammo >= WEAPON.magSize || lp.reserve <= 0) return;
    lp.reloading = true;
    lp.reloadEnd = this.now + WEAPON.reloadTime;
    Sfx.reloadSound();
    this.pushHud(true);
  }

  private finishReload() {
    const lp = this.lp;
    const need = WEAPON.magSize - lp.ammo;
    const take = Math.min(need, lp.reserve);
    lp.ammo += take;
    lp.reserve -= take;
    lp.reloading = false;
    this.pushHud(true);
  }

  // ---------------- damage / kills ----------------
  private applyDamage(targetId: string, dmg: number, head: boolean, sourceId: string): boolean {
    if (targetId === this.selfId) {
      this.takeDamage(dmg, sourceId, head);
      return !this.lp.alive;
    }
    const t = this.netState.get(targetId);
    if (!t || !t.alive) return false;
    t.hp -= dmg;
    t.lastHurt = this.now;
    if (t.hp <= 0) {
      t.hp = 0;
      t.alive = false;
      t.deaths++;
      t.killstreak = 0;
      t.respawnAt = this.now + 3;
      if (t.isBot) {
        const tb = t as any;
        const samePos = Math.hypot(t.px - (tb._lastDeathX ?? 0), t.pz - (tb._lastDeathZ ?? 0)) < 10;
        if (samePos && this.now - (tb._lastDeathTime ?? -999) < 30) {
          tb._antiCampCount = (tb._antiCampCount ?? 0) + 1;
        } else {
          tb._antiCampCount = 0;
        }
        tb._lastDeathX = t.px;
        tb._lastDeathZ = t.pz;
        tb._lastDeathTime = this.now;
      }
      this.addKill(sourceId, targetId, head);
      return true;
    }
    if (this.isClient(targetId)) {
      const s = this.netState.get(sourceId);
      const from = s ? [s.px, s.py, s.pz] : [t.px, t.py, t.pz];
      this.net?.sendTo(targetId, { t: "hurt", amount: dmg, from });
    }
    return false;
  }

  private addKill(sourceId: string, victimId: string, head: boolean) {
    if (sourceId === this.selfId) {
      this.lp.kills++;
      this.lp.killstreak++;
    } else {
      const s = this.netState.get(sourceId);
      if (s) {
        s.kills++;
        s.killstreak++;
      }
    }
    const victim = this.netState.get(victimId);
    const killerName = sourceId === this.selfId ? this.lp.name : this.netState.get(sourceId)?.name ?? "???";
    const victimName = victim?.name ?? "???";
    const involvesSelf = victimId === this.selfId || sourceId === this.selfId;
    this.handleKillFeed(killerName, victimName, head, involvesSelf);
    this.broadcastAll({ t: "kill", killer: killerName, victim: victimName, head, killerId: sourceId, victimId });
    if (sourceId === this.selfId) this.onSelfKill(victimName, head);
  }

  private takeDamage(dmg: number, sourceId: string, head: boolean) {
    const lp = this.lp;
    if (!lp.alive) return;
    lp.hp -= dmg;
    lp.lastHurt = this.now;
    this.triggerHurtVisual(sourceId);
    if (lp.hp <= 0) {
      lp.hp = 0;
      lp.deaths++;
      lp.killstreak = 0;
      this.addKill(sourceId, this.selfId, head);
      this.handleSelfDeath();
    }
  }

  private triggerHurtVisual(sourceId: string) {
    const s = this.netState.get(sourceId);
    if (s) {
      const dx = s.px - this.lp.pos.x;
      const dz = s.pz - this.lp.pos.z;
      const worldAng = Math.atan2(dx, dz);
      const fwdAng = Math.atan2(-Math.sin(this.lp.yaw), -Math.cos(this.lp.yaw));
      let rel = worldAng - fwdAng;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      this.damageDir = rel;
    }
    this.damageTime = performance.now();
    this.shake = Math.min(0.6, this.shake + 0.3);
    Sfx.hurtSound();
    this.pushHud(true);
  }

  private handleKillFeed(killer: string, victim: string, head: boolean, self: boolean) {
    this.killfeed.push({ id: this.kfId++, killer, victim, weapon: WEAPON.name, head, self, time: performance.now() });
    if (this.killfeed.length > 6) this.killfeed.shift();
  }

  private onSelfKill(victim: string, head: boolean) {
    this.killmarker = performance.now();
    let msg = head ? "TIR À LA TÊTE" : `${victim.toUpperCase()} ÉLIMINÉ`;
    if (this.lp.killstreak >= 3) msg = `${this.lp.killstreak} ÉLIMINATIONS D'AFFILÉE`;
    this.flashMessage(msg);
    Sfx.hitMarker();
  }

  private handleSelfDeath() {
    if (!this.lp.alive) return;
    this.lp.alive = false;
    this.lp.respawnAt = this.now + 3;
    Sfx.deathSound();
    this.flashMessage("VOUS ÊTES MORT");
    this.pushHud(true);
  }

  private handleSelfRespawn(fromWorld: boolean) {
    const lp = this.lp;
    if (lp.alive) return;
    if (fromWorld && this.selfState) {
      lp.pos.set(this.selfState.px, this.selfState.py, this.selfState.pz);
      lp.yaw = this.selfState.yaw;
    } else {
      const sp = this.pickSpawn(lp.pos);
      lp.pos.copy(sp);
    }
    lp.hp = PLAYER.maxHp;
    lp.alive = true;
    lp.vel.set(0, 0, 0);
    lp.vy = 0;
    lp.ammo = WEAPON.magSize;
    lp.reloading = false;
    this.flashMessage("PRÊT AU COMBAT");
    this.pushHud(true);
  }

  private flashMessage(msg: string) {
    this.message = msg;
    this.messageTime = performance.now();
  }
  private message: string | null = null;
  private messageTime = 0;

  // ---------------- bots ----------------
  private initBotState(bot: PState) {
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
    b._spawnTime = this.now;
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

  private botDiffMultipliers(d: string) {
    switch (d) {
      case "easy": return { acc: 0.4, reaction: 0.35, speed: 3.0, hs: 0.04, strafe: 0 };
      case "medium": return { acc: 0.7, reaction: 0.2, speed: 4.6, hs: 0.12, strafe: 1 };
      case "hard": return { acc: 0.95, reaction: 0.1, speed: 5.8, hs: 0.2, strafe: 2 };
      default: return { acc: 0.7, reaction: 0.2, speed: 4.6, hs: 0.12, strafe: 1 };
    }
  }

  private botHasLOS(bot: PState, tx: number, tz: number): boolean {
    const eye = new THREE.Vector3(bot.px, 1.5, bot.pz);
    const targ = new THREE.Vector3(tx, 1.5, tz);
    const dir = targ.clone().sub(eye);
    const dist = dir.length();
    if (dist < 1) return true;
    dir.normalize();
    this.raycaster.set(eye, dir);
    this.raycaster.far = dist;
    return this.raycaster.intersectObjects(this.map.rayMeshes, false).length === 0;
  }

  private botUpdateAwareness(bot: PState) {
    const b = bot as any;
    let seesEnemy = false;
    for (const p of this.netState.values()) {
      if (p.id === bot.id || !p.alive) continue;
      if (Math.hypot(p.px - bot.px, p.pz - bot.pz) < 50 && this.botHasLOS(bot, p.px, p.pz)) {
        seesEnemy = true; break;
      }
    }
    if (this.lp.alive && Math.hypot(this.lp.pos.x - bot.px, this.lp.pos.z - bot.pz) < 50 &&
        this.botHasLOS(bot, this.lp.pos.x, this.lp.pos.z)) seesEnemy = true;
    if (seesEnemy) {
      b._awareness = "alert";
      b._alertDecay = this.now + 6;
    } else if (this.now - b._lastSeenEnemy < 3) {
      b._awareness = "searching";
    } else if (this.now - b._noiseTime < 4) {
      b._awareness = "alert";
      b._alertDecay = this.now + 3;
    } else if (this.now > b._alertDecay) {
      b._awareness = "unaware";
    }
  }

  private botFindCoverPos(bot: PState, threatX: number, threatZ: number): { x: number; z: number } | null {
    const tdx = threatX - bot.px;
    const tdz = threatZ - bot.pz;
    if (Math.hypot(tdx, tdz) < 1) return null;
    const dirToThreat = new THREE.Vector3(tdx, 0, tdz).normalize();
    let best: { x: number; z: number } | null = null;
    let bestScore = -Infinity;
    for (const col of this.map.colliders) {
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
    const b = bot as any;
    const diff = b._difficulty;
    const dist = Math.hypot(target.px - bot.px, target.pz - bot.pz);
    const ideal = 13;
    if (this.now - b._spawnTime < 2) {
      b._moveMode = dist < 20 ? "retreat" : "approach";
      return;
    }
    if (b._antiCampCount >= 2 && dist < 30 && this.now - b._lastDeathTime < 8) {
      b._moveMode = "flank";
      return;
    }
    if (bot.hp < 25) {
      b._moveMode = "retreatHeal";
      return;
    }
    if ((bot.lastHurt ?? -999) > this.now - 2) {
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

  private updateBots(dt: number) {
    if (this.mode === "client") return;
    this.botAccum += dt;
    const decide = this.botAccum > 0.12;
    if (decide) this.botAccum = 0;

    for (const p of this.netState.values()) {
      if (p.id !== this.selfId && !p.isBot && !p.alive && this.now >= (p.respawnAt ?? 0)) {
        this.respawnActor(p);
      }
    }

    this.botSharedIntel = this.botSharedIntel.filter(i => this.now - i.time < 8);

    // Propagate gunshot noises to nearby bots
    for (const bot of this.netState.values()) {
      if (!bot.isBot || !bot.alive) continue;
      const b = bot as any;
      if (b._difficulty === undefined) this.initBotState(bot);
      if (bot.firing) {
        for (const other of this.netState.values()) {
          if (!other.isBot || other.id === bot.id || !other.alive) continue;
          if (Math.hypot(other.px - bot.px, other.pz - bot.pz) < 40) {
            (other as any)._noiseX = bot.px;
            (other as any)._noiseZ = bot.pz;
            (other as any)._noiseTime = this.now;
          }
        }
      }
    }
    if (this.lp.firingTick && this.lp.alive) {
      for (const other of this.netState.values()) {
        if (!other.isBot || !other.alive) continue;
        if (Math.hypot(other.px - this.lp.pos.x, other.pz - this.lp.pos.z) < 40) {
          (other as any)._noiseX = this.lp.pos.x;
          (other as any)._noiseZ = this.lp.pos.z;
          (other as any)._noiseTime = this.now;
        }
      }
    }

    for (const bot of this.netState.values()) {
      if (!bot.isBot) continue;
      if (!bot.alive) {
        if (this.now >= (bot.respawnAt ?? 0)) this.respawnActor(bot);
        continue;
      }

      const b = bot as any;
      bot.firing = this.now < b._fireUntil;

      // Health regen for bots
      if ((bot.lastHurt ?? -999) < this.now - 4 && bot.hp < PLAYER.maxHp) {
        bot.hp = Math.min(PLAYER.maxHp, bot.hp + PLAYER.regenRate * dt);
      }

      this.botUpdateAwareness(bot);

      const target = this.botFindTarget(bot);

      if (target) {
        b._lastKnownX = target.px;
        b._lastKnownZ = target.pz;
        b._lastSeenEnemy = this.now;
        this.botSharedIntel.push({ x: target.px, z: target.pz, time: this.now, reporter: bot.id });

        if (decide) {
          this.botDecide(bot, target);
          this.botChooseMoveMode(bot, target);
        }
        this.botMove(bot, target, dt);
      } else if (this.now - b._noiseTime < 4 || b._awareness === "searching") {
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

      const B = this.map.bounds - 1.5;
      bot.px = Math.max(-B, Math.min(B, bot.px));
      bot.pz = Math.max(-B, Math.min(B, bot.pz));
    }
  }

  private botFindTarget(bot: PState): PState | null {
    let best: PState | null = null;
    let bestScore = -Infinity;
    for (const p of this.netState.values()) {
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
    const b = bot as any;
    const mult = this.botDiffMultipliers(b._difficulty);
    const dx = target.px - bot.px;
    const dz = target.pz - bot.pz;
    const dist = Math.hypot(dx, dz);
    bot.yaw = Math.atan2(dx, dz);

    if (this.now - b._spawnTime < 1) return;
    if (this.now - b._lastSeenEnemy < mult.reaction) return;

    const hasLOS = this.botHasLOS(bot, target.px, target.pz);
    const campPenalty = b._antiCampCount >= 2 ? 0.2 : 1;

    if (hasLOS && dist < 38) {
      const fireInterval = 0.16 + mult.reaction * 0.6 + Math.random() * 0.08;
      if (this.now - b._lastShot > fireInterval) {
        b._lastShot = this.now;
        bot.firing = true;
        b._fireUntil = this.now + 0.08;

        const dToHost = Math.hypot(this.lp.pos.x - bot.px, this.lp.pos.z - bot.pz);
        Sfx.gunshot(dToHost);

        const hitChance = Math.max(0.15, 0.85 - dist / 60) * mult.acc * campPenalty;
        if (Math.random() < hitChance) {
          const head = Math.random() < mult.hs;
          const dmg = head ? Math.round(WEAPON.damage * WEAPON.headMult) : WEAPON.damage;
          if (target.id === this.selfId) this.takeDamage(dmg, bot.id, head);
          else this.applyDamage(target.id, dmg, head, bot.id);
        }
      }
    } else if (dist < 38 && this.now - b._lastSeenEnemy < 3 && Math.random() < 0.3 * mult.acc) {
      // Suppressive fire
      if (this.now - b._lastShot > 0.35 + mult.reaction * 0.8) {
        b._lastShot = this.now;
        bot.firing = true;
        b._fireUntil = this.now + 0.06;

        const dToHost = Math.hypot(this.lp.pos.x - bot.px, this.lp.pos.z - bot.pz);
        Sfx.gunshot(dToHost);
      }
    }
  }

  private botMove(bot: PState, target: PState, dt: number) {
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
        for (const p of this.netState.values()) {
          if (p.id === bot.id || !p.alive) continue;
          const pd = Math.hypot(p.px - bot.px, p.pz - bot.pz);
          if (pd < nearest) { nearest = pd; awayX = bot.px - p.px; awayZ = bot.pz - p.pz; }
        }
        if (this.lp.alive) {
          const pd = Math.hypot(this.lp.pos.x - bot.px, this.lp.pos.z - bot.pz);
          if (pd < nearest) { awayX = bot.px - this.lp.pos.x; awayZ = bot.pz - this.lp.pos.z; }
        }
        const aLen = Math.hypot(awayX, awayZ) || 1;
        mvx = awayX / aLen; mvz = awayZ / aLen;
        break;
      }
      case "strafe":
        if (dist > 0.5) {
          const s = mult.strafe >= 2
            ? Math.sin(this.now * 1.2 + b._strafePhase) + Math.sin(this.now * 0.7 + b._strafePhase * 2)
            : (Math.sin(this.now * (0.6 + mult.strafe * 0.2) + b._strafePhase) > 0 ? 1 : -1);
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
          const side = Math.sin(this.now * 0.3 + b._strafePhase) > 0 ? 1 : -1;
          mvx = (-dz / dist) * side + (dx / dist) * 0.5;
          mvz = (dx / dist) * side + (dz / dist) * 0.5;
          const fl = Math.hypot(mvx, mvz) || 1;
          mvx /= fl; mvz /= fl;
        }
        break;
      case "ambush": {
        const s = Math.sin(this.now * 0.5 + b._strafePhase) * 0.3;
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
    const r = PLAYER.radius;
    const feet = 0, head = PLAYER.height;
    for (const b of this.map.colliders) {
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

  private respawnActor(t: PState) {
    const sp = this.pickSpawn(new THREE.Vector3(this.lp.pos.x, 0, this.lp.pos.z));
    t.px = sp.x;
    t.py = 0;
    t.pz = sp.z;
    t.hp = PLAYER.maxHp;
    t.alive = true;
    t.killstreak = 0;
    if (t.isBot) this.initBotState(t);
  }

  private pickSpawn(avoid: THREE.Vector3): THREE.Vector3 {
    const pts = this.map.spawnPoints;
    let best = pts[0],
      bestD = -1;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[(i + Math.floor(Math.random() * pts.length)) % pts.length];
      const d = Math.hypot(p.x - avoid.x, p.z - avoid.z);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
    return best.clone();
  }

  private addLobbyPeer(id: string, name: string, color: number) {
    if (this.mode !== "host") return;
    const sp = this.pickSpawn(this.lp.pos);
    const st: PState = {
      id,
      name,
      color,
      px: sp.x,
      py: 0,
      pz: sp.z,
      yaw: 0,
      pitch: 0,
      hp: PLAYER.maxHp,
      alive: true,
      isBot: false,
      firing: false,
      kills: 0,
      deaths: 0,
      killstreak: 0,
      respawnAt: 0,
      lastHurt: -99,
    };
    this.netState.set(id, st);
    this.ensureActor(st);
    this.net?.sendTo(id, { t: "welcome", you: id, players: this.snapshot() });
    this.onEvent({ type: "status", data: `${name} a rejoint la partie` });
    this.pushHud(true);
  }

  // ---------------- actors (remote players/bots visuals) ----------------
  private ensureActor(st: PState) {
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
    // health regen for remote humans (host/solo)
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
      // firing transition
      if (st.firing && !a.prevFiring) {
        a.view.setFiring(true, this.now);
        const d = Math.hypot(a.curPos.x - this.lp.pos.x, a.curPos.z - this.lp.pos.z);
        Sfx.gunshot(d);
      }
      a.prevFiring = st.firing;
    }
  }

  // ---------------- fx ----------------
  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3) {
    let t = this.tracers.find((x) => x.life <= 0);
    if (!t) {
      if (this.tracers.length > 24) return;
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.025, 1, 6), coreMat);
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.06, 1, 6), glowMat);
      const group = new THREE.Group();
      group.add(glow);
      group.add(core);
      this.scene.add(group);
      t = { group, core, glow, life: 0 };
      this.tracers.push(t);
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

  private spawnSparks(at: THREE.Vector3, color: number, count: number, normal?: THREE.Vector3) {
    const isBlood = color === 0xcc1133;
    for (let i = 0; i < count; i++) {
      let s = this.sparks.find((x) => x.life <= 0);
      if (!s) {
        if (this.sparks.length > 60) return;
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), mat);
        this.scene.add(mesh);
        s = { mesh, vel: new THREE.Vector3(), life: 0 };
        this.sparks.push(s);
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

  private spawnDecal(at: THREE.Vector3, normal: THREE.Vector3) {
    let d = this.decals.find((x) => x.life <= 0);
    if (!d) {
      if (this.decals.length > 20) return;
      const mat = new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.08, 8), mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      d = { mesh, life: 0 };
      this.decals.push(d);
    }
    d.mesh.position.copy(at);
    d.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    (d.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.random() * 0.2;
    d.mesh.scale.setScalar(0.6 + Math.random() * 0.8);
    d.life = 3 + Math.random() * 2;
  }

  private spawnCasing() {
    const pos = new THREE.Vector3();
    this.weapon.muzzle.getWorldPosition(pos);
    const side = (Math.random() > 0.5 ? 1 : -1);
    pos.x += Math.sin(this.lp.yaw) * 0.12 * side;
    pos.z += Math.cos(this.lp.yaw) * 0.12 * side;
    pos.y += 0.05;
    let c = this.casings.find((x) => x.life <= 0);
    if (!c) {
      if (this.casings.length > 10) return;
      const mat = new THREE.MeshStandardMaterial({ color: 0xbb8833, metalness: 0.6, roughness: 0.4, transparent: true });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.035, 0.012), mat);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      c = { mesh, vel: new THREE.Vector3(), angVel: new THREE.Vector3(), rot: new THREE.Euler(), life: 0 };
      this.casings.push(c);
    }
    c.mesh.position.copy(pos);
    c.vel.set(
      -Math.sin(this.lp.yaw) * 1.5 * side + (Math.random() - 0.5) * 0.5,
      1.8 + Math.random() * 1.2,
      -Math.cos(this.lp.yaw) * 1.5 * side + (Math.random() - 0.5) * 0.5
    );
    c.angVel.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
    c.rot.set(0, 0, 0);
    c.life = 2;
  }

  private spawnHitRing(at: THREE.Vector3) {
    if (!this.hitRing) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.06, 24), mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.scene.add(mesh);
      this.hitRing = mesh;
    }
    this.hitRing.position.copy(at);
    this.hitRing.visible = true;
    this.hitRing.scale.setScalar(0.5);
    (this.hitRing.material as THREE.MeshBasicMaterial).opacity = 0.8;
    this.hitRingTime = performance.now();
  }

  private updateFx(dt: number) {
    // muzzle flash
    if (this.now < this.flashUntil) {
      this.weapon.flash.visible = true;
      this.weapon.flashGlow.visible = true;
      const t = (this.flashUntil - this.now) / 0.035;
      this.weapon.flashLight.intensity = t * 12;
      (this.weapon.flashGlow.material as THREE.MeshBasicMaterial).opacity = t * 0.35;
    } else {
      this.weapon.flash.visible = false;
      this.weapon.flashGlow.visible = false;
      this.weapon.flashLight.intensity = 0;
    }
    for (const t of this.tracers) {
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
    for (const s of this.sparks) {
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
    for (const d of this.decals) {
      if (d.life > 0) {
        d.life -= dt;
        (d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, d.life / 5) * 0.6;
        d.mesh.visible = d.life > 0;
      } else {
        d.mesh.visible = false;
      }
    }
    for (const c of this.casings) {
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
    if (this.hitRing) {
      if (this.hitRing.visible) {
        const elapsed = (performance.now() - this.hitRingTime) / 1000;
        if (elapsed < 0.3) {
          const t = elapsed / 0.3;
          this.hitRing.scale.setScalar(0.1 + t * 2);
          (this.hitRing.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
          this.hitRing.quaternion.copy(this.camera.quaternion);
        } else {
          this.hitRing.visible = false;
        }
      }
    }
    if (this.deathOverlay) {
      const target = this.lp.alive ? 0 : 0.6;
      const speed = this.lp.alive ? 3 : 2;
      const cur = (this.deathOverlay.material as THREE.MeshBasicMaterial).opacity;
      (this.deathOverlay.material as THREE.MeshBasicMaterial).opacity = cur + (target - cur) * Math.min(1, dt * speed);
    }
  }

  // ---------------- networking ----------------
  private isClient(id: string) {
    return this.mode === "host" && !!this.net?.conns.has(id);
  }

  private broadcastAll(msg: NetMsg) {
    if (this.mode === "host") this.net?.broadcast(msg);
    // solo: no-op (handled locally)
  }

  private snapshot(): PState[] {
    const arr: PState[] = [];
    for (const p of this.netState.values()) arr.push({ ...p });
    return arr;
  }

  private syncSelfToNet() {
    if (this.mode === "client") return;
    const lp = this.lp;
    this.netState.set(this.selfId, {
      id: this.selfId,
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
    });
    lp.firingTick = false;
  }

  private updateNet(dt: number) {
    this.netAccum += dt;
    if (this.netAccum < 0.055) return;
    this.netAccum = 0;

    if (this.mode === "client") {
      this.net?.send({
        t: "me",
        px: this.lp.pos.x,
        py: this.lp.pos.y,
        pz: this.lp.pos.z,
        yaw: this.lp.yaw,
        pitch: this.lp.pitch,
        firing: this.lp.firingTick,
      });
      this.lp.firingTick = false;
    } else {
      // host or solo: keep authoritative self entry fresh (bots target it)
      this.syncSelfToNet();
      if (this.mode === "host") this.net?.broadcast({ t: "world", players: this.snapshot() });
    }
  }

  private onNetData(_from: string, msg: NetMsg) {
    switch (msg.t) {
      case "welcome":
        if (this.mode === "client") {
          this.selfId = String(msg.you);
          const players = (msg.players as PState[]) ?? [];
          for (const p of players) this.applyWorldEntry(p);
        }
        break;
      case "world":
        if (this.mode === "client") {
          const players = (msg.players as PState[]) ?? [];
          for (const p of players) this.applyWorldEntry(p);
        }
        break;
      case "me":
        if (this.mode === "host") {
          const t = this.netState.get(_from);
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
        // client reports a hit on an actor; host resolves authoritatively
        if (this.mode === "host") {
          const target = String(msg.target);
          const head = Boolean(msg.head);
          const dmg = head ? Math.round(WEAPON.damage * WEAPON.headMult) : WEAPON.damage;
          this.applyDamage(target, dmg, head, _from);
        }
        break;
      case "hurt":
        if (this.mode === "client") {
          this.lp.lastHurt = this.now;
          const from = msg.from as number[] | undefined;
          if (from) {
            const dx = from[0] - this.lp.pos.x;
            const dz = from[2] - this.lp.pos.z;
            const fwdAng = Math.atan2(-Math.sin(this.lp.yaw), -Math.cos(this.lp.yaw));
            let rel = Math.atan2(dx, dz) - fwdAng;
            while (rel > Math.PI) rel -= Math.PI * 2;
            while (rel < -Math.PI) rel += Math.PI * 2;
            this.damageDir = rel;
          }
          this.damageTime = performance.now();
          this.shake = Math.min(0.6, this.shake + 0.3);
          Sfx.hurtSound();
          this.pushHud(true);
        }
        break;
      case "kill":
        if (this.mode === "client") {
          const killer = String(msg.killer);
          const victim = String(msg.victim);
          const head = Boolean(msg.head);
          const killerId = String(msg.killerId);
          const victimId = String(msg.victimId);
          const involvesSelf = victimId === this.selfId || killerId === this.selfId;
          this.handleKillFeed(killer, victim, head, involvesSelf);
          if (killerId === this.selfId) {
            this.killmarker = performance.now();
            this.flashMessage(head ? "TIR À LA TÊTE" : "ENNEMI ÉLIMINÉ");
            Sfx.hitMarker();
          }
          if (victimId === this.selfId) this.handleSelfDeath();
        }
        break;
      case "grenade_explode":
        {
          const px = Number(msg.px);
          const py = Number(msg.py);
          const pz = Number(msg.pz);
          const pos = new THREE.Vector3(px, py, pz);
          this.spawnExplosionFx(pos);
          Sfx.explosion();
          if (this.mode === "host") {
            const source = String(msg.owner || this.selfId);
            this.grenadeAoeDamage(pos, source);
            this.net?.broadcast({ t: "grenade_explode", px: msg.px, py: msg.py, pz: msg.pz, owner: msg.owner }, _from);
          }
        }
        break;
    }
  }

  private applyWorldEntry(p: PState) {
    if (p.id === this.selfId) {
      const wasAlive = this.selfState?.alive ?? true;
      this.selfState = p;
      // detect respawn / death transitions
      if (this.lp.alive && !p.alive) {
        this.handleSelfDeath();
      } else if (!this.lp.alive && p.alive) {
        this.handleSelfRespawn(true);
      } else {
        this.lp.hp = p.hp;
      }
      void wasAlive;
      return;
    }
    const a = this.ensureActor(p);
    // update state (clone to keep reference stable for actor)
    Object.assign(a.state, p);
    if (!p.alive && p.respawnAt) a.state.respawnAt = p.respawnAt;
  }

  // ---------------- HUD ----------------
  private pushHud(force: boolean) {
    this.hudAccum += 0;
    if (!force) {
      // throttle continuous pushes ~12Hz
      // implemented via separate accumulator below
    }
    this.throttledHud(force);
  }

  private lastHudPush = 0;
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
      spread: this.crosshairGap(),
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
    };
    this.onHud(state);
  }

  private playerCount() {
    if (this.mode === "client") return this.remote.size + 1;
    let n = 1; // self
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
      if (!p.firing && d > 12) continue; // only show firing or very close
      const f = dx * fwd.x + dz * fwd.z;
      const r = dx * right.x + dz * right.z;
      blips.push({ x: r, z: f, enemy: true, firing: p.firing });
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
        });
      });
    }
    rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    return rows;
  }

  // ---------------- grenades ----------------
  private throwGrenade() {
    if (this.now - this.lastGrenade < 1) return;
    this.lastGrenade = this.now;
    const lp = this.lp;
    let g = this.grenades.find((x) => !x.alive);
    if (!g) {
      if (this.grenades.length >= GRENADE.poolSize) return;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 })
      );
      mesh.castShadow = true;
      mesh.visible = false;
      this.scene.add(mesh);
      g = { mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), timer: 0, alive: false, owner: "" };
      this.grenades.push(g);
    }
    const eye = new THREE.Vector3(lp.pos.x, lp.pos.y + PLAYER.eyeHeight, lp.pos.z);
    const sin = Math.sin(lp.yaw);
    const cos = Math.cos(lp.yaw);
    const fwd = new THREE.Vector3(-sin, 0, -cos);
    g.pos.copy(eye).add(fwd.clone().multiplyScalar(0.8));
    g.vel.set(fwd.x * GRENADE.throwSpeed, 4.5, fwd.z * GRENADE.throwSpeed);
    g.timer = GRENADE.cookTime;
    g.alive = true;
    g.owner = this.selfId;
    g.mesh.position.copy(g.pos);
    g.mesh.visible = true;
    Sfx.grenadeCook();
  }

  private updateGrenades(dt: number) {
    for (const g of this.grenades) {
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

  private grenadeCollide(g: Grenade) {
    const r = 0.12;
    for (const b of this.map.colliders) {
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

  private grenadeExplode(g: Grenade) {
    g.alive = false;
    g.mesh.visible = false;
    this.spawnExplosionFx(g.pos);
    Sfx.explosion();
    this.shake = Math.min(0.8, this.shake + 0.5);
    if (this.mode === "host" || this.mode === "solo") {
      this.grenadeAoeDamage(g.pos, g.owner);
      if (this.mode === "host") {
        this.net?.broadcast({ t: "grenade_explode", px: g.pos.x, py: g.pos.y, pz: g.pos.z, owner: g.owner });
      }
    } else if (this.mode === "client") {
      this.net?.send({ t: "grenade_explode", px: g.pos.x, py: g.pos.y, pz: g.pos.z, owner: g.owner });
    }
  }

  private spawnExplosionFx(pos: THREE.Vector3) {
    this.spawnSparks(pos, 0xff6600, 15);
    this.spawnSparks(pos, 0xffcc00, 10);
    this.spawnSparks(pos, 0xff3300, 8);
  }

  private grenadeAoeDamage(pos: THREE.Vector3, source: string) {
    const dToSelf = this.lp.pos.distanceTo(pos);
    if (dToSelf < GRENADE.radius) {
      const dmg = Math.round(GRENADE.maxDamage * (1 - dToSelf / GRENADE.radius));
      this.takeDamage(Math.max(5, dmg), source, false);
    }
    for (const a of this.remote.values()) {
      if (!a.state.alive) continue;
      const d = new THREE.Vector3(a.state.px, a.state.py + 0.9, a.state.pz).distanceTo(pos);
      if (d < GRENADE.radius) {
        const dmg = Math.round(GRENADE.maxDamage * (1 - d / GRENADE.radius));
        this.applyDamage(a.state.id, Math.max(5, dmg), false, source);
      }
    }
    for (const t of this.netState.values()) {
      if (t.id === this.selfId || t.id === source || !t.alive) continue;
      if (t.isBot) {
        const d = new THREE.Vector3(t.px, t.py + 0.9, t.pz).distanceTo(pos);
        if (d < GRENADE.radius) {
          const dmg = Math.round(GRENADE.maxDamage * (1 - d / GRENADE.radius));
          this.applyDamage(t.id, Math.max(5, dmg), false, source);
        }
      }
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
    try {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    } catch {
      /* ignore */
    }
  }
}
