// ============================================================================
// THE FIRST DAY — deterministic solo tutorial controller
// ============================================================================
"use strict";

const Tutor = (() => {
  const SCENARIO = Object.freeze({
    version: 3,
    seed: 5,
    color: "teal",
    genre: "crime",
    comic: "orig_38",
    writer: "writer_crime_2B",
    artist: "artist_romance_2",
    orderId: 17,
    salesNode: 10,
  });
  const MEMOS = {
    masthead: ["WELCOME TO LIBERTY INK", "Morning, boss. Word is you bought this outfit — desks, presses, debts and all. I'm your city editor. Stick with me for one day and you'll run this place like you were born in the ink."],
    tour_rail: ["YOUR OFFICE", "The left wall is YOURS: staff, cash, idea tokens, trophies. When this wall fills up, you're winning."],
    tour_board: ["THE CITY", "The middle is Manhattan — six places your editors can work a shift. Four editors, one shift each, every round."],
    tour_chart: ["THE MARKET", "The right is the comic-book chart. Fans decide the ranks, ranks pay victory points. That column is why we're all here."],
    wire: ["THE RIVALS MOVE", "Now the other houses take their shifts — the wire up top keeps the gossip. You don't wait politely in this town; you read the ticker."],
    mastery_note: ["MASTERY CLAIMED", "First original in a genre claims its mastery token: +1 fan on every book you print in that genre, and 2 points at the final bell. Another house can steal it by out-printing you."],
    founding: ["YOUR STARTING TEAM", "Your writer and artist specialize in different genres. Each teammate who matches a book adds one launch fan. Choose the highlighted Crime project and two Crime ideas."],
    proof_confirm: ["THE PROOF SLIP", "Every decision pauses on this slip before the world moves. UNDO takes it back — any turn, all game long. The stamp makes it real. Stamp your founding and the rival houses will answer."],
    ideas: ["FIRST SHIFT — CAFE BIZARRE", "Send your first editor for ideas. Take the highlighted Crime ideas from the counter; table ideas are a limited bonus."],
    print: ["SECOND SHIFT — PRINT FLOOR", "Build the highlighted package: comic, writer, artist, team fee, and two matching ideas. The first press can run two books, but today you own one complete team."],
    accounting: ["THIRD SHIFT — ACCOUNTING", "Printing costs cash. Earlier Accounting desks pay more, so take the highlighted desk now."],
    sales: ["LAST SHIFT — MANHATTAN", "Your last editor works the street itself: walk the corners, flip newsstand orders face-up, collect what your chart can fill. Follow the gold marker on the map."],
    round_close: ["CLOSE OF BUSINESS", "Your best book sets the round rank. Each book's fan count sets its royalty bracket, then charted books cool by one fan without dropping below one."],
    free: ["THE FLOOR IS YOURS", "Your printed team stays on its book. Hire another writer and artist, then Develop a new project to build the next complete print package."],
  };
  let active = false;
  let state = freshState();
  let currentMemo = "";

  function freshState() {
    return {
      scenarioVersion: SCENARIO.version,
      beat: "masthead",
      foundingStep: "vault",
      salesStep: "start",
      botSteps: { 1: 0, 2: 0 },
      completedCore: false,
      skipped: false,
    };
  }
  function begin() {
    active = true;
    state = freshState();
    document.documentElement.classList.add("tutorial-active");
    sync();
  }
  function restore(saved) {
    if (!saved || saved.scenarioVersion !== SCENARIO.version || saved.skipped) return false;
    active = true;
    state = Object.assign(freshState(), saved, { botSteps: Object.assign({ 1: 0, 2: 0 }, saved.botSteps || {}) });
    document.documentElement.classList.add("tutorial-active");
    sync();
    return true;
  }
  function exportState() { return active || state.skipped ? structuredClone(state) : null; }
  function persistFlag() {
    try { localStorage.setItem("aoc-tutorial-status", state.completedCore ? "complete" : state.skipped ? "skipped" : "started"); } catch (_e) {}
  }
  function skip() {
    if (!confirm("Skip the guided tour and continue this game with normal controls?")) return;
    state.skipped = true;
    active = false;
    persistFlag();
    document.documentElement.classList.remove("tutorial-active");
    hide();
    announce("Tutorial skipped. Normal play continues.");
    renderAll();
  }

  const NEXT_FLOW = {
    masthead: "founding", tour_rail: "tour_board", tour_board: "tour_chart",
    tour_chart: "ideas", wire: "print", mastery_note: "accounting",
  };
  // BACK re-reads the previous lesson; NEXT (or the beat's own trigger)
  // returns. Only beats whose predecessor is safe to re-enter are listed.
  const PREV_FLOW = {
    founding: "masthead", tour_board: "tour_rail", tour_chart: "tour_board",
    ideas: "tour_chart", print: "wire", accounting: "mastery_note",
  };
  const INTERSTITIAL = { masthead: 1, tour_rail: 1, tour_board: 1, tour_chart: 1, wire: 1, mastery_note: 1 };
  function next() {
    const to = NEXT_FLOW[state.beat];
    if (!to) return;
    state.beat = to;
    sync();
  }
  function back() {
    const to = PREV_FLOW[state.beat];
    if (!to) return;
    state.beat = to;
    sync();
  }
  function onHumanTurn() {
    if (active && state.beat === "wire") next();
  }
  const SALES_STEP_HINTS = {
    start: "Place the editor on the Sales stand.",
    move: "Take your free step to the corner circled in gold.",
    flip: "Click the newsstand circled in gold to flip its order face-up.",
    collect: "Click it again to collect — it fills straight from your chart.",
    end: "Press END SALES RUN to file the day.",
    review: "Stamp the proof.",
  };
  function targetForBeat() {
    if (state.beat === "masthead") return null;
    if (state.beat === "tour_rail") return "#desk-status";
    if (state.beat === "tour_board") return "#locations";
    if (state.beat === "tour_chart") return "#sidebar";
    if (state.beat === "wire") return "#wire-strip";
    if (state.beat === "mastery_note") return "#desk-awards";
    if (state.beat === "founding")
      return state.foundingStep === "vault" ? '#modal-root [data-tut="vault"]'
        : state.foundingStep === "tokens" ? '#modal-root [data-tut="tokens"]'
        : "#modal-root #sp-ok";
    if (state.beat === "proof_confirm") return "#review-bar";
    if (state.beat === "ideas") return '#locations [data-action="ideas"]';
    if (state.beat === "print") return '#locations [data-action="print"]';
    if (state.beat === "accounting") return '#locations [data-action="royalties"]';
    if (state.beat === "sales") {
      // on the street the gold canvas marker does the pointing; the DOM ring
      // only frames the decisions that live outside the map
      if (state.salesStep === "start")
        return document.querySelector("#modal-root.active .btn-go") ? "#modal-root.active .btn-go" : '#locations [data-action="sales"]';
      if (state.salesStep === "end") return "#btn-end-run";
      if (state.salesStep === "review") return "#review-bar";
      return null;
    }
    if (state.beat === "round_close") return "#sidebar";
    return "#locations";
  }
  function sync() {
    if (!active) return hide();
    if (UI.engine && state.beat === "round_close" && UI.engine.state.round >= 2) {
      state.beat = "free";
      state.completedCore = true;
      persistFlag();
    }
    const memo = MEMOS[state.beat] || MEMOS.free;
    let text = memo[1];
    if (state.beat === "sales" && SALES_STEP_HINTS[state.salesStep])
      text += " NOW: " + SALES_STEP_HINTS[state.salesStep];
    show(memo[0], text, targetForBeat());
    applyGlow();
    syncMapTarget();
  }
  // the sales lesson points at real street furniture: a gold marching ring
  // drawn by the map itself on the corner to walk to / the stand to work
  function syncMapTarget() {
    if (typeof MapView === "undefined" || !MapView.setTutorTarget) return;
    let t = null;
    if (active && state.beat === "sales") {
      if (state.salesStep === "move") t = { node: SCENARIO.salesNode };
      else if (state.salesStep === "flip" || state.salesStep === "collect") t = { slotId: SCENARIO.orderId };
    }
    MapView.setTutorTarget(t);
  }
  function show(title, text, selector) {
    const layer = document.getElementById("tutor-layer");
    const card = document.getElementById("tutor-card");
    if (!layer || !card) return;
    layer.hidden = false;
    card.querySelector("h3").textContent = title;
    card.querySelector("p").textContent = text;
    card.querySelector(".tutor-skip").onclick = skip;
    const key = title + "\n" + text;
    if (key !== currentMemo) { currentMemo = key; announce(`${title}. ${text}`); }
    const nextBtn = card.querySelector(".tutor-next");
    if (nextBtn) { nextBtn.hidden = !NEXT_FLOW[state.beat]; nextBtn.onclick = next; }
    const backBtn = card.querySelector(".tutor-back");
    if (backBtn) { backBtn.hidden = !PREV_FLOW[state.beat]; backBtn.onclick = back; }
    reanchor(selector);
  }
  // the current lesson's physical subjects glow gold (vault card, idea
  // tokens, cafe counter coins) — reapplied whenever the modal rebuilds
  function applyGlow() {
    document.querySelectorAll(".tutor-glow").forEach((n) => n.classList.remove("tutor-glow"));
    if (!active) return;
    const want = [];
    if (state.beat === "founding") want.push('#modal-root [data-tut-genre="' + SCENARIO.genre + '"]');
    if (state.beat === "ideas") want.push('#modal-root .counter-row [data-tut-genre="' + SCENARIO.genre + '"]');
    for (const sel of want) document.querySelectorAll(sel).forEach((n) => n.classList.add("tutor-glow"));
  }
  function reanchor(selector = targetForBeat()) {
    if (!active) return;
    const ring = document.getElementById("tutor-ring"), card = document.getElementById("tutor-card");
    if (!ring || !card) return;
    // #tutor-layer lives inside the zoomed #app: every real-pixel rect must
    // be divided by the fitUI zoom or highlights scatter on laptop widths
    // (the documented clientX/zoom trap).
    const z = parseFloat(document.getElementById("app")?.style.zoom) || 1;
    const vw = innerWidth / z, vh = innerHeight / z;
    const width = Math.min(360, vw - 24);
    card.style.width = width + "px";
    const target = selector ? document.querySelector(selector) : null;
    const modal = document.querySelector("#modal-root.active .modal");
    const ch = card.offsetHeight || 210; // real height — a guess overlaps buttons
    if (!target || (modal && !modal.contains(target) && !target.contains(modal))) {
      // no subject, or the subject is buried behind an open dialog: no ring —
      // dock the memo (centered for the masthead, lower-left otherwise)
      ring.hidden = true;
      if (state.beat === "masthead") {
        card.style.left = Math.max(12, vw / 2 - width / 2) + "px";
        card.style.top = Math.round(vh * 0.3) + "px";
      } else {
        card.style.left = "16px";
        card.style.top = Math.max(12, vh - ch - 20) + "px";
      }
      return;
    }
    ring.hidden = false;
    const b = target.getBoundingClientRect(), pad = 7;
    const r = { left: b.left / z, top: b.top / z, width: b.width / z, height: b.height / z, bottom: b.bottom / z, right: b.right / z };
    ring.style.left = Math.max(4, r.left - pad) + "px";
    ring.style.top = Math.max(4, r.top - pad) + "px";
    ring.style.width = Math.max(24, r.width + pad * 2) + "px";
    ring.style.height = Math.max(24, r.height + pad * 2) + "px";
    // the memo must never sit on the control it points at: below, above,
    // beside, and only then a corner dock away from the target
    let left = Math.max(12, Math.min(vw - width - 12, r.left + r.width / 2 - width / 2));
    let top;
    if (r.bottom + 14 + ch <= vh - 12) top = r.bottom + 14;
    else if (r.top - ch - 14 >= 12) top = r.top - ch - 14;
    else {
      top = Math.max(12, Math.min(vh - ch - 12, r.top + r.height / 2 - ch / 2));
      if (r.right + 14 + width <= vw - 12) left = r.right + 14;
      else if (r.left - width - 14 >= 12) left = r.left - width - 14;
      else { left = 16; top = r.top > vh / 2 ? 12 : Math.max(12, vh - ch - 20); }
    }
    card.style.left = left + "px";
    card.style.top = top + "px";
  }
  function hide() {
    const layer = document.getElementById("tutor-layer"), ring = document.getElementById("tutor-ring");
    const card = document.getElementById("tutor-card");
    if (card && layer && card.parentElement !== layer) layer.appendChild(card);
    if (layer) layer.hidden = true;
    if (ring) ring.hidden = true;
    if (typeof MapView !== "undefined" && MapView.setTutorTarget) MapView.setTutorTarget(null);
  }
  function detachFromModal() {
    const layer = document.getElementById("tutor-layer"), card = document.getElementById("tutor-card");
    if (layer && card && card.parentElement !== layer) layer.appendChild(card);
  }

  function allowedAction(action) {
    if (!active || state.beat === "free" || state.beat === "round_close") return true;
    if (INTERSTITIAL[state.beat]) return false;
    return (state.beat === "ideas" && action === "ideas") ||
      (state.beat === "print" && action === "print") ||
      (state.beat === "accounting" && action === "royalties") ||
      (state.beat === "sales" && action === "sales");
  }
  function allowCommand(kind, payload) {
    if (!active || state.beat === "free" || state.beat === "round_close") return true;
    if (INTERSTITIAL[state.beat]) return false;
    if (kind === "starting_picks") return state.beat === "founding" && payload.comic === SCENARIO.comic &&
      Array.isArray(payload.ideas) && payload.ideas.length === 2 && payload.ideas.every((g) => g === SCENARIO.genre);
    if (state.beat === "ideas") return kind === "action_ideas" && payload.supply && payload.supply.length === 2 && payload.supply.every((g) => g === SCENARIO.genre);
    if (state.beat === "print") {
      if (kind === "pending_resolve") return UI.engine.state.pending && UI.engine.state.pending.playerId === UI.humanId;
      return kind === "action_print" && payload.books && payload.books.length === 1 && payload.books[0].comic === SCENARIO.comic;
    }
    if (state.beat === "accounting") return kind === "action_royalties";
    if (state.beat === "sales") {
      if (state.salesStep === "start") return kind === "sales_start";
      if (state.salesStep === "move") return kind === "sales_move" && payload.node === SCENARIO.salesNode && !payload.ticket;
      if (state.salesStep === "flip") return kind === "sales_flip" && payload.slotId === SCENARIO.orderId;
      if (state.salesStep === "collect") return kind === "sales_collect" && payload.slotId === SCENARIO.orderId;
      if (state.salesStep === "end") return kind === "sales_end";
    }
    return false;
  }
  function afterCommand(kind) {
    if (state.beat === "sales") {
      if (kind === "sales_start") state.salesStep = "move";
      else if (kind === "sales_move") state.salesStep = "flip";
      else if (kind === "sales_flip") state.salesStep = "collect";
      else if (kind === "sales_collect") state.salesStep = "end";
      else if (kind === "sales_end") state.salesStep = "review";
    }
    queueMicrotask(sync);
  }
  function pingFounding(hasComic, nIdeas) {
    if (!active || state.beat !== "founding") return;
    const step = !hasComic ? "vault" : nIdeas < 2 ? "tokens" : "confirm";
    if (step !== state.foundingStep) { state.foundingStep = step; sync(); }
  }
  function onReviewShown() {
    if (!active) return;
    if (state.beat === "founding") state.beat = "proof_confirm";
    sync();
  }
  function onUndo() {
    if (!active) return;
    // undo is voluntary now: rewinding the founding proof reopens the vault,
    // rewinding mid-sales restarts the run script from its first step
    if (state.beat === "proof_confirm") state.beat = "founding";
    if (state.beat === "sales") state.salesStep = "start";
    sync();
  }
  function onReviewConfirmed(action) {
    if (!active) return;
    if (state.beat === "proof_confirm") state.beat = "tour_rail";
    else if (action === "ideas") state.beat = "wire";
    else if (action === "print") state.beat = "mastery_note";
    else if (action === "royalties") state.beat = "sales";
    else if (action === "sales") state.beat = "round_close";
    sync();
  }

  function takeBotTurn(engine, pid) {
    if (!active || engine.state.round !== 1 || engine.state.phase !== "actions") return AI.takeTurn(engine, pid);
    const scripts = { 1: ["hire", "develop", "royalties"], 2: ["develop", "hire", "royalties"] };
    const step = state.botSteps[pid] || 0, action = scripts[pid] && scripts[pid][step];
    state.botSteps[pid] = step + 1;
    if (action === "hire") engine.actHire(pid, { writer: "deck", artist: "deck" });
    else if (action === "develop") engine.actDevelop(pid, { comic: "deck" });
    else if (action === "royalties") engine.actRoyalties(pid);
    else AI.takeTurn(engine, pid);
  }

  addEventListener("resize", () => reanchor());
  addEventListener("scroll", () => { if (active) reanchor(); }, true);
  new MutationObserver(() => {
    if (!active) return;
    applyGlow();
    reanchor();
  }).observe(document.getElementById("modal-root") || document.body, { childList: true, subtree: true });
  return {
    SCENARIO,
    get active() { return active; },
    get state() { return state; },
    begin, restore, exportState, skip, sync, hide, reanchor, detachFromModal,
    next, back, onHumanTurn, pingFounding,
    allowedAction, allowCommand, afterCommand,
    onReviewShown, onUndo, onReviewConfirmed, takeBotTurn,
  };
})();
// a top-level const never lands on globalThis: session.js reaches the Tutor
// through root.Tutor, so the gate/afterCommand hooks need this explicitly
globalThis.Tutor = Tutor;
