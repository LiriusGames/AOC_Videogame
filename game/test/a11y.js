// ============================================================================
// Accessibility gate: axe-core scans + a keyboard-only scenario in headless
// Edge/Chrome. Targets WCAG 2.2 AA where practical; color-contrast is
// excluded deliberately (16-bit palette is a design decision, reviewed by
// hand) and the canvas map has a separate DOM alternative planned.
// Run: node game/test/a11y.js   (or npm run test:a11y)
// ============================================================================
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer-core");

const PORT = 8491;
const URL = `http://localhost:${PORT}/`;
const AXE_SRC = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

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

async function axeScan(page, label) {
  await page.evaluate(AXE_SRC);
  const result = await page.evaluate(() =>
    axe.run(document, {
      resultTypes: ["violations"],
      rules: { "color-contrast": { enabled: false } }, // deliberate retro palette
    }));
  const serious = result.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  for (const v of serious)
    console.error(`      [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes, e.g. ${v.nodes[0].target[0]})`);
  check(serious.length === 0, `axe: no critical/serious violations on ${label}`);
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
    // gate: any control the sweep finds without an accessible name fails CI
    const unnamed = [];
    page.on("console", (msg) => { if (msg.text().startsWith("a11y:")) unnamed.push(msg.text()); });
    const active = () => page.evaluate(() => {
      const a = document.activeElement;
      return { id: a.id, cls: a.className, inModal: !!a.closest("#modal-root") };
    });
    const tabUntil = async (pred, max = 40) => {
      for (let i = 0; i < max; i++) {
        if (await page.evaluate(pred)) return true;
        await page.keyboard.press("Tab");
      }
      return page.evaluate(pred);
    };

    // --------------------------------------------------------- title screen
    await page.goto(URL, { waitUntil: "networkidle0" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle0" });
    await axeScan(page, "title screen");

    // ------------------------------------------- keyboard: title -> setup
    check(await tabUntil(() => document.activeElement.id === "btn-new-game"),
      "keyboard: tab reaches START THE PRESSES");
    await page.keyboard.press("Enter");
    check(await page.evaluate(() => document.querySelector(".screen.active").id === "screen-setup"),
      "keyboard: Enter opens setup");

    // ------------------------------ publisher radiogroup with arrow keys
    await page.evaluate(() => document.querySelector('.pub-card[aria-checked="true"]').focus());
    const before = await page.evaluate(() => document.querySelector('.pub-card[aria-checked="true"]').getAttribute("aria-label"));
    await page.keyboard.press("ArrowRight");
    const after = await page.evaluate(() => ({
      label: document.querySelector('.pub-card[aria-checked="true"]').getAttribute("aria-label"),
      focusChecked: document.activeElement.getAttribute("aria-checked"),
    }));
    check(after.label !== before, "keyboard: arrow moves publisher selection");
    check(after.focusChecked === "true", "keyboard: focus follows the selected radio");
    await axeScan(page, "setup screen");

    // ------------------------------------------- keyboard: start the game
    check(await tabUntil(() => document.activeElement.id === "btn-start"),
      "keyboard: tab reaches OPEN FOR BUSINESS");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector("#modal-root .modal"), { timeout: 15000 });
    check(true, "founding modal opens");

    // ------------------------------------------------- modal focus rules
    let a = await active();
    check(a.inModal, "focus moved into the dialog");
    let trapped = true;
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      if (!(await active()).inModal) { trapped = false; break; }
    }
    check(trapped, "Tab stays trapped inside the dialog");
    check(await page.evaluate(() => {
      const m = document.querySelector("#modal-root .modal");
      return m.getAttribute("role") === "dialog" && m.getAttribute("aria-modal") === "true" &&
        !!m.getAttribute("aria-labelledby");
    }), "dialog has role, aria-modal, and an accessible name");

    // ------------------------------------ keyboard: pick a founding genre
    check(await tabUntil(() => document.activeElement.classList.contains("pick-card")),
      "keyboard: tab reaches a genre card");
    await page.keyboard.press("Enter");
    check(await page.evaluate(() => !!document.querySelector('#modal-root .pick-card[aria-pressed="true"]')),
      "keyboard: Enter selects it (aria-pressed)");
    await axeScan(page, "founding dialog");

    // finish the founding picks headlessly (not the subject under test)
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

    // --------------------------- keyboard: take a royalties action
    await page.waitForFunction(() =>
      typeof UI !== "undefined" && UI.engine.currentPlayerId() === UI.humanId && !UI.busy, { timeout: 20000 });
    const money0 = await page.evaluate(() => UI.engine.player(UI.humanId).money);
    await page.evaluate(() => document.querySelector('#locations .loc[aria-label^="Accounting"]').focus());
    await page.keyboard.press("Enter");
    await page.waitForFunction((m0) => UI.engine.player(UI.humanId).money > m0, { timeout: 10000 }, money0);
    check(true, "keyboard: Enter on the Accounting location collects royalties");

    check(await page.evaluate(() => {
      const r = document.getElementById("aria-status");
      return !!r && r.getAttribute("aria-live") === "polite";
    }), "live status region present");

    // ---------------------- keyboard-only sales run via the DOM map panel
    await page.waitForFunction(() => UI.engine.currentPlayerId() === UI.humanId &&
      !UI.busy && !UI.engine.state.pending && !UI.engine.state.awaitingSpecial, { timeout: 30000 });
    // stage an occupancy restriction: rival parked on an adjacent corner, we are broke
    await page.evaluate(() => {
      const e = UI.engine, rival = e.state.players.find((q) => q.id !== UI.humanId);
      rival.agentNode = MAP.X_LINKS[0];
      rival.agentMoved = true;
      e.player(UI.humanId).money = 0;
      renderAll();
    });
    await page.evaluate(() => document.querySelector('#locations .loc[data-action="sales"]').focus());
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !!document.querySelector("#modal-root .modal"));
    check(await tabUntil(() => /START THE RUN/.test(document.activeElement.textContent || "")),
      "keyboard: reach START THE RUN in the scout dialog");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !!document.querySelector(".sales-panel"));
    check(true, "sales panel renders");
    // the blocked destination must be DISCOVERABLE by keyboard, not merely
    // marked: tab onto it, read its description, and get the reason announced
    check(await tabUntil(() => (document.activeElement.dataset || {}).pkey === "dest-" + MAP.X_LINKS[0]),
      "keyboard: the occupied corner is still focusable");
    const occ = await page.evaluate(() => {
      const b = document.activeElement;
      const why = document.getElementById(b.getAttribute("aria-describedby"));
      return { ariaDisabled: b.getAttribute("aria-disabled"), why: why && why.textContent };
    });
    check(occ.ariaDisabled === "true" && /fee/.test(occ.why || ""),
      "aria-disabled with the fee reason wired via aria-describedby");
    await page.keyboard.press("Enter");
    check(await page.evaluate(() => /fee/.test(document.getElementById("aria-status").textContent)),
      "activating it announces the reason in the live region");
    check(await page.evaluate(() => UI.engine.player(UI.humanId).agentNode === "X"),
      "and the agent did not move");
    check(await tabUntil(() => /^dest-/.test((document.activeElement.dataset || {}).pkey || "") &&
      document.activeElement.getAttribute("aria-disabled") !== "true"), "keyboard: reach a legal destination");
    const nodeBefore = await page.evaluate(() => UI.engine.player(UI.humanId).agentNode);
    await page.keyboard.press("Enter");
    check(await page.evaluate((nb) => UI.engine.player(UI.humanId).agentNode !== nb, nodeBefore),
      "keyboard: Enter moves the agent");
    check(await page.evaluate(() => !!document.activeElement.closest(".sales-panel")),
      "focus preserved in the panel after the rerender");
    // flip or collect if the corner offers one
    const canAct = await page.evaluate(() => {
      const b = document.querySelector('.sales-panel [data-pkey^="flip-"]:not([disabled]),' +
        ' .sales-panel [data-pkey^="collect-"]:not([disabled])');
      if (!b) return false;
      b.focus();
      return true;
    });
    if (canAct) {
      const acts = await page.evaluate(() => {
        const ses = UI.engine.state.salesSession;
        return ses.flipsLeft + ses.collectsLeft;
      });
      await page.keyboard.press("Enter");
      check(await page.evaluate((n) => {
        const ses = UI.engine.state.salesSession;
        return !ses || ses.flipsLeft + ses.collectsLeft < n;
      }, acts), "keyboard: flip/collect consumed an action");
    }
    if (await page.evaluate(() => !!document.querySelector("#modal-root .modal"))) {
      check(await tabUntil(() => /END SALES RUN/.test(document.activeElement.textContent || "")),
        "keyboard: reach END SALES RUN");
      await page.keyboard.press("Enter");
    }
    await page.waitForFunction(() => !document.querySelector("#modal-root .modal"), { timeout: 10000 });
    check(true, "sales run ends from the keyboard");
    check(await page.evaluate(() => document.activeElement !== document.body),
      "focus restored somewhere useful after the dialog closes");

    if (unnamed.length) console.error("      " + unnamed.slice(0, 5).join("\n      "));
    check(unnamed.length === 0, "no interactive element lacked an accessible name during the run");
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
