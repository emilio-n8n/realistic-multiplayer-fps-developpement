import { useState } from "react";
import { COLORS } from "../game/types";

interface Props {
  onStartSolo: (name: string, color: number, bots: number) => void;
  onHost: (name: string, color: number, bots: number) => void;
  onJoin: (name: string, color: number, code: string) => void;
  error: string | null;
  connecting: boolean;
}

type Tab = "solo" | "host" | "join";

export default function Menu({ onStartSolo, onHost, onJoin, error, connecting }: Props) {
  const [tab, setTab] = useState<Tab>("solo");
  const [name, setName] = useState("Joueur");
  const [color, setColor] = useState(COLORS[0]);
  const [bots, setBots] = useState(6);
  const [code, setCode] = useState("");

  const start = () => {
    if (connecting) return;
    if (tab === "solo") onStartSolo(name.trim() || "Joueur", color, bots);
    else if (tab === "host") onHost(name.trim() || "Joueur", color, bots);
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
