// ============================================================================
// Browser smoke test: drives the real game in a headless Edge/Chrome via
// puppeteer-core (no browser download — uses the machine's installed one).
// Focus: the save/resume lifecycle, which unit tests can't reach.
// Run: node game/test/browser.js   (or npm run test:browser)
// ============================================================================
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer-core");

const PORT = 8489;
const URL = `http://localhost:${PORT}/`;

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error("no Chrome/Edge found; set CHROME_PATH");
}

let passed = 0, failed = 0;
function check(cond, name) {
  if (cond) { passed++; console.log("  ok  " + name); }
  else { failed++; console.error("FAIL  " + name); }
}

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, "..", "tools", "serve.js"), String(PORT)], { stdio: "ignore" });
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    const jsErrors = [];
    page.on("pageerror", (err) => jsErrors.push(String(err)));

    const visible = (sel) =>
      page.evaluate((s) => { const b = document.querySelector(s); return !!b && !b.hidden; }, sel);
    const activeScreen = () => page.evaluate(() => document.querySelector(".screen.active").id);
    const saveData = () =>
      page.evaluate(() => { try { return JSON.parse(localStorage.getItem("aoc_save")); } catch (e) { return null; } });

    // -------------------------------------------------- 1. clean first load
    await page.goto(URL, { waitUntil: "networkidle0" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle0" });
    check((await activeScreen()) === "screen-title", "title screen loads");
    check(!(await visible("#btn-continue")), "no save: continue hidden");

    // ------------------------------------- 2. start a game, reach a decision
    await page.$eval("#btn-new-game", (b) => b.click());
    check((await activeScreen()) === "screen-setup", "setup screen opens");
    await page.$eval("#btn-start", (b) => b.click());
    // note: top-level `const UI` is a lexical global — visible as a bare
    // identifier in evaluate(), but never as a window.UI property
    await page.waitForFunction(() => typeof UI !== "undefined" && !!UI.engine);
    // resolve round-1 picks/increase headlessly so the game reaches the
    // action phase (an ordinary mid-game point), then let the loop autosave
    await page.evaluate(() => {
      const e = UI.engine;
      let g = 0;
      while (g++ < 200 && e.state.phase !== "actions") {
        const s = e.state;
        if (s.pending) AI.resolveOwnPendings(e, s.pending.playerId);
        else if (s.awaitingSpecial) AI.settle(e, s.awaitingSpecial.player);
        else {
          const pid = s.turnOrder[s.turnIdx];
          if (pid === undefined) { e.advanceIncrease(); continue; }
          AI.doStartingPicks(e, pid);
          AI.doIncrease(e, pid);
          e.advanceIncrease();
        }
      }
      closeModal();
      Main.advance();
    });
    await page.waitForFunction(() => !!localStorage.getItem("aoc_save"));
    let d = await saveData();
    check(d && d.v === 1 && d.state.round === 1, "autosave written with v1, round 1");

    // ---------------------------------------- 3. reload + continue mid-game
    await page.reload({ waitUntil: "networkidle0" });
    check(await visible("#btn-continue"), "continue button appears");
    const label = await page.$eval("#btn-continue", (b) => b.textContent);
    check(/ROUND 1/.test(label), "continue label shows the round");
    check(label.includes((d.state.players[d.humanId].pubName || "").toUpperCase()), "continue label shows the publisher");
    await page.$eval("#btn-continue", (b) => b.click());
    await page.waitForFunction(() => document.querySelector(".screen.active").id === "screen-game");
    const resumed = await page.evaluate(() => ({ round: UI.engine.state.round, human: UI.humanId }));
    check(resumed.round === 1 && resumed.human === 0, "resume restores the game");
    check(await page.evaluate(() => {
      const tiles = [...document.querySelectorAll("#calendar .cal-tile")];
      return tiles.length === 5 && !!tiles[0].querySelector(".cal-genre .spr") &&
        tiles.slice(1).every((tile) => tile.querySelector(".future-round")) &&
        !document.querySelector("#calendar .genre-dot");
    }), "calendar uses genre artwork for revealed rounds and keeps future genres hidden");

    // --------------------------------------- 4. reload during a sales run
    await page.evaluate(() => {
      const e = UI.engine;
      let g = 0; // fast-forward AI turns until the human may act
      while (g++ < 60 && e.currentPlayerId() !== UI.humanId) {
        const s = e.state;
        if (s.pending) AI.resolveOwnPendings(e, s.pending.playerId);
        else if (s.awaitingSpecial) AI.settle(e, s.awaitingSpecial.player);
        else AI.takeTurn(e, e.currentPlayerId());
      }
      e.actSalesStart(UI.humanId);
      Main.advance(); // autosaves with the open sales session
    });
    d = await saveData();
    check(d && d.state.salesSession && d.state.salesSession.player === 0, "sales run captured in the save");
    await page.reload({ waitUntil: "networkidle0" });
    await page.$eval("#btn-continue", (b) => b.click());
    await page.waitForFunction(() => !!document.querySelector("#map-canvas"));
    check(true, "resume re-opens the sales run");
    await page.evaluate(() => { UI.engine.salesEnd(UI.humanId); closeModal(); Main.advance(); });

    // -------------------------------- 5. new-game overwrite: cancel, confirm
    await page.reload({ waitUntil: "networkidle0" });
    await page.$eval("#btn-new-game", (b) => b.click());
    await page.$eval("#btn-start", (b) => b.click());
    await page.waitForFunction(() => document.querySelector("#modal-root .modal"));
    const modalText = await page.$eval("#modal-root", (m) => m.textContent);
    check(/OVERWRITE/.test(modalText), "overwrite confirmation shown");
    const before = (await saveData()).savedAt;
    await page.evaluate(() => {
      [...document.querySelectorAll("#modal-root button")].find((b) => /KEEP/.test(b.textContent)).click();
    });
    check((await saveData()).savedAt === before, "cancel keeps the save");
    check((await activeScreen()) === "screen-setup", "cancel stays on setup");
    await page.$eval("#btn-start", (b) => b.click());
    await page.waitForFunction(() => document.querySelector("#modal-root .modal"));
    await page.evaluate(() => {
      [...document.querySelectorAll("#modal-root button")].find((b) => /START NEW/.test(b.textContent)).click();
    });
    await page.waitForFunction(() => document.querySelector(".screen.active").id === "screen-game");
    check(true, "confirm starts the new game");

    // ------------------------------------- 6. finished game clears the save
    await page.evaluate(() => { UI.engine.finishGame(); closeModal(); Main.advance(); });
    await page.waitForFunction(() => !localStorage.getItem("aoc_save"));
    check(true, "game over clears the save");

    // ------------------------------------------ 7. bad saves fail safely
    for (const [bad, name] of [
      ['{"v":99,"cfg":{},"state":{}}', "unknown version"],
      ["{corrupt json", "corrupt payload"],
    ]) {
      await page.evaluate((b) => localStorage.setItem("aoc_save", b), bad);
      await page.reload({ waitUntil: "networkidle0" });
      check(!(await visible("#btn-continue")), `${name} treated as no save`);
    }

    // ----------------- 8. print -> mastery -> decision presentation order
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle0" });
    await page.$eval("#btn-new-game", (b) => b.click());
    // undo is CUB REPORTER-only now: play these flows at easy difficulty
    await page.$eval('#setup-difficulty [data-v="easy"]', (b) => b.click());
    await page.$eval("#btn-start", (b) => b.click());
    await page.waitForFunction(() => typeof UI !== "undefined" && !!UI.engine);
    await page.evaluate(() => {
      const e = UI.engine;
      let g = 0;
      while (g++ < 200 && e.state.phase !== "actions") {
        const s = e.state;
        if (s.pending) AI.resolveOwnPendings(e, s.pending.playerId);
        else if (s.awaitingSpecial) AI.settle(e, s.awaitingSpecial.player);
        else {
          const pid = s.turnOrder[s.turnIdx];
          if (pid === undefined) { e.advanceIncrease(); continue; }
          AI.doStartingPicks(e, pid);
          AI.doIncrease(e, pid);
          e.advanceIncrease();
        }
      }
      closeModal();
      Main.advance();
    });
    await page.waitForFunction(() => UI.engine.currentPlayerId() === UI.humanId && !UI.busy, { timeout: 20000 });
    // drain the hero lane first: leftover AI print/mastery celebrations from
    // the turns just played would pollute the observation
    await page.waitForFunction(() => heroRemaining() === 0 && !document.querySelector(".fx-celebrate"),
      { timeout: 20000 });
    // observe hero surfaces + dialogs while a mastery-winning print plays out
    // (patterns are human-specific: "HOT OFF THE PRESS" / "You rule the genre")
    await page.evaluate(() => {
      window.__obs = { print: 0, mastery: 0, overlap: false, modalOverHero: false, modalAt: 0, t0: performance.now() };
      window.__obsIv = setInterval(() => {
        const o = window.__obs, t = performance.now() - o.t0;
        const cels = [...document.querySelectorAll(".fx-celebrate")];
        if (cels.length > 1) o.overlap = true;
        for (const c of cels) {
          if (/HOT OFF THE PRESS/.test(c.textContent) && !o.print) o.print = t;
          if (/You rule the genre/.test(c.textContent) && !o.mastery) o.mastery = t;
        }
        const modal = document.getElementById("modal-root").classList.contains("active");
        if (modal && !o.modalAt) o.modalAt = t;
        if (modal && cels.length) o.modalOverHero = true;
      }, 60);
    });
    await page.evaluate(() => {
      const e = UI.engine, s = e.state, pid = UI.humanId, p = e.player(pid);
      const give = (...ids) => {
        for (const id of ids) {
          for (const k of ["writers", "artists", "comics"])
            for (const arr of [s.decks[k], s.discards[k], s.display[k]]) {
              const i = arr.indexOf(id);
              if (i >= 0) arr.splice(i, 1);
            }
          p.hand.push(id);
        }
      };
      // the print must WIN mastery: pick a genre no one has printed yet
      // (random seeds can otherwise hand the genre to a rival first)
      const cd = COMICS.find((c) => s.mastery[c.genre] === undefined &&
        !s.chart.some((k) => k.genre === c.genre)) ||
        COMICS.find((c) => s.mastery[c.genre] === undefined) || CARD_BY_ID["orig_25"];
      const wid = s.decks.writers.concat(s.display.writers).find((id) => CARD_BY_ID[id].genre !== cd.genre);
      const aid = s.decks.artists.concat(s.display.artists).find((id) => CARD_BY_ID[id].genre !== cd.genre);
      give(cd.id, wid, aid);
      p.money = 12;
      p.ideas[cd.genre] = 2;
      p.printedCount = 1; // this print is the 2nd -> a cube decision follows
      e.actPrint(pid, { books: [{ type: "original", comic: cd.id, writer: wid, artist: aid }] });
      Main.afterHumanMove();
    });
    await page.waitForFunction(() => document.getElementById("modal-root").classList.contains("active"), { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 200));
    const obs = await page.evaluate(() => { clearInterval(window.__obsIv); return window.__obs; });
    check(obs.print > 0, "print presentation appeared");
    check(obs.mastery > 0, "mastery presentation appeared");
    check(obs.print < obs.mastery, "print appears before mastery");
    check(!obs.overlap, "hero presentations never overlap");
    check(!obs.modalOverHero && obs.modalAt > obs.mastery, "cube decision dialog opens only after both presentations");
    // the debut is front-page news in The Daily Spinner archive
    check(await page.evaluate(() => document.querySelectorAll("#dialogue .news-head").length > 0 &&
      !!document.querySelector("#dialogue .news-edition")),
      "comic debut got a Daily Spinner headline under an edition mark");
    check(await page.evaluate(() => !/NEWSREEL/.test(document.getElementById("dialogue").textContent)),
      "no NEWSREEL terminology remains in the archive");
    check(await page.evaluate(() => document.getElementById("wire-latest").textContent.trim().length > 0),
      "the press wire strip carries the latest dispatch");

    // --------------------- 9. quiet completion + always-armed undo
    // (continues from 8: the cube decision dialog is open)
    check(await page.evaluate(() => UI.pendingCompletion && !document.getElementById("review-bar")),
      "a chained decision remains pending without adding a proof popup");
    await page.evaluate(() => {
      const e = UI.engine;
      e.resolvePending(UI.humanId, { special: e.state.pending.data.options[0] });
      closeModal();
      Main.advance();
    });
    await page.waitForFunction(() => !UI.pendingCompletion, { timeout: 10000 });
    check(await page.evaluate(() => !document.getElementById("review-bar")),
      "the chained decision resolves without a visual proof layer");
    const rivalsHash = () => page.evaluate(() =>
      JSON.stringify(UI.engine.state.players.filter((p) => !p.human).map((p) => [p.editorsLeft, p.money, p.hand.length])));
    // documented save semantics: mid-transaction checkpoints (a pending
    // decision existed) ARE saved — revealed information must not be
    // undoable via reload. The post-completion Undo window is tested below.
    check(await page.evaluate(() =>
      JSON.parse(localStorage.getItem("aoc_save")).state.chart.length === UI.engine.state.chart.length),
      "chained transaction checkpoint is saved (reload resumes, not undoes)");
    const snapJson = await page.evaluate(() => JSON.stringify(UI.undoSnap.state));
    await page.keyboard.press("u"); // keyboard undo shortcut
    check(await page.evaluate((sj) => JSON.stringify(UI.engine.state) === sj, snapJson),
      "undo restores the exact pre-action state");
    check(await page.evaluate(() => /REWOUND/.test(document.getElementById("toast-root").textContent) &&
      UI.engine.currentPlayerId() === UI.humanId), "undo announces the rewind and returns control to the human");
    // simple action -> completes instantly, autosaves, and the AI
    // proceeds without any confirm click
    const mBefore = await page.evaluate(() => UI.engine.player(UI.humanId).money);
    await page.evaluate(() => { UI.engine.actRoyalties(UI.humanId); Main.afterHumanMove(); });
    await page.waitForFunction(() => !UI.pendingCompletion, { timeout: 10000 });
    check(await page.evaluate(() => !document.getElementById("review-bar")), "simple royalties action completes quietly");
    check(await page.evaluate((m0) =>
      JSON.parse(localStorage.getItem("aoc_save")).state.players[UI.humanId].money > m0 &&
      UI.engine.player(UI.humanId).money > m0, mBefore),
      "completed action autosaves immediately (reload resumes it)");
    const beforeConfirm = await rivalsHash();
    await page.waitForFunction((h) =>
      JSON.stringify(UI.engine.state.players.filter((p) => !p.human).map((p) => [p.editorsLeft, p.money, p.hand.length])) !== h,
      { timeout: 15000 }, beforeConfirm);
    check(true, "the rivals proceed on their own — no confirm step");
    // a completed sales run completes too (wait for the UI to arm Undo)
    await page.waitForFunction(() => UI.engine.currentPlayerId() === UI.humanId && !UI.busy &&
      !!UI.undoSnap && !UI.engine.state.pending && !UI.engine.state.awaitingSpecial, { timeout: 30000 });
    await page.evaluate(() => {
      UI.engine.actSalesStart(UI.humanId);
      UI.engine.salesEnd(UI.humanId);
      Main.afterHumanMove();
    });
    await page.waitForFunction(() => !UI.pendingCompletion, { timeout: 10000 });
    check(true, "completed sales run advances without confirmation");

    // ------------- 10. real sales interactions (canvas + DOM panel), file://
    // regression: every canvas/panel sales action once called the
    // nonexistent MapView.draw(), aborting the handler mid-way
    await page.waitForFunction(() => UI.engine.currentPlayerId() === UI.humanId && !UI.busy &&
      !!UI.undoSnap && !UI.engine.state.pending && !UI.engine.state.awaitingSpecial &&
      !document.querySelector("#modal-root .modal"), { timeout: 30000 });
    const errsBefore = jsErrors.length;
    await page.evaluate(() => {
      const e = UI.engine, p = e.player(UI.humanId);
      p.money = 20;
      p.editorsLeft = Math.max(1, p.editorsLeft);
      p.agentMoved = false;
      e.state.actionSpaces.sales = []; // deterministic: a sales slot is open
      renderAll();
    });
    await page.$eval('#locations .loc[data-action="sales"]', (b) => b.click());
    await page.waitForFunction(() => !!document.querySelector("#modal-root .modal"));
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("#modal-root button")].find((x) => /START THE RUN/.test(x.textContent || ""));
      b.click();
    });
    await page.waitForFunction(() => !!document.querySelector(".sales-run-modal") && !!UI.engine.state.salesSession);
    const cvMove = await page.evaluate(() => {
      // a real canvas interaction: synthesize a click through the map's own
      // hit test at a legal destination node
      const cv = document.getElementById("map-canvas");
      const target = UI.engine.agentAdjacent(UI.humanId).find((n) => n !== "X");
      const pos = MapView.nodePos(target);
      const r = cv.getBoundingClientRect();
      cv.dispatchEvent(new MouseEvent("click", {
        clientX: r.left + pos.x * (r.width / MapView.CW),
        clientY: r.top + pos.y * (r.height / MapView.CH),
        bubbles: true,
      }));
      return { target, at: UI.engine.player(UI.humanId).agentNode };
    });
    check(cvMove.at === cvMove.target, "canvas click moves the agent");
    check(jsErrors.length === errsBefore, "no page error from the canvas interaction");
    // reference pane: the player's chart books (with fans) ride the dispatch
    // column — the facts an order decision hangs on
    const refInfo = await page.evaluate(() => {
      const s = UI.engine.state;
      // deterministic: give the human one book on the chart, then re-render
      window.__refSnapChart = s.chart.filter((c) => c.owner === UI.humanId).length;
      if (!window.__refSnapChart) {
        const cd = COMICS[0];
        s.chart.push({
          idx: s.chart.length, cardId: cd.id, owner: UI.humanId, title: cd.title,
          genre: cd.genre, value: 4, fans: 3, isRipoff: false, bettercolor: false,
          everOnChart: true, masteryFanApplied: false,
          creatives: {
            writer: { id: "writer_" + cd.genre + "_2", genre: cd.genre, baseValue: 2, curValue: 2, name: "T W" },
            artist: { id: "artist_" + cd.genre + "_2", genre: cd.genre, baseValue: 2, curValue: 2, name: "T A" },
          },
        });
      }
      const pane = document.querySelector(".sales-run-modal .run-ref");
      if (!pane) return null;
      return { paneText: pane.textContent || "", books: pane.querySelectorAll(".rr-book").length };
    });
    check(refInfo && /YOUR BOOKS ON THE CHART/.test(refInfo.paneText),
      "run modal pins the player's chart books in the dispatch column");

    // minimize: the run parks into the Manhattan Map space and resumes from it
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("#modal-root button")].find((x) => /MINIMIZE/.test(x.textContent || ""));
      b.click();
    });
    await page.waitForFunction(() => !document.querySelector("#modal-root .modal"), { timeout: 10000 });
    const parked = await page.evaluate(() => {
      const sales = document.querySelector('#locations .loc[data-action="sales"]');
      const other = document.querySelector('#locations .loc[data-action="print"]');
      return {
        session: !!UI.engine.state.salesSession,
        resume: sales && sales.classList.contains("resume-run") &&
          /resume your sales run/i.test(sales.getAttribute("aria-label") || ""),
        plate: sales && !!sales.querySelector(".resume-plate"),
        othersLocked: other && other.getAttribute("aria-disabled") === "true" &&
          /finish your sales run/i.test(other.getAttribute("aria-label") || ""),
      };
    });
    check(parked.session, "minimized run keeps the sales session alive");
    check(parked.resume && parked.plate, "the Manhattan Map space becomes the pulsing resume button");
    check(parked.othersLocked, "other action spaces are locked (with the reason) while the run is parked");
    // regression: a queued advance() used to auto-reopen the parked run —
    // fire one deliberately and make sure the modal stays closed
    await page.evaluate(() => Main.advance());
    await new Promise((r) => setTimeout(r, 700));
    check(await page.evaluate(() => !document.querySelector("#modal-root .modal") && !!UI.engine.state.salesSession),
      "the parked run stays parked even when advance() fires");
    await page.$eval('#locations .loc[data-action="sales"]', (b) => b.click());
    await page.waitForFunction(() => !!document.querySelector(".sales-run-modal") && !!UI.engine.state.salesSession,
      { timeout: 10000 });
    const resumed2 = await page.evaluate(() => {
      const pane = document.querySelector(".sales-run-modal .run-ref");
      return { hud: (document.querySelector(".map-hud") || {}).textContent || "",
        books: pane ? pane.querySelectorAll(".rr-book").length : 0 };
    });
    check(/FLIPS/.test(resumed2.hud), "clicking the space resumes the run where it left off");
    check(resumed2.books > 0, "the reference pane lists the player's chart books after resume");
    check(jsErrors.length === errsBefore, "no page error from the minimize/resume round trip");

    // mastery ownership reads in THE STANDINGS, not on the personal shelf
    const standingsTok = await page.evaluate(() => {
      const s = UI.engine.state;
      const rival = s.players.find((p) => !p.human);
      s.mastery.western = rival.id;
      renderChart();
      renderHUD();
      const row = [...document.querySelectorAll(".standing-row")]
        .find((r) => (r.getAttribute("aria-label") || "").includes(UI.engine.player(rival.id).pubName));
      const sock = document.querySelector('#desk-awards .award-socket[data-genre="western"]');
      const out = {
        inRow: row && !!row.querySelector(".st-name .spr"),
        rowLabel: row ? /mastery token/.test(row.getAttribute("aria-label") || "") : false,
        // the empty socket shows a dim genre-mark placeholder (a nested
        // .spr) — only a DIRECT .spr child is an actual mastery token
        shelfClean: sock && !sock.classList.contains("won") && !sock.querySelector(":scope > .spr"),
      };
      delete s.mastery.western;
      renderChart(); renderHUD();
      return out;
    });
    check(standingsTok.inRow && standingsTok.rowLabel, "a rival's mastery token shows in their standings row");
    check(standingsTok.shelfClean, "the personal awards shelf never shows a rival's token");
    // direct keyboard control: the arrows drive the agent (no dispatch list)
    const kbBefore = await page.evaluate(() => {
      document.querySelector(".sales-map-pane").focus();
      return UI.engine.player(UI.humanId).agentNode;
    });
    for (const k of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"]) {
      if (await page.evaluate((nb) => UI.engine.player(UI.humanId).agentNode !== nb, kbBefore)) break;
      await page.keyboard.press(k);
    }
    const kbAfter = await page.evaluate(() => ({
      node: UI.engine.player(UI.humanId).agentNode,
      hud: (document.querySelector(".map-hud") || {}).textContent || "",
      live: document.getElementById("aria-status").textContent || "",
    }));
    check(kbAfter.node !== kbBefore, "arrow keys move the agent directly");
    check(/CASH/.test(kbAfter.hud), "post-action HUD refresh completed (code after the old crash point ran)");
    check(kbAfter.live.length > 0, "the move is narrated to the live region");
    check(jsErrors.length === errsBefore, "no page error from the keyboard interaction");
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("#modal-root button")].find((x) => /END SALES RUN/.test(x.textContent || ""));
      b.click();
    });
    await page.waitForFunction(() => !document.querySelector("#modal-root .modal"), { timeout: 10000 });
    await page.waitForFunction(() => !UI.pendingCompletion, { timeout: 10000 });
    check(true, "UI-driven sales run completes without a proof popup");

    // -------- 10b. placement flight: the staffer travels to the white square
    await page.waitForFunction(() => UI.engine.currentPlayerId() === UI.humanId && !UI.busy &&
      !!UI.undoSnap && !UI.engine.state.pending && !document.querySelector("#modal-root .modal"), { timeout: 30000 });
    const flight = await page.evaluate(() => {
      const e = UI.engine, p = e.player(UI.humanId);
      // keep 2 editors so this placement can never END the round (a round end
      // clears the action spaces and would legitimately empty the pip mid-flight)
      p.editorsLeft = Math.max(2, p.editorsLeft);
      e.state.actionSpaces.royalties = []; // deterministic: a free desk, no dialog
      UI.undoSnap = e.snapshot();
      const slot = e.state.actionSpaces.royalties.length;
      e.actRoyalties(UI.humanId);
      Main.afterHumanMove(); // flushes placeEditor -> launches the flight
      const pip = document.querySelector('#locations .loc[data-action="royalties"]')
        .querySelectorAll(".slot-pip")[slot];
      return {
        slot,
        gated: !!(UI.placeFlight && Object.keys(UI.placeFlight).length),
        pipEmpty: pip && !pip.querySelector(".spr"),
        flying: !!document.querySelector(".fx-token"),
      };
    });
    check(flight.gated && flight.pipEmpty, "the white square stays empty while the staffer is en route");
    check(flight.flying, "the staffer sprite visibly travels to the action space");
    await page.waitForFunction((slot) => {
      const pip = document.querySelector('#locations .loc[data-action="royalties"]')
        .querySelectorAll(".slot-pip")[slot];
      return pip && !!pip.querySelector(".spr") && !(UI.placeFlight && Object.keys(UI.placeFlight).length);
    }, { timeout: 10000 }, flight.slot);
    check(true, "the staffer lands: pip filled, flight flag cleared");
    await page.waitForFunction(() => !UI.pendingCompletion, { timeout: 15000 });

    // --------------- 11. publisher rail unification + published-catalog overflow
    check(await page.evaluate(() => !document.querySelector("#topbar #hud-resources") &&
      !!document.querySelector("#desk-status #hud-resources") &&
      !!document.querySelector("#desk-status #desk-orders") && !!document.querySelector("#desk-status #desk-awards") &&
      document.querySelectorAll("#desk-status #staff-roster .staffer").length >= 4),
      "personal resources/staff/orders/awards live in the Publisher rail, not the top bar");
    check(await page.evaluate(() => {
      // the press-wire tongue tickers NEWS (which may quote dollar amounts);
      // the check is that no personal cash READOUT lives in the top bar
      const bar = document.getElementById("topbar").cloneNode(true);
      const wire = bar.querySelector("#wire-strip");
      if (wire) wire.remove();
      return !/\$\d/.test(bar.textContent);
    }), "top bar carries no personal cash figure (news headlines aside)");
    check(await page.evaluate(() =>
      document.querySelectorAll("#desk-awards .award-socket").length === GENRES.length),
      "awards shelf shows one persistent socket per genre");
    for (const vp of [{ width: 1600, height: 900 }, { width: 1024, height: 768 }]) {
      await page.setViewport(vp);
      for (const n of [0, 4, 5, 6, 8]) {
        const r = await page.evaluate(async (n) => {
          // the viewport just changed: let fitUI's resize handling settle so
          // zoom/size compensation is coherent before anything is measured
          dispatchEvent(new Event("resize"));
          await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
          const e = UI.engine;
          if (!window.__deskSnap) window.__deskSnap = e.snapshot();
          else { e.restore(window.__deskSnap); UI.eventCursor = e.events.length; }
          const s = e.state; // restore() swaps the state object — bind after
          s.chart = s.chart.filter((c) => c.owner !== UI.humanId);
          COMICS.slice(0, n).forEach((cd) => {
            s.chart.push({ idx: 0, owner: UI.humanId, title: cd.title, genre: cd.genre,
              cardId: cd.id, isRipoff: false, fans: 3, value: 4, bettercolor: false,
              everOnChart: true, masteryFanApplied: false,
              creatives: {
                writer: { id: "writer_" + cd.genre + "_2", genre: cd.genre, baseValue: 2, curValue: 2, name: "Test Writer" },
                artist: { id: "artist_" + cd.genre + "_2", genre: cd.genre, baseValue: 2, curValue: 2, name: "Test Artist" },
              } });
          });
          s.chart.forEach((c, i) => (c.idx = i));
          renderAll();
          await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
          const mat = document.getElementById("hud-mat");
          const matR = mat.getBoundingClientRect();
          const handR = document.getElementById("hud-hand").getBoundingClientRect();
          const items = [...document.querySelectorAll("#hud-mat .press-item")];
          let reachable = 0, valuesOk = 0, overlapHand = 0;
          const detail = [];
          for (const it of items) {
            it.scrollIntoView({ block: "nearest", inline: "nearest" });
            const b = it.getBoundingClientRect();
            if (b.left >= matR.left - 1 && b.right <= matR.right + 1) reachable++;
            if (b.right > handR.left + 1 && b.left < handR.right) overlapHand++;
            detail.push([Math.round(b.left), Math.round(b.right)]);
            const c = s.chart[+it.dataset.chartIdx];
            const plate = it.querySelector(".val-plate");
            if (plate && plate.textContent === "VALUE " + c.value) valuesOk++;
          }
          const nav = document.getElementById("mat-nav");
          nav.hidden = mat.scrollWidth <= mat.clientWidth + 4; // sync recompute
          return { count: items.length, reachable, valuesOk, overlapHand,
            scrollable: mat.scrollWidth > mat.clientWidth + 4, navShown: !nav.hidden,
            detail, matR: [Math.round(matR.left), Math.round(matR.right)],
            handL: Math.round(handR.left) };
        }, n);
        const tag = `${vp.width}x${vp.height}, ${n} comics`;
        if (r.reachable !== n || r.overlapHand)
          console.error(`      geometry: mat=${r.matR} handLeft=${r.handL} items=${JSON.stringify(r.detail)}`);
        check(r.count === n, `${tag}: published catalog renders all of them`);
        check(r.reachable === n, `${tag}: every comic can be brought fully into view`);
        check(r.valuesOk === n, `${tag}: every VALUE plate matches engine state`);
        check(r.overlapHand === 0, `${tag}: none hides under the ON YOUR DESK column`);
        check(!r.scrollable || r.navShown, `${tag}: scroll affordance visible when it scrolls`);
      }
    }
    await page.evaluate(() => { UI.engine.restore(window.__deskSnap); UI.eventCursor = UI.engine.events.length; renderAll(); });
    await page.setViewport({ width: 800, height: 600 });

    // ---------------- 12. mastery token flight to its persistent home
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle0" });
    await page.$eval("#btn-new-game", (b) => b.click());
    // undo is CUB REPORTER-only now: play these flows at easy difficulty
    await page.$eval('#setup-difficulty [data-v="easy"]', (b) => b.click());
    await page.$eval("#btn-start", (b) => b.click());
    await page.waitForFunction(() => typeof UI !== "undefined" && !!UI.engine);
    await page.evaluate(() => {
      const e = UI.engine;
      let g = 0;
      while (g++ < 200 && e.state.phase !== "actions") {
        const s = e.state;
        if (s.pending) AI.resolveOwnPendings(e, s.pending.playerId);
        else if (s.awaitingSpecial) AI.settle(e, s.awaitingSpecial.player);
        else {
          const pid = s.turnOrder[s.turnIdx];
          if (pid === undefined) { e.advanceIncrease(); continue; }
          AI.doStartingPicks(e, pid);
          AI.doIncrease(e, pid);
          e.advanceIncrease();
        }
      }
      closeModal();
      Main.advance();
    });
    const quiesce = () => page.waitForFunction(() => UI.engine.currentPlayerId() === UI.humanId &&
      !UI.busy && !!UI.undoSnap && !UI.engine.state.pending && !UI.engine.state.awaitingSpecial &&
      heroRemaining() === 0 && !document.querySelector(".fx-celebrate"), { timeout: 30000 });
    // prints an original of a genre nobody holds; withPrev fabricates a
    // rival as the current (comic-less) holder so the token changes hands
    const masteryPrint = (withPrev) => page.evaluate((withPrev) => {
      const e = UI.engine, s = e.state, pid = UI.humanId, p = e.player(pid);
      const cd = COMICS.find((c) => s.mastery[c.genre] === undefined &&
        !s.chart.some((k) => k.genre === c.genre)) ||
        COMICS.find((c) => s.mastery[c.genre] === undefined);
      const rival = s.players.find((q) => q.id !== pid);
      if (withPrev) s.mastery[cd.genre] = rival.id;
      // deterministic room to act: an open print slot and an editor
      s.actionSpaces.print = [];
      p.editorsLeft = Math.max(1, p.editorsLeft);
      const give = (id) => {
        for (const k of ["writers", "artists", "comics"])
          for (const arr of [s.decks[k], s.discards[k], s.display[k]]) {
            const i = arr.indexOf(id);
            if (i >= 0) arr.splice(i, 1);
          }
        p.hand.push(id);
      };
      const wid = s.decks.writers.concat(s.display.writers).find((id) => CARD_BY_ID[id].genre !== cd.genre);
      const aid = s.decks.artists.concat(s.display.artists).find((id) => CARD_BY_ID[id].genre !== cd.genre);
      [cd.id, wid, aid].forEach(give);
      p.money = 12;
      p.ideas[cd.genre] = 2;
      p.printedCount = 0; // no cube decision: keep the presentation clean
      window.__flyObs = { fly: 0, flash: 0, hl: 0, xfer: 0, ann: 0 };
      window.__flyIv = setInterval(() => {
        if (document.querySelector(".fx-token")) window.__flyObs.fly++;
        if (document.querySelector(".award-socket.flash, .order-chip.flash")) window.__flyObs.flash++;
        if (document.querySelector('.award-socket[style*="outline"]')) window.__flyObs.hl++;
        const live = document.getElementById("aria-status").textContent;
        if (/mastery from/.test(live)) window.__flyObs.xfer++;
        if (/mastery/.test(live)) window.__flyObs.ann++;
      }, 50);
      e.actPrint(pid, { books: [{ type: "original", comic: cd.id, writer: wid, artist: aid }] });
      Main.afterHumanMove();
      return cd.genre;
    }, withPrev);
    const socketWon = (g) => page.waitForFunction((g) =>
      !!document.querySelector(`#desk-awards .award-socket[data-genre="${g}"].won .spr`),
      { timeout: 20000 }, g);
    const confirmIfShown = async () => {
      // completion is automatic: wait for every chained choice to settle
      await page.waitForFunction(() => !UI.pendingCompletion, { timeout: 15000 });
    };

    await quiesce();
    const g1 = await masteryPrint(false);
    await socketWon(g1);
    // print celebration (~1.9s) + queued mastery celebration (~1.8s) +
    // flight launch offset (1.25s) + flight (0.8s) + flash tail
    await new Promise((r) => setTimeout(r, 5600));
    let fo = await page.evaluate(() => { clearInterval(window.__flyIv); return window.__flyObs; });
    check(fo.fly > 0, "first mastery: the token visibly flies to the awards shelf");
    check(fo.flash > 0, "first mastery: the destination socket flashes");
    await confirmIfShown();

    await quiesce();
    const g2 = await masteryPrint(true);
    await socketWon(g2);
    await new Promise((r) => setTimeout(r, 5600));
    fo = await page.evaluate(() => { clearInterval(window.__flyIv); return window.__flyObs; });
    check(fo.fly > 0, "transferred mastery: the token visibly changes hands");
    check(fo.xfer > 0, "transfer is announced to screen readers");
    await confirmIfShown();

    // reduced motion: instant placement, calm highlight, still announced
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await quiesce();
    const g3 = await masteryPrint(true);
    await socketWon(g3);
    await new Promise((r) => setTimeout(r, 800));
    fo = await page.evaluate(() => { clearInterval(window.__flyIv); return window.__flyObs; });
    check(fo.fly === 0, "reduced motion: no token flight");
    check(fo.hl > 0, "reduced motion: calm highlight on the destination socket");
    check(fo.ann > 0, "reduced motion: still announced");
    await page.emulateMediaFeatures([]);
    await confirmIfShown();

    // the tokens are persistent state, not presentation leftovers
    check(await page.evaluate((gs) => { renderAll();
      return gs.every((g) => !!document.querySelector(`#desk-awards .award-socket[data-genre="${g}"].won .spr`));
    }, [g1, g2, g3]), "all three tokens remain on the shelf after a re-render");

    // --------- 13. cube relocation uses the shared special-choice visuals
    await quiesce();
    await page.evaluate(() => {
      const e = UI.engine, p = e.player(UI.humanId);
      p.cubeSpecials = ["hype", "marketing"];
      e.pushPending(UI.humanId, "relocateCube", {});
      Main.advance();
    });
    await page.waitForFunction(() => document.getElementById("modal-root").classList.contains("active") &&
      document.querySelectorAll("#modal-root .special-pick").length > 0, { timeout: 15000 });
    const rel = await page.evaluate(() => {
      const grp = (label) => [...document.querySelectorAll('#modal-root [role="group"]')]
        .find((g) => g.getAttribute("aria-label") === label);
      const complete = (row) => [...row.querySelectorAll(".special-pick")].every((c) =>
        c.querySelector("canvas.special-art") && /after /.test(c.textContent) &&
        (c.getAttribute("aria-label") || "").includes("triggers after"));
      const fromRow = grp("Your special actions"), toRow = grp("Trade for");
      return {
        fromN: fromRow ? fromRow.querySelectorAll(".special-pick").length : 0,
        toN: toRow ? toRow.querySelectorAll(".special-pick").length : 0,
        fromOk: fromRow && complete(fromRow), toOk: toRow && complete(toRow),
        notes: fromRow ? fromRow.querySelectorAll(".sp-note").length : 0,
      };
    });
    check(rel.fromN === 2 && rel.toN === 4, "relocation offers both current specials and all four alternatives");
    check(rel.fromOk && rel.toOk, "every choice shows artwork, trigger action, and effect description");
    check(rel.notes === 2, "current specials are marked ACTIVE NOW");
    await page.evaluate(() => {
      [...document.querySelectorAll('#modal-root [role="group"]')]
        .find((g) => g.getAttribute("aria-label") === "Your special actions")
        .querySelector('.special-pick[data-sp="hype"]').click();
    });
    check(await page.evaluate(() => {
      const c = document.querySelector('#modal-root .special-pick[data-sp="hype"]');
      return c.classList.contains("selected") && c.getAttribute("aria-pressed") === "true";
    }), "selecting a special marks it visibly and via aria-pressed");
    const dest = await page.evaluate(() => {
      const row = [...document.querySelectorAll('#modal-root [role="group"]')]
        .find((g) => g.getAttribute("aria-label") === "Trade for");
      const c = row.querySelector(".special-pick");
      c.click();
      return c.dataset.sp;
    });
    await page.$eval("#rc-ok", (b) => b.click());
    await page.waitForFunction(() => !document.getElementById("modal-root").classList.contains("active"));
    check(await page.evaluate((d) => {
      const p = UI.engine.player(UI.humanId);
      return p.cubeSpecials.includes(d) && !p.cubeSpecials.includes("hype");
    }, dest), "moving the cube updates engine state");
    check(await page.evaluate((d) => {
      const badge = document.querySelector(`#locations .loc[data-action="${SPECIALS[d].after}"] .special-badge`);
      return !!badge && badge.textContent.includes(SPECIALS[d].name);
    }, dest), "the location room shows the relocated special badge");
    await confirmIfShown();

    // direct file:// open: the friendly guard, not a half-loaded game
    const fpage = await browser.newPage();
    await fpage.goto("file:///" + path.join(__dirname, "..", "index.html").replace(/\\/g, "/"),
      { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 400));
    check(await fpage.evaluate(() => {
      const g = document.querySelector(".file-guard");
      return !!g && /PLAY\.bat/.test(g.textContent) && !document.getElementById("err-banner");
    }), "file:// open shows the PLAY.bat guard and no red error banner");
    check(await fpage.evaluate(() => !document.getElementById("btn-new-game")),
      "the game does not half-boot under file://");
    await fpage.close();

    check(jsErrors.length === 0, "no JS errors during the whole run" + (jsErrors.length ? ": " + jsErrors[0] : ""));
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
