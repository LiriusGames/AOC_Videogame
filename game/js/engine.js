// ============================================================================
// AGE OF COMICS — rules engine (pure logic, no DOM; testable in Node)
// Implements the full base game V27: worker placement, printing, chart,
// mastery, sales map, special actions, scoring.
// ============================================================================
(function initEngineModule(root, factory) {
  const data = root.AOC_DATA || (typeof require !== "undefined" ? require("./data.js") : null);
  if (!data) throw new Error("Age of Comics data module must load before the engine");
  const api = factory(data);
  root.AOC_ENGINE = api;
  Object.assign(root, api);
  if (typeof module !== "undefined") module.exports = api;
})(globalThis, function buildEngineModule(data) {
"use strict";

const {
  GENRES, PUBLISHERS, PLAYER_COLORS, COMICS, CREATIVES, CARD_BY_ID,
  RIPOFF_TITLES, ORDER_SPECS, ACTIONS, IDEAS_SLOTS, ROYALTIES_SLOTS,
  SALES_SLOTS, RANK_VP, FAN_MONEY, HAND_LIMIT, MARKETING, SPECIALS, MAP,
} = data;

// ------------------------------------------------------------------ RNG
function mulberry32(seed) {
  // internal state lives on the function (f.a) so Engine.snapshot can save it
  const f = function () {
    f.a |= 0; f.a = (f.a + 0x6D2B79F5) | 0;
    let t = Math.imul(f.a ^ (f.a >>> 15), 1 | f.a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.a = seed >>> 0;
  return f;
}

class Engine {
  // config: { players:[{color, human, name?}], useRipoffs, aggressive, seed, difficulty }
  constructor(config) {
    this.cfg = Object.assign({ useRipoffs: true, aggressive: false, seed: (Math.random() * 1e9) | 0 }, config);
    this.rng = mulberry32(this.cfg.seed);
    this.events = [];   // UI animation feed
    this.setup();
  }

  // ---------------------------------------------------------------- helpers
  emit(type, data = {}) { this.events.push(Object.assign({ type }, data)); }
  // full rewind support (UNDO): state is plain data, rng state is one number
  snapshot() {
    return { state: structuredClone(this.state), rngA: this.rng.a, nEvents: this.events.length };
  }
  restore(snap) {
    this.state = structuredClone(snap.state);
    this.rng.a = snap.rngA;
    this.events.length = snap.nEvents;
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (this.rng() * (i + 1)) | 0;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  player(id) { return this.state.players[id]; }
  pub(id) { return PUBLISHERS[this.player(id).color]; }
  card(id) { return CARD_BY_ID[id]; }

  // ------------------------------------------------------------------ setup
  setup() {
    const n = this.cfg.players.length;
    const s = this.state = {
      nPlayers: n,
      round: 1,
      phase: "increase", // increase -> actions -> (gameover)
      pending: null,     // {playerId, type, data} decision to resolve
      // fixedTurnOrder (opt-in, used by invite rooms): a pinned round-1
      // order so setup's position compensation (+1 idea / +$1) follows the
      // seats it belongs to. Absent = the usual seeded shuffle.
      turnOrder: this.cfg.fixedTurnOrder
        ? this.cfg.fixedTurnOrder.slice()
        : this.shuffle(this.cfg.players.map((_, i) => i)),
      turnIdx: 0,
      players: [],
      decks: { writers: [], artists: [], comics: [], ripoffs: [] },
      discards: { writers: [], artists: [], comics: [] },
      display: { writers: [], artists: [], comics: [] },
      boardIdeas: {},                 // genre -> 0|1
      actionSpaces: {},               // action -> [playerId,...]
      specialCubes: {},               // specialId -> [playerId,...]
      calendar: [],                   // round idx -> [genre] (round 3 has 2)
      calendarRevealed: [],
      mapSlots: [],                   // {id,nodes,genre,minVal,fans,faceUp,takenBy,fulfilled}
      chart: [],                      // printed comics: see printComic()
      rippedOriginals: {},            // origCardId -> true
      mastery: {},                    // genre -> playerId
      firstPrinted: {},               // genre -> true (any player printed it)
      salesSession: null,
      printX2: null,                  // playerId with pending 2nd print this action
      gameOver: false,
      scores: null,
    };
    GENRES.forEach((g) => (s.boardIdeas[g] = 1));
    ACTIONS.forEach((a) => (s.actionSpaces[a] = []));
    Object.keys(SPECIALS).forEach((k) => (s.specialCubes[k] = []));

    // calendar: 6 genre tiles over 5 rounds, round 3 gets two
    const cal = this.shuffle(GENRES.slice());
    s.calendar = [[cal[0]], [cal[1]], [cal[2], cal[3]], [cal[4]], [cal[5]]];

    // decks
    s.decks.writers = this.shuffle(CREATIVES.filter((c) => c.kind === "writer").map((c) => c.id));
    s.decks.artists = this.shuffle(CREATIVES.filter((c) => c.kind === "artist").map((c) => c.id));
    s.decks.comics = this.shuffle(COMICS.map((c) => c.id));

    // players
    this.cfg.players.forEach((p, i) => {
      s.players.push({
        id: i, color: p.color, human: !!p.human,
        name: p.name || PUBLISHERS[p.color].boss,
        pubName: PUBLISHERS[p.color].name,
        persona: p.persona || PUBLISHERS[p.color].persona,
        money: 5, tickets: 0,
        ideas: Object.fromEntries(GENRES.map((g) => [g, 0])),
        hand: [],            // card ids (comics + creatives), max 6
        hyped: [],           // {cardId, tokens}
        mat: [],             // printed comics -> chart entries store detail
        orders: [],          // collected order slot ids
        editors: 4, editorsLeft: 4, extraEditorUsed: false,
        cubesLeft: 3, cubeSpecials: [],  // specialIds where cube placed
        vpTokens: 0,
        agentNode: "X", agentMoved: false,
        printedCount: 0,
      });
    });

    // starting creatives: 1 writer value2 + 1 artist value2, different genres
    s.players.forEach((p) => {
      const w = this.drawWhere(s.decks.writers, (c) => this.card(c).value === 2);
      let a = this.drawWhere(s.decks.artists, (c) => this.card(c).value === 2 && this.card(c).genre !== this.card(w).genre);
      p.hand.push(w, a);
    });
    // in turn order: 1 comic of choice (AI/auto: random top), ideas, compensation
    s.turnOrder.forEach((pid, idx) => {
      const p = this.player(pid);
      p.startingPicks = { comic: true, ideas: 2 + (idx === 1 || idx === 3 ? 1 : 0) };
      if (idx === 2 || idx === 3) p.money += 1;
    });

    // map order tiles
    this.setupMapSlots();

    // card display
    this.refillDisplay();

    this.emit("setup");
    this.startRound();
  }

  drawWhere(deck, pred) {
    const i = deck.findIndex(pred);
    return deck.splice(i >= 0 ? i : 0, 1)[0];
  }

  setupMapSlots() {
    const s = this.state;
    const n = s.nPlayers;
    // build tile bag
    let bag = [];
    for (const g of GENRES) {
      let specs = ORDER_SPECS.slice();
      if (n === 2) { specs = specs.slice(); specs.splice(0, 1); specs.splice(specs.findIndex((o) => o.minVal === 4), 1); }
      else if (n === 3) { specs = specs.slice(); specs.splice(0, 1); }
      specs.forEach((o) => bag.push({ genre: g, minVal: o.minVal, fans: o.fans }));
    }
    this.shuffle(bag);
    const usable = MAP.slots.filter((sl) => sl.minPlayers <= n);
    // place with constraint: max 2 tiles of same genre connected to one circle
    // NOTE: id is the index into state.mapSlots; geoId is the map-geometry slot
    for (let attempt = 0; attempt < 400; attempt++) {
      const tiles = this.shuffle(bag.slice());
      const placed = usable.map((sl, i) => ({
        id: i, geoId: sl.id, nodes: sl.nodes, genre: tiles[i].genre, minVal: tiles[i].minVal,
        fans: tiles[i].fans, faceUp: false, takenBy: null, fulfilled: false,
      }));
      s.mapSlots = placed;
      if (this.mapConstraintOk(placed)) return;
    }
    // fallback: last attempt stays in place even if the constraint failed
  }
  mapConstraintOk(placed) {
    const perNode = {};
    for (const t of placed)
      for (const nd of t.nodes) {
        perNode[nd] = perNode[nd] || {};
        perNode[nd][t.genre] = (perNode[nd][t.genre] || 0) + 1;
        if (perNode[nd][t.genre] >= 3) return false;
      }
    return true;
  }

  refillDisplay() {
    const s = this.state;
    const count = s.nPlayers >= 4 ? 4 : 3;
    for (const [key, deckName] of [["writers", "writers"], ["artists", "artists"], ["comics", "comics"]]) {
      // discard leftovers
      s.discards[deckName].push(...s.display[key]);
      s.display[key] = [];
      for (let i = 0; i < count; i++) {
        const c = this.drawCard(deckName);
        if (c) s.display[key].push(c);
      }
    }
  }
  drawCard(deckName) {
    const s = this.state;
    if (s.decks[deckName].length === 0) {
      if (s.discards[deckName].length === 0) return null;
      s.decks[deckName] = this.shuffle(s.discards[deckName]);
      s.discards[deckName] = [];
      this.emit("reshuffle", { deck: deckName });
    }
    return s.decks[deckName].pop();
  }

  // ------------------------------------------------------------ round start
  startRound() {
    const s = this.state;
    // I.1 calendar: reveal genre(s), flip matching order tiles on map
    const genres = s.calendar[s.round - 1];
    s.calendarRevealed.push(...genres);
    for (const g of genres)
      s.mapSlots.forEach((t) => { if (t.genre === g && t.takenBy === null) t.faceUp = true; });
    this.emit("calendar", { round: s.round, genres });

    // I.2 refill board ideas
    GENRES.forEach((g) => (s.boardIdeas[g] = 1));

    // I.3 hype tokens accrue
    s.players.forEach((p) => p.hyped.forEach((h) => { h.tokens += 1; this.emit("hype", { player: p.id, cardId: h.cardId, tokens: h.tokens }); }));

    // I.4 increase-value phase (players in turn order may pay to upgrade creatives)
    // learn-vs-train eligibility is decided from BEGINNING-of-round values
    // (V27 p.10), so freeze them before anything mutates during the phase
    s.chart.forEach((c) => {
      delete c.inc_writer;
      delete c.inc_artist;
      c.incBase = { writer: c.creatives.writer.curValue, artist: c.creatives.artist.curValue };
    });
    s.phase = "increase";
    s.turnIdx = 0;
    this.emit("roundStart", { round: s.round });
    this.advanceIncrease(true);
  }

  // --- increase phase: iterate players who have any legal upgrade; others skipped
  increaseOptions(pid) {
    const p = this.player(pid);
    const opts = [];
    this.state.chart.filter((c) => c.owner === pid).forEach((comic) => {
      const w = comic.creatives.writer, a = comic.creatives.artist;
      // eligibility mode comes from beginning-of-round values, NOT the values
      // already mutated this phase: two equal specialists must both be able
      // to train even after the first one has trained (V27 p.10)
      const base = comic.incBase || { writer: w.curValue, artist: a.curValue };
      const pair = [["writer", w, a, "artist"], ["artist", a, w, "writer"]];
      for (const [kind, cr, mate, mateKind] of pair) {
        if (comic["inc_" + kind]) continue; // one increment per creative per round
        const spec = cr.genre === comic.genre, mateSpec = mate.genre === comic.genre;
        if (!spec || cr.curValue >= 3) continue;
        const nv = cr.curValue + 1;
        if (mateSpec && base[kind] < base[mateKind]) {
          // learn: capped at the teammate's value, and a teammate trained
          // THIS round can't be learned from until next round
          if (p.money >= 1 && comic.lastTrainRound !== this.state.round && nv <= mate.curValue)
            opts.push({ chartIdx: comic.idx, kind, mode: "learn", cost: 1, newValue: nv });
        } else {
          const cost = nv; // train: pay the new value ($2 to reach 2, $3 to reach 3)
          if (p.money >= cost) opts.push({ chartIdx: comic.idx, kind, mode: "train", cost, newValue: nv });
        }
      }
    });
    return opts;
  }
  applyIncrease(pid, opt) {
    const p = this.player(pid);
    const comic = this.state.chart[opt.chartIdx];
    const cr = comic.creatives[opt.kind];
    p.money -= opt.cost;
    cr.curValue = opt.newValue;
    comic["inc_" + opt.kind] = true;
    if (opt.mode === "train") comic.lastTrainRound = this.state.round;
    comic.value = comic.creatives.writer.curValue + comic.creatives.artist.curValue;
    this.emit("increase", { player: pid, chartIdx: comic.idx, kind: opt.kind, mode: opt.mode, newValue: opt.newValue, title: comic.title });
    this.checkOrderFulfillment(pid);
  }
  finishIncrease(pid) {
    // player done upgrading; move to next
    this.state.turnIdx++;
    this.advanceIncrease();
  }
  advanceIncrease(first = false) {
    const s = this.state;
    while (s.turnIdx < s.turnOrder.length) {
      const pid = s.turnOrder[s.turnIdx];
      const opts = this.increaseOptions(pid);
      const picks = this.player(pid).startingPicks;
      if (opts.length > 0 || picks) return; // waiting for this player (UI/AI)
      s.turnIdx++;
    }
    // done: start action phase
    s.phase = "actions";
    s.turnIdx = 0;
    s.players.forEach((p) => {
      p.editorsLeft = p.editors;
      p.extraEditorUsed = false;
      p.agentMoved = false;
    });
    this.emit("actionsBegin", { round: s.round, order: s.turnOrder.slice() });
  }

  // starting picks (round 1 only): comic card of choice + idea tokens
  resolveStartingPicks(pid, comicId, ideaGenres) {
    const s = this.state, p = this.player(pid);
    if (!p.startingPicks) return;
    // comic: from display or top of deck
    if (comicId) this.takeComicCard(pid, comicId, true);
    for (const g of ideaGenres) p.ideas[g]++;
    this.emit("startingPicks", { player: pid, comicId, ideaGenres });
    delete p.startingPicks;
  }

  takeComicCard(pid, comicId, fromAnywhere = false) {
    const s = this.state, p = this.player(pid);
    const di = s.display.comics.indexOf(comicId);
    if (di >= 0) s.display.comics.splice(di, 1);
    else {
      const idx = s.decks.comics.indexOf(comicId);
      if (idx >= 0) s.decks.comics.splice(idx, 1);
    }
    p.hand.push(comicId);
  }

  // ----------------------------------------------------------- action phase
  currentPlayerId() {
    const s = this.state;
    if (s.phase !== "actions" && s.phase !== "increase") return null;
    return s.turnOrder[s.turnIdx % s.turnOrder.length] ?? null;
  }
  slotsAvailable(action) {
    return Math.min(this.state.nPlayers + 1, 5);
  }
  nextSlot(action) {
    const filled = this.state.actionSpaces[action].length;
    return filled < this.slotsAvailable(action) ? filled : -1;
  }
  canAct(pid, action) {
    const p = this.player(pid);
    if (this.state.phase !== "actions" || this.currentPlayerId() !== pid) return false;
    if (p.editorsLeft <= 0) return false;
    return this.nextSlot(action) >= 0;
  }

  placeEditor(pid, action) {
    const s = this.state, p = this.player(pid);
    const slot = this.nextSlot(action);
    s.actionSpaces[action].push(pid);
    p.editorsLeft--;
    // the placement diary, in TIME order: the UI derives WHICH staffer went
    // where from it (the roster grays right-to-left as placements happen)
    (s.placeSeq = s.placeSeq || []).push({ player: pid, action, slot });
    this.emit("placeEditor", { player: pid, action, slot });
    return slot;
  }

  hasCube(pid, action) {
    const p = this.player(pid);
    return p.cubeSpecials.some((sp) => SPECIALS[sp].after === action);
  }
  cubeSpecialFor(pid, action) {
    return this.player(pid).cubeSpecials.find((sp) => SPECIALS[sp].after === action) || null;
  }

  endTurn() {
    const s = this.state;
    if (s.pending) return; // wait for decision
    // advance to next player who still has editors
    const n = s.turnOrder.length;
    for (let i = 1; i <= n; i++) {
      const idx = (s.turnIdx + i) % n;
      if (this.player(s.turnOrder[idx]).editorsLeft > 0) {
        s.turnIdx = idx;
        this.emit("turn", { player: s.turnOrder[idx] });
        return;
      }
    }
    // also current player may still have editors (others done)
    if (this.player(s.turnOrder[s.turnIdx % n]).editorsLeft > 0) {
      this.emit("turn", { player: s.turnOrder[s.turnIdx % n] });
      return;
    }
    this.endRound();
  }

  // pass: forfeit remaining editors (also safety valve if no space is left)
  actPass(pid) {
    const p = this.player(pid);
    if (this.currentPlayerId() !== pid || this.state.phase !== "actions") return false;
    p.editorsLeft = 0;
    this.emit("pass", { player: pid });
    this.endTurn();
    return true;
  }

  // ---------------------------------------------------------------- actions
  // HIRE: picks = {writer: cardId|"deck", artist: cardId|"deck"}
  actHire(pid, picks) {
    const s = this.state, p = this.player(pid);
    if (!this.canAct(pid, "hire")) return false;
    this.placeEditor(pid, "hire");
    const got = [], blind = []; // blind = drawn unseen (the UI reveals those)
    for (const kind of ["writer", "artist"]) {
      const key = kind + "s";
      let cardId = picks[kind];
      let wasBlind = false;
      if (cardId === "deck") { cardId = this.drawCard(key); wasBlind = true; }
      else {
        const di = s.display[key].indexOf(cardId);
        if (di >= 0) s.display[key].splice(di, 1);
        else { cardId = this.drawCard(key); wasBlind = true; } // safety
      }
      if (cardId) {
        p.hand.push(cardId);
        got.push(cardId);
        if (wasBlind) blind.push(cardId);
        if (this.card(cardId).value === 1) {
          p.ideas[this.card(cardId).genre]++;
          this.emit("gainIdea", { player: pid, genre: this.card(cardId).genre, from: "rookie" });
        }
      }
    }
    this.emit("hire", { player: pid, cards: got, blind });
    this.enforceHandLimitPending(pid);
    this.afterAction(pid, "hire");
    return true;
  }

  // DEVELOP: pick = {comic: cardId|"deck"} or {searchGenre: g} ($4)
  actDevelop(pid, pick) {
    const s = this.state, p = this.player(pid);
    if (!this.canAct(pid, "develop")) return false;
    if (pick.searchGenre && p.money < 4) return false;
    this.placeEditor(pid, "develop");
    let cardId = null;
    if (pick.searchGenre) {
      p.money -= 4;
      // discard from top of deck until genre found (recycle discards if needed)
      for (let guard = 0; guard < 60; guard++) {
        const c = this.drawCard("comics");
        if (!c) break;
        if (this.card(c).genre === pick.searchGenre) { cardId = c; break; }
        s.discards.comics.push(c);
      }
    } else if (pick.comic === "deck") {
      cardId = this.drawCard("comics");
    } else {
      const di = s.display.comics.indexOf(pick.comic);
      if (di >= 0) { s.display.comics.splice(di, 1); cardId = pick.comic; }
      else cardId = this.drawCard("comics");
    }
    if (cardId) p.hand.push(cardId);
    this.emit("develop", { player: pid, cardId, searched: !!pick.searchGenre,
      blind: !pick.searchGenre && pick.comic === "deck" });
    this.enforceHandLimitPending(pid);
    this.afterAction(pid, "develop");
    return true;
  }

  // IDEAS: picks = {board: [genres], supply: [g1, g2]}
  actIdeas(pid, picks) {
    const s = this.state, p = this.player(pid);
    if (!this.canAct(pid, "ideas")) return false;
    const slot = this.placeEditor(pid, "ideas");
    const allow = IDEAS_SLOTS[slot];
    let taken = 0;
    for (const g of picks.board || []) {
      if (taken >= allow) break;
      if (s.boardIdeas[g] > 0) { s.boardIdeas[g]--; p.ideas[g]++; taken++; }
    }
    for (const g of (picks.supply || []).slice(0, 2)) p.ideas[g]++;
    this.emit("ideas", { player: pid, board: picks.board, supply: picks.supply });
    this.afterAction(pid, "ideas");
    return true;
  }

  // ROYALTIES
  actRoyalties(pid) {
    const p = this.player(pid);
    if (!this.canAct(pid, "royalties")) return false;
    const slot = this.placeEditor(pid, "royalties");
    const amt = ROYALTIES_SLOTS[slot];
    p.money += amt;
    this.emit("royalties", { player: pid, amount: amt });
    this.afterAction(pid, "royalties");
    return true;
  }

  // PRINT: params = {books: [bookSpec, bookSpec?]}
  // bookSpec original: {type:"original", comic, writer, artist}
  // bookSpec ripoff:   {type:"ripoff", target(chartIdx), writer, artist}
  actPrint(pid, params) {
    const s = this.state, p = this.player(pid);
    if (!this.canAct(pid, "print")) return false;
    const slot = this.nextSlot("print");
    const maxBooks = slot === 0 ? 2 : 1;
    const books = (params.books || []).slice(0, maxBooks);
    if (books.length === 0) return false;
    if (!this.canPrintBook(pid, books[0])) return false;
    this.placeEditor(pid, "print");
    this.printBook(pid, books[0]);
    if (books.length > 1) {
      // second print resolved after pendings of the first (bonus may fund it)
      s.printX2 = { player: pid, book: books[1] };
    }
    this.maybeResolveX2();
    this.afterAction(pid, "print");
    return true;
  }
  maybeResolveX2() {
    const s = this.state;
    if (!s.printX2 || s.pending) return;
    const { player, book } = s.printX2;
    s.printX2 = null;
    if (this.canPrintBook(player, book)) this.printBook(player, book);
    else this.emit("printFailed", { player });
  }

  canPrintBook(pid, spec) {
    const p = this.player(pid);
    if (!spec) return false;
    const w = this.card(spec.writer), a = this.card(spec.artist);
    if (!w || !a || w.kind !== "writer" || a.kind !== "artist") return false;
    if (!p.hand.includes(spec.writer) || !p.hand.includes(spec.artist)) {
      // hyped comics are beside the mat, creatives must be in hand
      return false;
    }
    const cost = w.value + a.value;
    if (spec.type === "original") {
      const c = this.card(spec.comic);
      if (!c) return false;
      const inHand = p.hand.includes(spec.comic) || p.hyped.some((h) => h.cardId === spec.comic);
      if (!inHand) return false;
      return p.money >= cost && p.ideas[c.genre] >= 2;
    } else {
      if (!this.cfg.useRipoffs) return false;
      const target = this.state.chart[spec.target];
      if (!target || target.isRipoff || target.owner === pid) return false;
      if (this.state.rippedOriginals[target.cardId]) return false;
      return p.money >= cost;
    }
  }

  printBook(pid, spec) {
    const s = this.state, p = this.player(pid);
    const w = this.card(spec.writer), a = this.card(spec.artist);
    const cost = w.value + a.value;
    p.money -= cost;
    p.hand = p.hand.filter((c) => c !== spec.writer && c !== spec.artist);

    let entry;
    if (spec.type === "original") {
      const c = this.card(spec.comic);
      p.ideas[c.genre] -= 2;
      // remove from hand or hyped
      let hypeFans = 0;
      const hi = p.hyped.findIndex((h) => h.cardId === spec.comic);
      if (hi >= 0) { hypeFans = p.hyped[hi].tokens * 2; p.hyped.splice(hi, 1); }
      else p.hand = p.hand.filter((x) => x !== spec.comic);

      entry = this.makeChartEntry(pid, {
        cardId: c.id, title: c.title, genre: c.genre, isRipoff: false,
        sprite: c.id,
      }, w, a);
      entry.fans += 1; // originals get 1 fan
      if (c.bonus === "fan") entry.fans += 1;
      if (hypeFans) entry.fans += hypeFans;

      // one-off bonus
      if (c.bonus === "money") { p.money += 4; this.emit("bonus", { player: pid, kind: "money" }); }
      if (c.bonus === "ticket") { p.tickets += 1; this.emit("bonus", { player: pid, kind: "ticket" }); }
      if (c.bonus === "ideas") this.pushPending(pid, "chooseIdeas", { count: 2, reason: "bonus" });
    } else {
      const target = s.chart[spec.target];
      s.rippedOriginals[target.cardId] = true;
      const idxInGenre = COMICS.filter((c) => c.genre === target.genre).findIndex((c) => c.id === target.cardId) + 1;
      entry = this.makeChartEntry(pid, {
        cardId: target.cardId, title: RIPOFF_TITLES[target.cardId] || "Rip-off",
        genre: target.genre, isRipoff: true,
        sprite: `rip_${target.genre}_${idxInGenre}`,
      }, w, a);
      if (this.cfg.aggressive) this.addFans(target, -1, "ripped");
    }

    // specialization fans
    if (w.genre === entry.genre) entry.fans++;
    if (a.genre === entry.genre) entry.fans++;

    p.printedCount++;
    p.mat.push(entry.idx);

    // narrative order: the print debuts first, THEN mastery is awarded
    // (its +1 fan arrives as a visible "fans"/"mastery" event pair)
    this.emit("print", {
      player: pid, chartIdx: entry.idx, title: entry.title, genre: entry.genre,
      isRipoff: entry.isRipoff, fans: entry.fans, value: entry.value, sprite: entry.sprite,
    });
    this.checkMastery(pid, entry);

    // order auto-fulfillment
    this.checkOrderFulfillment(pid);

    // special action cube unlock at 2nd/3rd/4th; relocate at 5th
    if (p.printedCount >= 2 && p.printedCount <= 4 && p.cubesLeft > 0) {
      const opts = this.cubeOptions(pid);
      if (opts.length) this.pushPending(pid, "placeCube", { options: opts });
    } else if (p.printedCount === 5) {
      this.pushPending(pid, "relocateCube", {});
    }
  }

  makeChartEntry(pid, base, w, a) {
    const s = this.state;
    const entry = Object.assign({
      idx: s.chart.length, owner: pid, fans: 0, everOnChart: false,
      bettercolor: false, masteryFanApplied: false,
      creatives: {
        writer: { id: w.id, genre: w.genre, baseValue: w.value, curValue: w.value, name: w.name },
        artist: { id: a.id, genre: a.genre, baseValue: a.value, curValue: a.value, name: a.name },
      },
    }, base);
    entry.value = w.value + a.value;
    s.chart.push(entry);
    return entry;
  }

  cubeOptions(pid) {
    const p = this.player(pid);
    const tier = p.printedCount; // 2,3,4
    return Object.keys(SPECIALS).filter((k) =>
      SPECIALS[k].tier <= tier && !p.cubeSpecials.includes(k));
  }

  addFans(entry, n, source) {
    if (!entry) return;
    const before = entry.fans;
    entry.fans += n;
    // min 1 for originals & for ripoffs that ever reached 1
    const min = entry.isRipoff && !entry.everOnChart ? 0 : entry.isRipoff ? 1 : 1;
    if (entry.fans < min) entry.fans = min;
    if (entry.fans >= 1) entry.everOnChart = true;
    if (entry.fans !== before)
      this.emit("fans", { chartIdx: entry.idx, owner: entry.owner, fans: entry.fans, delta: entry.fans - before, source });
  }

  checkMastery(pid, entry) {
    const s = this.state, g = entry.genre;
    const prev = s.mastery[g];
    let gained = false;
    if (!s.firstPrinted[g]) {
      s.firstPrinted[g] = true;
      if (!entry.isRipoff || this.playerHasOriginal(pid, g)) {
        // first print of the genre. Rip-offs alone can't earn mastery.
        if (!entry.isRipoff) { s.mastery[g] = pid; gained = true; }
      }
    } else if (s.mastery[g] !== pid && s.mastery[g] !== undefined) {
      const mine = this.genreCount(pid, g);
      const theirs = this.genreCount(s.mastery[g], g);
      if (mine > theirs && this.playerHasOriginal(pid, g)) { s.mastery[g] = pid; gained = true; }
    } else if (s.mastery[g] === undefined) {
      // genre printed before but nobody holds mastery (first was a ripoff)
      if (this.playerHasOriginal(pid, g)) { s.mastery[g] = pid; gained = true; }
    }
    if (gained) {
      this.emit("mastery", { player: pid, genre: g, prev });
      // +1 fan to all their comics of that genre (once per comic)
      s.chart.filter((c) => c.owner === pid && c.genre === g && !c.masteryFanApplied)
        .forEach((c) => { c.masteryFanApplied = true; this.addFans(c, 1, "mastery"); });
    } else if (s.mastery[g] === pid && !entry.masteryFanApplied) {
      entry.masteryFanApplied = true;
      this.addFans(entry, 1, "mastery");
    }
  }
  genreCount(pid, g) {
    return this.state.chart.filter((c) => c.owner === pid && c.genre === g).length;
  }
  playerHasOriginal(pid, g) {
    return this.state.chart.some((c) => c.owner === pid && c.genre === g && !c.isRipoff);
  }

  // order auto-fulfillment: any collected, unfulfilled order matching one comic
  checkOrderFulfillment(pid) {
    const s = this.state, p = this.player(pid);
    for (const oid of p.orders) {
      const o = s.mapSlots[oid];
      if (o.fulfilled) continue;
      const eligible = s.chart.filter((c) => c.owner === pid && c.genre === o.genre && c.value >= o.minVal);
      if (eligible.length === 0) continue;
      if (eligible.length === 1) this.fulfillOrder(pid, oid, eligible[0].idx);
      else this.pushPending(pid, "chooseOrderComic", { orderId: oid, choices: eligible.map((c) => c.idx) });
    }
  }
  fulfillOrder(pid, orderId, chartIdx) {
    const s = this.state;
    const o = s.mapSlots[orderId];
    if (o.fulfilled) return;
    o.fulfilled = true;
    this.addFans(s.chart[chartIdx], o.fans, "order");
    this.emit("orderFulfilled", { player: pid, orderId, chartIdx, fans: o.fans, genre: o.genre });
  }

  // SALES ------------------------------------------------------------------
  actSalesStart(pid) {
    const s = this.state, p = this.player(pid);
    if (!this.canAct(pid, "sales")) return false;
    const slot = this.placeEditor(pid, "sales");
    s.salesSession = {
      player: pid, slot,
      flipsLeft: SALES_SLOTS[slot], collectsLeft: SALES_SLOTS[slot],
      freeWalk: true, unpaidNode: null,
    };
    this.emit("salesStart", { player: pid, slot, limit: SALES_SLOTS[slot] });
    return true;
  }
  agentAdjacent(pid) {
    const p = this.player(pid);
    if (p.agentNode === "X") return MAP.X_LINKS.slice();
    const adj = [];
    for (const [a, b] of MAP.edges) {
      if (a === p.agentNode) adj.push(b);
      if (b === p.agentNode) adj.push(a);
    }
    // X reachable/crossable: nodes adjacent through X (X_LINKS are mutually connected via X)
    if (MAP.X_LINKS.includes(p.agentNode))
      MAP.X_LINKS.forEach((n) => { if (n !== p.agentNode && !adj.includes(n)) adj.push(n); });
    return adj;
  }
  // legality/cost query for a sales move — single source of the movement
  // rules, used by salesMove itself and by any UI that lists destinations
  salesMoveCheck(pid, toNode, useTicket = false) {
    const s = this.state, ses = s.salesSession, p = this.player(pid);
    if (!ses || ses.player !== pid) return { ok: false, reason: "no sales run in progress" };
    const cabFare = !useTicket && !ses.freeWalk ? 2 : 0;
    const occupant = s.players.find((q) => q.id !== pid && q.agentNode === toNode && q.agentMoved);
    const occupied = occupant !== undefined;
    if (useTicket) {
      if (p.tickets <= 0) return { ok: false, cabFare, occupied, reason: "no tickets left" };
    } else {
      if (!this.agentAdjacent(pid).includes(toNode)) return { ok: false, cabFare, occupied, reason: "not adjacent" };
      if (p.money < cabFare) return { ok: false, cabFare, occupied, reason: "can't afford the $2 cab" };
    }
    // occupancy fee owed if flipping/collecting here or ending here;
    // can't enter a rival's corner without being able to pay it
    if (occupied && p.money - cabFare < 2)
      return { ok: false, cabFare, occupied, reason: "can't afford the rival's $2 fee" };
    return { ok: true, cabFare, occupied };
  }
  salesMove(pid, toNode, useTicket = false) {
    const s = this.state, ses = s.salesSession, p = this.player(pid);
    if (!this.salesMoveCheck(pid, toNode, useTicket).ok) return false;
    const occupant = s.players.find((q) => q.id !== pid && q.agentNode === toNode && q.agentMoved);
    if (useTicket) p.tickets--;
    else if (ses.freeWalk) ses.freeWalk = false;
    else {
      p.money -= 2;
      this.emit("cab", { player: pid });
    }
    p.agentNode = toNode;
    p.agentMoved = true;
    ses.unpaidNode = occupant ? occupant.id : null;
    ses.feePaid = false;
    this.emit("agentMove", { player: pid, node: toNode, ticket: useTicket });
    return true;
  }
  payOccupancy(pid) {
    const s = this.state, ses = s.salesSession, p = this.player(pid);
    if (ses.unpaidNode == null || ses.feePaid) return true;
    if (p.money < 2) return false;
    p.money -= 2;
    this.player(ses.unpaidNode).money += 2;
    ses.feePaid = true;
    this.emit("occupancyFee", { from: pid, to: ses.unpaidNode });
    return true;
  }
  slotsAtAgent(pid) {
    const p = this.player(pid);
    if (p.agentNode === "X") return [];
    return this.state.mapSlots.filter((t) => t.nodes.includes(p.agentNode) && t.takenBy === null);
  }
  salesFlip(pid, slotId) {
    const s = this.state, ses = s.salesSession;
    if (!ses || ses.player !== pid || ses.flipsLeft <= 0) return false;
    const t = s.mapSlots[slotId];
    if (!t || t.faceUp || t.takenBy !== null || !t.nodes.includes(this.player(pid).agentNode)) return false;
    if (!this.payOccupancy(pid)) return false;
    t.faceUp = true;
    ses.flipsLeft--;
    this.emit("flip", { player: pid, slotId, genre: t.genre, minVal: t.minVal, fans: t.fans });
    return true;
  }
  salesCollect(pid, slotId) {
    const s = this.state, ses = s.salesSession, p = this.player(pid);
    if (!ses || ses.player !== pid || ses.collectsLeft <= 0) return false;
    const t = s.mapSlots[slotId];
    if (!t || t.takenBy !== null || !t.nodes.includes(p.agentNode)) return false;
    if (!this.payOccupancy(pid)) return false;
    t.takenBy = pid;
    t.faceUp = true;
    p.orders.push(slotId);
    ses.collectsLeft--;
    this.emit("collect", { player: pid, slotId, genre: t.genre, minVal: t.minVal, fans: t.fans });
    this.checkOrderFulfillment(pid);
    return true;
  }
  salesEnd(pid) {
    const s = this.state;
    if (!s.salesSession || s.salesSession.player !== pid) return false;
    if (!this.payOccupancy(pid)) return false; // must settle the fee to end here
    s.salesSession = null;
    this.emit("salesEnd", { player: pid });
    this.afterAction(pid, "sales");
    return true;
  }

  // ------------------------------------------------------- special actions
  afterAction(pid, action) {
    const s = this.state;
    const sp = this.cubeSpecialFor(pid, action);
    if (sp) {
      s.awaitingSpecial = { player: pid, special: sp };
      this.emit("specialAvailable", { player: pid, special: sp });
    } else {
      this.completeAction();
    }
  }
  completeAction() {
    const s = this.state;
    s.awaitingSpecial = null;
    this.maybeResolveX2();
    if (s.pending || s.printX2) return; // resolve decisions first
    this.endTurn();
  }
  skipSpecial(pid) {
    const s = this.state;
    if (s.awaitingSpecial && s.awaitingSpecial.player === pid) this.completeAction();
  }

  // reassign: swaps = [{chartIdx, kind, withCardId}] (withCardId from hand)
  specialReassign(pid, swaps) {
    const s = this.state, p = this.player(pid);
    if (!s.awaitingSpecial || s.awaitingSpecial.special !== "reassign" || s.awaitingSpecial.player !== pid) return false;
    for (const sw of (swaps || []).slice(0, 2)) {
      const comic = s.chart[sw.chartIdx];
      if (!comic || comic.owner !== pid) continue;
      const newCard = this.card(sw.withCardId);
      if (!newCard || newCard.kind !== sw.kind || !p.hand.includes(sw.withCardId)) continue;
      const old = comic.creatives[sw.kind];
      const diff = newCard.value - old.curValue;
      if (diff > 0 && p.money < diff) continue;
      p.money -= Math.max(0, diff);
      if (diff < 0) p.money += -diff;
      // fan adjustment by specialization change
      const wasSpec = old.genre === comic.genre, nowSpec = newCard.genre === comic.genre;
      // swap: old goes to hand, new goes to mat
      p.hand = p.hand.filter((c) => c !== sw.withCardId);
      p.hand.push(old.id);
      comic.creatives[sw.kind] = { id: newCard.id, genre: newCard.genre, baseValue: newCard.value, curValue: newCard.value, name: newCard.name };
      comic.value = comic.creatives.writer.curValue + comic.creatives.artist.curValue;
      if (!wasSpec && nowSpec) this.addFans(comic, 1, "reassign");
      if (wasSpec && !nowSpec) this.addFans(comic, -1, "reassign");
      this.emit("reassign", { player: pid, chartIdx: sw.chartIdx, kind: sw.kind, newName: newCard.name });
      this.checkOrderFulfillment(pid);
    }
    this.enforceHandLimitPending(pid);
    this.completeAction();
    return true;
  }

  // hype: cardId of an unprinted comic in hand
  specialHype(pid, cardId) {
    const s = this.state, p = this.player(pid);
    if (!s.awaitingSpecial || s.awaitingSpecial.special !== "hype" || s.awaitingSpecial.player !== pid) return false;
    if (cardId) {
      const c = this.card(cardId);
      if (c && p.hand.includes(cardId) && c.genre) {
        p.hand = p.hand.filter((x) => x !== cardId);
        p.hyped.push({ cardId, tokens: 0 });
        this.emit("hypeStart", { player: pid, cardId, title: c.title });
      }
    }
    this.completeAction();
    return true;
  }

  // ideasconv: conversions = [{genre, chartIdx}] up to 3, distinct comics
  specialIdeasConv(pid, conversions) {
    const s = this.state, p = this.player(pid);
    if (!s.awaitingSpecial || s.awaitingSpecial.special !== "ideasconv" || s.awaitingSpecial.player !== pid) return false;
    const used = new Set();
    for (const cv of (conversions || []).slice(0, 3)) {
      const comic = s.chart[cv.chartIdx];
      if (!comic || comic.owner !== pid || used.has(cv.chartIdx)) continue;
      if (p.ideas[cv.genre] <= 0) continue;
      p.ideas[cv.genre]--;
      used.add(cv.chartIdx);
      this.addFans(comic, 1, "wordofmouth");
    }
    if (used.size) this.emit("ideasConverted", { player: pid, count: used.size });
    this.completeAction();
    return true;
  }

  // bettercolor: automatically applies to the freshest print
  specialBetterColor(pid, accept) {
    const s = this.state, p = this.player(pid);
    if (!s.awaitingSpecial || s.awaitingSpecial.special !== "bettercolor" || s.awaitingSpecial.player !== pid) return false;
    if (accept) {
      const mine = s.chart.filter((c) => c.owner === pid && !c.bettercolor);
      const last = mine[mine.length - 1];
      if (last) { last.bettercolor = true; this.emit("bettercolor", { player: pid, chartIdx: last.idx, title: last.title }); }
    }
    this.completeAction();
    return true;
  }

  // marketing: spend = 2|5|9, distribution = [{chartIdx, fans}]
  specialMarketing(pid, spend, distribution) {
    const s = this.state, p = this.player(pid);
    if (!s.awaitingSpecial || s.awaitingSpecial.special !== "marketing" || s.awaitingSpecial.player !== pid) return false;
    const tier = MARKETING.find((t) => t.cost === spend);
    if (tier && p.money >= tier.cost) {
      let fansLeft = tier.fans;
      p.money -= tier.cost;
      for (const d of distribution || []) {
        const comic = s.chart[d.chartIdx];
        if (!comic || comic.owner !== pid) continue;
        const n = Math.min(d.fans, fansLeft);
        if (n > 0) { this.addFans(comic, n, "marketing"); fansLeft -= n; }
      }
      this.emit("marketing", { player: pid, spend: tier.cost, fans: tier.fans - fansLeft });
    }
    this.completeAction();
    return true;
  }

  // extra editor
  specialExtraEditor(pid, accept) {
    const s = this.state, p = this.player(pid);
    if (!s.awaitingSpecial || s.awaitingSpecial.special !== "extraeditor" || s.awaitingSpecial.player !== pid) return false;
    if (accept && !p.extraEditorUsed) {
      p.extraEditorUsed = true;
      p.editorsLeft += 1;
      this.emit("extraEditor", { player: pid });
    }
    this.completeAction();
    return true;
  }

  // ------------------------------------------------------------- pendings
  pushPending(pid, type, data) {
    // queue: engine holds one; extras chain via _queue
    const s = this.state;
    const item = { playerId: pid, type, data };
    if (!s.pending) s.pending = item;
    else {
      s.pendingQueue = s.pendingQueue || [];
      s.pendingQueue.push(item);
    }
    this.emit("pending", { playerId: pid, type });
  }
  resolvePending(pid, payload) {
    const s = this.state;
    const pd = s.pending;
    if (!pd || pd.playerId !== pid) return false;
    s.pending = null;
    switch (pd.type) {
      case "placeCube": {
        const p = this.player(pid);
        const choice = payload.special;
        if (pd.data.options.includes(choice) && p.cubesLeft > 0) {
          p.cubesLeft--;
          p.cubeSpecials.push(choice);
          s.specialCubes[choice].push(pid);
          this.emit("cubePlaced", { player: pid, special: choice });
        }
        break;
      }
      case "relocateCube": {
        const p = this.player(pid);
        if (payload && payload.from && payload.to && p.cubeSpecials.includes(payload.from) &&
            !p.cubeSpecials.includes(payload.to) && SPECIALS[payload.to]) {
          p.cubeSpecials = p.cubeSpecials.filter((x) => x !== payload.from);
          s.specialCubes[payload.from] = s.specialCubes[payload.from].filter((x) => x !== pid);
          p.cubeSpecials.push(payload.to);
          s.specialCubes[payload.to].push(pid);
          this.emit("cubeMoved", { player: pid, from: payload.from, to: payload.to });
        }
        break;
      }
      case "chooseIdeas": {
        const p = this.player(pid);
        (payload.genres || []).slice(0, pd.data.count).forEach((g) => p.ideas[g]++);
        this.emit("gainIdea", { player: pid, genres: payload.genres, from: pd.data.reason });
        break;
      }
      case "chooseOrderComic": {
        const cid = payload.chartIdx;
        if (pd.data.choices.includes(cid)) this.fulfillOrder(pid, pd.data.orderId, cid);
        break;
      }
      case "discard": {
        const p = this.player(pid);
        for (const c of payload.cards || []) {
          const i = p.hand.indexOf(c);
          if (i >= 0) {
            p.hand.splice(i, 1);
            const card = this.card(c);
            const deck = card.kind === "writer" ? "writers" : card.kind === "artist" ? "artists" : "comics";
            s.discards[deck].push(c);
          }
        }
        // enforce again if still over
        this.enforceHandLimitPending(pid);
        break;
      }
    }
    // chain queue
    if (s.pendingQueue && s.pendingQueue.length) s.pending = s.pendingQueue.shift();
    if (!s.pending) {
      this.maybeResolveX2();
      if (!s.pending && !s.awaitingSpecial && !s.salesSession && s.phase === "actions") this.endTurn();
    }
    return true;
  }
  enforceHandLimitPending(pid) {
    const p = this.player(pid);
    const total = p.hand.length + p.hyped.length;
    if (total > HAND_LIMIT)
      this.pushPending(pid, "discard", { count: total - HAND_LIMIT });
  }

  // -------------------------------------------------------------- round end
  bestComicFans(pid) {
    const mine = this.state.chart.filter((c) => c.owner === pid && c.fans >= 1);
    return mine.length ? Math.max(...mine.map((c) => c.fans)) : -1;
  }
  comicMoney(fans) {
    if (fans < 1) return 0;
    if (fans > 10) return 6 + (FAN_MONEY[Math.min(10, fans - 10)] || 0);
    return FAN_MONEY[fans] || 0;
  }
  endRound() {
    const s = this.state;
    // 1. ranking + VP
    const ranked = s.players.map((p) => ({ id: p.id, best: this.bestComicFans(p.id) }))
      .sort((a, b) => b.best - a.best);
    let place = 0, i = 0;
    const rankInfo = [];
    while (i < ranked.length) {
      const tied = ranked.filter((r) => r.best === ranked[i].best);
      const vp = ranked[i].best >= 1 ? (RANK_VP[place] || 0) : 0;
      for (const r of tied) {
        this.player(r.id).vpTokens += vp;
        rankInfo.push({ player: r.id, place: place + 1, vp, best: r.best });
      }
      place += tied.length;
      i += tied.length;
    }
    // 2. earnings
    const pay = s.players.map((p) => {
      let sum = 0;
      s.chart.filter((c) => c.owner === p.id && c.fans >= 1).forEach((c) => (sum += this.comicMoney(c.fans)));
      p.money += sum;
      return { player: p.id, amount: sum };
    });
    this.emit("roundEnd", { round: s.round, rankInfo, pay });

    if (s.round === 5) return this.finishGame();

    // 3. next turn order = reverse ranking (ties: swap relative to previous order)
    const prevOrder = s.turnOrder.slice();
    const byBestAsc = ranked.slice().sort((a, b) =>
      a.best - b.best || prevOrder.indexOf(b.id) - prevOrder.indexOf(a.id));
    s.turnOrder = byBestAsc.map((r) => r.id);

    // 4. fan decay (min 1; not applied to off-chart ripoffs)
    s.chart.forEach((c) => { if (c.fans >= 1) this.addFans(c, -1, "decay"); });

    // 5. editors return to the players
    ACTIONS.forEach((a) => (s.actionSpaces[a] = []));
    s.placeSeq = [];
    // 6. refresh display
    this.refillDisplay();

    s.round++;
    this.startRound();
  }

  // --------------------------------------------------------------- scoring
  scorePlayer(pid) {
    const s = this.state;
    const p = this.player(pid);
    const comics = s.chart.filter((c) => c.owner === p.id);
    const fans = comics.reduce((sum, c) => sum + Math.max(0, c.fans), 0);
    const unfulfilled = p.orders.map((oid) => s.mapSlots[oid]).filter((o) => !o.fulfilled);
    const orderPenalty = unfulfilled.reduce((sum, o) => sum + o.fans, 0);
    const masteryVP = Object.values(s.mastery).filter((owner) => owner === p.id).length * 2;
    const bcVP = comics.filter((c) => c.bettercolor).length * 2;
    const moneyVP = Math.floor(p.money / 4);
    const ideasVP = Math.floor(GENRES.reduce((sum, g) => sum + p.ideas[g], 0) / 4);
    let origVP = 0;
    comics.filter((c) => !c.isRipoff).forEach((c) => {
      const spec = (c.creatives.writer.genre === c.genre ? 1 : 0) + (c.creatives.artist.genre === c.genre ? 1 : 0);
      origVP += spec === 2 ? 6 : spec === 1 ? 4 : 2;
    });
    let extraVP = 0;
    if (p.printedCount >= 5) extraVP += comics.filter((c) => !c.isRipoff).length; // +1 per original
    if (p.printedCount >= 6) extraVP += (p.printedCount - 5) * 2;                 // +2 from 6th onward
    const total = fans - orderPenalty + p.vpTokens + masteryVP + bcVP + moneyVP + ideasVP + origVP + extraVP;
    return {
      player: p.id, name: p.name, pubName: p.pubName, color: p.color,
      fans, orderPenalty, vpTokens: p.vpTokens, masteryVP, bcVP, moneyVP, ideasVP, origVP, extraVP, total,
      printed: p.printedCount,
    };
  }

  scorePreview() {
    const scores = this.state.players.map((p) => this.scorePlayer(p.id));
    // tiebreak: most printed, then highest total comic value
    scores.sort((a, b) => b.total - a.total ||
      this.player(b.player).printedCount - this.player(a.player).printedCount);
    return scores;
  }

  finishGame() {
    const s = this.state;
    s.gameOver = true;
    s.phase = "gameover";
    const scores = this.scorePreview();
    s.scores = scores;
    this.emit("gameOver", { scores });
    return scores;
  }
}

return { Engine, mulberry32 };
});
