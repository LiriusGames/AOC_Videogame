// ============================================================================
// Targeted rule regression tests: deterministic setups exercising one rule
// each, complementing the statistical coverage of sim.js.
// Run: node game/test/rules.js
// ============================================================================
"use strict";
const path = require("path");
const data = require(path.join(__dirname, "..", "js", "data.js"));
const { Engine } = require(path.join(__dirname, "..", "js", "engine.js"));
const { AI } = require(path.join(__dirname, "..", "js", "ai.js"));
const { GENRES, PLAYER_COLORS, CARD_BY_ID, COMICS, MAP, ROYALTIES_SLOTS, RANK_VP, HAND_LIMIT } = data;

// ------------------------------------------------------------------ harness
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (err) { failed++; console.error("FAIL  " + name + "\n      " + err.message); }
}
function eq(got, want, msg) {
  if (got !== want) throw new Error(`${msg || "eq"}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}
function ok(cond, msg) { if (!cond) throw new Error(msg || "expected truthy"); }

// game advanced past round-1 starting picks, sitting at the action phase
function freshGame(seed, n = 2) {
  const e = new Engine({ players: PLAYER_COLORS.slice(0, n).map((color) => ({ color })), seed, useRipoffs: true });
  let guard = 0;
  while (e.state.phase === "increase" && guard++ < 20) {
    const pid = e.state.turnOrder[e.state.turnIdx];
    if (e.player(pid).startingPicks) e.resolveStartingPicks(pid, null, []);
    e.advanceIncrease();
  }
  eq(e.state.phase, "actions", "freshGame reaches action phase");
  return e;
}

// move specific cards into a player's hand (removing them from decks/display
// so no duplicate ids exist anywhere)
function give(e, pid, ...ids) {
  const s = e.state;
  for (const id of ids) {
    for (const k of ["writers", "artists", "comics"])
      for (const arr of [s.decks[k], s.discards[k], s.display[k]]) {
        const i = arr.indexOf(id);
        if (i >= 0) arr.splice(i, 1);
      }
    e.player(pid).hand.push(id);
  }
}

function printOriginal(e, pid, comicId, w, a) {
  give(e, pid, comicId, w, a);
  const p = e.player(pid);
  p.money = Math.max(p.money, 10);
  p.ideas[CARD_BY_ID[comicId].genre] = 2;
  return e.actPrint(pid, { books: [{ type: "original", comic: comicId, writer: w, artist: a }] });
}

// ------------------------------------------------------------------- setup
test("setup: starting resources", () => {
  const e = freshGame(11);
  for (const p of e.state.players) {
    eq(p.money, 5, "2p starting money");
    eq(p.hand.length, 2, "starting hand");
    const w = e.card(p.hand[0]), a = e.card(p.hand[1]);
    eq(w.kind, "writer"); eq(a.kind, "artist");
    eq(w.value, 2); eq(a.value, 2);
    ok(w.genre !== a.genre, "starting creatives differ in genre");
    eq(p.editorsLeft, 4, "4 editors");
  }
});

test("setup: second player gets a third starting idea", () => {
  const e = new Engine({ players: [{ color: "yellow" }, { color: "salmon" }], seed: 12 });
  eq(e.player(e.state.turnOrder[0]).startingPicks.ideas, 2);
  eq(e.player(e.state.turnOrder[1]).startingPicks.ideas, 3);
});

// ----------------------------------------------------------------- actions
test("royalties: slot payouts and editor spend", () => {
  const e = freshGame(21);
  const p1 = e.currentPlayerId(), m1 = e.player(p1).money;
  ok(e.actRoyalties(p1));
  eq(e.player(p1).money, m1 + ROYALTIES_SLOTS[0], "first slot pays " + ROYALTIES_SLOTS[0]);
  eq(e.player(p1).editorsLeft, 3, "editor spent");
  const p2 = e.currentPlayerId(), m2 = e.player(p2).money;
  ok(p2 !== p1, "turn passed");
  ok(e.actRoyalties(p2));
  eq(e.player(p2).money, m2 + ROYALTIES_SLOTS[1], "second slot pays " + ROYALTIES_SLOTS[1]);
});

test("hire is atomic and always signs one writer plus one artist", () => {
  const e = freshGame(22);
  const pid = e.currentPlayerId(), p = e.player(pid);
  const writer = e.state.display.writers[0], artist = e.state.display.artists[0];
  const before = p.hand.length;
  ok(e.actHire(pid, { writer, artist }), "complete pair accepted");
  const hired = e.events.filter((ev) => ev.type === "hire").at(-1);
  eq(hired.cards.length, 2, "exactly two cards hired");
  eq(hired.cards.filter((id) => CARD_BY_ID[id].kind === "writer").length, 1, "one writer");
  eq(hired.cards.filter((id) => CARD_BY_ID[id].kind === "artist").length, 1, "one artist");
  eq(p.hand.length, before + 2, "both cards reach the hand");
});

test("invalid or exhausted hire pair spends nothing", () => {
  const e = freshGame(23);
  const pid = e.currentPlayerId();
  const writer = e.state.display.writers[0];
  e.state.display.artists = [];
  e.state.decks.artists = [];
  e.state.discards.artists = [];
  const stateBefore = JSON.stringify(e.state);
  const rngBefore = e.rng.a, eventsBefore = e.events.length;
  ok(!e.actHire(pid, { writer, artist: "deck" }), "incomplete source rejected");
  eq(JSON.stringify(e.state), stateBefore, "state unchanged");
  eq(e.rng.a, rngBefore, "RNG unchanged");
  eq(e.events.length, eventsBefore, "no events emitted");
});

test("AI passes instead of attempting an incomplete Hire", () => {
  const e = freshGame(24);
  const pid = e.currentPlayerId();
  for (const action of data.ACTIONS) e.state.actionSpaces[action] =
    action === "hire" ? [] : Array(e.slotsAvailable(action)).fill(1);
  e.state.display.artists = [];
  e.state.decks.artists = [];
  e.state.discards.artists = [];
  AI.takeTurn(e, pid);
  ok(e.events.some((ev) => ev.type === "pass" && ev.player === pid), "AI safely passes");
  ok(!e.events.some((ev) => ev.type === "hire" && ev.player === pid), "no partial Hire event");
});

test("ideas: board allowance by slot + 2 from supply", () => {
  const e = freshGame(22);
  const p1 = e.currentPlayerId();
  ok(e.actIdeas(p1, { board: ["scifi", "crime"], supply: ["horror", "horror"] }));
  eq(e.player(p1).ideas.scifi, 1); eq(e.player(p1).ideas.crime, 1);
  eq(e.player(p1).ideas.horror, 2, "2 supply ideas");
  eq(e.state.boardIdeas.scifi, 0); eq(e.state.boardIdeas.crime, 0);
  const p2 = e.currentPlayerId();
  ok(e.actIdeas(p2, { board: ["romance", "western"], supply: [] }));
  eq(e.player(p2).ideas.romance, 1, "slot 1 allows one board token");
  eq(e.player(p2).ideas.western, 0, "second board token refused on slot 1");
  eq(e.state.boardIdeas.western, 1, "token stays on the board");
});

// ------------------------------------------------------------------ print
test("print original: cost, ideas, fans, bonus, mastery", () => {
  const e = freshGame(31);
  const pid = e.currentPlayerId();
  // romance comic ($4 bonus), non-specialist $2+$2 creatives
  ok(printOriginal(e, pid, "orig_25", "writer_scifi_2", "artist_crime_2"));
  const p = e.player(pid), c = e.state.chart[0];
  eq(p.money, 10 - 4 + 4, "paid $4 creatives, gained $4 bonus");
  eq(p.ideas.romance, 0, "2 ideas spent");
  eq(c.value, 4);
  eq(c.fans, 2, "1 original fan + 1 mastery fan (no specialists)");
  eq(e.state.mastery.romance, pid, "first original earns mastery");
  eq(p.printedCount, 1);
  ok(!p.hand.includes("orig_25") && !p.hand.includes("writer_scifi_2"), "cards left hand");
});

test("print original: specialist and hype-style fan math", () => {
  const e = freshGame(32);
  const pid = e.currentPlayerId();
  // romance comic (+1 fan bonus) with two romance specialists ($2 + $3)
  ok(printOriginal(e, pid, "orig_22", "writer_romance_2", "artist_romance_3"));
  const c = e.state.chart[0];
  eq(c.value, 5);
  eq(c.fans, 5, "1 original + 1 bonus + 2 specialists + 1 mastery");
});

test("print requires 2 matching ideas and the money", () => {
  const e = freshGame(33);
  const pid = e.currentPlayerId();
  give(e, pid, "orig_25", "writer_scifi_2", "artist_crime_2");
  const p = e.player(pid);
  const spec = { type: "original", comic: "orig_25", writer: "writer_scifi_2", artist: "artist_crime_2" };
  p.money = 10; p.ideas.romance = 1;
  ok(!e.canPrintBook(pid, spec), "1 idea is not enough");
  p.ideas.romance = 2; p.money = 3;
  ok(!e.canPrintBook(pid, spec), "$3 is not enough for $2+$2 creatives");
  p.money = 4;
  ok(e.canPrintBook(pid, spec));
});

test("ripoff: no ideas needed, target locked, no self-rip, no mastery", () => {
  const e = freshGame(34);
  const A = e.currentPlayerId();
  ok(printOriginal(e, A, "orig_25", "writer_scifi_2", "artist_crime_2"));
  const B = e.currentPlayerId();
  ok(B !== A);
  give(e, B, "writer_western_2", "artist_romance_2");
  e.player(B).money = 10;
  ok(e.actPrint(B, { books: [{ type: "ripoff", target: 0, writer: "writer_western_2", artist: "artist_romance_2" }] }));
  const rip = e.state.chart[1];
  eq(e.player(B).money, 6, "paid creative cost only");
  ok(rip.isRipoff);
  eq(rip.fans, 1, "0 base + 1 artist specialist");
  ok(e.state.rippedOriginals["orig_25"], "original marked as ripped");
  eq(e.state.mastery.romance, A, "ripoff does not steal mastery");
  give(e, A, "writer_horror_2", "artist_horror_2");
  e.player(A).money = 10;
  ok(!e.canPrintBook(A, { type: "ripoff", target: 0, writer: "writer_horror_2", artist: "artist_horror_2" }),
    "own comic can't be ripped");
  give(e, B, "writer_horror_3", "artist_horror_3");
  ok(!e.canPrintBook(B, { type: "ripoff", target: 0, writer: "writer_horror_3", artist: "artist_horror_3" }),
    "an original can only be ripped once");
});

test("mastery transfers on strictly more comics of the genre", () => {
  const e = freshGame(35);
  const A = e.currentPlayerId();
  ok(printOriginal(e, A, "orig_25", "writer_scifi_2", "artist_crime_2"));
  const B = e.currentPlayerId();
  ok(printOriginal(e, B, "orig_22", "writer_romance_2", "artist_romance_2"));
  eq(e.state.mastery.romance, A, "1 vs 1: mastery stays");
  ok(e.actRoyalties(A));
  ok(printOriginal(e, B, "orig_23", "writer_romance_2B", "artist_romance_2B"));
  eq(e.state.mastery.romance, B, "2 vs 1: mastery transfers");
  const bComics = e.state.chart.filter((c) => c.owner === B);
  eq(bComics.length, 2);
  for (const c of bComics) ok(c.masteryFanApplied, "mastery fan applied to each comic");
});

// ------------------------------------------------------------------- sales
test("sales movement: free first walk, $2 cab, free ticket", () => {
  const e = freshGame(41);
  const pid = e.currentPlayerId(), p = e.player(pid);
  ok(e.actSalesStart(pid));
  p.money = 9;
  ok(e.salesMove(pid, MAP.X_LINKS[0]), "walk off X");
  eq(p.money, 9, "first walk is free");
  const next = e.agentAdjacent(pid).find((n) => n !== "X");
  ok(e.salesMove(pid, next));
  eq(p.money, 7, "cab costs $2");
  p.tickets = 1;
  ok(e.salesMove(pid, 23, true), "ticket teleports anywhere");
  eq(p.tickets, 0);
  eq(p.money, 7, "ticket costs no money");
});

test("occupancy: broke agent can't enter, salesEnd requires the fee", () => {
  const e = freshGame(42);
  const pid = e.currentPlayerId(), other = e.state.players.find((q) => q.id !== pid).id;
  e.player(other).agentNode = MAP.X_LINKS[0];
  e.player(other).agentMoved = true;
  ok(e.actSalesStart(pid));
  const p = e.player(pid);
  p.money = 0;
  ok(!e.salesMove(pid, MAP.X_LINKS[0]), "can't enter a rival's corner broke");
  p.money = 2;
  ok(e.salesMove(pid, MAP.X_LINKS[0]), "can enter with the fee covered");
  eq(e.state.salesSession.unpaidNode, other, "fee owed");
  p.money = 0; // simulate: fee somehow unpayable at end
  ok(!e.salesEnd(pid), "can't end the run owing an unpayable fee");
  ok(e.state.salesSession, "session stays open");
  p.money = 2;
  const otherMoney = e.player(other).money;
  ok(e.salesEnd(pid), "ends after paying");
  eq(p.money, 0, "$2 paid");
  eq(e.player(other).money, otherMoney + 2, "rival received the fee");
});

test("occupancy: flip pays the fee once, then collect is free", () => {
  const e = freshGame(43);
  const pid = e.currentPlayerId(), other = e.state.players.find((q) => q.id !== pid).id;
  const node = MAP.X_LINKS[0];
  e.player(other).agentNode = node;
  e.player(other).agentMoved = true;
  ok(e.actSalesStart(pid));
  const p = e.player(pid);
  p.money = 5;
  ok(e.salesMove(pid, node));
  const t = e.state.mapSlots.find((t) => t.nodes.includes(node) && !t.faceUp && t.takenBy === null);
  ok(t, "a face-down tile exists at the corner");
  ok(e.salesFlip(pid, t.id));
  eq(p.money, 3, "flip paid the $2 fee");
  eq(e.state.salesSession.flipsLeft, 2, "slot 0 grants 3 flips");
  ok(e.salesCollect(pid, t.id));
  eq(p.money, 3, "fee not charged twice");
  eq(t.takenBy, pid);
  ok(p.orders.includes(t.id));
});

test("orders auto-fulfill from a qualifying print", () => {
  const e = freshGame(44);
  const pid = e.currentPlayerId(), p = e.player(pid);
  const t = e.state.mapSlots.find((t) => t.minVal === 3 && t.takenBy === null);
  t.takenBy = pid; t.faceUp = true;
  p.orders.push(t.id);
  const comic = COMICS.find((c) => c.genre === t.genre && c.bonus !== "ideas");
  const others = GENRES.filter((g) => g !== t.genre);
  ok(printOriginal(e, pid, comic.id, `writer_${others[0]}_2`, `artist_${others[1]}_2`));
  ok(t.fulfilled, "order fulfilled by the print");
  const c = e.state.chart[0];
  eq(c.fans, 1 + (comic.bonus === "fan" ? 1 : 0) + 1 + t.fans, "original + bonus + mastery + order fans");
});

// -------------------------------------------- increase-value phase (V27 p.10)
// a romance comic printed with the given creatives, advanced to round 2's
// increase phase (beginning-of-round eligibility frozen in comic.incBase)
function increaseGame(seed, wId, aId) {
  const e = freshGame(seed);
  const pid = e.currentPlayerId();
  ok(printOriginal(e, pid, "orig_25", wId, aId));
  e.endRound();
  const p = e.player(pid);
  p.money = 20;
  return { e, pid, p, comic: e.state.chart[0] };
}

test("increase: non-specialists never improve", () => {
  const { e, pid } = increaseGame(81, "writer_scifi_2", "artist_crime_2");
  eq(e.increaseOptions(pid).length, 0, "no options for non-specialists");
});

test("increase: solo specialist trains 1→2 ($2) then 2→3 ($3), once per round", () => {
  const { e, pid, p, comic } = increaseGame(82, "writer_romance_1", "artist_crime_2");
  let opts = e.increaseOptions(pid);
  eq(opts.length, 1, "only the specialist can improve");
  eq(opts[0].mode, "train"); eq(opts[0].cost, 2); eq(opts[0].newValue, 2);
  e.applyIncrease(pid, opts[0]);
  eq(p.money, 18, "$2 paid to reach value 2");
  eq(comic.creatives.writer.curValue, 2);
  eq(comic.value, 4, "comic value recalculated immediately");
  eq(e.increaseOptions(pid).length, 0, "one increment per creative per round");
  e.endRound();
  p.money = 20;
  opts = e.increaseOptions(pid);
  eq(opts.length, 1, "eligible again next round (per-round flags reset)");
  eq(opts[0].cost, 3, "$3 to reach value 3");
  e.applyIncrease(pid, opts[0]);
  eq(comic.creatives.writer.curValue, 3);
  e.endRound();
  eq(e.increaseOptions(pid).length, 0, "value 3 is the maximum");
});

test("increase: learning costs $1 and never exceeds the teammate", () => {
  const { e, pid, p, comic } = increaseGame(83, "writer_romance_1", "artist_romance_3");
  let opts = e.increaseOptions(pid);
  eq(opts.length, 1, "teammate at max: only the lower one moves");
  eq(opts[0].mode, "learn"); eq(opts[0].cost, 1); eq(opts[0].kind, "writer");
  e.applyIncrease(pid, opts[0]);
  eq(p.money, 19, "$1 paid");
  eq(comic.creatives.writer.curValue, 2);
  eq(e.increaseOptions(pid).length, 0, "1 increment per round while learning too");
  e.endRound();
  p.money = 20;
  opts = e.increaseOptions(pid);
  eq(opts.length, 1); eq(opts[0].mode, "learn"); eq(opts[0].newValue, 3);
  e.applyIncrease(pid, opts[0]);
  e.endRound();
  eq(e.increaseOptions(pid).length, 0, "both at 3: nothing left to improve");
});

test("increase: two equal specialists may BOTH train in one round", () => {
  const { e, pid, p, comic } = increaseGame(84, "writer_romance_2", "artist_romance_2B");
  let opts = e.increaseOptions(pid);
  eq(opts.length, 2, "both equal specialists offered training");
  ok(opts.every((o) => o.mode === "train" && o.cost === 3), "both train at $3");
  e.applyIncrease(pid, opts[0]);
  // regression: eligibility is frozen at round start — the second one must
  // still TRAIN, not become a blocked "learner" behind the mutated values
  opts = e.increaseOptions(pid);
  eq(opts.length, 1, "second specialist still has an option after the first trains");
  eq(opts[0].mode, "train", "still training, not learning");
  eq(opts[0].cost, 3);
  e.applyIncrease(pid, opts[0]);
  eq(p.money, 14, "$6 total for both 2→3");
  eq(comic.value, 6);
});

test("increase: two value-1 specialists both reach 2 for $4 total", () => {
  const { e, pid, p, comic } = increaseGame(85, "writer_romance_1", "artist_romance_1");
  const opts = e.increaseOptions(pid);
  eq(opts.length, 2);
  ok(opts.every((o) => o.mode === "train" && o.cost === 2), "both train at $2");
  e.applyIncrease(pid, opts[0]);
  e.applyIncrease(pid, e.increaseOptions(pid)[0]);
  eq(p.money, 16, "$4 total");
  eq(comic.value, 4);
});

test("increase: training first blocks the partner's learning that round", () => {
  const { e, pid, p } = increaseGame(86, "writer_romance_1", "artist_romance_2");
  const train = e.increaseOptions(pid).find((o) => o.mode === "train" && o.kind === "artist");
  ok(train, "the stronger specialist may train even with unequal values");
  eq(train.cost, 3);
  e.applyIncrease(pid, train);
  eq(e.increaseOptions(pid).length, 0, "partner may not learn from the fresh training");
  e.endRound();
  p.money = 20;
  const opts = e.increaseOptions(pid);
  eq(opts.length, 1, "next round the lower one may learn again");
  eq(opts[0].mode, "learn"); eq(opts[0].kind, "writer");
});

test("increase: learn first, then train the stronger partner, same round", () => {
  const { e, pid, p, comic } = increaseGame(87, "writer_romance_1", "artist_romance_2");
  const learn = e.increaseOptions(pid).find((o) => o.mode === "learn");
  ok(learn, "lower specialist offered learning");
  eq(learn.kind, "writer"); eq(learn.cost, 1);
  e.applyIncrease(pid, learn);
  eq(comic.creatives.writer.curValue, 2);
  // V27 note: "you may also train the first creative again in that same round"
  const opts = e.increaseOptions(pid);
  eq(opts.length, 1); eq(opts[0].mode, "train"); eq(opts[0].kind, "artist"); eq(opts[0].cost, 3);
  e.applyIncrease(pid, opts[0]);
  eq(comic.value, 5);
  eq(p.money, 16, "$1 learn + $3 train");
});

test("increase: value recalc fulfils a waiting order immediately", () => {
  const { e, pid, p, comic } = increaseGame(88, "writer_romance_2", "artist_romance_2B");
  const t = e.state.mapSlots.find((t) => t.genre === "romance" && t.minVal === 5 && t.takenBy === null);
  ok(t, "a value-5 romance order exists");
  t.takenBy = pid; t.faceUp = true; p.orders.push(t.id);
  const fans0 = comic.fans;
  e.applyIncrease(pid, e.increaseOptions(pid)[0]); // value 4 → 5
  ok(t.fulfilled, "order fulfilled the moment the value qualified");
  eq(comic.fans, fans0 + t.fans, "order fans granted");
});

// -------------------------------------------------------------- hand limit
test("hand limit forces a discard decision", () => {
  const e = freshGame(51);
  const pid = e.currentPlayerId(), p = e.player(pid);
  give(e, pid, "orig_1", "orig_2", "orig_3", "orig_8"); // 2 + 4 = 6 in hand
  ok(e.actHire(pid, { writer: "deck", artist: "deck" })); // 8 > 6
  ok(e.state.pending && e.state.pending.type === "discard", "discard pending");
  eq(e.state.pending.data.count, 2);
  ok(e.resolvePending(pid, { cards: ["orig_1", "orig_2"] }));
  eq(p.hand.length + p.hyped.length, HAND_LIMIT);
  ok(e.state.discards.comics.includes("orig_1"), "discards recycled");
});

// ---------------------------------------------------------------- specials
test("special: extra editor works once per round", () => {
  const e = freshGame(61);
  const pid = e.currentPlayerId(), p = e.player(pid);
  e.state.awaitingSpecial = { player: pid, special: "extraeditor" };
  ok(e.specialExtraEditor(pid, true));
  eq(p.editorsLeft, 5);
  ok(p.extraEditorUsed);
  e.state.awaitingSpecial = { player: pid, special: "extraeditor" };
  ok(e.specialExtraEditor(pid, true));
  eq(p.editorsLeft, 5, "second use refused");
});

test("special: marketing tiers and affordability", () => {
  const e = freshGame(62);
  const pid = e.currentPlayerId();
  ok(printOriginal(e, pid, "orig_25", "writer_scifi_2", "artist_crime_2"));
  const p = e.player(pid), c = e.state.chart[0], fans0 = c.fans;
  p.money = 10;
  e.state.awaitingSpecial = { player: pid, special: "marketing" };
  ok(e.specialMarketing(pid, 5, [{ chartIdx: 0, fans: 2 }]));
  eq(p.money, 5, "$5 tier charged");
  eq(c.fans, fans0 + 2, "$5 buys 2 fans");
  p.money = 1;
  e.state.awaitingSpecial = { player: pid, special: "marketing" };
  ok(e.specialMarketing(pid, 2, [{ chartIdx: 0, fans: 1 }]));
  eq(p.money, 1, "unaffordable tier is a no-op");
  eq(c.fans, fans0 + 2);
});

test("special: word of mouth converts one idea per comic", () => {
  const e = freshGame(63);
  const pid = e.currentPlayerId();
  ok(printOriginal(e, pid, "orig_25", "writer_scifi_2", "artist_crime_2"));
  const p = e.player(pid), c = e.state.chart[0], fans0 = c.fans;
  p.ideas.horror = 2;
  e.state.awaitingSpecial = { player: pid, special: "ideasconv" };
  ok(e.specialIdeasConv(pid, [{ genre: "horror", chartIdx: 0 }, { genre: "horror", chartIdx: 0 }]));
  eq(c.fans, fans0 + 1, "max 1 fan per comic");
  eq(p.ideas.horror, 1, "only the applied conversion spent an idea");
});

test("special: hype accrues and cashes in at print", () => {
  const e = freshGame(64);
  const pid = e.currentPlayerId(), p = e.player(pid);
  give(e, pid, "orig_29"); // horror, +1 fan bonus
  e.state.awaitingSpecial = { player: pid, special: "hype" };
  ok(e.specialHype(pid, "orig_29"));
  ok(!p.hand.includes("orig_29"));
  eq(p.hyped[0].tokens, 0);
  e.endRound(); // round passes: hype token accrues
  eq(p.hyped[0].tokens, 1);
  if (e.currentPlayerId() !== pid) e.actPass(e.currentPlayerId());
  give(e, pid, "writer_scifi_2", "artist_crime_2");
  p.money = 10; p.ideas.horror = 2;
  ok(e.actPrint(pid, { books: [{ type: "original", comic: "orig_29", writer: "writer_scifi_2", artist: "artist_crime_2" }] }));
  const c = e.state.chart[0];
  eq(c.fans, 1 + 1 + 2 + 1, "original + bonus + 2 hype fans + mastery");
  eq(p.hyped.length, 0, "hype slot cleared");
});

// ------------------------------------------------------------- round & end
test("round end: rank VP, income, decay, reversed turn order", () => {
  const e = freshGame(71);
  const A = e.currentPlayerId();
  ok(printOriginal(e, A, "orig_25", "writer_scifi_2", "artist_crime_2")); // fans 2
  const B = e.state.players.find((q) => q.id !== A).id;
  const mA = e.player(A).money, vA = e.player(A).vpTokens;
  e.endRound();
  eq(e.player(A).vpTokens, vA + RANK_VP[0], "leader VP");
  eq(e.player(B).vpTokens, 0, "no chart presence, no VP");
  eq(e.player(A).money, mA + e.comicMoney(2), "income for 2 fans");
  eq(e.state.chart[0].fans, 1, "decay -1");
  eq(e.state.round, 2);
  eq(e.state.turnOrder[0], B, "turn order reversed by ranking");
});

test("comicMoney brackets", () => {
  const e = freshGame(72);
  eq(e.comicMoney(0), 0);
  eq(e.comicMoney(1), 1);
  eq(e.comicMoney(3), 2);
  eq(e.comicMoney(10), 6);
  eq(e.comicMoney(11), 7, "11+ adds to the $6 bracket");
});

test("final scoring components", () => {
  const e = freshGame(73);
  const A = e.currentPlayerId();
  ok(printOriginal(e, A, "orig_25", "writer_scifi_2", "artist_crime_2"));
  const B = e.state.players.find((q) => q.id !== A).id;
  e.player(A).money = 10; // moneyVP 2
  const beforePreview = JSON.stringify(e.state);
  const preview = e.scorePreview();
  eq(JSON.stringify(e.state), beforePreview, "score preview is a pure query");
  const scores = e.finishGame();
  eq(JSON.stringify(scores), JSON.stringify(preview), "projected VP uses the final-scoring calculation");
  const sA = scores.find((r) => r.player === A), sB = scores.find((r) => r.player === B);
  eq(sA.fans, 2); eq(sA.masteryVP, 2); eq(sA.moneyVP, 2);
  eq(sA.origVP, 2, "no specialists: 2 VP for the original");
  eq(sA.total, 2 + 2 + 2 + 2);
  eq(sB.moneyVP, Math.floor(e.player(B).money / 4));
  eq(scores[0].player, A, "A wins");
});

// ------------------------------------------------------------------- undo
test("undo: restore replays to an identical state", () => {
  const e = new Engine({ players: [{ color: "yellow" }, { color: "salmon" }, { color: "teal" }], seed: 777, useRipoffs: true });
  const run = (steps) => {
    for (let i = 0; i < steps && !e.state.gameOver; i++) {
      const s = e.state;
      if (s.pending) AI.resolveOwnPendings(e, s.pending.playerId);
      else if (s.awaitingSpecial) AI.settle(e, s.awaitingSpecial.player);
      else if (s.phase === "increase") {
        const pid = s.turnOrder[s.turnIdx];
        if (e.player(pid).startingPicks) AI.doStartingPicks(e, pid);
        AI.doIncrease(e, pid);
        e.advanceIncrease();
      } else if (s.phase === "actions") AI.takeTurn(e, e.currentPlayerId());
    }
  };
  run(30); // reach mid-game before snapshotting
  const snap = e.snapshot();
  run(80);
  const h1 = JSON.stringify(e.state);
  e.restore(snap);
  run(80);
  eq(JSON.stringify(e.state), h1, "identical state after replay");
});

test("salesMoveCheck reports costs and reasons without mutating", () => {
  const e = freshGame(45);
  const pid = e.currentPlayerId(), other = e.state.players.find((q) => q.id !== pid).id;
  e.player(other).agentNode = MAP.X_LINKS[0];
  e.player(other).agentMoved = true;
  ok(e.actSalesStart(pid));
  const p = e.player(pid);
  p.money = 0;
  let chk = e.salesMoveCheck(pid, MAP.X_LINKS[0]);
  ok(!chk.ok && chk.occupied && /fee/.test(chk.reason), "broke + occupied: fee reason");
  chk = e.salesMoveCheck(pid, MAP.X_LINKS[1]);
  ok(chk.ok && chk.cabFare === 0, "free walk to an empty corner");
  ok(e.salesMove(pid, MAP.X_LINKS[1]));
  chk = e.salesMoveCheck(pid, MAP.X_LINKS[2]);
  ok(!chk.ok && /cab/.test(chk.reason), "broke: cab reason after the free step");
  chk = e.salesMoveCheck(pid, 23, true);
  ok(!chk.ok && /ticket/.test(chk.reason), "no tickets reason");
  eq(p.money, 0, "checks never mutate");
});

test("save/resume: JSON round-trip preserves determinism", () => {
  const cfg = { players: [{ color: "yellow", human: false }, { color: "salmon", human: false }], seed: 888, useRipoffs: true };
  const run = (e, steps) => {
    for (let i = 0; i < steps && !e.state.gameOver; i++) {
      const s = e.state;
      if (s.pending) AI.resolveOwnPendings(e, s.pending.playerId);
      else if (s.awaitingSpecial) AI.settle(e, s.awaitingSpecial.player);
      else if (s.phase === "increase") {
        const pid = s.turnOrder[s.turnIdx];
        if (e.player(pid).startingPicks) AI.doStartingPicks(e, pid);
        AI.doIncrease(e, pid);
        e.advanceIncrease();
      } else if (s.phase === "actions") AI.takeTurn(e, e.currentPlayerId());
    }
  };
  const e1 = new Engine(cfg);
  run(e1, 60);
  // what Save.store/peek do: state + rng through JSON
  const d = JSON.parse(JSON.stringify({ state: e1.state, rngA: e1.rng.a }));
  const e2 = new Engine(cfg);
  e2.restore({ state: d.state, rngA: d.rngA, nEvents: 0 });
  run(e1, 4000);
  run(e2, 4000);
  ok(e1.state.gameOver && e2.state.gameOver, "both games finish");
  eq(JSON.stringify(e2.state.scores), JSON.stringify(e1.state.scores), "identical final scores");
  eq(JSON.stringify(e2.state), JSON.stringify(e1.state), "identical final state");
});

// ------------------------------------------------------------------ report
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
