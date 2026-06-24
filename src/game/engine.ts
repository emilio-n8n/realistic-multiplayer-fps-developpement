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
  mesh: THREE.Mesh;
  life: number;
}
interface Spark {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
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
  };

  private remote = new Map<string, RemoteActor>();
  private netState = new Map<string, PState>(); // authoritative (solo/host)
  private selfState: PState | null = null; // client mirror of self

  // fx
  private tracers: Tracer[] = [];
  private sparks: Spark[] = [];
  private flashUntil = 0;
  private shake = 0;
  private recoil = { pitch: 0, yaw: 0 };
  private bob = 0;
  private sway = new THREE.Vector2();
  private damageDir: number | null = null;
  private damageTime = 0;
  private hitmarker = 0;
  private killmarker = 0;

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
    if (e.code === "Escape") {
      // browser exits pointer lock; handled by lock change
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);

  private onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (!this.locked) {
      this.requestLock();
      return;
    }
    this.mouseDown = true;
  };
  private onMouseUp = () => (this.mouseDown = false);

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
      // respawn is host/solo-authoritative here; clients wait for the world update
      if (this.mode !== "client" && this.now >= lp.respawnAt) this.handleSelfRespawn(false);
      return;
    }

    // crouch
    const wantCrouch = this.keys.has("ControlLeft") || this.keys.has("KeyC");
    lp.crouch = wantCrouch;

    const fwd = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
    const str = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
    const moving = fwd !== 0 || str !== 0;
    const sprinting = this.keys.has("ShiftLeft") && fwd > 0 && !lp.crouch;

    const sin = Math.sin(lp.yaw);
    const cos = Math.cos(lp.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    const dirX = -sin * fwd + cos * str;
    const dirZ = -cos * fwd - sin * str;
    const len = Math.hypot(dirX, dirZ) || 1;

    let speed = PLAYER.speed;
    if (sprinting) speed *= PLAYER.sprintMult;
    else if (lp.crouch) speed *= PLAYER.crouchMult;

    const targetVx = (dirX / len) * speed * (moving ? 1 : 0);
    const targetVz = (dirZ / len) * speed * (moving ? 1 : 0);

    // accelerate / friction
    const accel = PLAYER.accel * dt;
    lp.vel.x += (targetVx - lp.vel.x) * Math.min(1, accel);
    lp.vel.z += (targetVz - lp.vel.z) * Math.min(1, accel);

    // jump
    if (this.keys.has("Space") && lp.onGround) {
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

    // health regen (solo/host authoritative; client handled via world)
    if (this.mode !== "client" && lp.alive && this.now - lp.lastHurt > PLAYER.regenDelay && lp.hp < PLAYER.maxHp) {
      lp.hp = Math.min(PLAYER.maxHp, lp.hp + PLAYER.regenRate * dt);
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

    const g = this.weapon.group;
    g.position.set(0.17 + this.sway.x + bobX, -0.15 + bobY - crouchDip + this.sway.y, -0.42);
    g.rotation.set(this.sway.y * 2, Math.PI + this.sway.x * 2, 0);

    // camera transform
    this.camera.position.set(this.lp.pos.x, this.lp.pos.y + (this.lp.crouch ? PLAYER.eyeHeight - 0.3 : PLAYER.eyeHeight), this.lp.pos.z);
    this.camera.rotation.y = this.lp.yaw + this.recoil.yaw;
    this.camera.rotation.x = this.lp.pitch + this.recoil.pitch;

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

    this.flashUntil = this.now + 0.045;
    this.weapon.flash.rotation.z = Math.random() * Math.PI;
    this.weapon.flash.scale.setScalar(0.8 + Math.random() * 0.6);
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
      const h = hits[0];
      end = h.point.clone();
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData.actorId === undefined) o = o.parent;
      if (o) {
        const targetId = o.userData.actorId as string;
        const head = h.object.userData.part === "head";
        const dmg = head ? Math.round(WEAPON.damage * WEAPON.headMult) : WEAPON.damage;
        hitActor = true;
        this.spawnSparks(h.point, 0xcc1133, head ? 9 : 5);
        this.hitmarker = performance.now();
        if (this.mode === "client") {
          this.net?.send({ t: "fire", target: targetId, head });
        } else {
          const killed = this.applyDamage(targetId, dmg, head, this.selfId);
          if (killed) this.killmarker = performance.now();
        }
      } else {
        this.spawnSparks(h.point, 0xbbbbbb, 4);
      }
    }
    this.spawnTracer(muzzlePos, end);
    void hitActor;
    this.pushHud(true);
  }

  private currentSpread() {
    const planar = Math.hypot(this.lp.vel.x, this.lp.vel.z);
    let sp = WEAPON.spread + (planar / PLAYER.speed) * WEAPON.moveSpread * 0.5;
    if (this.lp.crouch) sp *= 0.6;
    if (this.now - this.lp.lastShot < 0.2) sp += 0.01;
    return sp;
  }

  private crosshairGap() {
    const planar = Math.hypot(this.lp.vel.x, this.lp.vel.z);
    let g = 6 + (planar / PLAYER.speed) * 10;
    if (this.lp.crouch) g *= 0.6;
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
  private updateBots(dt: number) {
    if (this.mode === "client") return;
    this.botAccum += dt;
    const decide = this.botAccum > 0.12;
    if (decide) this.botAccum = 0;

    // respawn dead human players (clients) — host authoritative
    for (const p of this.netState.values()) {
      if (p.id !== this.selfId && !p.isBot && !p.alive && this.now >= (p.respawnAt ?? 0)) {
        this.respawnActor(p);
      }
    }

    for (const bot of this.netState.values()) {
      if (!bot.isBot) continue;
      if (!bot.alive) {
        if (this.now >= (bot.respawnAt ?? 0)) this.respawnActor(bot);
        continue;
      }
      bot.firing = this.now < ((bot as any)._fireUntil ?? 0);
      const target = this.botFindTarget(bot);
      if (target) {
        if (decide) this.botDecide(bot, target);
        this.botMove(bot, target, dt);
      } else {
        // idle wander
        bot.px += Math.cos(this.now * 0.3 + bot.id.length) * dt * 1.5;
      }
      // clamp to arena
      const B = this.map.bounds - 1.5;
      bot.px = Math.max(-B, Math.min(B, bot.px));
      bot.pz = Math.max(-B, Math.min(B, bot.pz));
    }
  }

  private botFindTarget(bot: PState): PState | null {
    let best: PState | null = null;
    let bestD = Infinity;
    for (const p of this.netState.values()) {
      if (p.id === bot.id || !p.alive) continue;
      const d = Math.hypot(p.px - bot.px, p.pz - bot.pz);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    // also target the local (host) player if close & alive
    if (this.lp.alive) {
      const d = Math.hypot(this.lp.pos.x - bot.px, this.lp.pos.z - bot.pz);
      if (d < bestD) {
        bestD = d;
        // represent local as a pseudo-target via netState? we handle via dedicated
      }
    }
    return best;
  }

  private botDecide(bot: PState, target: PState) {
    const dx = target.px - bot.px;
    const dz = target.pz - bot.pz;
    const dist = Math.hypot(dx, dz);
    bot.yaw = Math.atan2(dx, dz);
    // line of sight
    const eye = new THREE.Vector3(bot.px, 1.5, bot.pz);
    const targ = new THREE.Vector3(target.px, 1.5, target.pz);
    const dir = targ.clone().sub(eye);
    const distToT = dir.length();
    dir.normalize();
    this.raycaster.set(eye, dir);
    this.raycaster.far = distToT;
    const blocked = this.raycaster.intersectObjects(this.map.rayMeshes, false).length > 0;
    if (!blocked && dist < 38 && (bot as any)._fireCd === undefined) (bot as any)._fireCd = 0;
    if (!blocked && dist < 38 && this.now - ((bot as any)._lastShot ?? 0) > 0.16 + Math.random() * 0.12) {
        (bot as any)._lastShot = this.now;
        bot.firing = true;
        (bot as any)._fireUntil = this.now + 0.08;
        const hitChance = Math.max(0.22, 0.8 - dist / 55);
      if (Math.random() < hitChance) {
        const head = Math.random() < 0.12;
        const dmg = head ? Math.round(WEAPON.damage * WEAPON.headMult) : WEAPON.damage;
        if (target.id === this.selfId) this.takeDamage(dmg, bot.id, head);
        else this.applyDamage(target.id, dmg, head, bot.id);
      }
      // host hears it
      const dToHost = Math.hypot(this.lp.pos.x - bot.px, this.lp.pos.z - bot.pz);
      Sfx.gunshot(dToHost);
    }
    void distToT;
  }

  private botMove(bot: PState, target: PState, dt: number) {
    const dx = target.px - bot.px;
    const dz = target.pz - bot.pz;
    const dist = Math.hypot(dx, dz);
    const ideal = 13;
    let mvx = 0,
      mvz = 0;
    if (dist > ideal + 3) {
      mvx = dx / dist;
      mvz = dz / dist;
    } else if (dist < ideal - 4) {
      mvx = -dx / dist;
      mvz = -dz / dist;
    } else {
      // strafe
      const s = Math.sin(this.now * 0.8 + bot.id.length) > 0 ? 1 : -1;
      mvx = (-dz / dist) * s;
      mvz = (dx / dist) * s;
    }
    const sp = 4.6;
    const pos = new THREE.Vector3(bot.px, 0, bot.pz);
    const vel = new THREE.Vector3(mvx * sp, 0, mvz * sp);
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    // simple collision (reuse)
    const tmp = new THREE.Vector3(0, 0, 0);
    this.collideBot(pos, tmp);
    bot.px = pos.x;
    bot.pz = pos.z;
  }

  private collideBot(pos: THREE.Vector3, _vel: THREE.Vector3) {
    const r = PLAYER.radius;
    const feet = 0,
      head = PLAYER.height;
    for (const b of this.map.colliders) {
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
  }

  private respawnActor(t: PState) {
    const sp = this.pickSpawn(new THREE.Vector3(this.lp.pos.x, 0, this.lp.pos.z));
    t.px = sp.x;
    t.py = 0;
    t.pz = sp.z;
    t.hp = PLAYER.maxHp;
    t.alive = true;
    t.killstreak = 0;
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
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 6), mat);
      this.scene.add(mesh);
      t = { mesh, life: 0 };
      this.tracers.push(t);
    }
    const dist = from.distanceTo(to);
    const mid = from.clone().add(to).multiplyScalar(0.5);
    t.mesh.position.copy(mid);
    t.mesh.scale.set(1, dist, 1);
    const dir = to.clone().sub(from).normalize();
    t.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    (t.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9;
    t.life = 0.06;
  }

  private spawnSparks(at: THREE.Vector3, color: number, count: number) {
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
      s.vel.set((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4);
      s.life = 0.4 + Math.random() * 0.3;
    }
  }

  private updateFx(dt: number) {
    // muzzle flash
    if (this.now < this.flashUntil) {
      this.weapon.flash.visible = true;
      this.weapon.flashLight.intensity = ((this.flashUntil - this.now) / 0.045) * 7;
    } else {
      this.weapon.flash.visible = false;
      this.weapon.flashLight.intensity = 0;
    }
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        (t.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, t.life / 0.06) * 0.9;
        t.mesh.visible = t.life > 0;
      } else {
        t.mesh.visible = false;
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
