// ============================================================================
// UI V2 smoke gate: proves the opt-in publisher-desk shell preserves the six
// living action rooms, keeps the strategic desk scroll-free at its real limits,
// and shares the existing engine-backed scenes and Sales map. Run:
// node game/test/ui-v2.js
// ============================================================================
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer-core");
const AXE_SRC = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const PORT = 8498;
const URL = `http://localhost:${PORT}/?ui=v2`;

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
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  throw new Error("no Chrome/Edge found; set CHROME_PATH");
}

let passed = 0, failed = 0;
function check(condition, name) {
  if (condition) { passed++; console.log("  ok  " + name); }
  else { failed++; console.error("FAIL  " + name); }
}

(async () => {
  const server = spawn(process.execPath,
    [path.join(__dirname, "..", "tools", "serve.js"), String(PORT)], { stdio: "ignore" });
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    const jsErrors = [];
    page.on("pageerror", (error) => jsErrors.push(String(error)));

    await page.goto(URL, { waitUntil: "networkidle0" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle0" });
    check(await page.$eval("html", (node) => node.classList.contains("ui-v2")),
      "query flag activates only the V2 shell");

    await page.$eval("#btn-new-game", (button) => button.click());
    await page.$eval("#btn-start", (button) => button.click());
    await page.waitForFunction(() => typeof UI !== "undefined" && !!UI.engine);
    await page.evaluate(() => {
      const e = UI.engine;
      let guard = 0;
      while (guard++ < 200 && e.state.phase !== "actions") {
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
    await page.waitForFunction(() => document.querySelectorAll("#locations .loc").length === 6);

    check((await page.$$("#locations .loc")).length === 6,
      "all six illustrated action rooms remain present");
    check(await page.$eval("#action-stage", (stage) => getComputedStyle(stage).display === "none"),
      "the discarded selected-action spread reserves no board space");

    await page.waitForFunction(() => {
      const canvases = [...document.querySelectorAll("#locations canvas.loc-scene")];
      if (canvases.length !== 6) return false;
      return canvases.every((canvas) => {
        const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return true;
        return false;
      });
    }, { timeout: 10000 });
    check(true, "all six room canvases contain rendered artwork");

    await page.evaluate(() => {
      const e = UI.engine, s = e.state;
      s.phase = "actions";
      s.turnIdx = s.turnOrder.indexOf(UI.humanId);
      s.pending = null;
      s.awaitingSpecial = null;
      s.actionSpaces.hire = [];
      e.player(UI.humanId).editorsLeft = Math.max(1, e.player(UI.humanId).editorsLeft);
      UI.busy = false;
      renderAll();
    });

    const before = await page.evaluate(() => JSON.stringify(UI.engine.state));
    await page.$eval('#locations .loc[data-action="hire"]', (button) => button.click());
    await page.waitForFunction(() => !!document.querySelector("#modal-root .modal"));
    check((await page.$eval("#modal-root .modal h2", (heading) => heading.textContent)).includes("TALENT AGENCY"),
      "an action room opens its existing decision scene");
    check(await page.evaluate(() => JSON.stringify(UI.engine.state)) === before,
      "opening an action scene never mutates game state");
    await page.evaluate(() => closeModal());

    const geometry = await page.evaluate(() => {
      const box = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      };
      return {
        screen: box("#screen-game"), top: box("#topbar"), publisher: box("#desk-status"),
        rooms: box("#locations"), chart: box("#sidebar"), collections: box("#desk-collections"),
        hand: box("#hud-hand"), stands: box("#hud-left"), mark: box("#desk-publisher-mark"),
        tiles: [...document.querySelectorAll("#locations .loc")].map((node) => {
          const r = node.getBoundingClientRect();
          return { left: Math.round(r.left), top: Math.round(r.top), right: r.right, bottom: r.bottom };
        }),
      };
    });
    check(geometry.publisher.left >= geometry.screen.left - 1 && geometry.publisher.right <= geometry.rooms.left + 1 &&
      geometry.publisher.top >= geometry.top.bottom - 1 && geometry.publisher.bottom <= geometry.screen.bottom + 1,
      "the Publisher owns the full left column");
    check(new Set(geometry.tiles.map((r) => r.left)).size === 3 &&
      new Set(geometry.tiles.map((r) => r.top)).size === 2,
      "action rooms form a comparable three-by-two board");
    check(geometry.rooms.right <= geometry.chart.left + 1 && geometry.rooms.top >= geometry.top.bottom - 1,
      "Actions remain centered between Publisher and Chart");
    check(geometry.collections.left >= geometry.publisher.right - 1 && geometry.collections.top >= geometry.rooms.bottom - 1 &&
      geometry.collections.right <= geometry.screen.right + 1 && geometry.collections.bottom <= geometry.screen.bottom + 1,
      "Team, Projects and On the Stands own the lower row");
    check([geometry.hand, geometry.stands].every((r) => r.top >= geometry.collections.top && r.bottom <= geometry.collections.bottom),
      "both collection trays stay inside the lower row");
    check(geometry.mark.width > 0 && geometry.mark.height > 0,
      "the clean publisher mark is visible");
    check(await page.$eval("#desk-publisher-mark .v2-score-card b", (node) =>
      Number(node.textContent) === UI.engine.scorePlayer(UI.humanId).total),
      "projected VP comes from the engine scoring query");
    check((await page.$$(".v2-staffer")).length === 4,
      "the Publisher shows the normal four-editor staff roster");
    check((await page.$$("#hud-hand .v2-hand-group")).length === 3,
      "Team and Projects are grouped as writers, artists and projects");
    check(await page.$eval("#topbar", (bar) => bar.contains(document.getElementById("wire-strip"))),
      "the compact Press Wire teletype lives in the top bar");

    // Worst-case strategic desk: the hand limit is six and measured games
    // reach eight printed comics. Every item must remain visible without
    // making any of the four persistent desk zones scroll.
    const fullDesk = await page.evaluate(async () => {
      const e = UI.engine, s = e.state, p = e.player(UI.humanId);
      window.__v2DeskSnap = e.snapshot();
      p.hand = CREATIVES.slice(0, 3).map((c) => c.id).concat(COMICS.slice(0, 3).map((c) => c.id));
      p.hyped = [];
      s.chart = s.chart.filter((c) => c.owner !== UI.humanId);
      COMICS.slice(0, 8).forEach((cd) => s.chart.push({
        idx: 0, owner: UI.humanId, title: cd.title, genre: cd.genre,
        cardId: cd.id, isRipoff: false, fans: 3, value: 4, bettercolor: false,
        everOnChart: true, masteryFanApplied: false,
        creatives: {
          writer: { id: "writer_" + cd.genre + "_2", genre: cd.genre, baseValue: 2, curValue: 2, name: "Test Writer" },
          artist: { id: "artist_" + cd.genre + "_2", genre: cd.genre, baseValue: 2, curValue: 2, name: "Test Artist" },
        },
      }));
      s.chart.forEach((c, i) => (c.idx = i));
      p.printedCount = 8;
      p.orders = s.mapSlots.slice(0, 12).map((order) => {
        order.takenBy = UI.humanId; order.faceUp = true; return order.id;
      });
      renderHUD();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const noScroll = (selector) => {
        const node = document.querySelector(selector);
        return node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1;
      };
      const contained = (parentSelector, childSelector) => {
        const parent = document.querySelector(parentSelector).getBoundingClientRect();
        return [...document.querySelectorAll(childSelector)].every((child) => {
          const r = child.getBoundingClientRect();
          return r.left >= parent.left - 1 && r.right <= parent.right + 1 &&
            r.top >= parent.top - 1 && r.bottom <= parent.bottom + 1;
        });
      };
      const scrollMetrics = ["#desk-status", "#desk-collections", "#hud-hand", "#hud-mat"].map((selector) => {
        const node = document.querySelector(selector);
        return [selector, node.scrollWidth, node.clientWidth, node.scrollHeight, node.clientHeight];
      });
      return {
        handN: document.querySelectorAll("#hud-hand .v2-hand-tile").length,
        bookN: document.querySelectorAll("#hud-mat .v2-news-tile").length,
        orderN: document.querySelectorAll("#desk-orders .res").length,
        zonesNoScroll: scrollMetrics.every((m) => m[1] <= m[2] + 1 && m[3] <= m[4] + 1),
        scrollMetrics,
        handContained: contained("#hud-hand", "#hud-hand .v2-hand-tile"),
        booksContained: contained("#hud-mat", "#hud-mat .v2-news-tile"),
        ordersContained: contained("#desk-ledger", "#desk-orders .res"),
      };
    });
    check(fullDesk.handN === 6 && fullDesk.handContained,
      "all six hand cards remain visible at once");
    check(fullDesk.bookN === 8 && fullDesk.booksContained,
      "all eight published comics remain visible at once");
    check(fullDesk.orderN === 12 && fullDesk.ordersContained,
      "twelve persistent sales orders remain visible at once");
    if (!fullDesk.zonesNoScroll) console.error("      desk scroll metrics:", fullDesk.scrollMetrics);
    check(fullDesk.zonesNoScroll,
      "no persistent Publisher Desk zone requires a scrollbar");

    check((await page.$$(".v2-lane-head")).length === await page.evaluate(() => UI.engine.state.players.length),
      "every publishing house has an immediately visible colored chart lane");
    await page.evaluate(() => document.querySelector(`.v2-lane-head[data-player="${UI.humanId}"]`).click());
    await page.waitForFunction(() => !!document.querySelector(".v2-chart-detail"));
    check(await page.$eval(".v2-chart-detail", (detail) => detail.textContent.includes("PROJECTED VP") && detail.textContent.includes("PUBLISHED COMICS")),
      "clicking a chart lane opens the publisher information sheet");
    await page.$eval(".v2-chart-detail-close", (button) => button.click());
    await page.waitForFunction(() => !document.querySelector(".v2-chart-detail"));

    await page.$eval("#wire-strip", (button) => button.click());
    await page.waitForFunction(() => !document.getElementById("wire-panel").hidden);
    check(await page.$eval("#wire-panel", (panel) => getComputedStyle(panel).animationName === "v2-wire-open"),
      "the top teletype opens the animated paper archive");
    await page.$eval("#wire-close", (button) => button.click());

    const salesStarted = await page.evaluate(() => {
      const e = UI.engine;
      e.restore(window.__v2DeskSnap);
      UI.eventCursor = e.events.length;
      closeModal();
      let guard = 0;
      while (guard++ < 60 && e.currentPlayerId() !== UI.humanId) {
        const s = e.state;
        if (s.pending) AI.resolveOwnPendings(e, s.pending.playerId);
        else if (s.awaitingSpecial) AI.settle(e, s.awaitingSpecial.player);
        else AI.takeTurn(e, e.currentPlayerId());
      }
      e.state.actionSpaces.sales = [];
      e.player(UI.humanId).editorsLeft = Math.max(1, e.player(UI.humanId).editorsLeft);
      const ok = e.actSalesStart(UI.humanId);
      if (ok) Scenes.salesScene(true);
      return ok;
    });
    check(salesStarted, "V2 opens a real engine-backed sales run");
    await page.waitForFunction(() => !!document.querySelector(".sales-run-modal .sales-workspace"));
    const salesLayout = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
      const modal = document.querySelector(".sales-run-modal");
      const workspace = document.querySelector(".sales-workspace");
      const map = rect(".sales-map-pane"), panel = rect(".sales-panel"), actions = rect(".sales-actions");
      const within = (r) => {
        const m = modal.getBoundingClientRect();
        return r.left >= m.left - 1 && r.right <= m.right + 1 && r.top >= m.top - 1 && r.bottom <= m.bottom + 1;
      };
      return {
        sideBySide: map.right <= panel.left + 1,
        allInside: [map, panel, actions].every(within),
        noScroll: modal.scrollHeight <= modal.clientHeight + 1 &&
          workspace.scrollHeight <= workspace.clientHeight + 1 &&
          document.querySelector(".sales-panel").scrollHeight <= document.querySelector(".sales-panel").clientHeight + 1,
        destinations: document.querySelectorAll('.sales-panel [data-pkey^="dest-"]').length,
        canvasVisible: rect("#map-canvas").width > 350 && rect("#map-canvas").height > 350,
      };
    });
    check(salesLayout.sideBySide && salesLayout.allInside,
      "Sales map and dispatch desk share one viewport");
    check(salesLayout.noScroll, "Sales decisions require no modal or panel scrolling");
    check(salesLayout.destinations > 0 && salesLayout.canvasVisible,
      "legal destinations stay visible beside a readable map");

    await page.evaluate(AXE_SRC);
    const serious = await page.evaluate(() => axe.run(document, {
      resultTypes: ["violations"], rules: { "color-contrast": { enabled: false } },
    }).then((result) => result.violations
      .filter((v) => v.impact === "critical" || v.impact === "serious")
      .map((v) => ({ id: v.id, help: v.help, targets: v.nodes.map((n) => n.target[0]) }))));
    for (const violation of serious)
      console.error(`      [${violation.id}] ${violation.help}: ${violation.targets.join(", ")}`);
    check(serious.length === 0, "V2 board has no critical/serious axe violations");
    check(jsErrors.length === 0, "no JavaScript errors during the V2 run");
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})().catch((error) => { console.error(error); process.exit(1); });
