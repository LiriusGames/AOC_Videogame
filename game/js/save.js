// ============================================================================
// AGE OF COMICS — save/resume: versioned autosave in localStorage.
// The engine state is plain data and the RNG state is one number, so a save
// is just { cfg, state, rngA }. Restoring rebuilds the Engine and swaps both.
// ============================================================================
"use strict";

const Save = (() => {
  const KEY = "aoc_save";
  const VERSION = 1;

  function serialize() {
    const e = UI.engine;
    if (!e || e.state.gameOver || UI.autoplay) return null;
    return JSON.stringify({
      v: VERSION,
      savedAt: Date.now(),
      humanId: UI.humanId,
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
  function store() {
    try {
      const s = serialize();
      if (s) localStorage.setItem(KEY, s);
    } catch (err) { /* storage full/blocked: play on without saves */ }
  }

  // parsed + validated save, or null (unknown versions and corrupt
  // payloads are treated as absent, never as errors)
  function peek() {
    try {
      const raw = localStorage.getItem(KEY);
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

  function clear() {
    try { localStorage.removeItem(KEY); } catch (err) { /* ignore */ }
  }

  return { store, peek, clear };
})();
