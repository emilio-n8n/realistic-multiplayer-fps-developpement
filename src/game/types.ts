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
  alive: boolean;
  self: boolean;
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
}

export const WEAPON = {
  name: "AR-15",
  magSize: 30,
  reserveMax: 120,
  fireRate: 0.095, // seconds between shots
  damage: 28,
  headMult: 3.4,
  reloadTime: 1.7,
  range: 120,
  auto: true,
  spread: 0.012,
  moveSpread: 0.05,
  recoil: 0.022,
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
};

export const COLORS = [
  0x4f9bff, 0xff5a5a, 0x47d185, 0xffb13d, 0xb06bff, 0xff5ac8, 0x36e0e0, 0xe8e8e8,
];
