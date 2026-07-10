// ============================================================================
// AGE OF COMICS — main: screens, game flow, AI turn runner
// ============================================================================
"use strict";

const Main = (() => {
  const setup = { color: "teal", rivals: 2, difficulty: "normal", ripoffs: true };

  function show(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
  }

  // ------------------------------------------------------------------ title
  function initTitle() {
    document.getElementById("btn-new-game").onclick = () => {
      SFX.unlock(); SFX.play("click"); SFX.startMusic();
      buildSetup();
      show("screen-setup");
    };
    document.getElementById("btn-how").onclick = () => { SFX.unlock(); Scenes.helpModal(); };
  }

  function buildSetup() {
    const colors = document.getElementById("setup-colors");
    colors.innerHTML = "";
    for (const c of PLAYER_COLORS) {
      const pub = PUBLISHERS[c];
      const d = el("div", "pub-card" + (c === setup.color ? " active" : ""));
      d.style.setProperty("--pc", pub.color);
      const head = el("div", "pub-head");
      head.appendChild(spr("bossbig_" + c, 1.15));
      d.appendChild(head);
      const body = el("div", "pub-body");
      const logoRow = el("div", "pub-logo-row");
      logoRow.appendChild(spr(pub.logo, 0.8));
      logoRow.appendChild(el("b", "", pub.name));
      body.appendChild(logoRow);
      body.appendChild(el("div", "pub-boss", pub.boss));
      body.appendChild(el("div", "pub-blurb", pub.blurb));
      d.appendChild(body);
      d.onclick = () => {
        SFX.play("click");
        setup.color = c;
        buildSetup();
      };
      colors.appendChild(d);
    }
    hookChoices("setup-rivals", (v) => (setup.rivals = +v));
    hookChoices("setup-difficulty", (v) => (setup.difficulty = v));
    hookChoices("setup-ripoffs", (v) => (setup.ripoffs = v === "on"));
    updatePreview();
    document.getElementById("btn-start").onclick = () => { SFX.play("click"); newGame(); };
    document.getElementById("btn-back-title").onclick = () => { SFX.play("click"); show("screen-title"); };
  }
  function hookChoices(id, fn) {
    const g = document.getElementById(id);
    g.querySelectorAll(".choice").forEach((b) => {
      b.onclick = () => {
        SFX.play("click");
        g.querySelectorAll(".choice").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        fn(b.dataset.v);
        updatePreview();
      };
    });
  }
  function updatePreview() {
    const rivals = PLAYER_COLORS.filter((c) => c !== setup.color).slice(0, setup.rivals);
    document.getElementById("setup-preview").innerHTML =
      "<b>YOUR RIVALS:</b> " + rivals.map((c) => {
        const pub = PUBLISHERS[c];
        return `${sprHTML("boss_" + c, 0.6)} <b>${pub.boss}</b> (${pub.name})`;
      }).join(" &nbsp;&middot;&nbsp; ");
  }

  // --------------------------------------------------------------- new game
  function newGame() {
    const rivalColors = PLAYER_COLORS.filter((c) => c !== setup.color).slice(0, setup.rivals);
    const players = [{ color: setup.color, human: true, name: PUBLISHERS[setup.color].boss }]
      .concat(rivalColors.map((c) => ({ color: c, human: false })));
    UI.engine = new Engine({
      players,
      useRipoffs: setup.ripoffs,
      difficulty: setup.difficulty,
      seed: (Math.random() * 1e9) | 0,
    });
    UI.humanId = 0;
    UI.eventCursor = 0;
    show("screen-game");
    document.getElementById("dialogue").innerHTML = "";
    say(null, `<b>Manhattan, 1938.</b> Four publishing houses race to own the golden age of comics. Round I begins!`);
    const rivalsTxt = rivalColors.map((c) => PUBLISHERS[c].boss).join(", ");
    say(null, `Your rivals: <b>${rivalsTxt}</b>. Beat them to the top of the chart in 5 rounds.`);
    flushEvents();
    renderAll();
    advance();
  }

  // ------------------------------------------------------------- game flow
  let advanceTimer = null;
  function queueAdvance(ms) {
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(advance, ms);
  }

  function advance() {
    const e = UI.engine;
    if (!e) return;
    const s = e.state;
    const delay = flushEvents();
    renderAll();

    if (s.gameOver) { Scenes.endgameModal(s.scores); return; }

    // spectator mode: the AI drives the human seat through engine calls
    if (UI.autoplay) {
      if (s.pending) AI.resolveOwnPendings(e, s.pending.playerId);
      else if (s.awaitingSpecial) AI.settle(e, s.awaitingSpecial.player);
      else if (s.salesSession) e.salesEnd(s.salesSession.player);
      else if (s.phase === "increase") {
        const pid = s.turnOrder[s.turnIdx];
        if (pid !== undefined) { AI.doStartingPicks(e, pid); AI.doIncrease(e, pid); }
        else e.advanceIncrease();
      } else if (s.phase === "actions") {
        AI.takeTurn(e, e.currentPlayerId());
      }
      queueAdvance(Math.max(120, Math.min(flushEvents(), 400)));
      return;
    }

    // decisions first
    if (s.pending) {
      if (isHuman(s.pending.playerId)) { UI.busy = false; Scenes.pendingModal(); }
      else { AI.resolveOwnPendings(e, s.pending.playerId); queueAdvance(Math.max(250, delay)); }
      return;
    }
    if (s.awaitingSpecial) {
      if (isHuman(s.awaitingSpecial.player)) { UI.busy = false; Scenes.specialModal(s.awaitingSpecial.special); }
      else { AI.settle(e, s.awaitingSpecial.player); queueAdvance(Math.max(250, delay)); }
      return;
    }
    // resume an open human sales run (e.g. after an order-choice interrupted it)
    if (s.salesSession && isHuman(s.salesSession.player)) { Scenes.salesScene(true); return; }

    if (s.phase === "increase") {
      const pid = s.turnOrder[s.turnIdx];
      if (pid === undefined) { e.advanceIncrease(); queueAdvance(80); return; }
      if (isHuman(pid)) {
        UI.busy = false;
        const p = e.player(pid);
        const key = `inc-${s.round}-${pid}`;
        if (UI.lastTurnKey !== key) { UI.lastTurnKey = key; UI.undoSnap = e.snapshot(); }
        if (p.startingPicks) Scenes.startingPicksModal();
        else if (e.increaseOptions(pid).length) Scenes.increaseModal();
        else { e.finishIncrease(pid); queueAdvance(60); }
      } else {
        AI.doStartingPicks(e, pid);
        AI.doIncrease(e, pid);
        queueAdvance(Math.max(200, delay));
      }
      return;
    }

    if (s.phase === "actions") {
      const pid = e.currentPlayerId();
      if (pid === null) return;
      if (isHuman(pid)) {
        UI.busy = false;
        setAIStatus(null);
        document.getElementById("screen-game").classList.add("your-turn");
        renderAll();
        if (e.player(pid).editorsLeft > 0 && ACTIONS.every((a) => e.nextSlot(a) < 0)) {
          e.actPass(pid);
          queueAdvance(300);
          return;
        }
        // announce the turn once (not on every re-render) + arm the undo point
        const key = `${s.round}-${pid}-${e.player(pid).editorsLeft}`;
        if (UI.lastTurnKey !== key) {
          UI.lastTurnKey = key;
          UI.undoSnap = e.snapshot();
          renderTopbar();
          // show the whole editor pool: bright = still to place, ghost = spent
          const p = e.player(pid);
          const total = p.editors + (p.extraEditorUsed ? 1 : 0);
          const pips = Array.from({ length: total }, (_, i) =>
            `<span class="bb-meeple${i < p.editorsLeft ? "" : " spent"}">${sprHTML("meeple_" + p.color, 1.5)}</span>`).join("");
          showBanner("YOUR TURN", `${pips}<br>round ${s.round} &middot; ${p.editorsLeft} of ${total} editors left`);
          SFX.play("turn");
        }
        // wait for the player to click a location
      } else {
        UI.busy = true;
        document.getElementById("screen-game").classList.remove("your-turn");
        setAIStatus(pid);
        renderAll();
        setTimeout(() => {
          AI.takeTurn(e, pid);
          UI.busy = false;
          queueAdvance(Math.max(500, flushEvents()));
        }, 550);
      }
      return;
    }
  }

  // called after every human-initiated engine mutation
  function afterHumanMove() {
    const delay = flushEvents();
    renderAll();
    queueAdvance(Math.max(120, Math.min(delay, 500)));
  }

  // ------------------------------------------------------------- UI scale
  // The interface is designed for ~1600x900; on bigger displays everything
  // was rendering microscopically. Scale the whole app up in 0.25 steps so
  // the pixel look stays crisp and text is readable at 4K.
  function fitUI() {
    const app = document.getElementById("app");
    const z = Math.max(1, Math.round(Math.min(innerWidth / 1600, innerHeight / 900) * 4) / 4);
    app.style.zoom = z;
    app.style.width = Math.ceil(innerWidth / z) + "px";
    app.style.height = Math.ceil(innerHeight / z) + "px";
    // CSS zoom does NOT rescale vw/vh units — anything sized in viewport
    // units must divide by --z (e.g. modal max-height) or it overflows.
    document.documentElement.style.setProperty("--z", z);
  }

  // ------------------------------------------------------------------ undo
  // Rewind to the snapshot taken at the start of your current decision
  // (includes any AI moves shown since — they replay from the same rng).
  function doUndo() {
    if (!UI.undoSnap || UI.autoplay) return;
    clearTimeout(advanceTimer);
    UI.engine.restore(UI.undoSnap);
    UI.undoSnap = null;
    UI.eventCursor = UI.engine.events.length;
    UI.lastTurnKey = null;
    UI.busy = false;
    closeModal();
    setAIStatus(null);
    SFX.play("paper");
    toast("&#8630; Rewound to the start of your turn");
    renderAll();
    advance();
  }

  // ------------------------------------------------------------------ boot
  function boot() {
    fitUI();
    addEventListener("resize", fitUI);
    // visible error trap (also helps bug reports)
    window.onerror = (msg, src, line) => {
      const d = el("div", "", `JS ERROR: ${msg} @ ${String(src).split("/").pop()}:${line}`);
      d.style.cssText = "position:fixed;bottom:0;left:0;right:0;background:#a00;color:#fff;font:16px monospace;padding:4px;z-index:999";
      d.id = "err-banner";
      document.body.appendChild(d);
    };
    initTitle();
    // ?autoplay: AI plays the human seat too (UI smoke test / spectator mode)
    if (location.search.includes("autoplay")) {
      UI.autoplay = true;
      setTimeout(newGame, 400);
    }
    if (location.search.includes("setup")) { buildSetup(); show("screen-setup"); }
    // ?scene=hire|develop|ideas|print|sales|increase — debug: jump into a scene
    const dbg = /scene=(\w+)/.exec(location.search);
    if (dbg) {
      setTimeout(() => {
        newGame();
        if (dbg[1] === "founding") return; // the founding modal opens on its own
        const e = UI.engine, s = e.state;
        let guard = 0;
        while (s.phase !== "actions" && guard++ < 50) {
          if (s.pending) { AI.resolveOwnPendings(e, s.pending.playerId); continue; }
          const pid = s.turnOrder[s.turnIdx];
          if (pid === undefined) { e.advanceIncrease(); continue; }
          AI.doStartingPicks(e, pid);
          AI.doIncrease(e, pid);
        }
        s.turnIdx = s.turnOrder.indexOf(UI.humanId);
        clearTimeout(advanceTimer);
        UI.eventCursor = e.events.length;
        closeModal();
        renderAll();
        if (dbg[1] === "increase") Scenes.increaseModal();
        else Scenes.open(dbg[1]);
      }, 500);
    }
    document.getElementById("btn-undo").onclick = () => { SFX.play("click"); doUndo(); };
    document.getElementById("btn-help").onclick = () => { SFX.play("click"); Scenes.helpModal(); };
    document.getElementById("btn-chart").onclick = () => { SFX.play("click"); Scenes.viewMap(); };
    document.getElementById("btn-sound").onclick = (ev) => {
      const on = SFX.toggle();
      ev.target.style.opacity = on ? 1 : 0.4;
    };
    // AI taunts once in a while
    setInterval(() => {
      const e = UI.engine;
      if (!e || e.state.gameOver || Math.random() > 0.18) return;
      const rivals = e.state.players.filter((p) => !p.human);
      if (rivals.length) {
        const r = rivals[(Math.random() * rivals.length) | 0];
        say(r.id, pick(QUIPS.taunt));
      }
    }, 22000);
  }

  document.addEventListener("DOMContentLoaded", boot);
  return { advance, afterHumanMove, queueAdvance };
})();
