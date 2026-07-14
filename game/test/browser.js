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
    // observe hero surfaces + dialogs while a mastery-winning print plays out
    await page.evaluate(() => {
      window.__obs = { print: 0, mastery: 0, overlap: false, modalOverHero: false, modalAt: 0, t0: performance.now() };
      window.__obsIv = setInterval(() => {
        const o = window.__obs, t = performance.now() - o.t0;
        const cels = [...document.querySelectorAll(".fx-celebrate")];
        if (cels.length > 1) o.overlap = true;
        for (const c of cels) {
          if (/HOT OFF THE PRESS/.test(c.textContent) && !o.print) o.print = t;
          if (/MASTERY/.test(c.textContent) && !o.mastery) o.mastery = t;
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
      give("orig_25", "writer_scifi_2", "artist_crime_2");
      p.money = 10;
      p.ideas.romance = 2;
      p.printedCount = 1; // this print is the 2nd -> a cube decision follows
      e.actPrint(pid, { books: [{ type: "original", comic: "orig_25", writer: "writer_scifi_2", artist: "artist_crime_2" }] });
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

    check(jsErrors.length === 0, "no JS errors during the whole run" + (jsErrors.length ? ": " + jsErrors[0] : ""));
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
