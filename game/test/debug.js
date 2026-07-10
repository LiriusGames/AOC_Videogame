"use strict";
const fs = require("fs");
const path = require("path");
const code = ["data.js", "engine.js", "ai.js"]
  .map((f) => fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"))
  .join("\n") + "\n;global.__G={Engine,AI,GENRES,ACTIONS,PLAYER_COLORS};";
eval(code);
const { Engine, AI, GENRES, ACTIONS, PLAYER_COLORS } = global.__G;

const e = new Engine({ players: [{ color: "yellow" }, { color: "salmon" }], seed: 1200, useRipoffs: true, difficulty: "hard" });
let guard = 0;
const trace = [];
while (!e.state.gameOver && guard++ < 3000) {
  const s = e.state;
  let step;
  if (s.pending) { step = `pending:${s.pending.type} p${s.pending.playerId}`; AI.resolveOwnPendings(e, s.pending.playerId); }
  else if (s.awaitingSpecial) { step = `special:${s.awaitingSpecial.special} p${s.awaitingSpecial.player}`; AI.settle(e, s.awaitingSpecial.player); }
  else if (s.phase === "increase") {
    const pid = s.turnOrder[s.turnIdx];
    step = `increase p${pid}`;
    if (e.player(pid).startingPicks) AI.doStartingPicks(e, pid);
    AI.doIncrease(e, pid);
  } else if (s.phase === "actions") {
    const pid = e.currentPlayerId();
    const p = e.player(pid);
    step = `turn p${pid} editors=${p.editorsLeft} $${p.money}`;
    AI.takeTurn(e, pid);
  } else { step = `phase=${s.phase}`; break; }
  trace.push(step);
}
console.log("guard", guard, "round", e.state.round, "phase", e.state.phase, "gameOver", e.state.gameOver);
console.log("--- last 30 steps:");
console.log(trace.slice(-30).join("\n"));
const s = e.state;
console.log("pending", JSON.stringify(s.pending), "awaitingSpecial", JSON.stringify(s.awaitingSpecial), "printX2", !!s.printX2, "salesSession", !!s.salesSession);
s.players.forEach((p) => console.log(`p${p.id} editors=${p.editorsLeft} $${p.money} hand=${p.hand.length} hyped=${p.hyped.length} printed=${p.printedCount} cubes=${p.cubeSpecials}`));
console.log("spaces:", ACTIONS.map((a) => `${a}=${s.actionSpaces[a].length}/${e.slotsAvailable(a)}`).join(" "));
console.log("--- last 12 events:", e.events.slice(-12).map((ev) => ev.type).join(","));
