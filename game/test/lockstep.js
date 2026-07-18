"use strict";
const assert = require("assert");
const { Engine } = require("../js/engine.js");
const { AI } = require("../js/ai.js");
const { CARD_BY_ID } = require("../js/data.js");
const Protocol = require("../js/protocol.js");
const { RemoteSession } = require("../js/session.js");
require("../js/build.js");

// The modules intentionally publish these browser globals. Keep the explicit
// assignments here so this regression also works on older supported Node 22
// patch releases where CommonJS evaluation order differs slightly.
globalThis.Engine = Engine;
globalThis.AI = AI;

const hello = {
  build: globalThis.AOC_BUILD_ID,
  seed: 314159,
  players: [
    { color: "teal", human: true, name: "Ada" },
    { color: "yellow", human: false, name: "Bot" },
    { color: "salmon", human: true, name: "Grace" },
  ],
  seats: ["human", "bot", "human"],
  pids: ["aaaaaaaa", null, "cccccccc"],
  useRipoffs: true,
  difficulty: "normal",
};

function make(pid) {
  const s = new RemoteSession({ room: "TESTS", name: pid });
  s.pid = pid;
  s.buildFromHello(structuredClone(hello));
  s.onMessage({ t: "sync", seq: 0 });
  return s;
}

function startingMessage(session, seat) {
  const comic = session.engine.state.display.comics[0];
  const count = session.engine.player(seat).startingPicks.ideas;
  return {
    k: "cmd", seat, kind: "starting_picks",
    payload: { comic, ideas: Array(count).fill(CARD_BY_ID[comic].genre) },
    h: Protocol.engineHash(session.engine),
  };
}

function applyIdentically(a, b, message) {
  assert.equal(Protocol.engineHash(a.engine), Protocol.engineHash(b.engine));
  a.apply(structuredClone(message));
  b.apply(structuredClone(message));
  assert.equal(a.desynced, false);
  assert.equal(b.desynced, false);
  assert.equal(Protocol.engineHash(a.engine), Protocol.engineHash(b.engine));
}

const host = make("aaaaaaaa");
const guest = make("cccccccc");
assert.equal(host.engine.currentPlayerId(), 0);

// Seat 0 files its founding picks. Seat 1 is a bot and must be completely
// resolved inside apply(), leaving both clients at seat 2 with equal hashes.
applyIdentically(host, guest, startingMessage(host, 0));
assert.equal(host.engine.currentPlayerId(), 2);
applyIdentically(host, guest, startingMessage(host, 2));
assert.equal(host.engine.state.phase, "actions");
assert.equal(host.engine.currentPlayerId(), 0);

// A human move is followed by the automated seat synchronously, independent
// of animation timers or whether either browser is backgrounded.
applyIdentically(host, guest, {
  k: "cmd", seat: 0, kind: "action_royalties", payload: {},
  h: Protocol.engineHash(host.engine),
});
assert.equal(host.engine.currentPlayerId(), 2);

// A disconnected human desk becomes a bot without leaving the old browser in
// control, and the same pid can reclaim it later.
applyIdentically(host, guest, { k: "seat", seat: 2, ctl: "bot" });
assert.equal(guest.seat, -1);
assert.equal(guest.formerSeat, 2);
assert.equal(guest.isLocalSeat(2), false);
applyIdentically(host, guest, { k: "claim", seat: 2, pid: "cccccccc", name: "Grace" });
assert.equal(guest.seat, 2);
assert.equal(guest.isLocalSeat(2), true);

// A late joiner receives a safe desk to view even before claiming a bot, so
// the single-player-shaped HUD never tries to render player -1.
const spectator = make("dddddddd");
assert.equal(spectator.seat, -1);
assert.equal(spectator.humanId, 0);

// A late/reconnecting page builds the engine so it can apply the replay, but
// does not expose an interactive game until the ordered sync marker arrives.
const replaying = new RemoteSession({ room: "TESTS", name: "Late" });
replaying.pid = "eeeeeeee";
replaying.buildFromHello(structuredClone(hello));
assert.equal(replaying.started, false);
assert.equal(replaying.syncing, true);
replaying.sent = true; // models a socket dropping before its command echo
replaying.onMessage({ t: "sync", seq: 0 });
assert.equal(replaying.started, true);
assert.equal(replaying.syncing, false);
assert.equal(replaying.sent, false);

// A missing ordered entry is unrecoverable in lockstep. Never apply a later
// message and silently continue from a state that skipped a command.
const gap = make("ffffffff");
gap.onMessage({ t: "m", n: 2, m: { k: "seat", seat: 2, ctl: "bot" } });
assert.equal(gap.desynced, true);

// A half-open socket cannot leave the UI's one-command interlock stuck
// forever. The watchdog closes it so reconnect replay decides whether the
// in-flight command was persisted.
const watched = make("abababab");
let watchdogCode = 0;
watched.socket = { readyState: 1, send() {}, close(code) { watchdogCode = code; } };
watched.sent = true;
watched.sentAt = 1000;
assert.equal(watched.heartbeatTick(17001), false);
assert.equal(watchdogCode, 4002);

console.log("  ok  ordered human moves synchronously drain deterministic bots");
console.log("  ok  automated desks drop local control and can be reclaimed");
console.log("  ok  late joiners receive a valid spectator view");
console.log("  ok  reconnect replay gates input and safely releases a lost in-flight command");
console.log("  ok  a sequence gap stops the client before applying later moves");
console.log("  ok  command watchdog recovers a half-open in-flight move");
console.log("\n6 lockstep tests passed");
