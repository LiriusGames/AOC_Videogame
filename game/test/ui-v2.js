// ============================================================================
// UI V2 smoke gate: proves the opt-in publisher-desk shell renders its source
// art, keeps V2 browsing non-mutating, preserves the responsive desk geometry,
// and still opens the existing action scenes. Run: node game/test/ui-v2.js
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
    await page.waitForFunction(() => document.querySelectorAll(".v2-action-card").length === 6);

    check((await page.$$(".v2-action-card")).length === 6,
      "all six actions render as compact comics");
    check(await page.$eval("#action-stage", (stage) => getComputedStyle(stage).display !== "none"),
      "one selected action spread is visible");

    await page.waitForFunction(() => {
      const canvases = [...document.querySelectorAll(".v2-action-art, .v2-stage-art")];
      if (canvases.length !== 7) return false;
      return canvases.every((canvas) => {
        const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return true;
        return false;
      });
    }, { timeout: 10000 });
    check(true, "all action canvases contain rendered artwork");

    const before = await page.evaluate(() => JSON.stringify(UI.engine.state));
    await page.$eval('.v2-action-card[data-action="hire"]', (button) => button.click());
    check(await page.$eval("#action-stage h2", (heading) => heading.textContent) === "TALENT AGENCY",
      "selecting a comic changes the focused spread");
    check(await page.evaluate(() => JSON.stringify(UI.engine.state)) === before,
      "browsing action comics never mutates game state");

    const geometry = await page.evaluate(() => {
      const box = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      };
      return {
        rail: box("#locations"), stage: box("#action-stage"), hud: box("#hud"),
        vitals: box("#desk-vitals"), hand: box("#hud-hand"), newsroom: box("#hud-left"),
        ledger: box("#desk-ledger"), mark: box("#desk-publisher-mark"),
      };
    });
    check(geometry.rail.right <= geometry.stage.left + 1,
      "action rail and focused spread do not overlap");
    check(geometry.stage.bottom <= geometry.hud.top + 1,
      "the publisher desk has its own uninterrupted lower zone");
    check([geometry.vitals, geometry.hand, geometry.newsroom, geometry.ledger]
      .every((r) => r.top >= geometry.hud.top && r.bottom <= geometry.hud.bottom),
      "all four personal-information zones stay inside the desk");
    check(geometry.mark.width > 0 && geometry.mark.height > 0,
      "the clean publisher mark is visible");

    await page.$eval("#chart-mini", (button) => button.click());
    await page.waitForFunction(() => document.querySelector("#sidebar").classList.contains("open"));
    const drawer = await page.evaluate(() => {
      const side = document.querySelector("#sidebar").getBoundingClientRect();
      const tab = document.querySelector("#chart-mini").getBoundingClientRect();
      return { separated: tab.right <= side.left + 1, expanded: document.querySelector("#chart-mini").getAttribute("aria-expanded") };
    });
    check(drawer.separated, "open chart keeps its close tab outside the drawer content");
    check(drawer.expanded === "true", "chart drawer exposes its expanded state");

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
