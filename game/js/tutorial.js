// ============================================================================
// THE FIRST DAY — deterministic solo tutorial controller
// ============================================================================
"use strict";

const Tutor = (() => {
  const SCENARIO = Object.freeze({
    version: 2,
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
    founding: ["YOUR STARTING TEAM", "Your writer and artist specialize in different genres. Each teammate who matches a book adds one launch fan. Choose the highlighted Crime project and two Crime ideas."],
    proof_undo: ["MEET THE PROOF SLIP", "Every action pauses here before the world moves. Use UNDO once; then repeat the highlighted founding picks and confirm them for real."],
    proof_confirm: ["STAMP IT FOR REAL", "The same choices are waiting for you. Confirm this proof and the rival houses will take their turns."],
    ideas: ["FIRST SHIFT — CAFE BIZARRE", "Send your first editor for ideas. Take the highlighted Crime ideas from the counter; table ideas are a limited bonus."],
    print: ["SECOND SHIFT — PRINT FLOOR", "Build the highlighted package: comic, writer, artist, team fee, and two matching ideas. The first press can run two books, but today you own one complete team."],
    accounting: ["THIRD SHIFT — ACCOUNTING", "Printing costs cash. Earlier Accounting desks pay more, so take the highlighted desk now."],
    sales: ["LAST SHIFT — MANHATTAN", "Start the Sales run. Take the highlighted free step, flip stand 18, collect it, watch it fulfill, then end the run."],
    round_close: ["CLOSE OF BUSINESS", "Your best book sets the round rank. Each book's fan count sets its royalty bracket, then charted books cool by one fan without dropping below one."],
    free: ["THE FLOOR IS YOURS", "Your printed team stays on its book. Hire another writer and artist, then Develop a new project to build the next complete print package."],
  };
  let active = false;
  let state = freshState();
  let currentMemo = "";

  function freshState() {
    return {
      scenarioVersion: SCENARIO.version,
      beat: "founding",
      proofUndoDone: false,
      foundingSubmissions: 0,
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

  function targetForBeat() {
    if (state.beat === "founding") return "#modal-root .panel-section, #modal-root .card-row";
    if (state.beat === "proof_undo" || state.beat === "proof_confirm") return "#review-bar";
    if (state.beat === "ideas") return '#locations [data-action="ideas"]';
    if (state.beat === "print") return '#locations [data-action="print"]';
    if (state.beat === "accounting") return '#locations [data-action="royalties"]';
    if (state.beat === "sales") return state.salesStep === "start" ? '#locations [data-action="sales"]' : ".sales-map-pane, #map-canvas";
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
    show(memo[0], memo[1], targetForBeat());
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
    const modal = document.querySelector("#modal-root.active .modal");
    if (modal && card.parentElement !== modal) modal.appendChild(card);
    else if (!modal && card.parentElement !== layer) layer.appendChild(card);
    reanchor(selector);
  }
  function reanchor(selector = targetForBeat()) {
    if (!active) return;
    const ring = document.getElementById("tutor-ring"), card = document.getElementById("tutor-card");
    const target = document.querySelector(selector);
    if (!ring || !card || !target) {
      if (ring) ring.hidden = true;
      card.style.left = "max(16px, calc(50vw - 180px))";
      card.style.top = "16px";
      return;
    }
    ring.hidden = false;
    const r = target.getBoundingClientRect(), pad = 7;
    ring.style.left = Math.max(4, r.left - pad) + "px";
    ring.style.top = Math.max(4, r.top - pad) + "px";
    ring.style.width = Math.max(24, r.width + pad * 2) + "px";
    ring.style.height = Math.max(24, r.height + pad * 2) + "px";
    const width = Math.min(360, innerWidth - 24);
    const left = Math.max(12, Math.min(innerWidth - width - 12, r.left + r.width / 2 - width / 2));
    const below = r.bottom + 14;
    const top = below + 170 < innerHeight ? below : Math.max(12, r.top - 174);
    card.style.width = width + "px";
    card.style.left = left + "px";
    card.style.top = top + "px";
  }
  function hide() {
    const layer = document.getElementById("tutor-layer"), ring = document.getElementById("tutor-ring");
    const card = document.getElementById("tutor-card");
    if (card && layer && card.parentElement !== layer) layer.appendChild(card);
    if (layer) layer.hidden = true;
    if (ring) ring.hidden = true;
  }
  function detachFromModal() {
    const layer = document.getElementById("tutor-layer"), card = document.getElementById("tutor-card");
    if (layer && card && card.parentElement !== layer) layer.appendChild(card);
  }

  function allowedAction(action) {
    if (!active || state.beat === "free" || state.beat === "round_close") return true;
    return (state.beat === "ideas" && action === "ideas") ||
      (state.beat === "print" && action === "print") ||
      (state.beat === "accounting" && action === "royalties") ||
      (state.beat === "sales" && action === "sales");
  }
  function allowCommand(kind, payload) {
    if (!active || state.beat === "free" || state.beat === "round_close") return true;
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
    if (kind === "starting_picks") state.foundingSubmissions++;
    if (state.beat === "sales") {
      if (kind === "sales_start") state.salesStep = "move";
      else if (kind === "sales_move") state.salesStep = "flip";
      else if (kind === "sales_flip") state.salesStep = "collect";
      else if (kind === "sales_collect") state.salesStep = "end";
      else if (kind === "sales_end") state.salesStep = "review";
    }
    queueMicrotask(sync);
  }
  function onReviewShown() {
    if (!active) return;
    if (state.beat === "founding") state.beat = state.proofUndoDone ? "proof_confirm" : "proof_undo";
    sync();
  }
  function canConfirmReview() { return !active || state.beat !== "proof_undo"; }
  function onUndo() {
    if (!active) return;
    if (state.beat === "proof_undo") {
      state.proofUndoDone = true;
      state.beat = "founding";
      sync();
    }
  }
  function onReviewConfirmed(action) {
    if (!active) return;
    if (state.beat === "proof_confirm") state.beat = "ideas";
    else if (action === "ideas") state.beat = "print";
    else if (action === "print") state.beat = "accounting";
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
  return {
    SCENARIO,
    get active() { return active; },
    get state() { return state; },
    begin, restore, exportState, skip, sync, hide, reanchor, detachFromModal,
    allowedAction, allowCommand, afterCommand,
    onReviewShown, canConfirmReview, onUndo, onReviewConfirmed, takeBotTurn,
  };
})();
