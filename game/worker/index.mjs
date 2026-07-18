/* AGE OF COMICS — room relay (Cloudflare Worker + Durable Object).
   The Yokai model (handoff/yokai/NOTES.md): deliberately DUMB — no game
   rules live here, ever. The Worker serves the static game; each room is one
   Durable Object that assigns player ids, stores the host's one-time session
   setup ("hello"), stamps every game message with a global sequence number
   and rebroadcasts it to everyone — sender included, because clients apply a
   message only when it comes back ordered. The whole ordered log is kept so
   a reconnecting client replays from any point (`since`). Rooms self-delete
   a day after the last activity.

   The previous authoritative room (engine in the DO, revision control,
   redacted views, hashed tickets) is retired: private tables among friends
   run the deterministic engine on every client instead. */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/api\/room\/([A-Za-z0-9]{4,8})\/ws$/);
    if (m) return env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(m[1].toUpperCase())).fetch(req);
    if (url.pathname === "/api/build") // stale-tab check: clients compare with their baked-in stamp
      return new Response(env.BUILD || "dev", { headers: { "cache-control": "no-store" } });
    if (url.pathname.startsWith("/api/")) return new Response("not found", { status: 404 });
    return env.ASSETS.fetch(req);
  }
};

const EXPIRE_MS = 24 * 60 * 60 * 1000;

export class GameRoom {
  constructor(ctx) { this.ctx = ctx; }

  async load() {
    if (this.loaded) return;
    const s = this.ctx.storage;
    this.hello = (await s.get("hello")) || null; // host's session setup, replayed to late joiners
    this.cfg = (await s.get("cfg")) || null;     // host's lobby seat plan, mutable until hello
    this.seq = (await s.get("seq")) || 0;
    this.log = (await s.get("log")) || [];
    this.order = (await s.get("order")) || [];   // pids by first join; host = first still connected
    this.names = (await s.get("names")) || {};
    this.loaded = true;
  }
  async save() {
    await this.ctx.storage.put({
      hello: this.hello, cfg: this.cfg, seq: this.seq,
      log: this.log, order: this.order, names: this.names,
    });
  }

  connectedPids() {
    const out = new Set();
    for (const ws of this.ctx.getWebSockets()) out.add(ws.deserializeAttachment().pid);
    return out;
  }
  hostPid() {
    const on = this.connectedPids();
    return this.order.find((pid) => on.has(pid)) || null;
  }
  roster() {
    const on = this.connectedPids();
    return {
      host: this.hostPid(),
      players: this.order.map((pid) => ({ pid, name: this.names[pid] || "?", on: on.has(pid) })),
    };
  }
  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (_e) {} }
  broadcast(obj) { for (const ws of this.ctx.getWebSockets()) this.send(ws, obj); }
  async bumpAlarm() { await this.ctx.storage.setAlarm(Date.now() + EXPIRE_MS); }

  async fetch(req) {
    await this.load();
    if (req.headers.get("Upgrade") !== "websocket")
      return new Response("expected websocket", { status: 426 });
    const url = new URL(req.url);
    const name = (url.searchParams.get("name") || "Publisher").slice(0, 24);
    let pid = url.searchParams.get("pid") || ""; // a returning player reclaims their id
    if (!/^[a-f0-9]{8}$/.test(pid)) pid = crypto.randomUUID().slice(0, 8);
    const since = parseInt(url.searchParams.get("since") || "0", 10) || 0;

    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]); // hibernation API: no memory held while idle
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
    let msg;
    try { msg = JSON.parse(data); } catch (_e) { return; }
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

  async webSocketClose() { await this.load(); this.broadcast({ t: "roster", ...this.roster() }); }
  async webSocketError() { await this.load(); this.broadcast({ t: "roster", ...this.roster() }); }

  async alarm() { // room expired: drop everything
    for (const ws of this.ctx.getWebSockets()) { try { ws.close(1001, "room expired"); } catch (_e) {} }
    await this.ctx.storage.deleteAll();
    this.loaded = false;
  }
}
