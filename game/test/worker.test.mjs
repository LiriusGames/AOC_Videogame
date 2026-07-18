import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import "../js/build.js";

const BUILD_ID = globalThis.AOC_BUILD_ID;

// The relay knows nothing about the game: these tests exercise only the
// room contract (handoff/yokai/NOTES.md) — pid minting, host election,
// cfg/hello replay, sequence stamping, and replay-from-`since`.

function nextMessage(socket, wanted) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${wanted}`)), 10000);
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.t !== wanted) return;
      clearTimeout(timer);
      socket.removeEventListener("message", onMessage);
      resolve(message);
    };
    socket.addEventListener("message", onMessage);
  });
}
function collect(socket) {
  const seen = [];
  socket.addEventListener("message", (event) => { seen.push(JSON.parse(event.data)); });
  return seen;
}

async function connect(room, { name = "Tester", token = "", pidQuery = "", since = 0 } = {}) {
  const protocols = ["aoc-room-v2"];
  if (token) protocols.push(`aoc-token-${token}`);
  const response = await SELF.fetch(
    `https://example.test/api/room/${room}/ws?name=${encodeURIComponent(name)}&pid=${pidQuery}&since=${since}&build=${BUILD_ID}`,
    { headers: { upgrade: "websocket", "sec-websocket-protocol": protocols.join(", ") } });
  expect(response.status).toBe(101);
  expect(response.headers.get("sec-websocket-protocol")).toBe("aoc-room-v2");
  const socket = response.webSocket;
  socket.accept();
  return socket;
}

