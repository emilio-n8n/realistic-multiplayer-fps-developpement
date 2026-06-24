import { useCallback, useEffect, useRef, useState } from "react";
import Menu from "./components/Menu";
import Hud from "./components/Hud";
import { Game } from "./game/engine";
import type { GameMode } from "./game/engine";
import { Net } from "./net/net";
import type { NetCallbacks } from "./net/net";
import * as Sfx from "./game/sound";
import type { HudState } from "./game/types";

interface Session {
  mode: GameMode;
  name: string;
  color: number;
  botCount: number;
}

export default function App() {
  const [screen, setScreen] = useState<"menu" | "game">("menu");
  const [hud, setHud] = useState<HudState | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [conn, setConn] = useState<{ code: string | null; status: string; error: string | null }>({
    code: null,
    status: "",
    error: null,
  });

  const sessionRef = useRef<Session | null>(null);
  const netRef = useRef<Net | null>(null);
  const gameRef = useRef<Game | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleEngineEvent = useCallback((e: { type: string; data?: unknown }) => {
    if (e.type === "status") setConn((c) => ({ ...c, status: String(e.data ?? "") }));
    else if (e.type === "code") setConn((c) => ({ ...c, code: String(e.data ?? "") }));
    else if (e.type === "error") setConn((c) => ({ ...c, error: String(e.data ?? "Erreur") }));
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
      onHud: setHud,
      onLockChange: () => {},
      onEvent: handleEngineEvent,
    });
    gameRef.current = game;
    game.start();

    return () => {
      game.dispose();
      gameRef.current = null;
      setHud(null);
    };
  }, [screen, handleEngineEvent]);

  const startSolo = (name: string, color: number, bots: number) => {
    sessionRef.current = { mode: "solo", name, color, botCount: bots };
    setConn({ code: null, status: "Entraînement solo", error: null });
    setScreen("game");
  };

  const startHost = (name: string, color: number, bots: number) => {
    const net = new Net(engineNetCb());
    netRef.current = net;
    sessionRef.current = { mode: "host", name, color, botCount: bots };
    setConn({ code: null, status: "Création de la partie…", error: null });
    net.host(name);
    setScreen("game");
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
        setScreen("game");
      },
      onPeerJoin: () => {},
      onPeerLeave: () => {},
      onData: () => {},
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

  // factory for the engine's net callbacks (host keeps these while waiting too)
  function engineNetCb(): NetCallbacks {
    return {
      onStatus: (s) => setConn((c) => ({ ...c, status: s })),
      onCodeReady: (code) => setConn((c) => ({ ...c, code })),
      onJoined: () => {},
      onPeerJoin: () => {},
      onPeerLeave: () => {},
      onData: () => {},
      onError: (m) => setConn((c) => ({ ...c, error: m })),
    };
  }

  const leave = useCallback(() => {
    gameRef.current?.dispose();
    gameRef.current = null;
    netRef.current?.close();
    netRef.current = null;
    sessionRef.current = null;
    setHud(null);
    setScreen("menu");
    setConnecting(false);
  }, []);

  const resume = useCallback(() => {
    gameRef.current?.requestLock();
  }, []);

  if (screen === "menu") {
    return <Menu onStartSolo={startSolo} onHost={startHost} onJoin={startJoin} error={conn.error} connecting={connecting} />;
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
        />
      )}
    </div>
  );
}
