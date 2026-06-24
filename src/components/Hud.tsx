import { useEffect, useRef, useState } from "react";
import type { HudState } from "../game/types";
import type { GameMode } from "../game/engine";
import { isAudioEnabled, setAudioEnabled } from "../game/sound";

function hex(c: number) {
  return "#" + c.toString(16).padStart(6, "0");
}

interface Props {
  hud: HudState;
  mode: GameMode;
  code: string | null;
  status: string;
  error: string | null;
  name: string;
  onResume: () => void;
  onLeave: () => void;
}

export default function Hud({ hud, mode, code, status, error, name, onResume, onLeave }: Props) {
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
  const hpPct = Math.max(0, Math.min(1, hud.hp / hud.maxHp));

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-mono text-white">
      {/* vignette */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{
          boxShadow: hud.lowHp ? "inset 0 0 200px 40px rgba(180,0,0,0.55)" : "inset 0 0 160px 30px rgba(0,0,0,0.45)",
          opacity: hud.lowHp ? 0.9 : 0.6,
        }}
      />
      {recentDamage && (
        <div className="absolute inset-0 animate-pulse" style={{ boxShadow: "inset 0 0 220px 60px rgba(200,0,0,0.5)" }} />
      )}

      {/* crosshair */}
      {hud.alive && !hud.paused && (
        <Crosshair gap={hud.spread} hit={hitFlash} kill={killFlash} />
      )}

      {/* damage direction */}
      {hud.damageDir !== null && now - hud.damageTime < 900 && (
        <div
          className="absolute left-1/2 top-1/2"
          style={{ transform: `translate(-50%,-50%) rotate(${hud.damageDir}rad)` }}
        >
          <div style={{ width: 120, height: 120, transform: "translateY(-78px)" }} className="relative">
            <svg width="120" height="120" viewBox="-60 -60 120 120" className="absolute inset-0">
              <path d="M -26 -34 A 44 44 0 0 1 26 -34" stroke="rgba(255,40,40,0.9)" strokeWidth="9" fill="none" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      )}

      {/* center message */}
      {hud.message && (
        <div className="absolute left-1/2 top-[26%] -translate-x-1/2 text-center">
          <div className="text-3xl font-black tracking-widest text-amber-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            {hud.message}
          </div>
        </div>
      )}

      {/* radar */}
      <Radar radar={hud.radar} yawDir />

      {/* top center stats */}
      <div className="absolute left-1/2 top-3 -translate-x-1/2 flex items-center gap-6 rounded-md bg-black/45 px-5 py-1.5 text-sm backdrop-blur">
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
      </div>

      {/* killfeed */}
      <div className="absolute right-3 top-14 flex flex-col items-end gap-1 text-xs">
        {hud.killfeed.map((k) => (
          <div
            key={k.id}
            className={`flex items-center gap-2 rounded bg-black/55 px-2 py-1 backdrop-blur ${k.self ? "border border-amber-400/50" : ""}`}
          >
            <span className={k.killer === name ? "text-amber-300" : "text-white/80"}>{k.killer}</span>
            <span className="text-rose-400">{k.head ? "🎯" : "✕"}</span>
            <span className={k.victim === name ? "text-rose-300" : "text-white/50"}>{k.victim}</span>
          </div>
        ))}
      </div>

      {/* health */}
      <div className="absolute bottom-6 left-6 w-64">
        <div className="mb-1 flex items-end justify-between">
          <span className="text-xs uppercase tracking-widest text-white/60">Santé</span>
          <span className={`text-2xl font-black ${hud.lowHp ? "text-rose-400" : "text-white"}`}>{hud.hp}</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/60 ring-1 ring-white/15">
          <div
            className="h-full rounded-full transition-all duration-150"
            style={{
              width: `${hpPct * 100}%`,
              background: hud.lowHp ? "linear-gradient(90deg,#7f1d1d,#ef4444)" : "linear-gradient(90deg,#166534,#22c55e)",
            }}
          />
        </div>
      </div>

      {/* ammo */}
      <div className="absolute bottom-6 right-6 text-right">
        <div className="text-xs uppercase tracking-widest text-white/60">{hud.reloading ? "Rechargement…" : "Munitions"}</div>
        <div className="flex items-end justify-end gap-2">
          <span className={`text-4xl font-black ${hud.ammo === 0 ? "text-rose-500" : "text-white"}`}>
            {hud.reloading ? Math.round(hud.reloadProgress * hud.mag) : hud.ammo}
          </span>
          <span className="mb-1 text-lg text-white/50">/ {hud.reserve}</span>
        </div>
        {hud.reloading && (
          <div className="ml-auto mt-1 h-1.5 w-36 overflow-hidden rounded-full bg-black/60">
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${hud.reloadProgress * 100}%` }} />
          </div>
        )}
      </div>

      {/* mute toggle */}
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

      {/* scoreboard */}
      {showScore && (
        <div className="absolute left-1/2 top-1/2 w-[420px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg bg-black/75 ring-1 ring-white/15 backdrop-blur">
          <div className="bg-white/5 px-4 py-2 text-center text-sm uppercase tracking-widest text-amber-300">Tableau des scores</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/50">
                <th className="px-4 py-1 text-left font-normal">Joueur</th>
                <th className="px-3 py-1 text-right font-normal">K</th>
                <th className="px-3 py-1 text-right font-normal">M</th>
              </tr>
            </thead>
            <tbody>
              {hud.scoreboard.map((r, i) => (
                <tr key={i} className={r.self ? "bg-amber-400/15" : ""}>
                  <td className="px-4 py-1.5 text-left">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: hex(r.color) }} />
                    <span className={r.self ? "text-amber-200" : "text-white/85"}>{r.name}</span>
                    {!r.alive && <span className="ml-1 text-rose-400/70">☠</span>}
                    {r.isBot && <span className="ml-1 text-white/30 text-[10px]">BOT</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right text-emerald-400">{r.kills}</td>
                  <td className="px-3 py-1.5 text-right text-rose-400">{r.deaths}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* respawn overlay */}
      {!hud.alive && !hud.paused && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="text-5xl font-black tracking-widest text-rose-500 drop-shadow">ÉLIMINÉ</div>
          <div className="mt-3 text-white/70">Réapparition dans {Math.ceil(hud.respawnIn)}…</div>
        </div>
      )}

      {/* pause / menu overlay */}
      {hud.paused && (
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

function Crosshair({ gap, hit, kill }: { gap: number; hit: boolean; kill: boolean }) {
  const color = kill ? "#f43f5e" : hit ? "#ffffff" : "rgba(255,255,255,0.85)";
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
      </div>
    </div>
  );
}

function Radar({ radar }: { radar: HudState["radar"]; yawDir?: boolean }) {
  const R = 58;
  const range = 45;
  return (
    <div className="absolute left-4 top-14 h-[120px] w-[120px] rounded-full bg-black/45 ring-1 ring-white/15 backdrop-blur">
      <div className="absolute inset-0 rounded-full" style={{ boxShadow: "inset 0 0 20px rgba(0,0,0,0.6)" }} />
      <svg width="120" height="120" viewBox="-60 -60 120 120" className="absolute inset-0">
        <circle cx="0" cy="0" r="40" stroke="rgba(255,255,255,0.08)" strokeWidth="1" fill="none" />
        <circle cx="0" cy="0" r="22" stroke="rgba(255,255,255,0.08)" strokeWidth="1" fill="none" />
        <line x1="0" y1="-58" x2="0" y2="58" stroke="rgba(255,255,255,0.06)" />
        <line x1="-58" y1="0" x2="58" y2="0" stroke="rgba(255,255,255,0.06)" />
        {/* self */}
        <polygon points="0,-6 4,5 0,2 -4,5" fill="rgba(255,255,255,0.9)" />
        {radar.map((b, i) => {
          const x = Math.max(-55, Math.min(55, (b.x / range) * R));
          const y = Math.max(-55, Math.min(55, -(b.z / range) * R));
          return <circle key={i} cx={x} cy={y} r={b.firing ? 4 : 2.5} fill={b.firing ? "#ff3b3b" : "rgba(255,120,120,0.7)"} />;
        })}
      </svg>
    </div>
  );
}
