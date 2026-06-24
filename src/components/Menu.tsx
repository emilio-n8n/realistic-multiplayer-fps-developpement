import { useState } from "react";
import { COLORS, DEFAULT_LOADOUTS, PERK_DEFS, WEAPON_NAMES, ATTACHMENT_DEFS } from "../game/types";
import type { CareerStats } from "../game/types";
import { loadCareerStats } from "../game/types";

interface Props {
  onStartSolo: (name: string, color: number, bots: number, gameMode: string, hardcore: boolean, team: "red" | "blue", loadoutIndex?: number) => void;
  onHost: (name: string, color: number, bots: number, gameMode: string, hardcore: boolean, team: "red" | "blue", loadoutIndex?: number) => void;
  onJoin: (name: string, color: number, code: string) => void;
  error: string | null;
  connecting: boolean;
  careerStats?: CareerStats;
}

type Tab = "solo" | "host" | "join";

export default function Menu({ onStartSolo, onHost, onJoin, error, connecting, careerStats }: Props) {
  const [tab, setTab] = useState<Tab>("solo");
  const [name, setName] = useState("Joueur");
  const [color, setColor] = useState(COLORS[0]);
  const [bots, setBots] = useState(6);
  const [code, setCode] = useState("");
  const [gameMode, setGameMode] = useState<"ffa" | "tdm" | "dom" | "snd">("ffa");
  const [hardcore, setHardcore] = useState(false);
  const [team, setTeam] = useState<"red" | "blue">("red");
  const [loadoutIndex, setLoadoutIndex] = useState(0);
  const [showStats, setShowStats] = useState(false);

  const isTeamMode = gameMode === "tdm" || gameMode === "dom" || gameMode === "snd";

  const start = () => {
    if (connecting) return;
    if (tab === "solo") onStartSolo(name.trim() || "Joueur", color, bots, gameMode, hardcore, team, loadoutIndex);
    else if (tab === "host") onHost(name.trim() || "Joueur", color, bots, gameMode, hardcore, team, loadoutIndex);
    else onJoin(name.trim() || "Joueur", color, code.trim().toUpperCase());
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-zinc-950 text-white">
      {/* background layers */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 600px at 70% 10%, rgba(245,158,11,0.18), transparent 60%), radial-gradient(900px 700px at 10% 90%, rgba(30,64,120,0.35), transparent 55%), linear-gradient(160deg,#0a0a0f,#13171f 60%,#070809)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(circle at 50% 40%, black, transparent 75%)",
        }}
      />
      {/* floating embers */}
      {Array.from({ length: 18 }).map((_, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-amber-400/40"
          style={{
            width: 3,
            height: 3,
            left: `${(i * 53) % 100}%`,
            top: `${(i * 37) % 100}%`,
            animation: `floatUp ${8 + (i % 5) * 2}s linear ${i * 0.6}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes floatUp{0%{transform:translateY(20px);opacity:0}10%{opacity:1}100%{transform:translateY(-120px);opacity:0}}`}</style>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
        {/* header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-amber-500 text-2xl font-black text-black shadow-lg shadow-amber-500/30">
              ✪
            </div>
            <div>
              <h1 className="text-2xl font-black leading-none tracking-tight">
                FRONT<span className="text-amber-400">LINE</span>
              </h1>
              <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">Tactical FPS · Web Edition</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-xs text-white/40 sm:flex">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            Serveur P2P en ligne
            <button onClick={() => setShowStats(true)} className="ml-2 rounded bg-white/10 px-2 py-1 text-white/60 hover:bg-white/20 hover:text-white/80">STATS</button>
          </div>
        </div>

        {/* hero */}
        <div className="mt-10 grid flex-1 items-center gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl">
              ENTREZ DANS
              <br />
              LA <span className="text-amber-400">ZONE</span> DE GUERRE
            </h2>
            <p className="mt-4 max-w-md text-white/60">
              FPS tactique réaliste jouable directement dans le navigateur. Mouvement fluide, armes avec recul,
              balistique, IA ennemie — et un multijoueur <b className="text-white/80">hôte + code</b> pour jouer
              avec tes amis en peer-to-peer.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs">
              {["Vue FPS immersive", "Ombres dynamiques", "Recul & rechargement", "Radar tactique", "Multijoueur P2P"].map(
                (f) => (
                  <span key={f} className="rounded-full bg-white/5 px-3 py-1 text-white/60 ring-1 ring-white/10">
                    {f}
                  </span>
                )
              )}
            </div>
          </div>

          {/* panel */}
          <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-6 shadow-2xl backdrop-blur">
            {/* tabs */}
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/40 p-1 text-sm">
              {([
                ["solo", "Solo"],
                ["host", "Héberger"],
                ["join", "Rejoindre"],
              ] as [Tab, string][]).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`rounded-md py-2 font-bold transition ${
                    tab === id ? "bg-amber-500 text-black" : "text-white/60 hover:bg-white/5"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-4">
              <Field label="Nom de combat">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 14))}
                  className="w-full rounded-lg bg-black/50 px-3 py-2.5 text-white outline-none ring-1 ring-white/10 focus:ring-amber-400"
                  placeholder="Ton pseudo"
                />
              </Field>

              <Field label="Couleur">
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`h-8 w-8 rounded-full ring-2 transition ${
                        color === c ? "ring-white scale-110" : "ring-transparent hover:scale-110"
                      }`}
                      style={{ background: "#" + c.toString(16).padStart(6, "0") }}
                    />
                  ))}
                </div>
              </Field>

              {tab === "join" ? (
                <Field label="Code de la partie">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))}
                    className="w-full rounded-lg bg-black/50 px-3 py-2.5 text-center text-2xl font-black tracking-[0.4em] text-amber-400 outline-none ring-1 ring-white/10 focus:ring-amber-400"
                    placeholder="XXXXX"
                  />
                </Field>
              ) : (
                <>
                <Field label="Mode de jeu">
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["ffa", "FFA"],
                      ["tdm", "TDM"],
                      ["dom", "Domination"],
                      ["snd", "Search & Destroy"],
                    ] as [string, string][]).map(([id, label]) => (
                      <button
                        key={id}
                        onClick={() => setGameMode(id as any)}
                        className={`rounded-lg py-2 text-sm font-bold transition ${
                          gameMode === id ? "bg-amber-500 text-black" : "bg-white/5 text-white/60 hover:bg-white/10"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>
                {gameMode === "snd" && (
                  <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300/80 ring-1 ring-amber-500/20">
                    Pose / désamorce la bombe. Pas de réapparition. 4 manches pour gagner.
                  </div>
                )}
                {gameMode === "dom" && (
                  <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300/80 ring-1 ring-amber-500/20">
                    Capture et défends 3 points. 100 points pour gagner.
                  </div>
                )}
                {isTeamMode && (
                  <Field label="Équipe">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTeam("red")}
                        className={`flex-1 rounded-lg py-2 text-sm font-bold transition ${
                          team === "red" ? "bg-red-500/30 text-red-300 ring-1 ring-red-400" : "bg-white/5 text-white/60 hover:bg-white/10"
                        }`}
                      >
                        Rouge
                      </button>
                      <button
                        onClick={() => setTeam("blue")}
                        className={`flex-1 rounded-lg py-2 text-sm font-bold transition ${
                          team === "blue" ? "bg-blue-500/30 text-blue-300 ring-1 ring-blue-400" : "bg-white/5 text-white/60 hover:bg-white/10"
                        }`}
                      >
                        Bleu
                      </button>
                    </div>
                  </Field>
                )}
                <Field label="Classe">
                  <div className="grid grid-cols-5 gap-1.5">
                    {DEFAULT_LOADOUTS.map((loadout, i) => (
                      <button
                        key={i}
                        onClick={() => setLoadoutIndex(i)}
                        className={`rounded-lg p-2 text-center transition ${
                          loadoutIndex === i
                            ? "bg-amber-500 text-black ring-2 ring-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.4)]"
                            : "bg-white/5 text-white/60 hover:bg-white/10"
                        }`}
                      >
                        <div className="text-[10px] font-bold">{loadout.name}</div>
                        <div className="mt-1 text-[9px] text-white/50">{WEAPON_NAMES[loadout.primary]}</div>
                        <div className="text-[9px] text-white/40">{WEAPON_NAMES[loadout.secondary]}</div>
                        <div className="mt-1 flex justify-center gap-0.5">
                          {loadout.perks.map((p) => (
                            <span key={p} className="text-base">{PERK_DEFS[p].icon}</span>
                          ))}
                        </div>
                        <div className="mt-1 flex justify-center gap-0.5">
                          {(Object.keys(loadout.attachments) as any[]).map((a) => (
                            <span key={a} className="text-[9px]" title={ATTACHMENT_DEFS[a as keyof typeof ATTACHMENT_DEFS]?.name}>{ATTACHMENT_DEFS[a as keyof typeof ATTACHMENT_DEFS]?.icon}</span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label={`Bots ennemis : ${bots}`}>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={bots}
                    onChange={(e) => setBots(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                  <div className="flex justify-between text-[10px] text-white/30">
                    <span>0</span>
                    <span>{tab === "host" ? "Remplissent la map en attente de joueurs" : "Entraînement"}</span>
                    <span>10</span>
                  </div>
                </Field>
                <Field label="">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hardcore}
                      onChange={(e) => setHardcore(e.target.checked)}
                      className="accent-amber-500 w-4 h-4"
                    />
                    <span className="text-sm font-bold text-white/80">Mode Hardcore</span>
                  </label>
                  {hardcore && (
                    <div className="mt-1.5 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300/80 ring-1 ring-rose-500/20">
                      Dégâts x3, pas de HUD, friendly fire activé
                    </div>
                  )}
                </Field>
              </>
              )}

              {error && (
                <div className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300 ring-1 ring-rose-500/30">{error}</div>
              )}

              <button
                onClick={start}
                disabled={connecting || (tab === "join" && code.length < 5)}
                className="w-full rounded-lg bg-amber-500 py-3.5 text-lg font-black text-black shadow-lg shadow-amber-500/20 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {connecting ? "CONNEXION…" : tab === "solo" ? "▶ JOUER EN SOLO" : tab === "host" ? "▶ CRÉER LA PARTIE" : "▶ REJOINDRE"}
              </button>

              {tab === "host" && (
                <p className="text-center text-xs text-white/40">
                  Tu reçois un <b className="text-amber-400">code à 5 lettres</b> à partager. Tes amis font « Rejoindre ».
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-xs text-white/30">
          Astuce : clique sur l'écran pour verrouiller la souris · Échap pour mettre en pause
        </div>
      </div>

      {/* Stats Modal */}
      {showStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={() => setShowStats(false)}>
          <div className="w-[460px] max-w-[92vw] rounded-2xl border border-white/10 bg-zinc-900/90 p-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-center text-2xl font-black tracking-tight text-white">STATISTIQUES DE CARRIÈRE</h2>
            {careerStats ? (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="text-2xl font-black text-amber-400">{careerStats.playerLevel}</div>
                    <div className="text-[10px] uppercase tracking-wider text-white/40">Niveau</div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="text-2xl font-black text-white">{careerStats.gamesPlayed}</div>
                    <div className="text-[10px] uppercase tracking-wider text-white/40">Parties</div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="text-2xl font-black text-emerald-400">{careerStats.gamesWon}</div>
                    <div className="text-[10px] uppercase tracking-wider text-white/40">Victoires</div>
                  </div>
                </div>
                <div className="flex gap-4 rounded-lg bg-white/5 p-3 text-sm">
                  <div className="flex-1 text-center">
                    <div className="text-white/40">K/D</div>
                    <div className="text-lg font-bold text-white">
                      {careerStats.totalDeaths > 0 ? (careerStats.totalKills / careerStats.totalDeaths).toFixed(2) : careerStats.totalKills > 0 ? "∞" : "0.00"}
                    </div>
                  </div>
                  <div className="flex-1 text-center">
                    <div className="text-white/40">Kills</div>
                    <div className="text-lg font-bold text-emerald-400">{careerStats.totalKills}</div>
                  </div>
                  <div className="flex-1 text-center">
                    <div className="text-white/40">Headshots</div>
                    <div className="text-lg font-bold text-yellow-400">{careerStats.totalHeadshots}</div>
                  </div>
                </div>
                <div className="rounded-lg bg-white/5 p-3">
                  <div className="mb-2 text-xs uppercase tracking-wider text-white/40">XP Totale</div>
                  <div className="h-2 bg-black/60 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 transition-all" style={{ width: `${(careerStats.totalXP % 100) / 100 * 100}%` }} />
                  </div>
                  <div className="mt-1 text-xs text-white/40 text-center">{careerStats.totalXP} XP</div>
                </div>
                <div className="rounded-lg bg-white/5 p-3">
                  <div className="text-xs uppercase tracking-wider text-white/40 mb-2">Armes</div>
                  {(["ar15", "smg", "shotgun", "sniper", "pistol"] as const).map((w) => {
                    const ws = careerStats.weaponStats[w];
                    return ws ? (
                      <div key={w} className="flex items-center justify-between py-1 text-sm border-b border-white/5 last:border-0">
                        <span className="text-white/70">{WEAPON_NAMES[w]}</span>
                        <span className="text-white/40 text-xs">K:{ws.kills} T:{ws.headshots} Niv.{ws.level}</span>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-5 text-center text-white/40">Aucune statistique</div>
            )}
            <button onClick={() => setShowStats(false)} className="mt-5 w-full rounded-lg bg-amber-500 py-3 font-bold text-black hover:bg-amber-400">
              FERMER
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-widest text-white/40">{label}</span>
      {children}
    </label>
  );
}
