// ============================================================================
// AGE OF COMICS — save/resume: versioned autosave in localStorage.
// The engine state is plain data and the RNG state is one number, so a save
// is just { cfg, state, rngA }. Restoring rebuilds the Engine and swaps both.
// ============================================================================
"use strict";

const Save = (() => {
  const KEYS = { game: "aoc_save", tutorial: "aoc_tutorial_save" };
  const VERSION = 1;

  function slotName(slot) { return slot || (UI.mode === "tutorial" ? "tutorial" : "game"); }
  function serialize() {
    const e = UI.engine;
    if (!e || e.state.gameOver || UI.autoplay) return null;
    return JSON.stringify({
      v: VERSION,
      savedAt: Date.now(),
      mode: UI.mode || "solo",
      humanId: UI.humanId,
      tutorial: typeof Tutor !== "undefined" ? Tutor.exportState() : null,
      cfg: {
        players: e.cfg.players,
        useRipoffs: e.cfg.useRipoffs,
        difficulty: e.cfg.difficulty,
        seed: e.cfg.seed,
      },
      rngA: e.rng.a,
      state: e.state,
    });
  }

  // autosave the running game (no-op when there is nothing worth saving)
  function store(slot) {
    try {
      const s = serialize();
      if (s) localStorage.setItem(KEYS[slotName(slot)], s);
    } catch (err) { /* storage full/blocked: play on without saves */ }
  }

  // parsed + validated save, or null (unknown versions and corrupt
  // payloads are treated as absent, never as errors)
  function peek(slot = "game") {
    try {
      const raw = localStorage.getItem(KEYS[slotName(slot)]);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (d.v !== VERSION || !d.cfg || !d.state || d.state.gameOver) return null;
      if (!Array.isArray(d.cfg.players) || !Array.isArray(d.state.players)) return null;
      if (d.cfg.players.length !== d.state.players.length) return null;
      if (!(d.state.round >= 1 && d.state.round <= 5)) return null;
      if (!d.state.players[d.humanId] || !d.state.players[d.humanId].human) return null;
      return d;
    } catch (err) { return null; }
  }

  function clear(slot) {
    try { localStorage.removeItem(KEYS[slotName(slot)]); } catch (err) { /* ignore */ }
  }

  return { serialize, store, peek, clear };
})();
