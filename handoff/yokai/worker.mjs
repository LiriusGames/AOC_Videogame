/* Yokai Ryokan — room relay (Cloudflare Worker + Durable Object).
   Deliberately dumb: no game rules live here, ever (docs/multiplayer-plan.md).
   The Worker serves the static game; each room is one Durable Object that
   assigns player ids, stores the host's session setup ("hello"), stamps every
   game message with a global sequence number and rebroadcasts it to everyone —
   sender included, because clients apply a message only when it comes back
   ordered. The whole ordered log is kept so a reconnecting client can replay
   from any point (`since`). Rooms self-delete a day after the last activity. */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,8})\/ws$/);
    if (m) return env.ROOM.get(env.ROOM.idFromName(m[1].toUpperCase())).fetch(req);
    if (url.pathname === "/build") // stale-tab check: clients compare this with their baked-in stamp
      return new Response(env.BUILD || "dev", { headers: { "cache-control": "no-store" } });
    if ((url.pathname === "/log" || url.pathname === "/note") && req.method === "POST")
      return env.LEDGER.get(env.LEDGER.idFromName("ledger")).fetch(req);
    if (url.pathname.startsWith("/admin")) { // private playtest ledger
      if (!env.ADMIN_KEY || url.searchParams.get("key") !== env.ADMIN_KEY)
        return new Response("forbidden", { status: 403 });
      return env.LEDGER.get(env.LEDGER.idFromName("ledger")).fetch(req);
    }
    return env.ASSETS.fetch(req);
  }
};

const EXPIRE_MS = 24 * 60 * 60 * 1000;

export class Room {
  constructor(ctx) { this.ctx = ctx; }

  async load() {
    if (this.loaded) return;
    const s = this.ctx.storage;
    this.hello = (await s.get("hello")) || null; // host's session setup, replayed to late joiners
    this.cfg = (await s.get("cfg")) || null; // host's lobby seat plan, replayed to joiners
    this.seq = (await s.get("seq")) || 0;
    this.log = (await s.get("log")) || [];
    this.order = (await s.get("order")) || []; // pids by first join; host = first still connected
    this.names = (await s.get("names")) || {};
    this.loaded = true;
  }
  async save() {
    const s = this.ctx.storage;
    await s.put({ hello: this.hello, cfg: this.cfg, seq: this.seq, log: this.log, order: this.order, names: this.names });
  }

  connectedPids() {
    const out = new Set();
    for (const ws of this.ctx.getWebSockets()) out.add(ws.deserializeAttachment().pid);
    return out;
  }
  hostPid() {
    const on = this.connectedPids();
    return this.order.find(pid => on.has(pid)) || null;
  }
  roster() {
    const on = this.connectedPids();
    return {
      host: this.hostPid(),
      players: this.order.map(pid => ({ pid, name: this.names[pid] || "?", on: on.has(pid) }))
    };
  }
  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (_) {} }
  broadcast(obj, except) {
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) this.send(ws, obj);
  }
  async bumpAlarm() { await this.ctx.storage.setAlarm(Date.now() + EXPIRE_MS); }

  async fetch(req) {
    await this.load();
    if (req.headers.get("Upgrade") !== "websocket")
      return new Response("expected websocket", { status: 426 });
    const url = new URL(req.url);
    const name = (url.searchParams.get("name") || "Guest").slice(0, 24);
    let pid = url.searchParams.get("pid") || ""; // a returning player reclaims their id
    if (!/^[a-f0-9]{8}$/.test(pid)) pid = crypto.randomUUID().slice(0, 8);
    const since = parseInt(url.searchParams.get("since") || "0", 10) || 0;

    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]); // hibernation API: handlers below, no memory held while idle
    pair[1].serializeAttachment({ pid });
    if (!this.order.includes(pid)) this.order.push(pid);
    this.names[pid] = name;
    await this.save();

    this.send(pair[1], { t: "you", pid, host: this.hostPid() === pid });
    if (this.cfg) this.send(pair[1], { t: "cfg", cfg: this.cfg });
    if (this.hello) this.send(pair[1], { t: "hello", hello: this.hello });
    for (const e of this.log) if (e.n > since) this.send(pair[1], e);
    this.broadcast({ t: "roster", ...this.roster() });
    await this.bumpAlarm();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws, data) {
    await this.load();
    let msg; try { msg = JSON.parse(data); } catch (_) { return; }
    const { pid } = ws.deserializeAttachment();
    if (msg.t === "hello") {
      if (this.hello || pid !== this.hostPid()) return; // only the host, only once
      this.hello = msg.hello;
      await this.save();
      this.broadcast({ t: "hello", hello: this.hello });
    } else if (msg.t === "cfg") { // lobby seat plan: host-only, mutable until the game starts
      if (this.hello || pid !== this.hostPid()) return;
      this.cfg = msg.cfg;
      await this.save();
      this.broadcast({ t: "cfg", cfg: this.cfg });
    } else if (msg.t === "m") {
      const e = { t: "m", n: ++this.seq, m: msg.m };
      this.log.push(e);
      await this.save();
      this.broadcast(e);
    } else if (msg.t === "ping") {
      this.send(ws, { t: "pong" });
    }
    await this.bumpAlarm();
  }

  async webSocketClose(ws) { await this.load(); this.broadcast({ t: "roster", ...this.roster() }); }
  async webSocketError(ws) { await this.load(); this.broadcast({ t: "roster", ...this.roster() }); }

  async alarm() { // room expired: drop everything
    for (const ws of this.ctx.getWebSockets()) { try { ws.close(1001, "room expired"); } catch (_) {} }
    await this.ctx.storage.deleteAll();
    this.loaded = false;
  }
}

