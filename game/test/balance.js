// ============================================================================
// AI balance measurement (not a CI gate — a tuning instrument).
// Rotates every persona combination through 2/3/4-player games across all
// difficulty and rip-off settings, then reports win rates normalized by
// appearances, average scores, and seat-position effects.
// Run: node game/test/balance.js [seedsPerCombo=10]
// ============================================================================
"use strict";
const fs = require("fs");
const path = require("path");

const code = ["data.js", "engine.js", "ai.js"]
  .map((f) => fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"))
  .join("\n") + "\n;global.__G={Engine,AI,PLAYER_COLORS,PUBLISHERS};";
eval(code);
const { Engine, AI, PLAYER_COLORS, PUBLISHERS } = global.__G;

const SEEDS = Number(process.argv[2]) || 10;

function combos(arr, k) {
  if (k === 0) return [[]];
  return arr.flatMap((x, i) => combos(arr.slice(i + 1), k - 1).map((c) => [x, ...c]));
}

function runGame(colors, seed, difficulty, useRipoffs) {
  const e = new Engine({ players: colors.map((color) => ({ color, human: false })), seed, useRipoffs, difficulty });
  const initialOrder = e.state.turnOrder.slice();
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
    if (s.phase === "actions") { AI.takeTurn(e, e.currentPlayerId()); continue; }
    break;
  }
  if (!e.state.gameOver) throw new Error(`game stuck: seed ${seed} [${colors}]`);
  return { e, initialOrder };
}

// stats[difficulty|ripoffs][persona] = { apps, wins, score, printed, money }
const stats = {}, seat = {}; // seat[n][pos] = { apps, wins }
let games = 0;
const t0 = Date.now();

for (const difficulty of ["easy", "normal", "hard"]) {
  for (const useRipoffs of [true, false]) {
    const cfgKey = `${difficulty} / ripoffs ${useRipoffs ? "on" : "off"}`;
    const S = (stats[cfgKey] = {});
    for (const n of [2, 3, 4])
      for (const colors of combos(PLAYER_COLORS, n))
        for (let i = 0; i < SEEDS; i++) {
          const { e, initialOrder } = runGame(colors, 40000 + games, difficulty, useRipoffs);
          games++;
          const sc = e.state.scores;
          for (const r of sc) {
            const persona = e.player(r.player).persona;
            const st = (S[persona] = S[persona] || { apps: 0, wins: 0, score: 0, printed: 0, money: 0 });
            st.apps++; st.score += r.total; st.printed += r.printed; st.money += e.player(r.player).money;
          }
          S[e.player(sc[0].player).persona].wins++;
          const sn = (seat[n] = seat[n] || Array.from({ length: n }, () => ({ apps: 0, wins: 0 })));
          initialOrder.forEach((pid, pos) => {
            sn[pos].apps++;
            if (pid === sc[0].player) sn[pos].wins++;
          });
        }
  }
}

console.log(`${games} games in ${((Date.now() - t0) / 1000).toFixed(1)}s (${SEEDS} seeds per combo)\n`);
const pct = (a, b) => ((100 * a) / b).toFixed(1).padStart(5) + "%";
for (const cfgKey of Object.keys(stats)) {
  console.log(`== ${cfgKey}`);
  console.log("   persona   apps  win%   avg score  avg printed  avg $");
  for (const persona of ["chart", "ripoff", "quality", "money"]) {
    const s = stats[cfgKey][persona];
    console.log(`   ${persona.padEnd(9)} ${String(s.apps).padStart(4)} ${pct(s.wins, s.apps)}   ` +
      `${(s.score / s.apps).toFixed(1).padStart(6)}      ${(s.printed / s.apps).toFixed(1).padStart(4)}     ` +
      `${(s.money / s.apps).toFixed(1).padStart(5)}`);
  }
  console.log();
}
console.log("== seat effect (initial turn order, all configs)");
for (const n of Object.keys(seat)) {
  const row = seat[n].map((s, i) => `seat${i + 1} ${pct(s.wins, s.apps)}`).join("  ");
  console.log(`   ${n}p: ${row}`);
}
