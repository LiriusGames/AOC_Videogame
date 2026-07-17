// Headless playtest: run all-AI games, check invariants, report stats.
"use strict";
const path = require("path");
const data = require(path.join(__dirname, "..", "js", "data.js"));
const { Engine } = require(path.join(__dirname, "..", "js", "engine.js"));
const { AI } = require(path.join(__dirname, "..", "js", "ai.js"));
const { GENRES, ACTIONS, PLAYER_COLORS } = data;

function assert(cond, msg, engine) {
  if (!cond) {
    console.error("ASSERT FAIL:", msg, "| seed", engine && engine.cfg.seed, "| round", engine && engine.state.round);
    throw new Error(msg);
  }
}

function checkInvariants(e) {
  const s = e.state;
  for (const p of s.players) {
    assert(p.money >= 0, `negative money p${p.id}: ${p.money}`, e);
    for (const g of GENRES) assert(p.ideas[g] >= 0, `negative ideas p${p.id} ${g}`, e);
    assert(p.tickets >= 0, `negative tickets p${p.id}`, e);
    assert(p.hand.length + p.hyped.length <= 6 || s.pending, `hand overflow p${p.id}: ${p.hand.length}+${p.hyped.length}`, e);
    assert(p.editorsLeft >= 0, `negative editors p${p.id}`, e);
  }
  for (const c of s.chart) assert(c.fans >= 0, `negative fans chart#${c.idx}`, e);
  s.mapSlots.forEach((t, i) => assert(t.id === i, `mapSlot id/index mismatch ${t.id}!=${i}`, e));
  for (const p of s.players)
    for (const oid of p.orders)
      assert(s.mapSlots[oid].takenBy === p.id, `order ${oid} not owned by p${p.id}`, e);
  // no duplicate cards anywhere
  const seen = {};
  const all = [];
  s.players.forEach((p) => { all.push(...p.hand); p.hyped.forEach((h) => all.push(h.cardId)); });
  ["writers", "artists", "comics"].forEach((k) => { all.push(...s.decks[k]); all.push(...s.discards[k]); all.push(...s.display[k]); });
  s.chart.forEach((c) => { all.push(c.creatives.writer.id, c.creatives.artist.id); if (!c.isRipoff) all.push(c.cardId); });
  for (const id of all) {
    assert(!seen[id], `duplicate card ${id}`, e);
    seen[id] = 1;
  }
}

function runGame(seed, nPlayers, opts = {}) {
  const players = PLAYER_COLORS.slice(0, nPlayers).map((color) => ({ color, human: false }));
  const e = new Engine({ players, seed, useRipoffs: opts.useRipoffs !== false, difficulty: opts.difficulty || "hard" });
  // occupancy-fee invariant: a sales run may never end with an unpayable fee owed
  const origEnd = e.salesEnd.bind(e);
  e.salesEnd = (pid) => {
    const ses = e.state.salesSession;
    const owedBroke = ses && ses.unpaidNode != null && !ses.feePaid && e.player(pid).money < 2;
    const ok = origEnd(pid);
    assert(!(ok && owedBroke), "sales run ended with unpayable occupancy fee", e);
    return ok;
  };
  let guard = 0;
  while (!e.state.gameOver && guard++ < 4000) {
    const s = e.state;
    if (s.pending) { AI.resolveOwnPendings(e, s.pending.playerId); continue; }
    if (s.awaitingSpecial) { AI.settle(e, s.awaitingSpecial.player); continue; }
    if (s.phase === "increase") {
      const pid = s.turnOrder[s.turnIdx];
      if (e.player(pid).startingPicks) AI.doStartingPicks(e, pid);
      AI.doIncrease(e, pid);
      e.advanceIncrease();
      continue;
    }
    if (s.phase === "actions") {
      const pid = e.currentPlayerId();
      AI.takeTurn(e, pid);
      checkInvariants(e);
      continue;
    }
    break;
  }
  assert(e.state.gameOver, `game did not finish (guard=${guard})`, e);
  return e;
}

// ------------------------------------------------------------------- run
// main batch: hard + ripoffs (the reported stats), then a smaller matrix
// across every difficulty / ripoff setting so all rule paths stay checked.
let games = 0, wins = {}, totals = [], printed = [], actionsUsed = {};
ACTIONS.forEach((a) => (actionsUsed[a] = 0));
const t0 = Date.now();
for (const n of [2, 3, 4]) {
  for (let i = 0; i < 60; i++) {
    const e = runGame(1000 + n * 100 + i, n);
    games++;
    const sc = e.state.scores;
    wins[e.player(sc[0].player).persona] = (wins[e.player(sc[0].player).persona] || 0) + 1;
    sc.forEach((r) => { totals.push(r.total); printed.push(r.printed); });
    ACTIONS.forEach((a) => (actionsUsed[a] += e.state.actionSpaces[a].length));
  }
}
const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log(`OK: ${games} games in ${Date.now() - t0}ms`);
console.log(`score avg ${avg(totals)} min ${Math.min(...totals)} max ${Math.max(...totals)}`);
console.log(`printed avg ${avg(printed)} max ${Math.max(...printed)}`);
console.log("wins by persona:", wins);
console.log("action usage (last-round spaces):", actionsUsed);

let matrixGames = 0;
const tm = Date.now();
for (const difficulty of ["easy", "normal", "hard"]) {
  for (const useRipoffs of [true, false]) {
    if (difficulty === "hard" && useRipoffs) continue; // covered above
    for (const n of [2, 3, 4])
      for (let i = 0; i < 12; i++) {
        runGame(9000 + n * 100 + i, n, { difficulty, useRipoffs });
        matrixGames++;
      }
  }
}
console.log(`OK: ${matrixGames} matrix games (easy/normal/hard x ripoffs on/off) in ${Date.now() - tm}ms`);
