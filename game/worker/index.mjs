import { DurableObject } from "cloudflare:workers";
import "../js/data.js";
import "../js/engine.js";
import "../js/protocol.js";

const { Engine } = globalThis.AOC_ENGINE;
const Protocol = globalThis.AOC_PROTOCOL;
const COLORS = new Set(["teal", "yellow", "salmon", "brown"]);
const ROOM_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_NAME_LENGTH = 32;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function cleanName(value, fallback) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_NAME_LENGTH);
  return cleaned || fallback;
}

function randomToken(bytes = 24) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("");
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function roomRoute(pathname) {
  const match = pathname.match(/^\/api\/rooms\/([a-zA-Z0-9_-]{16,80})\/(socket|join)$/);
  return match && { roomId: match[1], action: match[2] };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!sameOrigin(request)) return json({ error: "Cross-origin room requests are not allowed" }, 403);

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json"))
        return json({ error: "Expected application/json" }, 415);
      let input;
      try { input = await request.json(); } catch (_error) { return json({ error: "Malformed JSON" }, 400); }
      const hostColor = COLORS.has(input.hostColor) ? input.hostColor : "teal";
      const guestColor = COLORS.has(input.guestColor) && input.guestColor !== hostColor
        ? input.guestColor : [...COLORS].find((color) => color !== hostColor);
      const roomId = randomToken(18);
      const hostTicket = randomToken();
      const guestTicket = randomToken();
      const payload = {
        roomId,
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
        config: {
          players: [
            { color: hostColor, human: true, name: cleanName(input.hostName, "Host") },
            { color: guestColor, human: true, name: cleanName(input.guestName, "Guest") },
          ],
          useRipoffs: input.useRipoffs !== false,
          difficulty: "human",
        },
        tickets: [await hashToken(hostTicket), await hashToken(guestTicket)],
      };
      const stub = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(roomId));
      const created = await stub.fetch("https://room.internal/create", {
        method: "POST", body: JSON.stringify(payload), headers: { "content-type": "application/json" },
      });
      if (!created.ok) return json({ error: "Room could not be created" }, 500);
      const invite = new URL("/", request.url);
      invite.searchParams.set("room", roomId);
      invite.searchParams.set("ticket", guestTicket);
      return json({ roomId, seatId: 0, ticket: hostTicket, inviteUrl: invite.toString() }, 201);
    }

    const route = roomRoute(url.pathname);
    if (route && (route.action === "socket" || request.method === "GET")) {
      const protocols = (request.headers.get("sec-websocket-protocol") || "").split(",").map((value) => value.trim());
      const protocolTicket = protocols.find((value) => value.startsWith("ticket."));
      const ticket = route.action === "socket" && protocolTicket ? protocolTicket.slice(7) : (url.searchParams.get("ticket") || "");
      if (ticket.length < 20 || ticket.length > 100) return json({ error: "Invalid room ticket" }, 401);
      const stub = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(route.roomId));
      const internal = new URL(`https://room.internal/${route.action}`);
      internal.searchParams.set("ticketHash", await hashToken(ticket));
      return stub.fetch(new Request(internal, request));
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
};

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS room (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        revision INTEGER NOT NULL,
        status TEXT NOT NULL,
        config TEXT NOT NULL,
        snapshot TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tickets (
        token_hash TEXT PRIMARY KEY,
        seat_id INTEGER NOT NULL UNIQUE CHECK (seat_id IN (0, 1))
      );
      CREATE TABLE IF NOT EXISTS commands (
        command_id TEXT PRIMARY KEY,
        seat_id INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        response TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  first(query, ...params) {
    const rows = [...this.sql.exec(query, ...params)];
    return rows[0] || null;
  }

  room() {
    const row = this.first("SELECT revision, status, config, snapshot, updated_at FROM room WHERE singleton = 1");
    if (!row) return null;
    return { ...row, config: JSON.parse(row.config), snapshot: JSON.parse(row.snapshot) };
  }

  seatFor(ticketHash) {
    const row = this.first("SELECT seat_id FROM tickets WHERE token_hash = ?", ticketHash);
    return row ? row.seat_id : null;
  }

  loadEngine(room) {
    const engine = new Engine(room.config);
    engine.events.length = 0;
    engine.restore({ state: room.snapshot.state, rngA: room.snapshot.rngA, nEvents: 0 });
    return engine;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/create") return this.create(request);
    const ticketHash = url.searchParams.get("ticketHash") || "";
    const seatId = this.seatFor(ticketHash);
    if (seatId === null) return json({ error: "Room ticket was rejected" }, 401);
    if (request.method === "GET" && url.pathname === "/join") {
      const room = this.room();
      return room ? json({ seatId, revision: room.revision, status: room.status }) : json({ error: "Room not found" }, 404);
    }
    if (request.method === "GET" && url.pathname === "/socket") return this.openSocket(request, seatId);
    return json({ error: "Not found" }, 404);
  }

  async create(request) {
    if (this.room()) return json({ error: "Room already exists" }, 409);
    let payload;
    try { payload = await request.json(); } catch (_error) { return json({ error: "Malformed room" }, 400); }
    if (!payload || !Array.isArray(payload.tickets) || payload.tickets.length !== 2 ||
        !payload.config || !Array.isArray(payload.config.players) || payload.config.players.length !== 2)
      return json({ error: "Malformed room" }, 400);
    // room policy: the host founds first — the guest may still be opening
    // the invite while seat 0 plays. Setup compensation follows the order.
    const engine = new Engine({
      ...payload.config,
      seed: payload.seed,
      fixedTurnOrder: payload.config.players.map((_, i) => i),
    });
    const snapshot = engine.snapshot();
    snapshot.nEvents = 0;
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.sql.exec("INSERT INTO room (singleton, revision, status, config, snapshot, updated_at) VALUES (1, 0, 'active', ?, ?, ?)",
        JSON.stringify(engine.cfg), JSON.stringify(snapshot), now);
      this.sql.exec("INSERT INTO tickets (token_hash, seat_id) VALUES (?, 0), (?, 1)", payload.tickets[0], payload.tickets[1]);
    });
    await this.ctx.storage.setAlarm(now + ROOM_RETENTION_MS);
    return json({ ok: true }, 201);
  }

  openSocket(request, seatId) {
    if (request.headers.get("upgrade") !== "websocket") return json({ error: "WebSocket upgrade required" }, 426);
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment();
      if (attachment && attachment.seatId === seatId) socket.close(4001, "Reconnected from another tab");
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seatId });
    this.sendSnapshot(server, seatId, []);
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client, headers: { "sec-websocket-protocol": "aoc-v1" } });
  }

  send(socket, message) {
    try { socket.send(JSON.stringify(message)); } catch (_error) { /* socket closed between enumeration and send */ }
  }

  sendSnapshot(socket, seatId, events) {
    const room = this.room();
    if (!room) return;
    const engine = this.loadEngine(room);
    this.send(socket, {
      type: "snapshot",
      v: Protocol.COMMAND_VERSION,
      revision: room.revision,
      seatId,
      status: room.status,
      config: room.config,
      view: Protocol.projectState(engine, seatId),
      events: events.map((event) => Protocol.projectEvent(event, seatId)),
      stateHash: Protocol.stateHash(Protocol.projectState(engine, seatId)),
    });
  }

  broadcastSnapshot(events) {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment();
      if (attachment) this.sendSnapshot(socket, attachment.seatId, events);
    }
  }

  broadcastPresence() {
    const connected = new Set();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment();
      if (attachment) connected.add(attachment.seatId);
    }
    for (const socket of this.ctx.getWebSockets())
      this.send(socket, { type: "presence", connected: [0, 1].map((seatId) => connected.has(seatId)) });
  }

  async webSocketMessage(socket, raw) {
    const attachment = socket.deserializeAttachment();
    if (!attachment) return socket.close(4003, "Missing seat");
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    if (new TextEncoder().encode(text).byteLength > Protocol.MAX_COMMAND_BYTES)
      return this.send(socket, { type: "rejected", code: "MESSAGE_TOO_LARGE", message: "Command exceeds 16 KiB" });
    let message;
    try { message = JSON.parse(text); } catch (_error) {
      return this.send(socket, { type: "rejected", code: "BAD_JSON", message: "Message is not valid JSON" });
    }
    if (message.type === "resume") return this.sendSnapshot(socket, attachment.seatId, []);
    if (message.type !== "command") return this.send(socket, { type: "rejected", code: "BAD_MESSAGE", message: "Unknown message type" });
    const valid = Protocol.validateEnvelope(message);
    if (!valid.ok) return this.send(socket, { type: "rejected", commandId: message.commandId, ...valid });

    const duplicate = this.first("SELECT response FROM commands WHERE command_id = ? AND seat_id = ?", message.commandId, attachment.seatId);
    if (duplicate) return this.send(socket, JSON.parse(duplicate.response));
    const room = this.room();
    if (!room || room.status !== "active")
      return this.send(socket, { type: "rejected", commandId: message.commandId, code: "ROOM_CLOSED", message: "Room is no longer active" });
    if (message.expectedRevision !== room.revision) {
      this.send(socket, { type: "rejected", commandId: message.commandId, code: "REVISION_CONFLICT", message: "Room state changed; resynchronizing" });
      return this.sendSnapshot(socket, attachment.seatId, []);
    }

    const engine = this.loadEngine(room);
    const applied = Protocol.applyEngineCommand(engine, attachment.seatId, message.kind, message.payload || {});
    if (!applied.ok) return this.send(socket, { type: "rejected", commandId: message.commandId, ...applied });
    const revision = room.revision + 1;
    const now = Date.now();
    const response = { type: "accepted", v: Protocol.COMMAND_VERSION, commandId: message.commandId, revision };
    const snapshot = engine.snapshot();
    snapshot.nEvents = 0;
    this.ctx.storage.transactionSync(() => {
      this.sql.exec("UPDATE room SET revision = ?, status = ?, snapshot = ?, updated_at = ? WHERE singleton = 1",
        revision, engine.state.gameOver ? "complete" : "active", JSON.stringify(snapshot), now);
      this.sql.exec("INSERT INTO commands (command_id, seat_id, revision, response, created_at) VALUES (?, ?, ?, ?, ?)",
        message.commandId, attachment.seatId, revision, JSON.stringify(response), now);
      this.sql.exec("DELETE FROM commands WHERE created_at < ?", now - 7 * 24 * 60 * 60 * 1000);
    });
    await this.ctx.storage.setAlarm(now + ROOM_RETENTION_MS);
    this.send(socket, response);
    this.broadcastSnapshot(applied.events || []);
  }

  webSocketClose() { this.broadcastPresence(); }
  webSocketError() { this.broadcastPresence(); }

  async alarm() {
    for (const socket of this.ctx.getWebSockets()) socket.close(4000, "Private room expired");
    await this.ctx.storage.deleteAll();
  }
}
