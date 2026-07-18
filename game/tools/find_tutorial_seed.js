// Find a legal deterministic First Day scenario. The script drives the exact
// round-one command path and prints the first seed that leaves every gated
// action and the adjacent Sales order available when it is needed.
"use strict";
const path = require("path");
const ROOT = path.join(__dirname, "..", "js");
const data = require(path.join(ROOT, "data.js"));
const { Engine } = require(path.join(ROOT, "engine.js"));
const { AI } = require(path.join(ROOT, "ai.js"));
const { PLAYER_COLORS, PUBLISHERS, CARD_BY_ID, MAP, GENRES } = data;

function players() {
  return [
    { color: "teal", human: true, name: PUBLISHERS.teal.boss },
    { color: "yellow", human: false },
    { color: "salmon", human: false },
  ];
}

function scriptedBotTurn(engine, pid, step) {
  const scripts = {
    1: ["hire", "develop", "royalties"],
    2: ["develop", "hire", "royalties"],
  };
  const action = scripts[pid][step];
  if (action === "hire") return engine.actHire(pid, { writer: "deck", artist: "deck" });
  if (action === "develop") return engine.actDevelop(pid, { comic: "deck" });
  return engine.actRoyalties(pid);
}

function runBotsUntilHuman(engine, botSteps) {
  let guard = 0;
  while (engine.state.phase === "actions" && engine.currentPlayerId() !== 0 && guard++ < 100) {
    const pid = engine.currentPlayerId();
    if (!scriptedBotTurn(engine, pid, botSteps[pid]++)) return false;
    while (engine.state.pending && engine.state.pending.playerId === pid) AI.resolveOwnPendings(engine, pid);
    if (engine.state.awaitingSpecial && engine.state.awaitingSpecial.player === pid) AI.settle(engine, pid);
  }
  return guard < 100 && engine.currentPlayerId() === 0;
}

function trySeed(seed) {
  const e = new Engine({ players: players(), useRipoffs: true, difficulty: "normal", seed });
  const botSteps = { 1: 0, 2: 0 };
  if (e.state.turnOrder[0] !== 0 || e.player(0).startingPicks.ideas !== 2) return null;
  const specialties = e.player(0).hand.map((id) => CARD_BY_ID[id].genre);
  const genre = specialties.find((g) => e.state.decks.comics.some((id) => CARD_BY_ID[id].genre === g));
  if (!genre) return null;
  const comic = e.state.decks.comics.slice().reverse().find((id) => CARD_BY_ID[id].genre === genre);
  e.resolveStartingPicks(0, comic, [genre, genre]);
  e.advanceIncrease();
  while (e.state.phase === "increase") {
    const pid = e.state.turnOrder[e.state.turnIdx];
    if (pid === undefined) e.advanceIncrease();
    else { AI.doStartingPicks(e, pid); AI.doIncrease(e, pid); }
  }
  if (e.currentPlayerId() !== 0) return null;

  const other = GENRES.find((g) => g !== genre && e.state.boardIdeas[g] > 0);
  if (!e.actIdeas(0, { board: [genre, other], supply: [genre, genre] })) return null;
  if (!runBotsUntilHuman(e, botSteps) || e.nextSlot("print") !== 0) return null;

  const writer = e.player(0).hand.find((id) => CARD_BY_ID[id].kind === "writer");
  const artist = e.player(0).hand.find((id) => CARD_BY_ID[id].kind === "artist");
  if (!e.actPrint(0, { books: [{ type: "original", comic, writer, artist }] })) return null;
  if (!runBotsUntilHuman(e, botSteps) || e.nextSlot("royalties") < 0) return null;
  if (!e.actRoyalties(0)) return null;
  if (!runBotsUntilHuman(e, botSteps) || e.nextSlot("sales") < 0) return null;

  const occupied = new Set(e.state.players.filter((p) => p.id !== 0 && p.agentMoved).map((p) => p.agentNode));
  const order = e.state.mapSlots.find((o) => !o.faceUp && o.takenBy === null && o.genre === genre && o.minVal <= 4 &&
    o.nodes.some((n) => MAP.X_LINKS.includes(n) && !occupied.has(n)));
  if (!order) return null;
  const node = order.nodes.find((n) => MAP.X_LINKS.includes(n) && !occupied.has(n));
  return { seed, genre, comic, writer, artist, orderId: order.id, node, turnOrder: e.state.turnOrder.slice() };
}

module.exports = { trySeed };

if (require.main === module) {
  const max = Number(process.argv[2]) || 250000;
  for (let seed = 1; seed <= max; seed++) {
    const found = trySeed(seed);
    if (found) { console.log(JSON.stringify(found, null, 2)); process.exit(0); }
  }
  console.error(`No tutorial seed found through ${max}`);
  process.exit(1);
}
