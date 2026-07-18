/* AGE OF COMICS — trust-based lockstep room relay.
   The relay deliberately contains no game rules. It authenticates a socket to
   one room identity, stores the host's setup, orders messages, and replays an
   append-only log. Every browser runs the deterministic Engine locally. */

import "../js/build.js";

const BUILD_ID = globalThis.AOC_BUILD_ID;
const EXPIRE_MS = 24 * 60 * 60 * 1000;
const MAX_FRAME_CHARS = 16 * 1024;
const MAX_LOG_ENTRIES = 4000;
const MAX_ROOM_IDENTITIES = 12;
const MAX_ROOM_SOCKETS = 12;
const PID_RE = /^[a-f0-9]{16}$/;
const PLAYER_COLORS = new Set(["yellow", "salmon", "teal", "brown"]);
const ENTRY_PREFIX = "e:";
const WS_PROTOCOL = "aoc-room-v2";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/api\/room\/([A-Za-z0-9]{4,8})\/ws$/);
    if (m) return env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(m[1].toUpperCase())).fetch(req);
    if (url.pathname === "/api/build")
      return new Response(BUILD_ID, { headers: { "cache-control": "no-store" } });
    if (url.pathname.startsWith("/api/")) return new Response("not found", { status: 404 });
    return env.ASSETS.fetch(req);
  }
};

function isObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function isSeat(v, n) { return Number.isSafeInteger(v) && v >= 0 && v < n; }
function entryKey(n) { return ENTRY_PREFIX + String(n).padStart(8, "0"); }
function cleanName(v) { return String(v || "Publisher").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 24) || "Publisher"; }
function offeredProtocols(req) {
  return (req.headers.get("Sec-WebSocket-Protocol") || "").split(",").map((x) => x.trim()).filter(Boolean);
}
function suppliedToken(protocols) {
  const value = protocols.find((x) => /^aoc-token-[a-f0-9]{32}$/.test(x));
  return value ? value.slice("aoc-token-".length) : null;
}
function hex(bytes) { return [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, "0")).join(""); }
async function tokenHash(token) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
}
function validCfg(cfg) {
  if (!isObject(cfg) || !Number.isSafeInteger(cfg.n) || cfg.n < 2 || cfg.n > 4 ||
      !Array.isArray(cfg.seats) || cfg.seats.length !== cfg.n) return false;
  const humans = [];
  for (const seat of cfg.seats) {
    if (!isObject(seat) || !["human", "bot", "open"].includes(seat.kind)) return false;
    if (seat.kind === "human") {
      if (!PID_RE.test(seat.pid || "")) return false;
      humans.push(seat.pid);
    }
  }
  return new Set(humans).size === humans.length;
}
function validHello(hello) {
  if (!isObject(hello) || hello.build !== BUILD_ID || !Number.isSafeInteger(hello.seed) ||
      typeof hello.useRipoffs !== "boolean" || !["easy", "normal", "hard"].includes(hello.difficulty) ||
      !Array.isArray(hello.players) || hello.players.length < 2 || hello.players.length > 4 ||
      !Array.isArray(hello.seats) || !Array.isArray(hello.pids) ||
      hello.seats.length !== hello.players.length || hello.pids.length !== hello.players.length) return false;
  const humans = [];
  for (let i = 0; i < hello.players.length; i++) {
    const player = hello.players[i];
    if (!isObject(player) || !PLAYER_COLORS.has(player.color) ||
        typeof player.name !== "string" || player.name.length > 48 ||
        !["human", "bot"].includes(hello.seats[i]) || player.human !== (hello.seats[i] === "human")) return false;
    if (hello.seats[i] === "human") {
      if (!PID_RE.test(hello.pids[i] || "")) return false;
      humans.push(hello.pids[i]);
    } else if (hello.pids[i] !== null) return false;
  }
  return new Set(humans).size === humans.length;
}

export class GameRoom {
  constructor(ctx) { this.ctx = ctx; }

