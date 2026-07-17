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
  constructor({ roomId, ticket, humanId, socketUrl }) {
    super();
    this.mode = "remote";
    this.roomId = roomId;
    this.ticket = ticket;
    this.humanId = humanId;
    this.socketUrl = socketUrl;
    this.revision = 0;
    this.view = null;
    this.engine = null;
    this.events = [];
    this.socket = null;
    this.pending = new Map();
    this.retry = 0;
    this.closed = false;
  }
  isLocalSeat(pid) { return pid === this.humanId; }
  isBot(pid) { return !!(this.view && this.view.controllers && this.view.controllers[pid] === "bot"); }
  connect() {
    this.closed = false;
    const url = new URL(this.socketUrl, location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    this.socket = new WebSocket(url, ["aoc-v1", `ticket.${this.ticket}`]);
    this.socket.onopen = () => {
      this.retry = 0;
      this.socket.send(JSON.stringify({ type: "resume", v: protocol.COMMAND_VERSION, lastRevision: this.revision }));
      this.dispatchEvent(new CustomEvent("status", { detail: "connected" }));
    };
    this.socket.onmessage = (event) => this.onMessage(event.data);
    this.socket.onclose = () => {
      this.dispatchEvent(new CustomEvent("status", { detail: "disconnected" }));
      if (!this.closed) setTimeout(() => this.connect(), Math.min(10000, 500 * (2 ** this.retry++)));
    };
    this.socket.onerror = () => this.socket && this.socket.close();
  }
  close() { this.closed = true; if (this.socket) this.socket.close(1000, "leaving room"); }
  dispatch(kind, payload = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN)
      return { ok: false, code: "OFFLINE", message: "Not connected to the room" };
    const commandId = crypto.randomUUID();
    const expectedRevision = this.revision + this.pending.size;
    const message = { type: "command", v: protocol.COMMAND_VERSION, commandId, expectedRevision, kind, payload };
    // Keep synchronous scene code responsive while the room remains the sole
    // authority. Hidden-deck commands cannot be predicted from a redacted view;
    // everything else may update the disposable projection until the room's
    // snapshot replaces it.
    const hiddenDeckCommand = kind === "starting_picks" ||
      (kind === "action_hire" && (payload.writer === "deck" || payload.artist === "deck")) ||
      (kind === "action_develop" && (payload.comic === "deck" || payload.searchGenre));
    if (!hiddenDeckCommand && this.engine) {
      const eventCount = this.engine.events.length;
      const predicted = protocol.applyEngineCommand(this.engine, this.humanId, kind, payload);
      if (!predicted.ok) return predicted;
      this.engine.events.length = eventCount;
    }
    this.pending.set(commandId, message);
    this.socket.send(JSON.stringify(message));
    return { ok: true, commandId };
  }
  onMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (_e) { return; }
    if (msg.type === "snapshot") {
      this.revision = msg.revision;
      this.humanId = msg.seatId;
      this.view = msg.view;
      this.events = msg.events || [];
      if (!this.engine) {
        this.engine = new root.Engine(msg.config);
        this.engine.events.length = 0;
      }
      this.engine.state = structuredClone(msg.view);
      this.engine.events.push(...this.events);
      this.dispatchEvent(new CustomEvent("snapshot", { detail: msg }));
    } else if (msg.type === "accepted") {
      this.revision = msg.revision;
      this.pending.delete(msg.commandId);
    } else if (msg.type === "rejected") {
      this.pending.clear();
      if (root.toast) root.toast(msg.message || "The room rejected that move.");
      if (msg.snapshot) this.onMessage(JSON.stringify(msg.snapshot));
    } else if (msg.type === "presence") {
      this.dispatchEvent(new CustomEvent("presence", { detail: msg }));
    }
  }
}

return { LocalSession, RemoteSession };
});
