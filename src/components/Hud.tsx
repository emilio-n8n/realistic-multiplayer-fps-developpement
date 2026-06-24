import { useEffect, useRef, useState } from "react";
import type { HudState, PerkType } from "../game/types";
import { PERK_DEFS } from "../game/types";
import type { GameMode } from "../game/engine";
import { isAudioEnabled, setAudioEnabled } from "../game/sound";

function hex(c: number) {
  return "#" + c.toString(16).padStart(6, "0");
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

interface Props {
  hud: HudState;
  mode: GameMode;
  code: string | null;
  status: string;
  name: string;
  onResume: () => void;
  onLeave: () => void;
  onRestart: () => void;
  onKillstreak?: (type: string) => void;
}

const ABBR: Record<string, string> = { ar15: "AR", smg: "SMG", shotgun: "SG", sniper: "SR", pistol: "PST" };

export default function Hud({ hud, mode, code, status, name, onResume, onLeave, onRestart, onKillstreak }: Props) {
  const [showScore, setShowScore] = useState(false);
  const [muted, setMuted] = useState(!isAudioEnabled());
  const nowRef = useRef(performance.now());
  nowRef.current = performance.now();

  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      if (e.code === "Tab") {
        e.preventDefault();
        setShowScore(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Tab") setShowScore(false);
    };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", dn);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const now = nowRef.current;
  const hitFlash = now - hud.hitmarker < 140;
  const killFlash = now - hud.killmarker < 220;
  const recentDamage = now - hud.damageTime < 700;
  const showDamageNum = hud.lastDamageDealt > 0 && now - hud.lastDamageDealtTime < 600;
  const hpPct = Math.max(0, Math.min(1, hud.hp / hud.maxHp));

  const flashEnd: number = (hud as any).flashEnd ?? 0;
  const sprintEnd: number = (hud as any).sprintEnd ?? 0;
  const weaponIndex: number = (hud as any).weaponIndex ?? 0;
  const weaponList: string[] = (hud as any).weaponList ?? [];
  const killstreaksReady: string[] = (hud as any).killstreaksReady ?? [];
  const uavActive: boolean = (hud as any).uavActive ?? false;
  const equipmentLethal: string | null = (hud as any).equipmentLethal ?? null;
  const equipmentTactical: string | null = (hud as any).equipmentTactical ?? null;
  const minimapPings: { x: number; z: number; time: number }[] = (hud as any).minimapPings ?? [];
  const loadoutName: string = (hud as any).loadoutName ?? "";
  const perks: PerkType[] = (hud as any).perks ?? [];
  const weaponProgression = (hud as any).weaponProgression ?? null;
  const playerLevel: number = (hud as any).playerLevel ?? 1;
  const domState = hud.domState;
  const capturePointNear = hud.capturePointNear;
  const captureProgress = hud.captureProgress;
  const sndState = hud.sndState;
  const bombCarrier = hud.bombCarrier;
  const planting = hud.planting;
  const plantProgress = hud.plantProgress;
  const defusing = hud.defusing;
  const defuseProgress = hud.defuseProgress;
  const hardcoreSettings = hud.hardcore;
  const isHardcore = hardcoreSettings?.enabled ?? false;

  const flashActive = flashEnd > 0 && now < flashEnd;
  const flashOpacity = flashActive ? Math.min(0.95, ((flashEnd - now) / 2000) * 0.95) : 0;
  const sprintFlash = sprintEnd > 0 && now - sprintEnd < 300;

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-mono text-white">
      <style>{`
        @keyframes heartbeat {
          0% { transform: scale(1); }
          15% { transform: scale(1.03); }
          30% { transform: scale(1); }
          60% { transform: scale(1.01); }
          100% { transform: scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes floatUp {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-40px); }
        }
        @keyframes countPop {
          0% { transform: scale(2); opacity: 0; }
          50% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes countFade {
          0% { transform: scale(1.5); opacity: 0; }
          30% { transform: scale(1); opacity: 1; }
          100% { opacity: 0; transform: scale(0.8); }
        }
        @keyframes slideUp {
          0% { transform: translateY(40px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {/* flashbang overlay */}
      {flashActive && (
        <div className="absolute inset-0 z-50" style={{ background: "white", opacity: flashOpacity }} />
      )}

      {/* countdown overlay */}
      {hud.matchPhase === "countdown" && hud.countdownLeft > 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-50">
          <div key={Math.ceil(hud.countdownLeft)} className="text-[180px] font-black text-amber-400 animate-[countPop_0.6s_ease-out] drop-shadow-2xl">
            {Math.ceil(hud.countdownLeft)}
          </div>
        </div>
      )}
      {hud.matchPhase === "countdown" && hud.countdownLeft === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="text-[120px] font-black text-emerald-400 animate-[countFade_0.8s_ease-out] drop-shadow-2xl">
            GO!
          </div>
        </div>
      )}

      {/* vignette */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{
          boxShadow: hud.lowHp ? "inset 0 0 200px 40px rgba(180,0,0,0.55)" : "inset 0 0 160px 30px rgba(0,0,0,0.45)",
          opacity: hud.lowHp ? 0.9 : 0.6,
          animation: hud.lowHp ? "heartbeat 2s ease-in-out infinite" : "none",
        }}
      />
      {recentDamage && (
        <div className="absolute inset-0 animate-pulse" style={{ boxShadow: "inset 0 0 220px 60px rgba(200,0,0,0.5)" }} />
      )}

      {/* crosshair */}
      {hud.alive && !hud.paused && !hud.matchOver && !isHardcore && (
        <Crosshair gap={hud.spread} hit={hitFlash} kill={killFlash} sprint={sprintFlash} />
      )}

      {/* damage number popup */}
      {showDamageNum && (
        <div
          className="pointer-events-none absolute left-1/2 top-[46%] -translate-x-1/2"
          style={{ animation: "floatUp 0.6s ease-out forwards" }}
        >
          <span className="text-2xl font-black text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]">
            +{hud.lastDamageDealt}
          </span>
        </div>
      )}

      {/* damage direction */}
      {hud.damageDir !== null && now - hud.damageTime < 900 && (
        <div
          className="absolute left-1/2 top-1/2"
          style={{ transform: `translate(-50%,-50%) rotate(${hud.damageDir}rad)` }}
        >
          <div style={{ width: 140, height: 140, transform: "translateY(-88px)" }} className="relative">
            <svg width="140" height="140" viewBox="-70 -70 140 140" className="absolute inset-0">
              <path d="M -30 -42 A 52 52 0 0 1 30 -42" stroke="rgba(255,200,200,0.3)" strokeWidth="14" fill="none" strokeLinecap="round" />
              <path d="M -30 -42 A 52 52 0 0 1 30 -42" stroke="rgba(255,40,40,0.9)" strokeWidth="10" fill="none" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      )}

      {/* center message */}
      {hud.message && !hud.matchOver && (
        <div className="absolute left-1/2 top-[26%] -translate-x-1/2 text-center">
          <div className="text-3xl font-black tracking-widest text-amber-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            {hud.message}
          </div>
        </div>
      )}

      {/* radar */}
      {!isHardcore && <Radar radar={hud.radar} yaw={hud.yaw} minimapPings={minimapPings} uavActive={uavActive} now={now} />}

      {/* top center stats */}
      {!isHardcore && <div className="absolute left-1/2 top-3 -translate-x-1/2 flex items-center gap-6 rounded-md bg-black/45 px-5 py-1.5 text-sm backdrop-blur">
        {hud.tdm && (
          <>
            <span className="text-red-400 font-bold">{hud.teamKillsRed}</span>
            <span className="text-white/30">-</span>
            <span className="text-blue-400 font-bold">{hud.teamKillsBlue}</span>
            <span className="h-4 w-px bg-white/10" />
          </>
        )}
        <span className="text-emerald-400">
          K <b className="text-white">{hud.kills}</b>
        </span>
        <span className="text-rose-400">
          M <b className="text-white">{hud.deaths}</b>
        </span>
        {hud.killstreak >= 2 && (
          <span className="rounded bg-amber-500/80 px-2 py-0.5 text-xs font-bold text-black">SÉRIE x{hud.killstreak}</span>
        )}
        <span className="text-white/60">{hud.playerCount} joueur{hud.playerCount > 1 ? "s" : ""}</span>
        <span className="text-purple-400/80 text-xs">Niv.{playerLevel}</span>
        {loadoutName && <span className="text-white/40 text-[10px]">{loadoutName}</span>}
        {hud.tdm && (
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
            hud.team === "red" ? "bg-red-500/30 text-red-300" : "bg-blue-500/30 text-blue-300"
          }`}>
            {hud.team === "red" ? "ROUGE" : "BLEU"}
          </span>
        )}
      </div>}

      {/* Domination HUD */}
      {domState && !isHardcore && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2">
          <div className="flex gap-6 items-center">
            <div className="flex items-center gap-2 text-sm text-white/60">ROUGE <span className="text-2xl font-black text-rose-400">{domState.scoreRed}</span></div>
            {domState.points.map(p => (
              <div key={p.id} className={`text-center ${p.contesting ? 'animate-pulse' : ''}`}>
                <div className={`text-2xl font-black ${p.team === 'red' ? 'text-rose-500' : p.team === 'blue' ? 'text-blue-400' : 'text-gray-500'}`}>
                  {p.id.toUpperCase()}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-white/30">
                  {p.team === null ? 'Libre' : p.team === 'red' ? 'Rouge' : 'Bleu'}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 text-sm text-white/60"><span className="text-2xl font-black text-blue-400">{domState.scoreBlue}</span> BLEU</div>
          </div>
        </div>
      )}
      {capturePointNear && !isHardcore && (
        <div className="absolute bottom-44 left-1/2 -translate-x-1/2 text-center">
          <div className="text-sm text-white/80 uppercase tracking-wider mb-1">
            Capturer {capturePointNear.toUpperCase()}
          </div>
          <div className="w-48 h-2 bg-black/60 rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${captureProgress}%` }} />
          </div>
        </div>
      )}

      {/* S&D HUD */}
      {sndState && !isHardcore && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-center">
          <div className="text-sm text-white/80">
            Ronde {sndState.round} · {sndState.attackingTeam === 'red' ? 'ATTAQUE' : 'DÉFENSE'}
          </div>
          <div className="text-4xl font-black text-amber-400">
            {sndState.phase === 'prep' ? Math.ceil(sndState.phaseTimer) : sndState.phase === 'active' && sndState.bombPlanted ? '' : sndState.phase === 'active' ? '' : sndState.phase === 'post' ? Math.ceil(sndState.phaseTimer) : ''}
          </div>
          {sndState.bombPlanted && (
            <div className="text-xl font-black text-rose-500 animate-pulse">BOMBE • {Math.ceil(sndState.bombTimer)}s</div>
          )}
          {defusing && (
            <div className="mt-2">
              <div className="text-sm text-amber-400 uppercase tracking-wider">Désamorçage…</div>
              <div className="w-48 h-2 bg-black/60 rounded-full overflow-hidden mx-auto mt-1">
                <div className="h-full bg-emerald-400 transition-all" style={{ width: `${(defuseProgress / 7) * 100}%` }} />
              </div>
            </div>
          )}
          {planting && (
            <div className="mt-2">
              <div className="text-sm text-amber-400 uppercase tracking-wider">Pose de bombe…</div>
              <div className="w-48 h-2 bg-black/60 rounded-full overflow-hidden mx-auto mt-1">
                <div className="h-full bg-rose-500 transition-all" style={{ width: `${(plantProgress / 3) * 100}%` }} />
              </div>
            </div>
          )}
          {bombCarrier && !sndState.bombPlanted && (
            <div className="mt-1 text-sm text-amber-400 font-bold">💣 BOMBE</div>
          )}
          <div className="flex gap-3 justify-center mt-1 text-xs">
            <span className="text-rose-400">R {sndState.teamScoreRed}</span>
            <span className="text-blue-400">B {sndState.teamScoreBlue}</span>
          </div>
        </div>
      )}

      {/* Hardcore badge */}
      {isHardcore && (
        <div className="absolute top-4 right-4">
          <div className="rounded bg-rose-600/30 px-2 py-0.5 text-[10px] font-bold text-rose-400 uppercase tracking-wider ring-1 ring-rose-500/40">
            HC
          </div>
        </div>
      )}

      {/* killfeed */}
      <div className="absolute right-3 top-14 flex flex-col items-end gap-1 text-xs">
        {hud.killfeed.map((k) => {
          const age = (now - k.time) / 1000;
          const opacity = Math.max(0.25, 1 - age / 5.5);
          return (
            <div
              key={k.id}
              className={`flex items-center gap-1.5 rounded bg-black/55 px-2 py-1 backdrop-blur transition-opacity duration-300 ${k.self ? "border border-amber-400/50" : ""}`}
              style={{ opacity }}
            >
              <span className={k.killer === name ? "text-amber-300" : "text-white/80"}>{k.killer}</span>
              <span className="text-[10px] text-white/30">[AR]</span>
              <span className={k.head ? "text-yellow-300" : "text-rose-400"}>{k.head ? "💀" : "✕"}</span>
              <span className={k.victim === name ? "text-rose-300" : "text-white/50"}>{k.victim}</span>
            </div>
          );
        })}
      </div>

      {/* match timer + map name */}
      {hud.matchPhase === "playing" && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 text-center pointer-events-none z-40">
          <div className={`text-2xl font-mono font-black ${hud.matchTimeLimit - hud.matchTime < 60 ? 'text-rose-500 animate-pulse' : 'text-white/80'}`}>
            {formatTime(hud.matchTime)} / {formatTime(hud.matchTimeLimit)}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-white/30">{hud.mapName}</div>
        </div>
      )}

      {/* killstreak display */}
      {killstreaksReady.length > 0 && !isHardcore && (
        <div className="absolute bottom-32 left-6 flex gap-1.5">
          {killstreaksReady.map((s) => (
            <button
              key={s}
              onClick={(e) => { e.stopPropagation(); onKillstreak?.(s); }}
              className="pointer-events-auto animate-pulse rounded border border-amber-500/40 bg-amber-500/20 px-2 py-1 text-xs text-amber-300 shadow-[0_0_6px_rgba(251,191,36,0.2)] hover:bg-amber-500/30"
            >
              {s === "uav" ? "UAV" : s === "airstrike" ? "FRA" : s === "helicopter" ? "HEL" : s.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* equipment indicator */}
      {(equipmentLethal || equipmentTactical) && !isHardcore && (
        <div className="absolute bottom-32 right-6 flex flex-col gap-1 text-xs">
          {equipmentLethal && (
            <div className="flex items-center gap-1.5 rounded bg-black/50 px-2 py-1">
              <span className="text-white/40">[G]</span>
              <span>💣</span>
              <span className="text-white/70">{equipmentLethal.toUpperCase()}</span>
            </div>
          )}
          {equipmentTactical && (
            <div className="flex items-center gap-1.5 rounded bg-black/50 px-2 py-1">
              <span className="text-white/40">[Q]</span>
              <span>✨</span>
              <span className="text-white/70">{equipmentTactical.toUpperCase()}</span>
            </div>
          )}
        </div>
      )}

      {/* health */}
      {!isHardcore && perks.length > 0 && (
        <div className="absolute bottom-6 left-[280px] flex gap-1 items-end pb-1">
          {perks.map((p) => (
            <span key={p} className="text-lg drop-shadow-[0_0_4px_rgba(0,0,0,0.8)]" title={PERK_DEFS[p].description}>{PERK_DEFS[p].icon}</span>
          ))}
        </div>
      )}
      {isHardcore ? (
        <div className="absolute bottom-6 left-6">
          <span className={`text-2xl font-black ${hud.lowHp ? "text-rose-400" : "text-white"}`}>{hud.hp}</span>
        </div>
      ) : (
      <div className="absolute bottom-6 left-6 w-64">
        <div className="mb-1 flex items-end justify-between">
          <span className="text-xs uppercase tracking-widest text-white/60">Santé</span>
          <span className={`text-2xl font-black transition-all duration-200 ${hud.lowHp ? "text-rose-400" : "text-white"}`}>
            {hud.hp}
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/60 ring-1 ring-white/15">
          <div
            className="h-full rounded-full transition-all duration-150 ease-out"
            style={{
              width: `${hpPct * 100}%`,
              background: hud.lowHp ? "linear-gradient(90deg,#7f1d1d,#ef4444)" : "linear-gradient(90deg,#166534,#22c55e)",
            }}
          />
        </div>
        {hud.lowHp && (
          <div className="mt-1 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
            <span className="text-[10px] uppercase tracking-wider text-rose-400/80">Santé critique</span>
          </div>
        )}
      </div>
      )}

      {/* weapon selector */}
      {weaponList.length > 0 && !isHardcore && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 flex gap-1">
          {weaponList.map((type, i) => (
            <div
              key={type}
              className={`rounded px-3 py-1.5 text-xs ${
                i === weaponIndex
                  ? "bg-amber-500 font-bold text-black shadow-[0_0_8px_rgba(251,191,36,0.5)]"
                  : "bg-black/50 text-white/60"
              }`}
            >
              <div>{ABBR[type] ?? type.toUpperCase()}</div>
              <div className="text-[10px]">{i === weaponIndex ? `${hud.ammo}/${hud.reserve}` : ""}</div>
            </div>
          ))}
        </div>
      )}

      {/* weapon XP bar */}
      {weaponProgression && weaponProgression[hud.weaponType] && !isHardcore && (() => {
        const wp = weaponProgression[hud.weaponType];
        return (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-64">
            <div className="h-1 bg-black/60 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 transition-all duration-200" style={{ width: `${(wp.xp / wp.xpToNext) * 100}%` }} />
            </div>
            <div className="text-[9px] text-white/40 text-center mt-0.5">Niv.{wp.level}</div>
          </div>
        );
      })()}

      {/* weapon / ammo */}
      {!isHardcore && <div className="absolute bottom-6 right-6 text-right">
        <div className="mb-1 flex items-center justify-end gap-2">
          <div className="flex h-5 w-8 items-center justify-center rounded bg-white/10 text-[10px] font-bold text-white/70 ring-1 ring-white/20">
            {hud.fireMode === "auto" ? "A" : "S"}
          </div>
          <span className="text-xs uppercase tracking-wider text-white/70">{hud.weaponName}</span>
        </div>
        <div className="text-xs uppercase tracking-widest text-white/60">{hud.reloading ? "Rechargement…" : "Munitions"}</div>
        <div className="flex items-end justify-end gap-2">
          <span
            className={`text-4xl font-black transition-colors duration-200 ${hud.ammo === 0 ? "animate-pulse text-rose-500" : "text-white"}`}
          >
            {hud.reloading ? Math.round(hud.reloadProgress * hud.mag) : hud.ammo}
          </span>
          <span className="mb-1 text-lg text-white/50">/ {hud.reserve}</span>
        </div>
        {hud.reloading && (
          <div className="ml-auto mt-1 h-1.5 w-36 overflow-hidden rounded-full bg-black/60 ring-1 ring-amber-400/30">
            <div
              className="h-full rounded-full bg-amber-400 transition-all duration-100"
              style={{ width: `${hud.reloadProgress * 100}%` }}
            />
          </div>
        )}
      </div>}

      {/* mute toggle */}
      {!isHardcore && (
      <button
        onClick={() => {
          const m = !muted;
          setMuted(m);
          setAudioEnabled(!m);
        }}
        className="pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2 rounded bg-black/50 px-3 py-1 text-xs text-white/70 ring-1 ring-white/15 hover:bg-black/70"
      >
        {muted ? "🔇 Son coupé" : "🔊 Son activé"}
      </button>
      )}

      {/* scoreboard */}
      {showScore && (
        <div className="absolute left-1/2 top-1/2 w-[500px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg bg-black/75 ring-1 ring-white/15 backdrop-blur">
          <div className="bg-white/5 px-4 py-2 text-center text-sm uppercase tracking-widest text-amber-300">Tableau des scores</div>
          {hud.tdm && (
            <div className="flex justify-between px-4 py-1.5 border-b border-white/10 text-sm font-bold">
              <span className="text-red-400">Rouge: {hud.teamKillsRed}</span>
              <span className="text-blue-400">Bleu: {hud.teamKillsBlue}</span>
            </div>
          )}
          <div className="max-h-[320px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/50">
                  {hud.tdm && <th className="px-2 py-1 text-left font-normal w-6">Éq</th>}
                  <th className="px-4 py-1 text-left font-normal">Joueur</th>
                  <th className="px-3 py-1 text-right font-normal">K</th>
                  <th className="px-3 py-1 text-right font-normal">M</th>
                  <th className="px-3 py-1 text-right font-normal">K/D</th>
                  <th className="px-3 py-1 text-right font-normal">Ping</th>
                </tr>
              </thead>
              <tbody>
                {hud.scoreboard.map((r, i) => (
                  <tr key={i} className={r.self ? "bg-amber-400/15" : i % 2 === 0 ? "bg-white/5" : ""}>
                    {hud.tdm && (
                      <td className="px-2 py-1.5 text-center">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${r.team === "red" ? "bg-red-500" : r.team === "blue" ? "bg-blue-500" : "bg-gray-500"}`} />
                      </td>
                    )}
                    <td className="px-4 py-1.5 text-left">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: hex(r.color) }} />
                      <span className={r.self ? "font-bold text-amber-200" : "text-white/85"}>{r.name}</span>
                      {!r.alive && <span className="ml-1 text-rose-400/70">☠</span>}
                      {r.isBot && <span className="ml-1 text-white/30 text-[10px]">BOT</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right text-emerald-400">{r.kills}</td>
                    <td className="px-3 py-1.5 text-right text-rose-400">{r.deaths}</td>
                    <td className="px-3 py-1.5 text-right text-white/70">
                      {r.deaths > 0 ? (r.kills / r.deaths).toFixed(1) : r.kills > 0 ? "∞" : "0.0"}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <span
                        className={`inline-block h-1.5 w-6 rounded-full ${hud.ping > 100 ? "bg-red-400" : "bg-emerald-400"}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* spectator overlay */}
      {!hud.alive && !hud.paused && !hud.matchOver && hud.spectating && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 z-40 pointer-events-none">
          <div className="text-xs uppercase tracking-widest text-white/40 mb-2">👁 MODE SPECTATEUR</div>
          <div className="mt-2 text-sm text-white/50">ESPACE → Réapparaître</div>
          <div className="mt-1 text-[10px] text-white/30">Q/E monter/descendre · WASD se déplacer</div>
        </div>
      )}

      {/* respawn overlay (only when not spectating) */}
      {!hud.alive && !hud.paused && !hud.matchOver && !hud.spectating && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="text-5xl font-black tracking-widest text-rose-500 drop-shadow">ÉLIMINÉ</div>
          <div className="mt-3 text-white/70">Réapparition dans {Math.ceil(hud.respawnIn)}…</div>
        </div>
      )}

      {/* multi-kill announcement */}
      {hud.multiKillMessage && now - hud.multiKillTime < 1500 && (
        <div className="absolute left-1/2 top-[32%] -translate-x-1/2 text-center z-50 pointer-events-none">
          <div
            className="text-5xl font-black text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.6)]"
            style={{ animation: "countFade 0.8s ease-out forwards" }}
          >
            {hud.multiKillMessage}
          </div>
        </div>
      )}

      {/* headshot indicator */}
      {hud.headshotTime > 0 && now - hud.headshotTime < 800 && (
        <div className="absolute left-1/2 top-[38%] -translate-x-1/2 text-center z-50 pointer-events-none">
          <div className="text-3xl font-black text-yellow-300 drop-shadow-[0_0_10px_rgba(253,224,71,0.6)]" style={{ animation: "countFade 0.8s ease-out forwards" }}>
            HEADSHOT
          </div>
        </div>
      )}

      {/* match over overlay */}
      {hud.matchOver && hud.matchResult && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-md"
          style={{ animation: "fadeIn 0.5s ease-out forwards" }}
        >
          <div
            className="pointer-events-auto w-[480px] max-w-[92vw] rounded-2xl border border-white/10 bg-zinc-900/90 p-7 shadow-2xl"
            style={{ animation: "slideUp 0.5s ease-out forwards" }}
          >
            <div className="text-center">
              <div className="text-sm uppercase tracking-[0.3em] text-amber-400/60">Partie terminée</div>
              <h2 className="mt-2 text-4xl font-black text-white">
                FRONT<span className="text-amber-400">LINE</span>
              </h2>
              {/* Victory/Defeat */}
              {hud.tdm && (
                <div className="mt-3">
                  <div className={`text-5xl font-black ${hud.matchResult.winner === (hud.team === "red" ? "Rouge" : "Bleu") || hud.matchResult.winner === name ? "text-emerald-400" : "text-rose-500"}`}>
                    {hud.matchResult.winner === (hud.team === "red" ? "Rouge" : "Bleu") || hud.matchResult.winner === name ? "VICTOIRE" : "DÉFAITE"}
                  </div>
                </div>
              )}
              <div className="mt-4">
                <div className="text-lg text-white/60">Vainqueur</div>
                <div className="mt-1 text-3xl font-black text-amber-300">{hud.matchResult.winner}</div>
              </div>
            </div>

            {/* Team scores */}
            {hud.tdm && (() => {
              const mr = hud.matchResult!;
              return (
              <div className="mt-4 flex justify-center gap-8 text-lg font-bold">
                <div className="text-center">
                  <div className="text-sm text-red-400">Rouge</div>
                  <div className="text-3xl text-red-300">{mr.teamKillsRed ?? hud.teamKillsRed}</div>
                </div>
                <div className="text-3xl text-white/30 self-end pb-1">-</div>
                <div className="text-center">
                  <div className="text-sm text-blue-400">Bleu</div>
                  <div className="text-3xl text-blue-300">{mr.teamKillsBlue ?? hud.teamKillsBlue}</div>
                </div>
              </div>
              );
            })()}

            {/* MVP */}
            {hud.matchResult.stats.length > 0 &&
              (() => {
                const mvp = hud.matchResult.stats.reduce((best, r) => (r.kills > best.kills ? r : best));
                return (
                  <div className="mt-5 rounded-xl bg-amber-500/10 px-4 py-3 ring-1 ring-amber-400/30" style={{ animation: "fadeIn 0.6s ease-out forwards" }}>
                    <div className="text-center text-xs uppercase tracking-widest text-amber-400/60">👑 MVP</div>
                    <div className="mt-1 flex items-center justify-center gap-3">
                      <span
                        className="inline-block h-4 w-4 rounded-full ring-2 ring-amber-400/50"
                        style={{ background: hex(mvp.color) }}
                      />
                      <span className="text-lg font-bold text-amber-200">{mvp.name}</span>
                      <span className="text-sm text-amber-300/80">
                        {mvp.kills}K / {mvp.deaths}M
                      </span>
                    </div>
                    <div className="mt-1 text-center text-xs text-amber-400/50">
                      K/D: {mvp.deaths > 0 ? (mvp.kills / mvp.deaths).toFixed(1) : mvp.kills > 0 ? "∞" : "0.0"} ·{" "}
                      Précision: {mvp.kills > 0 ? `${Math.round((mvp.kills / (mvp.kills + mvp.deaths)) * 100)}%` : "—"}
                    </div>
                  </div>
                );
              })()}

            {/* stats table */}
            <div className="mt-4 max-h-[200px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-white/40">
                    <th className="px-3 py-1 text-left font-normal">Joueur</th>
                    <th className="px-3 py-1 text-right font-normal">K</th>
                    <th className="px-3 py-1 text-right font-normal">M</th>
                    <th className="px-3 py-1 text-right font-normal">K/D</th>
                  </tr>
                </thead>
                <tbody>
                  {hud.matchResult.stats.map((r, i) => (
                    <tr key={i} className={r.self ? "bg-amber-400/10" : ""}>
                      <td className="px-3 py-1.5 text-left">
                        <span
                          className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                          style={{ background: hex(r.color) }}
                        />
                        <span className={r.self ? "font-bold text-amber-200" : "text-white/80"}>{r.name}</span>
                        {!r.alive && <span className="ml-1 text-rose-400/70">☠</span>}
                        {r.isBot && <span className="ml-1 text-white/30 text-[10px]">BOT</span>}
                        {hud.matchResult!.stats.reduce((best, r2) => r2.kills > best.kills ? r2 : best).name === r.name && (
                          <span className="ml-1 text-amber-400">👑</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right text-emerald-400">{r.kills}</td>
                      <td className="px-3 py-1.5 text-right text-rose-400">{r.deaths}</td>
                      <td className="px-3 py-1.5 text-right text-white/60">
                        {r.deaths > 0 ? (r.kills / r.deaths).toFixed(1) : r.kills > 0 ? "∞" : "0.0"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* buttons */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={onRestart}
                className="flex-1 rounded-lg bg-amber-500 py-3 text-center font-bold text-black transition hover:bg-amber-400 hover:scale-[1.02] active:scale-95"
              >
                ▶ REJOUER
              </button>
              <button
                onClick={onLeave}
                className="flex-1 rounded-lg bg-white/5 py-3 text-center text-sm text-white/60 ring-1 ring-white/10 transition hover:bg-white/10 hover:scale-[1.02] active:scale-95"
              >
                Quitter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* pause / menu overlay */}
      {hud.paused && !hud.matchOver && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={onResume}>
          <div className="w-[460px] max-w-[92vw] rounded-2xl border border-white/10 bg-zinc-900/90 p-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-center text-3xl font-black tracking-tight text-white">
              FRONT<span className="text-amber-400">LINE</span>
            </h2>
            <p className="mt-1 text-center text-sm text-white/50">
              {mode === "host" ? "Partie multijoueur — Hôte" : mode === "client" ? "Partie multijoueur — Client" : "Entraînement solo"}
            </p>

            {mode === "host" && code && (
              <div className="mt-5 rounded-xl bg-black/50 p-4 text-center ring-1 ring-amber-400/30">
                <div className="text-xs uppercase tracking-widest text-white/50">Code de la partie — partage-le</div>
                <div className="mt-1 text-4xl font-black tracking-[0.3em] text-amber-400">{code}</div>
                <div className="mt-1 text-xs text-white/40">{status}</div>
              </div>
            )}
            {mode !== "host" && (
              <div className="mt-5 rounded-xl bg-black/40 p-3 text-center text-sm text-white/60">{status}</div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2 text-xs text-white/60">
              <Ctl k="Z Q S D" v="Déplacement" />
              <Ctl k="Souris" v="Viser" />
              <Ctl k="Clic G" v="Tirer" />
              <Ctl k="Shift" v="Sprint" />
              <Ctl k="Ctrl / C" v="Accroupi" />
              <Ctl k="Espace" v="Sauter" />
              <Ctl k="R" v="Recharger" />
              <Ctl k="Tab" v="Scores" />
            </div>

            <button
              onClick={onResume}
              className="mt-5 w-full rounded-lg bg-amber-500 py-3 text-center font-bold text-black transition hover:bg-amber-400"
            >
              ▶ REPRENDRE
            </button>
            <button
              onClick={onLeave}
              className="mt-2 w-full rounded-lg bg-white/5 py-2 text-center text-sm text-white/60 ring-1 ring-white/10 transition hover:bg-white/10"
            >
              Quitter la partie
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Ctl({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between rounded bg-white/5 px-3 py-1.5">
      <span className="font-bold text-white/80">{k}</span>
      <span>{v}</span>
    </div>
  );
}

function Crosshair({ gap, hit, kill, sprint }: { gap: number; hit: boolean; kill: boolean; sprint: boolean }) {
  const color = kill ? "#f43f5e" : sprint ? "#ef4444" : hit ? "#ffffff" : "rgba(255,255,255,0.85)";
  const len = 8;
  const thick = 2;
  return (
    <div className="absolute left-1/2 top-1/2">
      <div className="relative" style={{ width: 0, height: 0 }}>
        {/* dot */}
        <div className="absolute rounded-full" style={{ width: 2, height: 2, background: color, left: -1, top: -1 }} />
        {/* lines */}
        <span className="absolute" style={{ width: thick, height: len, background: color, left: -thick / 2, top: -(gap + len) }} />
        <span className="absolute" style={{ width: thick, height: len, background: color, left: -thick / 2, top: gap }} />
        <span className="absolute" style={{ width: len, height: thick, background: color, top: -thick / 2, left: -(gap + len) }} />
        <span className="absolute" style={{ width: len, height: thick, background: color, top: -thick / 2, left: gap }} />
        {/* hit marker */}
        {(hit || kill) && (
          <svg width="40" height="40" viewBox="-20 -20 40 40" className="absolute" style={{ left: -20, top: -20 }}>
            <line x1="-16" y1="-16" x2="-9" y2="-9" stroke={color} strokeWidth="2.5" />
            <line x1="16" y1="-16" x2="9" y2="-9" stroke={color} strokeWidth="2.5" />
            <line x1="-16" y1="16" x2="-9" y2="9" stroke={color} strokeWidth="2.5" />
            <line x1="16" y1="16" x2="9" y2="9" stroke={color} strokeWidth="2.5" />
          </svg>
        )}
        {/* skull on kill */}
        {kill && (
          <span className="absolute text-lg" style={{ left: -9, top: -34 }}>
            💀
          </span>
        )}
      </div>
    </div>
  );
}

function Radar({ radar, yaw, minimapPings, uavActive, now }: { radar: HudState["radar"]; yaw?: number; minimapPings?: { x: number; z: number; time: number }[]; uavActive?: boolean; now: number }) {
  const R = 68;
  const range = 45;
  const deg = (yaw ?? 0) * (180 / Math.PI);
  return (
    <div className={`absolute left-4 top-14 h-[160px] w-[160px] rounded-full ${uavActive ? "ring-2 ring-amber-400/50 animate-pulse" : ""}`}>
      <svg width="160" height="160" viewBox="-75 -75 150 150" className="absolute inset-0">
        {/* outer compass ring */}
        <circle cx="0" cy="0" r="73" stroke="rgba(255,255,255,0.15)" strokeWidth="2" fill="none" />
        <circle cx="0" cy="0" r="71" stroke="rgba(255,255,255,0.06)" strokeWidth="1" fill="none" />
        {/* rotating direction labels and ticks */}
        <g transform={`rotate(${-deg})`}>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line
              key={a}
              x1={0}
              y1={-71}
              x2={0}
              y2={a % 90 === 0 ? -67 : -69}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth={a % 90 === 0 ? 2 : 1}
              transform={`rotate(${a})`}
            />
          ))}
          <text x="0" y="-60" textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize="10" fontWeight="bold" fontFamily="monospace">
            N
          </text>
          <text x="64" y="4" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="8" fontFamily="monospace">
            E
          </text>
          <text x="0" y="72" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="8" fontFamily="monospace">
            S
          </text>
          <text x="-64" y="4" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="8" fontFamily="monospace">
            W
          </text>
        </g>
        {/* radar background */}
        <circle cx="0" cy="0" r="65" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <circle cx="0" cy="0" r="44" stroke="rgba(255,255,255,0.07)" strokeWidth="1" fill="none" />
        <circle cx="0" cy="0" r="24" stroke="rgba(255,255,255,0.07)" strokeWidth="1" fill="none" />
        <line x1="0" y1="-65" x2="0" y2="65" stroke="rgba(255,255,255,0.05)" />
        <line x1="-65" y1="0" x2="65" y2="0" stroke="rgba(255,255,255,0.05)" />
        {/* self */}
        <polygon points="0,-7 4.5,5.5 0,2.5 -4.5,5.5" fill="rgba(255,255,255,0.9)" />
        {radar.map((b, i) => {
          const x = Math.max(-62, Math.min(62, (b.x / range) * R));
          const y = Math.max(-62, Math.min(62, -(b.z / range) * R));
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={b.firing ? 4.5 : 3}
              fill={b.enemy ? (b.firing ? "#ff3b3b" : "rgba(255,120,120,0.7)") : b.firing ? "#3bff3b" : "rgba(120,255,120,0.7)"}
              stroke={b.enemy ? "rgba(255,0,0,0.3)" : "rgba(0,255,0,0.3)"}
              strokeWidth={1}
            />
          );
        })}
        {/* minimap pings */}
        {minimapPings?.map((ping, i) => {
          const age = (now - ping.time) / 1000;
          const op = Math.max(0, 1 - age / 2);
          const px = Math.max(-62, Math.min(62, (ping.x / range) * R));
          const py = Math.max(-62, Math.min(62, -(ping.z / range) * R));
          return (
            <circle
              key={i}
              cx={px}
              cy={py}
              r={4}
              fill={`rgba(255,50,50,${op * 0.8})`}
              stroke={`rgba(255,0,0,${op * 0.5})`}
              strokeWidth={1.5}
            />
          );
        })}
      </svg>
    </div>
  );
}