  async load() {
    if (this.loaded) return;
    const s = this.ctx.storage;
    const stored = await s.get(["hello", "cfg", "seq", "log", "order", "names", "seats", "pids", "auth", "revoked", "locked"]);
    this.hello = stored.get("hello") || null;
    this.cfg = stored.get("cfg") || null;
    this.seq = stored.get("seq") || 0;
    this.order = stored.get("order") || [];
    this.names = stored.get("names") || {};
    this.auth = stored.get("auth") || {};       // public pid -> SHA-256(private resume token)
    this.revoked = stored.get("revoked") || []; // retired token hashes
    this.locked = stored.get("locked") === true;
    this.seats = stored.get("seats") || (this.hello ? this.hello.seats.slice() : []);
    this.pids = stored.get("pids") || (this.hello ? this.hello.pids.slice() : []);

    // One-time migration for rooms created by the previous single-value log.
    const legacy = stored.get("log");
    if (Array.isArray(legacy) && legacy.length) {
      for (let i = 0; i < legacy.length; i += 120) {
        const batch = {};
        for (const e of legacy.slice(i, i + 120)) {
          if (e && Number.isSafeInteger(e.n)) batch[entryKey(e.n)] = e;
        }
        if (Object.keys(batch).length) await s.put(batch);
      }
      if (this.hello) {
        for (const entry of legacy) this.applySeatCache(entry && entry.m, this.seats, this.pids);
      }
      this.seq = Math.max(this.seq, ...legacy.map((e) => e && Number.isSafeInteger(e.n) ? e.n : 0));
      await s.put({ seq: this.seq, seats: this.seats, pids: this.pids });
      await s.delete("log");
    } else if (legacy !== undefined) {
      await s.delete("log");
    }
    this.loaded = true;
  }

  async saveLobby() {
    await this.ctx.storage.put({
      hello: this.hello, cfg: this.cfg, seq: this.seq,
      order: this.order, names: this.names, seats: this.seats, pids: this.pids,
      auth: this.auth, revoked: this.revoked, locked: this.locked,
    });
  }

