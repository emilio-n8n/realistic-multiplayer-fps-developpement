import { COLORS } from "../game/types";

interface LobbyPeer {
  id: string;
  name: string;
  color: number;
  team?: "red" | "blue";
  weapon?: string;
  loadoutName?: string;
}

interface Props {
  mode: "solo" | "host" | "client" | "tdm" | "dom" | "snd";
  code: string | null;
  status: string;
  error: string | null;
  name: string;
  peers: LobbyPeer[];
  botCount: number;
  team?: "red" | "blue";
  loadoutName?: string;
  onStart: () => void;
  onLeave: () => void;
  votes?: number[];
  votedMap?: number;
  onVoteMap?: (index: number) => void;
}

function hex(c: number) {
  return "#" + c.toString(16).padStart(6, "0");
}

const ABBR: Record<string, string> = { ar15: "AR", smg: "SMG", shotgun: "SG", sniper: "SR", pistol: "PST" };

export default function Lobby({ mode, code, status, error, name, peers, botCount, team, loadoutName, onStart, onLeave }: Props) {
  const isHost = mode === "host";
  const isClient = mode === "client";
  const isSolo = mode === "solo";

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-zinc-950 text-white">
      {/* background layers */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1000px 500px at 80% 20%, rgba(245,158,11,0.12), transparent 60%), radial-gradient(800px 600px at 20% 80%, rgba(30,64,120,0.3), transparent 55%), linear-gradient(160deg,#0a0a0f,#13171f 60%,#070809)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(circle at 50% 40%, black, transparent 70%)",
        }}
      />

      {/* floating embers */}
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-amber-400/30"
          style={{
            width: 2 + (i % 3),
            height: 2 + (i % 3),
            left: `${(i * 47 + 13) % 100}%`,
            top: `${(i * 31 + 7) % 100}%`,
            animation: `floatUp ${9 + (i % 4) * 2}s linear ${i * 0.7}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes floatUp{0%{transform:translateY(10px);opacity:0}10%{opacity:1}100%{transform:translateY(-100px);opacity:0}}`}</style>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col items-center px-6 py-8">
        {/* header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-xl font-black text-black shadow-lg shadow-amber-500/30">
            ✪
          </div>
          <div>
            <h1 className="text-xl font-black leading-none tracking-tight">
              FRONT<span className="text-amber-400">LINE</span>
            </h1>
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">Tactical FPS</p>
          </div>
        </div>

        {/* lobby card */}
        <div className="mt-8 w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900/70 p-6 shadow-2xl backdrop-blur">
          {/* mode badge */}
          <div className="text-center">
            <span className="inline-block rounded-full bg-white/5 px-3 py-1 text-xs uppercase tracking-widest text-white/50">
              {isSolo && "Entraînement solo"}
              {isHost && "Partie multijoueur — Hôte"}
              {isClient && "Partie multijoueur — Client"}
            </span>
          </div>

          {/* room code (host) */}
          {isHost && code && (
            <div className="mt-5 rounded-xl bg-black/50 p-4 text-center ring-1 ring-amber-400/30">
              <div className="text-xs uppercase tracking-widest text-white/50">Code de la partie</div>
              <div className="mt-1 text-4xl font-black tracking-[0.3em] text-amber-400">{code}</div>
              <div className="mt-1 text-xs text-white/40">Partage ce code à tes amis</div>
            </div>
          )}

          {/* status */}
          <div className="mt-4 text-center">
            {status ? (
              <div className="flex items-center justify-center gap-2 text-sm text-white/60">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                {status}
              </div>
            ) : (
              <div className="text-sm text-white/40">Préparation…</div>
            )}
          </div>

          {/* error */}
          {error && (
            <div className="mt-3 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300 ring-1 ring-rose-500/30">
              {error}
            </div>
          )}

          {/* player list (host) */}
          {isHost && (
            <div className="mt-5">
              <div className="mb-2 text-xs uppercase tracking-widest text-white/40">
                Joueurs connectés ({peers.length + 1})
              </div>
              <div className="space-y-1.5">
                {/* self */}
                <div className="flex items-center gap-3 rounded-lg bg-amber-400/10 px-3 py-2 ring-1 ring-amber-400/20">
                  <span className="inline-block h-3 w-3 rounded-full ring-2 ring-white/30" style={{ background: hex(COLORS[0]) }} />
                  <span className="font-bold text-amber-200">{name}</span>
                  {loadoutName && <span className="text-[10px] text-amber-400/60">{loadoutName}</span>}
                  <span className="ml-auto flex items-center gap-2">
                    {team && (
                      <span className={`text-[10px] uppercase tracking-wider ${team === "red" ? "text-red-400" : "text-blue-400"}`}>
                        {team === "red" ? "Rouge" : "Bleu"}
                      </span>
                    )}
                    <span className="text-[10px] uppercase tracking-wider text-amber-400/60">Toi</span>
                  </span>
                </div>
                {peers.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
                    <span className="inline-block h-3 w-3 rounded-full ring-2 ring-white/10" style={{ background: hex(p.color) }} />
                    <span className="text-white/80">{p.name}</span>
                    {p.weapon && <span className="ml-1 text-[10px] text-white/40">({ABBR[p.weapon] ?? p.weapon.toUpperCase()})</span>}
                    {p.team && (
                      <span className={`ml-auto text-[10px] uppercase tracking-wider ${p.team === "red" ? "text-red-400" : "text-blue-400"}`}>
                        {p.team === "red" ? "Rouge" : "Bleu"}
                      </span>
                    )}
                  </div>
                ))}
                {/* empty slots hint */}
                {peers.length === 0 && (
                  <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-xs text-white/30">
                    En attente de joueurs…
                  </div>
                )}
              </div>
            </div>
          )}

          {/* map info */}
          <div className="mt-5 text-center">
            <div className="text-xs uppercase tracking-widest text-white/40">Carte</div>
            <div className="mt-1 text-sm font-bold text-amber-400">FRONTLINE ARENA</div>
          </div>

          {/* solo info */}
          {isSolo && (
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-center gap-4 rounded-lg bg-white/5 px-4 py-3">
                <div className="text-center">
                  <div className="text-2xl font-black text-emerald-400">{botCount}</div>
                  <div className="text-xs text-white/40">Bots ennemis</div>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div className="text-center">
                  <div className="text-2xl font-black text-white">1</div>
                  <div className="text-xs text-white/40">Joueur</div>
                </div>
              </div>
              <p className="text-center text-xs text-white/40">
                Entraînement contre {botCount} bot{botCount > 1 ? "s" : ""} contrôlé{botCount > 1 ? "s" : ""} par l'IA
              </p>
            </div>
          )}

          {/* map voting */}
          {!isSolo && (
            <div className="mt-4">
              <div className="text-xs uppercase tracking-widest text-white/40 mb-2">Vote pour la carte</div>
              <div className="flex gap-2">
                {["Frontline Arena", "Désert", "Night Ops"].map((name, i) => (
                  <button
                    key={i}
                    onClick={() => onVoteMap?.(i)}
                    className={`flex-1 rounded-lg p-3 text-center transition ${
                      votedMap === i ? 'bg-amber-500/20 ring-2 ring-amber-400' : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="text-sm font-bold text-white/80">{name}</div>
                    <div className="text-xs text-white/40">{votes?.[i] || 0} votes</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* client waiting */}
          {isClient && (
            <div className="mt-5 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-white/60">
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                En attente du lancement par l'hôte…
              </div>
              <div className="rounded-lg bg-white/5 px-4 py-2 text-xs text-white/40">
                Tu recevras automatiquement l'état de la partie
              </div>
            </div>
          )}

          {/* controls hint */}
          <div className="mt-5 grid grid-cols-2 gap-1.5 text-xs text-white/50">
            <div className="flex items-center justify-between rounded bg-white/5 px-3 py-1.5">
              <span className="font-bold text-white/70">Z Q S D</span>
              <span>Déplacement</span>
            </div>
            <div className="flex items-center justify-between rounded bg-white/5 px-3 py-1.5">
              <span className="font-bold text-white/70">Souris</span>
              <span>Viser</span>
            </div>
            <div className="flex items-center justify-between rounded bg-white/5 px-3 py-1.5">
              <span className="font-bold text-white/70">Clic G</span>
              <span>Tirer</span>
            </div>
            <div className="flex items-center justify-between rounded bg-white/5 px-3 py-1.5">
              <span className="font-bold text-white/70">Shift</span>
              <span>Sprint</span>
            </div>
            <div className="flex items-center justify-between rounded bg-white/5 px-3 py-1.5">
              <span className="font-bold text-white/70">Ctrl / C</span>
              <span>Accroupi</span>
            </div>
            <div className="flex items-center justify-between rounded bg-white/5 px-3 py-1.5">
              <span className="font-bold text-white/70">Espace</span>
              <span>Sauter</span>
            </div>
            <div className="flex items-center justify-between rounded bg-white/5 px-3 py-1.5">
              <span className="font-bold text-white/70">R</span>
              <span>Recharger</span>
            </div>
            <div className="flex items-center justify-between rounded bg-white/5 px-3 py-1.5">
              <span className="font-bold text-white/70">Tab</span>
              <span>Scores</span>
            </div>
          </div>

          {/* start button (solo/host) */}
          {!isClient && (
            <button
              onClick={onStart}
              className="mt-5 w-full rounded-lg bg-amber-500 py-3.5 text-lg font-black text-black shadow-lg shadow-amber-500/20 transition hover:bg-amber-400"
            >
              {isSolo ? "▶ COMMENCER LA PARTIE" : "▶ LANCER LA PARTIE"}
            </button>
          )}

          {/* leave button */}
          <button
            onClick={onLeave}
            className="mt-2 w-full rounded-lg bg-white/5 py-2 text-center text-sm text-white/60 ring-1 ring-white/10 transition hover:bg-white/10"
          >
            Quitter
          </button>
        </div>
      </div>
    </div>
  );
}
