import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

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
  socket.addEventListener("message", (event) => seen.push(JSON.parse(event.data)));
  return seen;
}

async function connect(room, { name = "Tester", pid = "", since = 0 } = {}) {
  const response = await SELF.fetch(
    `https://example.test/api/room/${room}/ws?name=${encodeURIComponent(name)}&pid=${pid}&since=${since}`,
    { headers: { upgrade: "websocket" } });
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  socket.accept();
  return socket;
}

describe("room relay", () => {
  it("mints pids, elects the first joiner host, and replays cfg to joiners", async () => {
    const host = await connect("AAAAA", { name: "Ada" });
    const you = await nextMessage(host, "you");
    expect(you.pid).toMatch(/^[a-f0-9]{8}$/);
    expect(you.host).toBe(true);

    host.send(JSON.stringify({ t: "cfg", cfg: { n: 3, seats: [{ kind: "human", pid: you.pid }] } }));
    await nextMessage(host, "cfg"); // echoed to everyone, sender included

    const guest = await connect("AAAAA", { name: "Grace" });
    const seen = collect(guest);
    const guestYou = await nextMessage(guest, "you");
    expect(guestYou.host).toBe(false);
    const roster = await nextMessage(guest, "roster");
    expect(roster.host).toBe(you.pid);
    expect(roster.players.map((p) => p.name)).toContain("Ada");
    // the stored cfg arrived during the connect replay
    expect(seen.some((m) => m.t === "cfg" && m.cfg.n === 3)).toBe(true);
    host.close();
    guest.close();
  });

  it("stores hello once, host-only, and replays it to late joiners", async () => {
    const host = await connect("BBBBB", { name: "Ada" });
    await nextMessage(host, "you");
    const guest = await connect("BBBBB", { name: "Grace" });
    const guestYou = await nextMessage(guest, "you");

    // a non-host hello is ignored
    guest.send(JSON.stringify({ t: "hello", hello: { seed: 999 } }));
    host.send(JSON.stringify({ t: "hello", hello: { seed: 42, seats: ["human", "human"] } }));
    const hello = await nextMessage(host, "hello");
    expect(hello.hello.seed).toBe(42);
    // a second hello (even from the host) is ignored
    host.send(JSON.stringify({ t: "hello", hello: { seed: 1 } }));

    const late = await connect("BBBBB", { name: "Late", pid: guestYou.pid });
    const replayed = await nextMessage(late, "hello");
    expect(replayed.hello.seed).toBe(42);
    host.close(); guest.close(); late.close();
  });

  it("stamps game messages with a global order and replays from `since`", async () => {
    const a = await connect("CCCCC", { name: "A" });
    await nextMessage(a, "you");
    const b = await connect("CCCCC", { name: "B" });
    await nextMessage(b, "you");

    const got = [];
    b.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === "m") got.push(m);
    });
    for (let i = 1; i <= 3; i++)
      a.send(JSON.stringify({ t: "m", m: { k: "cmd", kind: "test", i } }));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out on ordered log")), 10000);
      const poll = setInterval(() => {
        if (got.length >= 3) { clearTimeout(timer); clearInterval(poll); resolve(); }
      }, 20);
    });
    expect(got.map((m) => m.n)).toEqual([1, 2, 3]);
    expect(got.map((m) => m.m.i)).toEqual([1, 2, 3]);

    // reconnect replaying only what was missed
    const c = await connect("CCCCC", { name: "C", since: 2 });
    const seen = collect(c);
    await nextMessage(c, "roster");
    await new Promise((r) => setTimeout(r, 100));
    const replayed = seen.filter((m) => m.t === "m").map((m) => m.n);
    expect(replayed).toEqual([3]);
    a.close(); b.close(); c.close();
  });
});
