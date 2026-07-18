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
    this.token = null;      // private resume credential; never shown in rosters or URLs
    this.isHost = false;
    this.roster = null;
    this.cfg = null;
    this.hello = null;
    this.seats = [];
    this.pids = [];
    this.seat = -1;        // desk currently controlled by this browser
    this.formerSeat = -1;  // last desk, kept so a replaced player can reclaim it
    this.humanId = 0;      // desk shown by the existing single-player-shaped UI
    this.engine = null;
    this.started = false;
    this.seq = 0;
    this.sent = false;      // one command in flight at a time
    this.syncing = true;    // reconnect replay must finish before new input
    this.desynced = false;
    this.closed = false;
    this.retry = 0;
    this.connecting = false;
    this.buildTimer = null;
    this.heartbeatTimer = null;
    this.awaitingPongAt = 0;
    this.sentAt = 0;
  }
  isLocalSeat(pid) {
    return !!this.engine && pid === this.seat && this.seats[pid] === "human" && this.pids[pid] === this.pid;
  }
  isBot(pid) { return this.seats[pid] === "bot"; }
  url() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return proto + "//" + location.host + "/api/room/" + this.room + "/ws?name=" +
      encodeURIComponent(this.name || "Publisher") +
      "&build=" + encodeURIComponent(root.AOC_BUILD_ID || "unknown") +
      (this.seq ? "&since=" + this.seq : "");
  }
  protocols() {
    const out = ["aoc-room-v2"];
    if (this.token && /^[a-f0-9]{32}$/.test(this.token)) out.push("aoc-token-" + this.token);
    return out;
  }
  async checkBuild() {
    if (typeof fetch !== "function") return true;
    try {
      const response = await fetch("/api/build", { cache: "no-store" });
      if (!response.ok) return true; // an offline relay is handled by reconnect
      const remote = (await response.text()).trim();
      if (remote && remote !== root.AOC_BUILD_ID) {
        this.versionFailure(remote);
        return false;
      }
    } catch (_e) { return true; }
    return true;
  }
  versionFailure(remote) {
    if (this.closed && this.versionMismatch) return;
    this.versionMismatch = true;
    this.closed = true;
    this.connecting = false;
    if (this.buildTimer) clearInterval(this.buildTimer);
    this.stopHeartbeat();
    if (this.socket) try { this.socket.close(4000, "client update required"); } catch (_e) {}
    this.dispatchEvent(new CustomEvent("versionerror", { detail: {
      local: root.AOC_BUILD_ID || "unknown", remote: remote || "unknown",
    } }));
  }
  async connect() {
    if (this.connecting || this.versionMismatch) return;
    this.connecting = true;
    this.closed = false;
    this.syncing = true;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem("aoc-net") || "null"); } catch (_e) {}
    if (saved && saved.room === this.room) {
      this.pid = this.pid || saved.pid;
      this.token = this.token || saved.token;
      this.name = this.name || saved.name;
    }
    if (!(await this.checkBuild()) || this.closed) { this.connecting = false; return; }
    const ws = this.socket = new WebSocket(this.url(), this.protocols());
    ws.onopen = () => {
      this.connecting = false;
      this.retry = 0;
      if (!this.buildTimer) this.buildTimer = setInterval(() => this.checkBuild(), 10 * 60 * 1000);
      this.startHeartbeat();
      this.dispatchEvent(new CustomEvent("status", { detail: "connected" }));
    };
    ws.onmessage = (ev) => { try { this.onMessage(JSON.parse(ev.data)); } catch (e) { console.error(e); } };
    ws.onclose = (ev) => {
      this.connecting = false;
      this.stopHeartbeat();
      if (ev.code === 4001) {
        this.closed = true;
        if (!this.replaced) {
          this.replaced = true;
          this.dispatchEvent(new CustomEvent("replaced"));
        }
      } else if ([4003, 4004, 4005, 4006].includes(ev.code)) {
        this.closed = true;
      }
      this.dispatchEvent(new CustomEvent("status", { detail: "disconnected" }));
      if (!this.closed) setTimeout(() => this.connect(), Math.min(10000, 500 * 2 ** this.retry++));
    };
    ws.onerror = () => this.socket && this.socket.close();
  }
  close() {
    this.closed = true;
    this.connecting = false;
    if (this.buildTimer) { clearInterval(this.buildTimer); this.buildTimer = null; }
    this.stopHeartbeat();
    if (this.socket) this.socket.close(1000, "leaving room");
  }
  startHeartbeat() {
    this.stopHeartbeat();
    this.awaitingPongAt = 0;
    this.heartbeatTimer = setInterval(() => this.heartbeatTick(), 15000);
  }
  heartbeatTick(now = Date.now()) {
    if ((this.awaitingPongAt && now - this.awaitingPongAt > 45000) ||
        (this.sent && this.sentAt && now - this.sentAt > 15000)) {
      if (this.socket) try { this.socket.close(4002, "connection watchdog"); } catch (_e) {}
      return false;
    }
    if (this.sendRaw({ t: "ping", at: now }) && !this.awaitingPongAt) this.awaitingPongAt = now;
    return true;
  }
  stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.awaitingPongAt = 0;
  }
  sendRaw(obj) {
    if (!this.socket || this.socket.readyState !== 1) return false;
    try { this.socket.send(JSON.stringify(obj)); return true; }
    catch (_e) { return false; }
  }
  onMessage(m) {
    if (m.t === "you") {
      this.pid = m.pid;
      if (m.token) this.token = m.token;
      this.isHost = m.host;
      try { localStorage.setItem("aoc-net", JSON.stringify({ room: this.room, pid: this.pid, token: this.token, name: this.name })); } catch (_e) {}
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
    } else if (m.t === "replaced") {
      if (!this.replaced) {
        this.replaced = true;
        this.closed = true;
        this.dispatchEvent(new CustomEvent("replaced"));
      }
    } else if (m.t === "error") {
      this.sent = false;
      this.sentAt = 0;
      this.dispatchEvent(new CustomEvent("roomerror", { detail: m.code || "ROOM_ERROR" }));
    } else if (m.t === "removed") {
      this.closed = true;
      this.dispatchEvent(new CustomEvent("roomerror", { detail: "REMOVED" }));
    } else if (m.t === "pong") {
      this.awaitingPongAt = 0;
    } else if (m.t === "sync") {
      // WebSocket delivery is ordered: hello + every missed log entry arrive
      // before this marker. If an in-flight command was accepted its echo has
      // now cleared `sent`; if it was lost, it is safe to clear it here.
      if (!Number.isSafeInteger(m.seq) || m.seq !== this.seq) return this.desync();
      this.sent = false;
      this.sentAt = 0;
      this.syncing = false;
      if (this.engine && !this.started) this.beginGame();
      this.dispatchEvent(new CustomEvent("status", { detail: "synced" }));
    } else if (m.t === "m") {
      if (m.n <= this.seq) return; // duplicate delivery after reconnect
      if (!Number.isSafeInteger(m.n) || m.n !== this.seq + 1) return this.desync();
      this.seq = m.n;
      this.apply(m.m);
    }
  }
  buildFromHello(hello) {
    if (this.engine) return; // one game per room
    if (!hello || hello.build !== root.AOC_BUILD_ID) return this.versionFailure(hello && hello.build);
    this.hello = hello;
    this.seats = hello.seats.slice();
    this.pids = (hello.pids || []).slice();
    this.seat = this.pids.indexOf(this.pid);
    this.humanId = this.seat >= 0 ? this.seat : 0;
    this.engine = new root.Engine({
      players: hello.players,
      useRipoffs: hello.useRipoffs,
      difficulty: hello.difficulty,
      seed: hello.seed,
      fixedTurnOrder: hello.players.map((_, i) => i), // host founds first
    });
    this.drainBots();
    if (!this.syncing) this.beginGame();
  }
  beginGame() {
    if (this.started || !this.engine) return;
    this.started = true;
    this.dispatchEvent(new CustomEvent("start"));
  }
  apply(m) {
    if (this.desynced) return;
    if (m.k === "cmd") {
      const g = this.engine;
      if (!g) return;
      // desync sentinel: the sender stamped its pre-command state hash
      if (m.h && m.h !== protocol.engineHash(g)) return this.desync();
      const result = protocol.applyEngineCommand(g, m.seat, m.kind, m.payload);
      if (m.seat === this.seat) this.sent = false;
      if (m.seat === this.seat) this.sentAt = 0;
      if (!result.ok) return this.desync(); // the sender validated it: divergence
      this.drainBots();
      this.dispatchEvent(new CustomEvent("applied", { detail: { seat: m.seat, kind: m.kind } }));
    } else if (m.k === "seat") { // disconnect fallback: the seat plays on as a bot
      if (!Number.isSafeInteger(m.seat) || m.seat < 0 || m.seat >= this.seats.length || m.ctl !== "bot")
        return this.desync();
      this.seats[m.seat] = m.ctl;
      if (m.seat === this.seat) {
        this.formerSeat = m.seat;
        this.seat = -1;
        this.humanId = m.seat; // keep showing the desk while it is automated
        this.sent = false;
        this.sentAt = 0;
      }
      this.drainBots();
      this.dispatchEvent(new CustomEvent("applied", { detail: { seat: m.seat, kind: "seat" } }));
    } else if (m.k === "claim") { // reclaim after a drop, or a late join
      if (this.seats[m.seat] !== "bot") return; // not claimable: drop identically everywhere
      this.seats[m.seat] = "human";
      this.pids[m.seat] = m.pid || null;
      if (m.pid === this.pid) {
        this.seat = this.humanId = m.seat;
        this.formerSeat = -1;
      } else if (this.seat === m.seat) {
        this.formerSeat = m.seat;
        this.seat = -1;
        this.humanId = m.seat;
      }
      this.drainBots();
      this.dispatchEvent(new CustomEvent("applied", { detail: { seat: m.seat, kind: "claim" } }));
    }
  }
  // Multiplayer bots are part of the deterministic simulation, not the UI
  // animation loop. Every client drains the same bot work synchronously after
  // each ordered room message, so background-tab timer throttling cannot alter
  // the state observed by the next human command.
  drainBots() {
    const g = this.engine, ai = root.AI;
    if (!g || !ai || this.desynced) return;
    let guard = 0;
    while (guard++ < 500) {
      const s = g.state;
      if (s.gameOver) return;
      if (s.pending) {
        if (!this.isBot(s.pending.playerId)) return;
        ai.resolveOwnPendings(g, s.pending.playerId);
        continue;
      }
      if (s.awaitingSpecial) {
        if (!this.isBot(s.awaitingSpecial.player)) return;
        ai.settle(g, s.awaitingSpecial.player);
        continue;
      }
      if (s.salesSession) {
        if (!this.isBot(s.salesSession.player)) return;
        g.salesEnd(s.salesSession.player);
        continue;
      }
      if (s.phase === "increase") {
        const pid = s.turnOrder[s.turnIdx];
        if (pid === undefined) { g.advanceIncrease(); continue; }
        if (!this.isBot(pid)) return;
        ai.doStartingPicks(g, pid);
        ai.doIncrease(g, pid);
        continue;
      }
      if (s.phase === "actions") {
        const pid = g.currentPlayerId();
        if (pid === null || !this.isBot(pid)) return;
        ai.takeTurn(g, pid);
        continue;
      }
      return;
    }
    this.desync();
  }
  desync() {
    this.desynced = true;
    this.dispatchEvent(new CustomEvent("desync"));
  }
  dispatch(kind, payload = {}) {
    if (this.desynced) return { ok: false, code: "DESYNC", message: "Out of sync with the room — reload the page to rejoin." };
    if (!this.engine || this.seat < 0 || this.seats[this.seat] !== "human" || this.pids[this.seat] !== this.pid)
      return { ok: false, code: "NO_SEAT", message: "You are watching this table." };
    if (this.syncing) return { ok: false, code: "SYNCING", message: "Replaying the latest room moves — try again in a moment." };
    if (this.sent) return { ok: false, code: "IN_FLIGHT", message: "Your last move is still being filed." };
    if (!this.socket || this.socket.readyState !== 1) return { ok: false, code: "OFFLINE", message: "Not connected to the room." };
    // validate on a scratch rewind: the real mutation happens on the echo
    const g = this.engine;
    const h = protocol.engineHash(g);
    const snap = g.snapshot();
    const evLen = g.events.length;
    const check = protocol.applyEngineCommand(g, this.seat, kind, payload);
    g.restore(snap);
    g.events.length = evLen;
    if (!check.ok) return check;
    this.sent = true;
    this.sentAt = Date.now();
    if (!this.sendRaw({ t: "m", m: { k: "cmd", seat: this.seat, kind, payload, h } })) {
      this.sent = false;
      this.sentAt = 0;
      return { ok: false, code: "OFFLINE", message: "The room connection closed before that move was sent." };
    }
    return { ok: true, queued: true };
  }
  // ---- lobby & seat management (host tools + reclaiming) ----
  sendCfg(cfg) { this.cfg = cfg; this.sendRaw({ t: "cfg", cfg }); }
  sendHello(hello) { this.sendRaw({ t: "hello", hello }); }
  setLocked(locked) { this.sendRaw({ t: "settings", locked: !!locked }); }
  removeParticipant(pid) { this.sendRaw({ t: "kick", pid }); }
  replaceWithBot(seat) { this.sendRaw({ t: "m", m: { k: "seat", seat, ctl: "bot" } }); }
  claimSeat(seat) { this.sendRaw({ t: "m", m: { k: "claim", seat, pid: this.pid, name: this.name } }); }
}

return { LocalSession, RemoteSession };
});
