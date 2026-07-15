// ============================================================================
// Deterministic layout screenshots (report tool, not a CI gate).
// Captures title / founding dialog / board / sales map (+ chart drawer at
// laptop widths) at the supported sizes into test/shots/.
// Run: node game/test/screens.js
// ============================================================================
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer-core");

const PORT = 8497;
const V2 = process.env.AOC_UI === "v2";
const URL = `http://localhost:${PORT}/${V2 ? "?ui=v2" : ""}`;
const SHOTS = path.join(__dirname, "shots");
const SIZES = [[1600, 900], [1366, 768], [1280, 720], [1024, 768]];

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

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = spawn(process.execPath, [path.join(__dirname, "..", "tools", "serve.js"), String(PORT)], { stdio: "ignore" });
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  try {
    for (const [w, h] of SIZES) {
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: h });
      await page.goto(URL, { waitUntil: "networkidle0" });
      await page.evaluate(() => localStorage.clear());
      const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${V2 ? "v2-" : ""}${name}-${w}x${h}.png`) });
      await shot("title");

      await page.$eval("#btn-new-game", (b) => b.click());
      await page.$eval("#btn-start", (b) => b.click());
      await page.waitForFunction(() => typeof UI !== "undefined" && !!UI.engine);
      // the founding dialog opens once the human's round-1 turn comes up
      await page.waitForFunction(() => !!document.querySelector("#modal-root .modal"), { timeout: 15000 });
      await shot("founding");

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
      await new Promise((r) => setTimeout(r, 400));
      await page.evaluate(() => document.getElementById("big-banner").classList.remove("show"));
      await shot("board");

      if (V2) {
        await page.evaluate(() => {
          const e = UI.engine, s = e.state, p = e.player(UI.humanId);
          window.__screenDeskSnap = e.snapshot();
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
        });
        await new Promise((r) => setTimeout(r, 100));
        await shot("desk-full");
        await page.evaluate(() => {
          UI.engine.restore(window.__screenDeskSnap);
          UI.eventCursor = UI.engine.events.length;
          renderAll();
        });
        await page.evaluate(() => document.querySelector(`.v2-lane-head[data-player="${UI.humanId}"]`).click());
        await new Promise((r) => setTimeout(r, 100));
        await shot("chart-detail");
        await page.$eval(".v2-chart-detail-close", (button) => button.click());
      }

      const hasDrawer = await page.evaluate(() =>
        getComputedStyle(document.getElementById("chart-mini")).display !== "none");
      if (hasDrawer) {
        await page.$eval("#chart-mini", (b) => b.click());
        await new Promise((r) => setTimeout(r, 300));
        await shot("drawer");
        await page.$eval("#chart-mini", (b) => b.click());
      }

      await page.evaluate(() => {
        const e = UI.engine;
        let guard = 0;
        while (guard++ < 60 && e.currentPlayerId() !== UI.humanId) {
          const s = e.state;
          if (s.pending) AI.resolveOwnPendings(e, s.pending.playerId);
          else if (s.awaitingSpecial) AI.settle(e, s.awaitingSpecial.player);
          else AI.takeTurn(e, e.currentPlayerId());
        }
        e.state.actionSpaces.sales = [];
        e.player(UI.humanId).editorsLeft = Math.max(1, e.player(UI.humanId).editorsLeft);
        if (e.actSalesStart(UI.humanId)) Scenes.salesScene(true);
      });
      await new Promise((r) => setTimeout(r, 300));
      await shot("map");
      await page.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log("screenshots:", SHOTS);
})().catch((err) => { console.error(err); process.exit(1); });