describe("room relay", () => {
  it("mints pids, elects the first joiner host, and replays cfg to joiners", async () => {
    const host = await connect("AAAAA", { name: "Ada" });
    const you = await nextMessage(host, "you");
    expect(you.pid).toMatch(/^[a-f0-9]{16}$/);
    expect(you.token).toMatch(/^[a-f0-9]{32}$/);
    expect(you.host).toBe(true);

    host.send(JSON.stringify({ t: "cfg", cfg: { n: 3, seats: [
      { kind: "human", pid: you.pid }, { kind: "bot" }, { kind: "open" },
    ] } }));
    await nextMessage(host, "cfg"); // echoed to everyone, sender included

    const guest = await connect("AAAAA", { name: "Grace" });
    const seen = collect(guest);
    const guestYou = await nextMessage(guest, "you");
    expect(guestYou.host).toBe(false);
    const roster = await nextMessage(guest, "roster");
    expect(roster.host).toBe(you.pid);
    expect(JSON.stringify(roster)).not.toContain(you.token);
    expect(roster.players.map((p) => p.name)).toContain("Ada");
    // the stored cfg arrived during the connect replay
    expect(seen.some((m) => m.t === "cfg" && m.cfg.n === 3)).toBe(true);
    host.close();
    guest.close();
  });

  it("stores hello once, host-only, and replays it to late joiners", async () => {
    const host = await connect("BBBBB", { name: "Ada" });
    const hostYou = await nextMessage(host, "you");
    const guest = await connect("BBBBB", { name: "Grace" });
    const guestYou = await nextMessage(guest, "you");

    // a non-host hello is ignored
    guest.send(JSON.stringify({ t: "hello", hello: { seed: 999 } }));
    host.send(JSON.stringify({ t: "hello", hello: {
      build: BUILD_ID,
      seed: 42,
      players: [{ color: "teal", human: true, name: "Ada" }, { color: "yellow", human: true, name: "Grace" }],
      seats: ["human", "human"], pids: [hostYou.pid, guestYou.pid],
      useRipoffs: true, difficulty: "normal",
    } }));
    const hello = await nextMessage(host, "hello");
    expect(hello.hello.seed).toBe(42);
    // a second hello (even from the host) is ignored
    host.send(JSON.stringify({ t: "hello", hello: { seed: 1 } }));

    const late = await connect("BBBBB", { name: "Late", token: guestYou.token });
    const replayed = await nextMessage(late, "hello");
    expect(replayed.hello.seed).toBe(42);
    host.close(); guest.close(); late.close();
  });

  it("stamps game messages with a global order and replays from `since`", async () => {
    const a = await connect("CCCCC", { name: "A" });
    const aYou = await nextMessage(a, "you");
    const b = await connect("CCCCC", { name: "B" });
    const bYou = await nextMessage(b, "you");
    a.send(JSON.stringify({ t: "hello", hello: {
      build: BUILD_ID,
      seed: 7,
      players: [{ color: "teal", human: true, name: "A" }, { color: "yellow", human: true, name: "B" }],
      seats: ["human", "human"], pids: [aYou.pid, bYou.pid],
      useRipoffs: true, difficulty: "normal",
    } }));
    await nextMessage(a, "hello");

    const rejected = nextMessage(b, "error");
    b.send(JSON.stringify({ t: "m", m: {
      k: "cmd", seat: 0, kind: "test", payload: {}, h: "00000000",
    } }));
    expect((await rejected).code).toBe("BAD_ROOM_MESSAGE");

    const got = [];
    b.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === "m") got.push(m);
    });
    for (let i = 1; i <= 3; i++)
      a.send(JSON.stringify({ t: "m", m: {
        k: "cmd", seat: 0, kind: "test", payload: { i }, h: "00000000",
      } }));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out on ordered log")), 10000);
      const poll = setInterval(() => {
        if (got.length >= 3) { clearTimeout(timer); clearInterval(poll); resolve(); }
      }, 20);
    });
    expect(got.map((m) => m.n)).toEqual([1, 2, 3]);
    expect(got.map((m) => m.m.payload.i)).toEqual([1, 2, 3]);

    // reconnect replaying only what was missed
    const c = await connect("CCCCC", { name: "C", since: 2 });
    const seen = collect(c);
    await nextMessage(c, "roster");
    await new Promise((r) => setTimeout(r, 100));
    const replayed = seen.filter((m) => m.t === "m").map((m) => m.n);
    expect(replayed).toEqual([3]);
    expect(seen.some((m) => m.t === "sync" && m.seq === 3)).toBe(true);
    a.close(); b.close(); c.close();
  });

  it("lets the host automate a disconnected seat and lets that pid reclaim it", async () => {
    const host = await connect("DDDDD", { name: "Host" });
    const hostYou = await nextMessage(host, "you");
    const guest = await connect("DDDDD", { name: "Guest" });
    const guestYou = await nextMessage(guest, "you");
    host.send(JSON.stringify({ t: "hello", hello: {
      build: BUILD_ID,
      seed: 9,
      players: [{ color: "teal", human: true, name: "Host" }, { color: "yellow", human: true, name: "Guest" }],
      seats: ["human", "human"], pids: [hostYou.pid, guestYou.pid],
      useRipoffs: true, difficulty: "normal",
    } }));
    await nextMessage(host, "hello");

    const offline = nextMessage(host, "roster");
    guest.close();
    const roster = await offline;
    expect(roster.players.find((p) => p.pid === guestYou.pid).on).toBe(false);

    host.send(JSON.stringify({ t: "m", m: { k: "seat", seat: 1, ctl: "bot" } }));
    const handed = await nextMessage(host, "m");
    expect(handed.m).toEqual({ k: "seat", seat: 1, ctl: "bot" });

    const returning = await connect("DDDDD", { name: "Guest", token: guestYou.token, since: handed.n });
    await nextMessage(returning, "you");
    returning.send(JSON.stringify({ t: "m", m: {
      k: "claim", seat: 1, pid: guestYou.pid, name: "Guest",
    } }));
    const claimed = await nextMessage(host, "m");
    expect(claimed.m.k).toBe("claim");
    expect(claimed.m.pid).toBe(guestYou.pid);
    host.close(); returning.close();
  });

  it("rejects stale builds and gives one live socket control of each private token", async () => {
    const stale = await SELF.fetch(
      "https://example.test/api/room/EEEEE/ws?name=Old&build=old-build",
      { headers: { upgrade: "websocket" } });
    expect(stale.status).toBe(409);

    const first = await connect("EEEEE", { name: "First" });
    const identity = await nextMessage(first, "you");
    const replaced = nextMessage(first, "replaced");
    const second = await connect("EEEEE", { name: "Second", token: identity.token });
    expect((await replaced).t).toBe("replaced");
    expect((await nextMessage(second, "you")).pid).toBe(identity.pid);
    second.close();
  });

  it("does not treat a public pid as a resume credential", async () => {
    const owner = await connect("FFFFF", { name: "Owner" });
    const ownerYou = await nextMessage(owner, "you");
    const impostor = await connect("FFFFF", { name: "Impostor", pidQuery: ownerYou.pid });
    const impostorYou = await nextMessage(impostor, "you");
    expect(impostorYou.pid).not.toBe(ownerYou.pid);
    expect(impostorYou.token).toMatch(/^[a-f0-9]{32}$/);
    owner.close(); impostor.close();
  });

  it("lets the host lock the room and remove another participant", async () => {
    const host = await connect("GGGGG", { name: "Host" });
    const hostYou = await nextMessage(host, "you");
    const guest = await connect("GGGGG", { name: "Guest" });
    const guestYou = await nextMessage(guest, "you");

    host.send(JSON.stringify({ t: "settings", locked: true }));
    const lockedRoster = await nextMessage(host, "roster");
    expect(lockedRoster.locked).toBe(true);

    const visitor = await connect("GGGGG", { name: "Visitor" });
    expect((await nextMessage(visitor, "error")).code).toBe("TABLE_LOCKED");

    guest.close();
    const returnedGuest = await connect("GGGGG", { name: "Guest", token: guestYou.token });
    expect((await nextMessage(returnedGuest, "you")).pid).toBe(guestYou.pid);

    const removed = nextMessage(returnedGuest, "removed");
    host.send(JSON.stringify({ t: "kick", pid: guestYou.pid }));
    expect((await removed).t).toBe("removed");

    const rejectedReturn = await connect("GGGGG", { name: "Guest", token: guestYou.token });
    expect((await nextMessage(rejectedReturn, "error")).code).toBe("REMOVED");
    expect(hostYou.pid).not.toBe(guestYou.pid);
    host.close(); visitor.close(); returnedGuest.close(); rejectedReturn.close();
  });

  it("caps the number of identities admitted to one room", async () => {
    const sockets = [];
    for (let i = 0; i < 12; i++) {
      const socket = await connect("HHHHH", { name: `P${i}` });
      await nextMessage(socket, "you");
      sockets.push(socket);
    }
    const overflow = await connect("HHHHH", { name: "Overflow" });
    expect((await nextMessage(overflow, "error")).code).toBe("ROOM_FULL");
    overflow.close();
    for (const socket of sockets) socket.close();
  });
});
