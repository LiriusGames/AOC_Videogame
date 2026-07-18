// ============================================================================
// AGE OF COMICS — local/remote session boundary
// UI sends commands through a session; only LocalSession mutates a local Engine.
// ============================================================================
(function initSessionModule(root, factory) {
  const protocol = root.AOC_PROTOCOL || (typeof require !== "undefined" ? require("./protocol.js") : null);
  if (!protocol) throw new Error("Age of Comics protocol module must load before sessions");
  const api = factory(protocol, root);
  root.AOC_SESSION = api;
  Object.assign(root, api);
  if (typeof module !== "undefined") module.exports = api;
})(globalThis, function buildSessionModule(protocol, root) {
"use strict";

class LocalSession {
  constructor(engine, humanId = 0) {
    this.mode = "local";
    this.engine = engine;
    this.humanId = humanId;
  }
  isLocalSeat(pid) { return pid === this.humanId; }
  isBot(pid) { return !this.engine.player(pid).human; }
  dispatch(kind, payload = {}) {
    if (root.Tutor && root.Tutor.active && !root.Tutor.allowCommand(kind, payload))
      return { ok: false, code: "TUTOR_GATE", message: "Follow the highlighted tutorial step — or skip the tour." };
    const result = protocol.applyEngineCommand(this.engine, this.humanId, kind, payload);
    if (result.ok && root.Tutor && root.Tutor.active) root.Tutor.afterCommand(kind, payload, result);
    return result;
  }
}

class RemoteSession extends EventTarget {
  // The lockstep room client (handoff/yokai/NOTES.md): every client runs the
  // identical deterministic Engine; local input NEVER mutates it directly —
  // a command is validated on a scratch rewind, sent to the relay, and the
  // mutation happens when the echo returns in global order. Bots live in the
  // sim: every client advances them locally, so their moves never travel.
  constructor({ room, name }) {
    super();
    this.mode = "remote";
    this.room = room;
    this.name = name;
    this.pid = null;
    this.isHost = false;
    this.roster = null;
    this.cfg = null;
    this.hello = null;
    this.seats = [];
    this.pids = [];
    this.seat = -1;
    this.humanId = -1;
    this.engine = null;
    this.seq = 0;
    this.sent = false;      // one command in flight at a time
    this.desynced = false;
    this.closed = false;
    this.retry = 0;
  }
  isLocalSeat(pid) { return !!this.engine && pid === this.seat; }
  isBot(pid) { return this.seats[pid] === "bot"; }
  url() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return proto + "//" + location.host + "/api/room/" + this.room + "/ws?name=" +
      encodeURIComponent(this.name || "Publisher") +
      (this.pid ? "&pid=" + this.pid : "") + (this.seq ? "&since=" + this.seq : "");
  }
  connect() {
    this.closed = false;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem("aoc-net") || "null"); } catch (_e) {}
    if (saved && saved.room === this.room) {
      this.pid = this.pid || saved.pid;
      this.name = this.name || saved.name;
    }
    const ws = this.socket = new WebSocket(this.url());
    ws.onopen = () => { this.retry = 0; this.dispatchEvent(new CustomEvent("status", { detail: "connected" })); };
    ws.onmessage = (ev) => { try { this.onMessage(JSON.parse(ev.data)); } catch (e) { console.error(e); } };
    ws.onclose = () => {
      this.dispatchEvent(new CustomEvent("status", { detail: "disconnected" }));
      if (!this.closed) setTimeout(() => this.connect(), Math.min(10000, 500 * 2 ** this.retry++));
    };
    ws.onerror = () => this.socket && this.socket.close();
  }
  close() { this.closed = true; if (this.socket) this.socket.close(1000, "leaving room"); }
  sendRaw(obj) { if (this.socket && this.socket.readyState === 1) this.socket.send(JSON.stringify(obj)); }
  onMessage(m) {
    if (m.t === "you") {
      this.pid = m.pid;
      this.isHost = m.host;
      try { localStorage.setItem("aoc-net", JSON.stringify({ room: this.room, pid: this.pid, name: this.name })); } catch (_e) {}
      this.dispatchEvent(new CustomEvent("lobby"));
    } else if (m.t === "roster") {
      this.roster = m;
      this.isHost = m.host === this.pid;
      this.dispatchEvent(new CustomEvent("lobby"));
    } else if (m.t === "cfg") {
      this.cfg = m.cfg;
      this.dispatchEvent(new CustomEvent("lobby"));
    } else if (m.t === "hello") {
      this.buildFromHello(m.hello);
    } else if (m.t === "m") {
      if (m.n <= this.seq) return; // duplicate delivery after reconnect
      this.seq = m.n;
      this.apply(m.m);
    }
  }
  buildFromHello(hello) {
    if (this.engine) return; // one game per room
    this.hello = hello;
    this.seats = hello.seats.slice();
    this.pids = (hello.pids || []).slice();
    this.seat = this.humanId = this.pids.indexOf(this.pid);
    this.engine = new root.Engine({
      players: hello.players,
      useRipoffs: hello.useRipoffs,
      difficulty: hello.difficulty,
      seed: hello.seed,
      fixedTurnOrder: hello.players.map((_, i) => i), // host founds first
    });
    this.dispatchEvent(new CustomEvent("start"));
  }
  apply(m) {
    if (this.desynced) return;
    if (m.k === "cmd") {
      const g = this.engine;
      if (!g) return;
      // desync sentinel: the sender stamped its pre-command state hash
      if (m.h && m.h !== protocol.stateHash(g.state)) return this.desync();
      const result = protocol.applyEngineCommand(g, m.seat, m.kind, m.payload);
      if (m.seat === this.seat) this.sent = false;
      if (!result.ok) return this.desync(); // the sender validated it: divergence
      this.dispatchEvent(new CustomEvent("applied", { detail: { seat: m.seat, kind: m.kind } }));
    } else if (m.k === "seat") { // disconnect fallback: the seat plays on as a bot
      this.seats[m.seat] = m.ctl;
      this.dispatchEvent(new CustomEvent("applied", { detail: { seat: m.seat, kind: "seat" } }));
    } else if (m.k === "claim") { // reclaim after a drop, or a late join
      if (this.seats[m.seat] !== "bot") return; // not claimable: drop identically everywhere
      this.seats[m.seat] = "human";
      this.pids[m.seat] = m.pid || null;
      if (m.pid === this.pid) this.seat = this.humanId = m.seat;
      this.dispatchEvent(new CustomEvent("applied", { detail: { seat: m.seat, kind: "claim" } }));
    }
  }
  desync() {
    this.desynced = true;
    this.dispatchEvent(new CustomEvent("desync"));
  }
  dispatch(kind, payload = {}) {
    if (this.desynced) return { ok: false, code: "DESYNC", message: "Out of sync with the room — reload the page to rejoin." };
    if (!this.engine || this.seat < 0) return { ok: false, code: "NO_SEAT", message: "You are watching this table." };
    if (this.sent) return { ok: false, code: "IN_FLIGHT", message: "Your last move is still being filed." };
    if (!this.socket || this.socket.readyState !== 1) return { ok: false, code: "OFFLINE", message: "Not connected to the room." };
    // validate on a scratch rewind: the real mutation happens on the echo
    const g = this.engine;
    const h = protocol.stateHash(g.state);
    const snap = g.snapshot();
    const evLen = g.events.length;
    const check = protocol.applyEngineCommand(g, this.seat, kind, payload);
    g.restore(snap);
    g.events.length = evLen;
    if (!check.ok) return check;
    this.sent = true;
    this.sendRaw({ t: "m", m: { k: "cmd", seat: this.seat, kind, payload, h } });
    return { ok: true, queued: true };
  }
  // ---- lobby & seat management (host tools + reclaiming) ----
  sendCfg(cfg) { this.cfg = cfg; this.sendRaw({ t: "cfg", cfg }); }
  sendHello(hello) { this.sendRaw({ t: "hello", hello }); }
  replaceWithBot(seat) { this.sendRaw({ t: "m", m: { k: "seat", seat, ctl: "bot" } }); }
  claimSeat(seat) { this.sendRaw({ t: "m", m: { k: "claim", seat, pid: this.pid, name: this.name } }); }
}

return { LocalSession, RemoteSession };
});