  connectedPids(excludeWs = null) {
    const out = new Set();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === excludeWs) continue;
      const attachment = ws.deserializeAttachment();
      if (attachment && attachment.pid) out.add(attachment.pid);
    }
    return out;
  }
  hostPid(excludeWs = null) {
    const on = this.connectedPids(excludeWs);
    return this.order.find((pid) => on.has(pid)) || null;
  }
  roster(excludeWs = null) {
    const on = this.connectedPids(excludeWs);
    return {
      host: this.hostPid(excludeWs),
      locked: this.locked,
      players: this.order.map((pid) => ({ pid, name: this.names[pid] || "?", on: on.has(pid) })),
    };
  }
  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (_e) {} }
  broadcast(obj) { for (const ws of this.ctx.getWebSockets()) this.send(ws, obj); }
  async bumpAlarm() { await this.ctx.storage.setAlarm(Date.now() + EXPIRE_MS); }

  socketResponse(client) {
    return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": WS_PROTOCOL } });
  }
  rejectSocket(code, closeCode, reason) {
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ pid: null, rejected: true });
    this.send(pair[1], { t: "error", code });
    try { pair[1].close(closeCode, reason); } catch (_e) {}
    return this.socketResponse(pair[0]);
  }

  async replay(ws, since) {
    let cursor = entryKey(since);
    while (true) {
      const page = await this.ctx.storage.list({ prefix: ENTRY_PREFIX, startAfter: cursor, limit: 128 });
      if (!page.size) return;
      for (const [key, entry] of page) { cursor = key; this.send(ws, entry); }
      if (page.size < 128) return;
    }
  }

  async fetch(req) {
    await this.load();
    if (req.headers.get("Upgrade") !== "websocket")
      return new Response("expected websocket", { status: 426 });
    const url = new URL(req.url);
    const origin = req.headers.get("Origin");
    if (origin && origin !== url.origin) return new Response("cross-origin websocket denied", { status: 403 });
    if (url.searchParams.get("build") !== BUILD_ID)
      return new Response("client update required", { status: 409 });
    const protocols = offeredProtocols(req);
    if (!protocols.includes(WS_PROTOCOL)) return new Response("websocket protocol required", { status: 426 });

    const name = cleanName(url.searchParams.get("name"));
    const resumeToken = suppliedToken(protocols);
    const resumeHash = resumeToken ? await tokenHash(resumeToken) : null;
    if (resumeHash && this.revoked.includes(resumeHash)) return this.rejectSocket("REMOVED", 4003, "removed from table");
    let pid = resumeHash ? Object.keys(this.auth).find((id) => this.auth[id] === resumeHash) : null;
    if (resumeToken && !pid) return this.rejectSocket("BAD_CREDENTIAL", 4006, "resume credential rejected");
    const returning = !!pid;
    if (!returning && this.locked) return this.rejectSocket("TABLE_LOCKED", 4004, "table locked");
    if (!returning && (this.order.length >= MAX_ROOM_IDENTITIES || this.connectedPids().size >= MAX_ROOM_SOCKETS))
      return this.rejectSocket("ROOM_FULL", 4005, "room full");

    let issuedToken = null;
    if (!pid) {
      pid = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
      issuedToken = crypto.randomUUID().replaceAll("-", "");
      this.auth[pid] = await tokenHash(issuedToken);
    }
    const since = Math.max(0, parseInt(url.searchParams.get("since") || "0", 10) || 0);

    // Newest tab wins. This prevents two live sockets from issuing commands as
    // the same trusted player identity after a refresh or duplicated tab.
    for (const old of this.ctx.getWebSockets()) {
      const attachment = old.deserializeAttachment();
      if (attachment && attachment.pid === pid) {
        this.send(old, { t: "replaced" });
        try { old.close(4001, "desk opened elsewhere"); } catch (_e) {}
      }
    }

    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ pid });
    if (!this.order.includes(pid)) this.order.push(pid);
    this.names[pid] = name;
    await this.saveLobby();

    this.send(pair[1], { t: "you", pid, token: issuedToken, host: this.hostPid() === pid });
    if (this.cfg) this.send(pair[1], { t: "cfg", cfg: this.cfg });
    if (this.hello) this.send(pair[1], { t: "hello", hello: this.hello });
    await this.replay(pair[1], since);
    this.send(pair[1], { t: "sync", seq: this.seq });
    this.broadcast({ t: "roster", ...this.roster() });
    await this.bumpAlarm();
    return this.socketResponse(pair[0]);
  }

  applySeatCache(m, seats, pids) {
    if (!m || !seats.length) return;
    if (m.k === "seat" && isSeat(m.seat, seats.length) && m.ctl === "bot") seats[m.seat] = "bot";
    else if (m.k === "claim" && isSeat(m.seat, seats.length) && seats[m.seat] === "bot") {
      seats[m.seat] = "human";
      pids[m.seat] = m.pid;
    }
  }

  seatState() { return { seats: this.seats.slice(), pids: this.pids.slice() }; }

  async webSocketMessage(ws, data) {
    await this.load();
    if (typeof data !== "string" || data.length > MAX_FRAME_CHARS) {
      this.send(ws, { t: "error", code: "BAD_FRAME" });
      return;
    }
    let msg;
    try { msg = JSON.parse(data); } catch (_e) { return; }
    const { pid } = ws.deserializeAttachment();
    if (msg.t === "hello") {
      if (this.hello || pid !== this.hostPid() || !validHello(msg.hello)) return;
      this.hello = msg.hello;
      this.seats = this.hello.seats.slice();
      this.pids = this.hello.pids.slice();
      await this.saveLobby();
      this.broadcast({ t: "hello", hello: this.hello });
    } else if (msg.t === "cfg") {
      if (this.hello || pid !== this.hostPid() || !validCfg(msg.cfg)) return;
      this.cfg = msg.cfg;
      await this.saveLobby();
      this.broadcast({ t: "cfg", cfg: this.cfg });
    } else if (msg.t === "settings") {
      if (pid !== this.hostPid() || typeof msg.locked !== "boolean") return;
      this.locked = msg.locked;
      await this.ctx.storage.put("locked", this.locked);
      this.broadcast({ t: "roster", ...this.roster() });
    } else if (msg.t === "kick") {
      if (pid !== this.hostPid() || !PID_RE.test(msg.pid || "") || msg.pid === pid || !this.order.includes(msg.pid)) return;
      const kickedPid = msg.pid;
      const retiredHash = this.auth[kickedPid];
      if (retiredHash && !this.revoked.includes(retiredHash)) this.revoked.push(retiredHash);
      if (this.revoked.length > 32) this.revoked.shift();
      delete this.auth[kickedPid];
      delete this.names[kickedPid];
      this.order = this.order.filter((id) => id !== kickedPid);
      if (!this.hello && this.cfg) {
        for (const seat of this.cfg.seats) if (seat.kind === "human" && seat.pid === kickedPid) {
          seat.kind = "open";
          delete seat.pid;
        }
      }
      await this.saveLobby();
      for (const target of this.ctx.getWebSockets()) {
        const attachment = target.deserializeAttachment();
        if (attachment && attachment.pid === kickedPid) {
          this.send(target, { t: "removed" });
          try { target.close(4003, "removed from table"); } catch (_e) {}
        }
      }
      this.broadcast({ t: "roster", ...this.roster() });
    } else if (msg.t === "m") {
      if (!this.validRoomMessage(msg.m, pid) || this.seq >= MAX_LOG_ENTRIES) {
        this.send(ws, { t: "error", code: "BAD_ROOM_MESSAGE" });
        return;
      }
      const next = this.seq + 1;
      const entry = { t: "m", n: next, m: msg.m };
      const seats = this.seats.slice(), pids = this.pids.slice();
      this.applySeatCache(msg.m, seats, pids);
      const batch = { seq: next, [entryKey(next)]: entry };
      if (msg.m.k === "seat" || msg.m.k === "claim") {
        batch.seats = seats;
        batch.pids = pids;
      }
      await this.ctx.storage.put(batch);
      this.seq = next;
      this.seats = seats;
      this.pids = pids;
      this.broadcast(entry);
    } else if (msg.t === "ping") {
      this.send(ws, { t: "pong", at: msg.at });
    }
    await this.bumpAlarm();
  }

  validRoomMessage(m, pid) {
    if (!this.hello || !isObject(m) || typeof m.k !== "string") return false;
    const n = this.hello.players.length;
    const current = this.seatState();
    if (m.k === "cmd") {
      return isSeat(m.seat, n) && current.seats[m.seat] === "human" && current.pids[m.seat] === pid &&
        typeof m.kind === "string" && m.kind.length > 0 && m.kind.length <= 64 && isObject(m.payload) &&
        typeof m.h === "string" && /^[a-f0-9]{8}$/.test(m.h);
    }
    if (m.k === "seat") {
      if (pid !== this.hostPid() || !isSeat(m.seat, n) || m.ctl !== "bot" || current.seats[m.seat] !== "human") return false;
      return !this.connectedPids().has(current.pids[m.seat]);
    }
    if (m.k === "claim") {
      if (!isSeat(m.seat, n) || current.seats[m.seat] !== "bot" || m.pid !== pid || typeof m.name !== "string") return false;
      return !current.pids.some((owner, i) => current.seats[i] === "human" && owner === pid);
    }
    return false;
  }

  async webSocketClose(ws) { await this.load(); this.broadcast({ t: "roster", ...this.roster(ws) }); }
  async webSocketError(ws) { await this.load(); this.broadcast({ t: "roster", ...this.roster(ws) }); }

  async alarm() {
    for (const ws of this.ctx.getWebSockets()) { try { ws.close(1001, "room expired"); } catch (_e) {} }
    await this.ctx.storage.deleteAll();
    this.loaded = false;
  }
}
