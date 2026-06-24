// Shared types between the engine, networking and UI layers.

export interface PState {
  id: string;
  name: string;
  color: number;
  px: number;
  py: number;
  pz: number; // feet position
  yaw: number;
  pitch: number;
  hp: number;
  alive: boolean;
  isBot: boolean;
  firing: boolean;
  kills: number;
  deaths: number;
  killstreak: number;
  respawnAt?: number;
  lastHurt?: number;
  team: "red" | "blue";
}

export interface KillFeedItem {
  id: number;
  killer: string;
  victim: string;
  weapon: string;
  head: boolean;
  self: boolean; // involves the local player
  time: number;
}

export interface ScoreRow {
  name: string;
  kills: number;
  deaths: number;
  isBot: boolean;
  color: number;
  team: "red" | "blue" | null;
  alive: boolean;
  self: boolean;
}

export interface MatchResult {
  winner: string;
  stats: ScoreRow[];
}

export interface RadarBlip {
  x: number; // relative forward
  z: number; // relative side
  enemy: boolean;
  firing: boolean;
}

export interface HudState {
  hp: number;
  maxHp: number;
  alive: boolean;
  ammo: number;
  mag: number;
  reserve: number;
  reloading: boolean;
  reloadProgress: number;
  kills: number;
  deaths: number;
  killstreak: number;
  spread: number;
  hitmarker: number; // timestamp of last hit
  killmarker: number; // timestamp of last kill
  damageDir: number | null; // radians, relative to facing
  damageTime: number;
  lowHp: boolean;
  killfeed: KillFeedItem[];
  scoreboard: ScoreRow[];
  radar: RadarBlip[];
  message: string | null;
  messageTime: number;
  respawnIn: number; // seconds, -1 if alive
  paused: boolean;
  connected: boolean;
  playerCount: number;
  matchOver: boolean;
  matchResult: MatchResult | null;
  weaponName: string;
  fireMode: "auto" | "semi";
  lastDamageDealt: number;
  lastDamageDealtTime: number;
  ping: number;
  yaw: number;
  teamKillsRed: number;
  teamKillsBlue: number;
  tdm: boolean;
  team: "red" | "blue";
}

export const WEAPON = {
  name: "AR-15",
  magSize: 30,
  reserveMax: 120,
  fireRate: 0.095,
  damage: 28,
  headMult: 3.4,
  reloadTime: 1.7,
  range: 120,
  auto: true,
  spread: 0.012,
  moveSpread: 0.05,
  recoil: 0.022,
  adsSpreadMult: 0.3,
  penDmgMult: 0.5,
  limbDmgArm: 0.7,
  limbDmgLeg: 0.5,
  vestDR: 0.3,
};

export const PLAYER = {
  maxHp: 100,
  radius: 0.45,
  height: 1.7,
  crouchHeight: 1.1,
  speed: 7.2,
  sprintMult: 1.7,
  crouchMult: 0.5,
  accel: 60,
  friction: 10,
  jump: 7.2,
  gravity: 22,
  eyeHeight: 1.55,
  regenDelay: 4.5,
  regenRate: 26,
  slideDuration: 0.5,
  slideSpeed: 10,
  airControlMult: 0.4,
  adsSpeedMult: 0.55,
  sprintReadyDelay: 0.3,
  bleedThreshold: 20,
  bleedMaxRegen: 20,
};

export const GRENADE = {
  cookTime: 3,
  radius: 8,
  maxDamage: 80,
  throwSpeed: 18,
  bounceFactor: 0.5,
  gravity: 12,
  poolSize: 6,
};

export const COLORS = [
  0x4f9bff, 0xff5a5a, 0x47d185, 0xffb13d, 0xb06bff, 0xff5ac8, 0x36e0e0, 0xe8e8e8,
];
