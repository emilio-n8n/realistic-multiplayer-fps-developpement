import Peer from "peerjs";
import type { DataConnection } from "peerjs";

// Networking over WebRTC (PeerJS uses a public broker for signaling).
// Topology: star. The host is authoritative; clients connect to the host.

export const CODE_PREFIX = "codwebfps-";

export type NetMsg = Record<string, unknown> & { t: string };

export interface NetCallbacks {
  onStatus: (status: string) => void;
  onCodeReady?: (code: string) => void; // host: code is ready to share
  onJoined?: (youId: string) => void; // client: connected to host
  onPeerJoin: (id: string, name: string) => void; // host: a client connected
  onPeerLeave: (id: string) => void;
  onData: (fromId: string, msg: NetMsg) => void;
  onError?: (msg: string) => void;
}

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export class Net {
  peer: Peer | null = null;
  conns = new Map<string, DataConnection>(); // host: clientId -> conn ; client: ['host'] -> conn
  role: "host" | "client" | null = null;
  selfId = "";
  cb: NetCallbacks;
  private dead = false;

  constructor(cb: NetCallbacks) {
    this.cb = cb;
  }

  host(name: string) {
    this.role = "host";
    this.tryHost(name, 0);
  }

  private tryHost(name: string, attempt: number) {
    const code = randomCode();
    this.cb.onStatus("Création de la partie…");
    const peer = new Peer(CODE_PREFIX + code, {
      debug: 1,
    });
    this.peer = peer;

    peer.on("open", (id) => {
      this.selfId = id;
      this.cb.onCodeReady?.(code);
      this.cb.onStatus(`En attente de joueurs • CODE: ${code}`);
    });

    peer.on("connection", (conn) => {
      conn.on("open", () => {
        this.conns.set(conn.peer, conn);
      });
      conn.on("data", (data) => {
        const msg = data as NetMsg;
        if (msg.t === "hello") {
          this.cb.onPeerJoin(conn.peer, String(msg.name ?? "Player"));
        }
        this.cb.onData(conn.peer, msg);
      });
      conn.on("close", () => {
        this.conns.delete(conn.peer);
        this.cb.onPeerLeave(conn.peer);
      });
      conn.on("error", () => {
        this.conns.delete(conn.peer);
        this.cb.onPeerLeave(conn.peer);
      });
    });

    peer.on("error", (err: any) => {
      const type = err?.type ?? "";
      if (type === "unavailable-id" && attempt < 5 && !this.dead) {
        // code collided, try another
        this.peer?.destroy();
        this.tryHost(name, attempt + 1);
        return;
      }
      if (type === "peer-unavailable") {
        this.cb.onError?.("Joueur introuvable.");
        return;
      }
      this.cb.onError?.("Erreur réseau: " + (type || String(err)));
    });
  }

  join(code: string, name: string) {
    this.role = "client";
    const target = CODE_PREFIX + code.toUpperCase().trim();
    this.cb.onStatus("Connexion à l'hôte…");
    const peer = new Peer({ debug: 1 });
    this.peer = peer;

    peer.on("open", (id) => {
      this.selfId = id;
      const conn = peer.connect(target, { serialization: "json" });
      conn.on("open", () => {
        this.conns.set("host", conn);
        conn.send({ t: "hello", name });
        this.cb.onJoined?.(id);
        this.cb.onStatus("Connecté à l'hôte");
      });
      conn.on("data", (data) => {
        this.cb.onData("host", data as NetMsg);
      });
      conn.on("close", () => {
        this.conns.delete("host");
        if (!this.dead) this.cb.onError?.("L'hôte a fermé la partie.");
      });
      conn.on("error", () => {
        if (!this.dead) this.cb.onError?.("Impossible de rejoindre (code invalide ou partie fermée).");
      });
    });

    peer.on("error", (err: any) => {
      const type = err?.type ?? "";
      if (type === "peer-unavailable") {
        this.cb.onError?.("Partie introuvable. Vérifie le code.");
        return;
      }
      this.cb.onError?.("Erreur réseau: " + (type || String(err)));
    });
  }

  // client -> host
  send(msg: NetMsg) {
    const c = this.conns.get("host");
    if (c && c.open) c.send(msg);
  }

  // host -> one client
  sendTo(id: string, msg: NetMsg) {
    const c = this.conns.get(id);
    if (c && c.open) c.send(msg);
  }

  // host -> all clients (except optional)
  broadcast(msg: NetMsg, except?: string) {
    this.conns.forEach((c, id) => {
      if (id !== except && c.open) c.send(msg);
    });
  }

  close() {
    this.dead = true;
    this.conns.forEach((c) => {
      try {
        c.close();
      } catch {
        /* ignore */
      }
    });
    this.conns.clear();
    try {
      this.peer?.destroy();
    } catch {
      /* ignore */
    }
    this.peer = null;
  }
}
