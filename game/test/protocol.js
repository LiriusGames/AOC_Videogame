"use strict";
const assert = require("assert");
const { Engine } = require("../js/engine.js");
const { PUBLISHERS } = require("../js/data.js");
const Protocol = require("../js/protocol.js");

function game() {
  return new Engine({
    players: [
      { color: "teal", human: true, name: PUBLISHERS.teal.boss },
      { color: "yellow", human: true, name: PUBLISHERS.yellow.boss },
    ],
    useRipoffs: true,
    seed: 41,
  });
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("  ok ", name);
}

test("command envelope rejects missing identity and stale protocol versions", () => {
  assert.equal(Protocol.validateEnvelope({}).ok, false);
  assert.equal(Protocol.validateEnvelope({ v: 99, commandId: "c1", expectedRevision: 0, kind: "action_pass", payload: {} }).code, "BAD_VERSION");
  assert.equal(Protocol.validateEnvelope({ v: 1, commandId: "c1", expectedRevision: 0, kind: "action_pass", payload: {} }).ok, true);
});

test("authenticated actor cannot issue another seat's turn", () => {
  const e = game();
  const actor = e.currentPlayerId();
  const other = actor === 0 ? 1 : 0;
  const before = Protocol.stateHash(e.state);
  const result = Protocol.applyEngineCommand(e, other, "starting_picks", { genre: "crime", ideas: ["crime", "crime"] });
  assert.equal(result.code, "OUT_OF_TURN");
  assert.equal(Protocol.stateHash(e.state), before);
});

test("failed command rolls state and RNG back exactly", () => {
  const e = game();
  const actor = e.currentPlayerId();
  const before = e.snapshot();
  const result = Protocol.applyEngineCommand(e, actor, "starting_picks", { genre: "bogus", ideas: ["crime", "crime"] });
  assert.equal(result.ok, false);
  assert.deepEqual(e.snapshot(), before);
});

test("founding genre is resolved server-side without exposing deck order", () => {
  const e = game();
  const actor = e.currentPlayerId();
  const result = Protocol.applyEngineCommand(e, actor, "starting_picks", { genre: "crime", ideas: ["crime", "crime"] });
  assert.equal(result.ok, true);
  assert.equal(e.player(actor).startingPicks, undefined);
  assert(e.player(actor).hand.length >= 3);
});

test("seat projection hides decks, future calendar, opponent hand, and pending data", () => {
  const e = game();
  e.state.pending = { playerId: 1, type: "chooseIdeas", data: { count: 2, reason: "secret" } };
  const view = Protocol.projectState(e, 0);
  assert(view.decks.comics.every((card) => card === null));
  assert.equal(view.calendar[e.state.round], null);
  assert(view.players[1].hand.every((card) => card === null));
  assert.equal(view.pending.data, null);
});

console.log(`\n${passed} protocol tests passed`);