/* Playtest ledger: one SQLite-backed Durable Object collecting every finished
   game the clients report (POST /log) and serving the private dashboard
   (GET /admin — the key check happens in the Worker before we are reached).
   Knows nothing about the rules; stores what it is sent. */
export class Ledger {
  constructor(ctx) {
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS games(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL, mode TEXT, room TEXT, seed TEXT,
      summary TEXT, log TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS notes(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL, mode TEXT, room TEXT, seed TEXT,
      author TEXT, text TEXT)`);
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/log") {
      const body = await req.text();
      if (body.length > 400000) return new Response("too big", { status: 413 });
      let p; try { p = JSON.parse(body); } catch (_) { return new Response("bad json", { status: 400 }); }
      const seed = p.seed != null ? String(p.seed) : null;
      const room = p.room ? String(p.room).slice(0, 8) : null;
      if (seed && room) { // an online game is reported once, whoever reports it
        const dup = this.sql.exec("SELECT id FROM games WHERE room=? AND seed=?", room, seed).toArray();
        if (dup.length) return new Response("dup");
      }
      const events = p.events || []; delete p.events;
      this.sql.exec("INSERT INTO games(ts,mode,room,seed,summary,log) VALUES(?,?,?,?,?,?)",
        new Date().toISOString(), String(p.mode || "?").slice(0, 16), room, seed,
        JSON.stringify(p), JSON.stringify(events));
      return new Response("ok");
    }
    if (req.method === "POST" && url.pathname === "/note") { // player feedback
      const body = await req.text();
      if (body.length > 5000) return new Response("too big", { status: 413 });
      let p; try { p = JSON.parse(body); } catch (_) { return new Response("bad json", { status: 400 }); }
      const text = String(p.text || "").trim().slice(0, 2000);
      if (!text) return new Response("empty", { status: 400 });
      this.sql.exec("INSERT INTO notes(ts,mode,room,seed,author,text) VALUES(?,?,?,?,?,?)",
        new Date().toISOString(), String(p.mode || "?").slice(0, 16),
        p.room ? String(p.room).slice(0, 8) : null, p.seed != null ? String(p.seed) : null,
        String(p.author || "?").slice(0, 24), text);
      return new Response("ok");
    }
    if (url.pathname === "/admin/game") {
      const id = parseInt(url.searchParams.get("id") || "0", 10);
      const row = this.sql.exec("SELECT * FROM games WHERE id=?", id).toArray()[0];
      if (!row) return new Response("not found", { status: 404 });
      const whenIt = (ts) => { try { return new Date(ts).toLocaleString("sv-SE", { timeZone: "Europe/Rome" }); } catch (_) { return ts; } };
      return new Response(JSON.stringify(
        { id: row.id, when: whenIt(row.ts) + " (Italy)", ts: row.ts, mode: row.mode, room: row.room, seed: row.seed,
          summary: JSON.parse(row.summary), events: JSON.parse(row.log) }, null, 2),
        { headers: { "content-type": "application/json; charset=utf-8" } });
    }
    // GET /admin — the dashboard (trimmed for handoff; see Yokai repo for full HTML)
    const rows = this.sql.exec("SELECT id,ts,mode,room,summary FROM games ORDER BY id DESC LIMIT 300").toArray();
    return new Response(JSON.stringify(rows.map(r => ({ id: r.id, ts: r.ts, mode: r.mode, room: r.room }))),
      { headers: { "content-type": "application/json" } });
  }
}
