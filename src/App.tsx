import { useCallback, useEffect, useRef, useState } from "react";
import Menu from "./components/Menu";
import Lobby from "./components/Lobby";
import Hud from "./components/Hud";
import { Game } from "./game/engine";
import type { GameMode } from "./game/engine";
import { Net } from "./net/net";
import type { NetCallbacks } from "./net/net";
import * as Sfx from "./game/sound";
import type { HudState, CareerStats } from "./game/types";
import { COLORS, loadCareerStats, saveCareerStats, WEAPON_LIST } from "./game/types";

interface Session {
  mode: GameMode;
  name: string;
  color: number;
  botCount: number;
  tdm?: boolean;
  team?: "red" | "blue";
  loadoutIndex?: number;
  hardcore?: boolean;
}

interface LobbyPeer {
  id: string;
  name: string;
  color: number;
  team?: "red" | "blue";
}

export default function App() {
  const [screen, setScreen] = useState<"menu" | "lobby" | "game">("menu");
  const [hud, setHud] = useState<HudState | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [conn, setConn] = useState<{ code: string | null; status: string; error: string | null }>({
    code: null,
    status: "",
    error: null,
  });
  const [lobbyPeers, setLobbyPeers] = useState<LobbyPeer[]>([]);
  const [careerStats, setCareerStats] = useState<CareerStats>(() => loadCareerStats());
  const [mapVotes, setMapVotes] = useState<number[]>([0, 0, 0]);
  const [votedMap, setVotedMap] = useState<number | undefined>(undefined);

  const sessionRef = useRef<Session | null>(null);
  const netRef = useRef<Net | null>(null);
  const gameRef = useRef<Game | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lobbyPeersRef = useRef<LobbyPeer[]>([]);

  const handleEngineEvent = useCallback((e: { type: string; data?: unknown }) => {
    if (e.type === "status") setConn((c) => ({ ...c, status: String(e.data ?? "") }));
    else if (e.type === "code") setConn((c) => ({ ...c, code: String(e.data ?? "") }));
    else if (e.type === "error") setConn((c) => ({ ...c, error: String(e.data ?? "Erreur") }));
  }, []);

  // factory for host lobby callbacks
  function lobbyHostCb(isTeamMode: boolean = false): NetCallbacks {
    return {
      onStatus: (s) => setConn((c) => ({ ...c, status: s })),
      onCodeReady: (code) => setConn((c) => ({ ...c, code })),
      onJoined: () => {},
      onPeerJoin: (id, name) => {
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        setLobbyPeers((prev) => {
          let team: "red" | "blue" | undefined;
          if (isTeamMode) {
            const hostTeam = sessionRef.current?.team ?? "red";
            const redCount = prev.filter(p => p.team === "red").length + (hostTeam === "red" ? 1 : 0);
            const blueCount = prev.filter(p => p.team === "blue").length + (hostTeam === "blue" ? 1 : 0);
            team = redCount <= blueCount ? "red" : "blue";
          }
          return [...prev, { id, name, color, team }];
        });
      },
      onPeerLeave: (id) => {
        setLobbyPeers((prev) => prev.filter((p) => p.id !== id));
      },
      onData: () => {},
      onError: (m) => setConn((c) => ({ ...c, error: m })),
    };
  }

  const startSolo = (name: string, color: number, bots: number, gameMode: string, hardcore: boolean, team: "red" | "blue", loadoutIndex?: number) => {
    const mode = (gameMode === "ffa" ? "solo" : gameMode) as GameMode;
    const isTeamMode = mode === "tdm" || mode === "dom" || mode === "snd";
    sessionRef.current = { mode, name, color, botCount: bots, tdm: isTeamMode, team, loadoutIndex, hardcore };
    setConn({ code: null, status: "Prêt au combat", error: null });
    setLobbyPeers([]);
    setScreen("lobby");
  };

  const startHost = (name: string, color: number, bots: number, gameMode: string, hardcore: boolean, team: "red" | "blue", loadoutIndex?: number) => {
    const mode = (gameMode === "ffa" ? "solo" : gameMode) as GameMode;
    const isTeamMode = mode === "tdm" || mode === "dom" || mode === "snd";
    const net = new Net(lobbyHostCb(isTeamMode));
    netRef.current = net;
    sessionRef.current = { mode: "host", name, color, botCount: bots, tdm: isTeamMode, team, loadoutIndex, hardcore };
    setConn({ code: null, status: "Création de la partie…", error: null });
    setLobbyPeers([]);
    net.host(name);
    setScreen("lobby");
  };

  const startJoin = (name: string, color: number, code: string) => {
    setConnecting(true);
    setConn({ code: null, status: "Connexion…", error: null });
    const net = new Net({
      onStatus: (s) => setConn((c) => ({ ...c, status: s })),
      onCodeReady: () => {},
      onJoined: () => {
        setConnecting(false);
        sessionRef.current = { mode: "client", name, color, botCount: 0 };
        setConn((c) => ({ ...c, error: null }));
        setScreen("lobby");
      },
      onPeerJoin: () => {},
      onPeerLeave: () => {},
      onData: (_from, msg) => {
        if (msg.t === "lobby_start") {
          lobbyPeersRef.current = [];
          setScreen("game");
        }
      },
      onError: (m) => {
        setConnecting(false);
        setConn((c) => ({ ...c, error: m }));
        netRef.current?.close();
        netRef.current = null;
      },
    });
    netRef.current = net;
    net.join(code, name);
  };

  const leave = useCallback(() => {
    gameRef.current?.dispose();
    gameRef.current = null;
    netRef.current?.close();
    netRef.current = null;
    sessionRef.current = null;
    setHud(null);
    setScreen("menu");
    setConnecting(false);
    setLobbyPeers([]);
  }, []);

  const resume = useCallback(() => {
    gameRef.current?.requestLock();
  }, []);

  const handleRestart = useCallback(() => {
    gameRef.current?.restartMatch();
  }, []);

  // create / destroy the engine when entering the game screen
  useEffect(() => {
    if (screen !== "game") return;
    const el = containerRef.current;
    const session = sessionRef.current;
    if (!el || !session) return;

    Sfx.initAudio();
    const game = new Game(el, {
      mode: session.mode,
      net: netRef.current,
      name: session.name,
      color: session.color,
      botCount: session.botCount,
      tdm: session.tdm,
      team: session.team,
      lobbyPeers: lobbyPeersRef.current,
      loadoutIndex: session.loadoutIndex,
      hardcore: session.hardcore,
      onHud: setHud,
      onLockChange: () => {},
      onEvent: handleEngineEvent,
      onCareerStatsUpdate: (data) => {
        setCareerStats((prev) => {
          const next = { ...prev };
          next.gamesPlayed++;
          if (data.won) next.gamesWon++;
          next.totalKills += data.kills;
          next.totalDeaths += data.deaths;
          next.totalHeadshots += data.headshots;
          next.totalTimePlayed += data.timePlayed;
          next.totalXP += data.playerXp;
          if (data.playerLevel > next.playerLevel) next.playerLevel = data.playerLevel;
          // Merge weapon stats
          for (const w of WEAPON_LIST) {
            const cws = next.weaponStats[w] ?? { kills: 0, headshots: 0, xp: 0, level: 1 };
            const gws = data.weapons[w];
            if (gws) {
              cws.kills += gws.kills;
              cws.headshots += gws.headshots;
              cws.xp += gws.xp;
              if (gws.level > cws.level) cws.level = gws.level;
            }
            next.weaponStats[w] = cws;
          }
          saveCareerStats(next);
          return next;
        });
      },
    });
    gameRef.current = game;
    game.start();

    return () => {
      game.dispose();
      gameRef.current = null;
      setHud(null);
    };
  }, [screen, handleEngineEvent]);

  const handleLobbyStart = useCallback(() => {
    lobbyPeersRef.current = lobbyPeers;
    if (sessionRef.current?.mode === "host" && netRef.current) {
      netRef.current.broadcast({ t: "lobby_start" });
    }
    setScreen("game");
  }, [lobbyPeers]);

  if (screen === "menu") {
    return <Menu onStartSolo={startSolo} onHost={startHost} onJoin={startJoin} error={conn.error} connecting={connecting} careerStats={careerStats} />;
  }

  if (screen === "lobby") {
    return (
      <Lobby
        mode={sessionRef.current?.mode ?? "solo"}
        code={conn.code}
        status={conn.status}
        error={conn.error}
        name={sessionRef.current?.name ?? ""}
        peers={lobbyPeers}
        botCount={sessionRef.current?.botCount ?? 0}
        team={sessionRef.current?.team}
        loadoutName={sessionRef.current?.loadoutIndex !== undefined ? ["Assaut", "Tireur", "Support", "Éclaireur", "Démolisseur"][sessionRef.current.loadoutIndex] : undefined}
        onStart={handleLobbyStart}
        onLeave={leave}
        votes={mapVotes}
        votedMap={votedMap}
        onVoteMap={(i) => {
          setVotedMap(i);
          setMapVotes((prev) => {
            const next = [...prev];
            if (votedMap !== undefined) next[votedMap] = Math.max(0, next[votedMap] - 1);
            next[i] = (next[i] || 0) + 1;
            return next;
          });
        }}
      />
    );
  }

  const mode = sessionRef.current?.mode ?? "solo";
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <div ref={containerRef} className="absolute inset-0" />
      {hud && (
        <Hud
          hud={hud}
          mode={mode}
          code={conn.code}
          status={conn.status}
          name={sessionRef.current?.name ?? ""}
          onResume={resume}
          onLeave={leave}
          onRestart={handleRestart}
          onKillstreak={(type) => (gameRef.current as any)?.activateKillstreak?.(type)}
        />
      )}
    </div>
  );
}
