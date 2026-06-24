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
  loadoutIndex?: number;
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
  teamKillsRed?: number;
  teamKillsBlue?: number;
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
  weaponType: WeaponType;
  weaponIndex: number;
  weaponList: WeaponType[];
  streakKills: number;
  killstreaksReady: KillstreakType[];
  uavActive: boolean;
  equipmentLethal: EquipmentType | null;
  equipmentTactical: EquipmentType | null;
  minimapPings: { x: number; z: number; time: number }[];
  loadoutName: string;
  perks: PerkType[];
  weaponProgression: WeaponProgressionData;
  playerLevel: number;
  domState: DomState | null;
  capturePointNear: string | null;
  captureProgress: number;
  sndState: SndState | null;
  bombCarrier: boolean;
  planting: boolean;
  plantProgress: number;
  defusing: boolean;
  defuseProgress: number;
  hardcore: HardcoreSettings | null;
  matchPhase: "countdown" | "playing" | "ended";
  countdownLeft: number;
  matchTime: number;
  matchTimeLimit: number;
  mapName: string;
  spectating: boolean;
  multiKillMessage: string | null;
  multiKillTime: number;
  headshotTime: number;
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

// ---------- Weapon types ----------

export type WeaponType = "ar15" | "smg" | "shotgun" | "sniper" | "pistol";

export interface WeaponStats {
  name: string;
  magSize: number;
  reserveMax: number;
  fireRate: number;
  damage: number;
  headMult: number;
  reloadTime: number;
  range: number;
  spread: number;
  moveSpread: number;
  recoil: number;
  auto: boolean;
  pellets?: number;
  swapTime: number;
  sprintToFire: number;
}

export const WEAPON_LIST: WeaponType[] = ["ar15", "smg", "shotgun", "sniper", "pistol"];

export const WEAPON_STATS: Record<WeaponType, WeaponStats> = {
  ar15: {
    name: "AR-15", magSize: 30, reserveMax: 120, fireRate: 0.095, damage: 28,
    headMult: 3.4, reloadTime: 1.7, range: 120, spread: 0.012, moveSpread: 0.05,
    recoil: 0.022, auto: true, swapTime: 0.6, sprintToFire: 0.25,
  },
  smg: {
    name: "SMG-9", magSize: 40, reserveMax: 160, fireRate: 0.07, damage: 22,
    headMult: 3.0, reloadTime: 1.5, range: 80, spread: 0.02, moveSpread: 0.08,
    recoil: 0.015, auto: true, swapTime: 0.4, sprintToFire: 0.2,
  },
  shotgun: {
    name: "M870", magSize: 8, reserveMax: 32, fireRate: 0.8, damage: 20,
    headMult: 1.5, reloadTime: 2.5, range: 30, spread: 0.08, moveSpread: 0.12,
    recoil: 0.045, auto: false, pellets: 8, swapTime: 0.8, sprintToFire: 0.35,
  },
  sniper: {
    name: "RSI", magSize: 5, reserveMax: 20, fireRate: 1.0, damage: 80,
    headMult: 2.0, reloadTime: 3.0, range: 200, spread: 0.002, moveSpread: 0.01,
    recoil: 0.05, auto: false, swapTime: 1.0, sprintToFire: 0.4,
  },
  pistol: {
    name: "P220", magSize: 15, reserveMax: 60, fireRate: 0.12, damage: 24,
    headMult: 3.0, reloadTime: 1.2, range: 50, spread: 0.015, moveSpread: 0.04,
    recoil: 0.018, auto: false, swapTime: 0.3, sprintToFire: 0.15,
  },
};

export const WEAPON_NAMES: Record<WeaponType, string> = {
  ar15: "AR-15", smg: "SMG-9", shotgun: "M870", sniper: "RSI", pistol: "P220",
};

// ---------- Equipment types ----------

export type EquipmentType = "frag" | "flash" | "smoke" | "claymore";
export const EQUIPMENT_LIST: EquipmentType[] = ["frag", "flash", "smoke", "claymore"];

// ---------- Killstreak types ----------

export type KillstreakType = "uav" | "airstrike" | "helicopter";
export const KILLSTREAK_LIST: KillstreakType[] = ["uav", "airstrike", "helicopter"];
export const KILLSTREAK_DEFS: Record<KillstreakType, { name: string; kills: number; description: string }> = {
  uav: { name: "UAV", kills: 3, description: "Reveals enemies on minimap" },
  airstrike: { name: "Airstrike", kills: 5, description: "Calls in an air bombardment" },
  helicopter: { name: "Helicopter", kills: 7, description: "Deploys an attack helicopter" },
};

// ---------- Perks ----------

export type PerkType = "gunner" | "ninja" | "tank" | "scout" | "demolition";

export interface PerkDef {
  name: string;
  description: string;
  icon: string;
}

export const PERK_DEFS: Record<PerkType, PerkDef> = {
  gunner: { name: "Gunner", description: "Rechargement 30% plus rapide", icon: "⚡" },
  ninja:  { name: "Ninja",  description: "Pas silencieux, 20% plus rapide", icon: "👣" },
  tank:   { name: "Tank",   description: "HP max +25, dégâts subis -10%", icon: "🛡️" },
  scout:  { name: "Scout",  description: "Sprint 20% plus rapide, radar permanent", icon: "🔭" },
  demolition: { name: "Démolition", description: "2 grenades, explosion +25% rayon", icon: "💣" },
};

export interface Loadout {
  name: string;
  primary: WeaponType;
  secondary: WeaponType;
  lethal: EquipmentType;
  tactical: EquipmentType;
  perks: PerkType[];
}

export const DEFAULT_LOADOUTS: Loadout[] = [
  { name: "Assaut",    primary: "ar15",    secondary: "pistol", lethal: "frag", tactical: "flash", perks: ["gunner", "tank"] },
  { name: "Tireur",    primary: "sniper",  secondary: "pistol", lethal: "claymore", tactical: "smoke", perks: ["scout", "ninja"] },
  { name: "Support",   primary: "smg",     secondary: "pistol", lethal: "frag", tactical: "flash", perks: ["tank", "demolition"] },
  { name: "Éclaireur", primary: "shotgun", secondary: "pistol", lethal: "claymore", tactical: "smoke", perks: ["ninja", "scout"] },
  { name: "Démolisseur", primary: "ar15",  secondary: "shotgun", lethal: "frag", tactical: "flash", perks: ["demolition", "gunner"] },
];

// ---------- Weapon progression ----------

export interface WeaponProgression {
  level: number;
  xp: number;
  xpToNext: number;
  kills: number;
  headshots: number;
}
export type WeaponProgressionData = Record<WeaponType, WeaponProgression>;

export interface CapturePoint {
  id: string;
  x: number;
  z: number;
  radius: number;
  team: "red" | "blue" | null;
  progress: number;
  contesting: boolean;
}

export interface DomState {
  points: CapturePoint[];
  scoreRed: number;
  scoreBlue: number;
  scoreLimit: number;
}

export interface SndState {
  round: number;
  phase: "prep" | "active" | "post";
  phaseTimer: number;
  attackingTeam: "red" | "blue";
  bombPlanted: boolean;
  bombSite: "a" | "b" | null;
  bombTimer: number;
  teamScoreRed: number;
  teamScoreBlue: number;
  roundsToWin: number;
  aliveRed: number;
  aliveBlue: number;
}

export interface HardcoreSettings {
  enabled: boolean;
  hpMultiplier: number;
  friendlyFire: boolean;
  noHud: boolean;
  noCrosshair: boolean;
  noRadar: boolean;
  headshotOnly: boolean;
}
