"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer-core");
const AXE_SRC = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const PORT = 8493;
const URL = `http://localhost:${PORT}/`;
function findBrowser() {
  const candidates = [process.env.CHROME_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium-browser"].filter(Boolean);
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  throw new Error("no Chrome/Edge found; set CHROME_PATH");
}

let passed = 0;
function check(value, name) {
  if (!value) throw new Error(`FAIL  ${name}`);
  passed++;
  console.log(`  ok  ${name}`);
}

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, "..", "tools", "serve.js"), String(PORT)], { stdio: "ignore" });
  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(URL, { waitUntil: "networkidle0" });
    await page.evaluate(() => localStorage.clear());
    await page.click("#btn-tutorial");
    await page.waitForFunction(() => typeof Tutor !== "undefined" && Tutor.active && !!document.querySelector("#modal-root.active"));
    const scenario = await page.evaluate(() => ({ seed: UI.engine.cfg.seed, beat: Tutor.state.beat, mode: UI.mode }));
    check(scenario.seed === 5 && scenario.beat === "masthead" && scenario.mode === "tutorial", "title action starts the pinned tutorial scenario at the masthead memo");
    await page.$eval("#tutor-card .tutor-next", (btn) => btn.click());
    await page.waitForFunction(() => Tutor.state.beat === "founding");
    await page.evaluate(AXE_SRC);
    const axe = await page.evaluate(() => axe.run(document, {
      resultTypes: ["violations"], rules: { "color-contrast": { enabled: false } },
    }));
    check(!axe.violations.some((violation) => ["critical", "serious"].includes(violation.impact)),
      "tutorial founding overlay has no critical/serious accessibility violations");

    async function foundHouse() {
      await page.$$eval(".vault-card", (cards) => cards.find((card) => /CRIME/i.test(card.textContent)).click());
      await page.evaluate(() => {
        const token = [...document.querySelectorAll(".token-btn")][GENRES.indexOf("crime")];
        token.click(); token.click();
        document.querySelector("#sp-ok").click();
      });
      // the founding files itself: the stamp lands and the proof note follows
      await page.waitForFunction(() => Tutor.state.beat === "proof_confirm", { timeout: 10000 });
    }
    await foundHouse();
    check(await page.evaluate(() => !document.querySelector("#review-bar").hidden),
      "the founding files itself with a proof stamp (no confirm step)");
    // undo stays voluntary: the top-bar button rewinds and reopens the vault
    await page.click("#btn-undo");
    await page.waitForFunction(() => Tutor.state.beat === "founding" && !!document.querySelector("#modal-root.active"));
    await foundHouse();
    check(await page.evaluate(() => Tutor.state.beat === "proof_confirm"), "voluntary undo reopens the vault and returns to the proof note");
    // the proof note is an interstitial now: NEXT starts the premises tour
    await page.$eval("#tutor-card .tutor-next", (btn) => btn.click());
    await page.waitForFunction(() => Tutor.state.beat === "tour_rail", { timeout: 10000 });
    await page.$eval("#tutor-card .tutor-next", (btn) => btn.click());
    await page.waitForFunction(() => Tutor.state.beat === "tour_board");
    await page.$eval("#tutor-card .tutor-back", (btn) => btn.click());
    check(await page.evaluate(() => Tutor.state.beat === "tour_rail"), "BACK rewinds the tour one stop");
    await page.$eval("#tutor-card .tutor-next", (btn) => btn.click());
    await page.waitForFunction(() => Tutor.state.beat === "tour_board");
    await page.$eval("#tutor-card .tutor-next", (btn) => btn.click());
    await page.waitForFunction(() => Tutor.state.beat === "tour_chart");
    await page.$eval("#tutor-card .tutor-next", (btn) => btn.click());

    async function waitTurn(beat) {
      await page.waitForFunction((wanted) => Tutor.state.beat === wanted && UI.engine.currentPlayerId() === UI.humanId &&
        !UI.busy && !!UI.undoSnap,
        { timeout: 15000 }, beat);
    }
    async function action(kind, payload, nextBeat) {
      await page.evaluate(({ kind, payload }) => {
        const result = UI.session.dispatch(kind, payload);
        if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
        Main.afterHumanMove();
      }, { kind, payload });
      if (kind === "action_print") await page.evaluate(() => {
        const pending = UI.engine.state.pending;
        if (pending && pending.type === "chooseIdeas") {
          const genres = Array(pending.data.count).fill(Tutor.SCENARIO.genre);
          const result = UI.session.dispatch("pending_resolve", { choice: { genres } });
          if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
          Main.advance();
        }
      });
      // no confirm step: the stamp files the action and the beat moves on
      await waitTurn(nextBeat);
    }

    await waitTurn("ideas");
    const ideaPayload = await page.evaluate(() => {
      const board = GENRES.filter((genre) => UI.engine.state.boardIdeas[genre] > 0).slice(0, 2);
      return { board, supply: [Tutor.SCENARIO.genre, Tutor.SCENARIO.genre] };
    });
    await action("action_ideas", ideaPayload, "print");
    await action("action_print", { books: [{ type: "original", comic: "orig_38", writer: "writer_crime_2B", artist: "artist_romance_2" }] }, "mastery_note");
    await page.$eval("#tutor-card .tutor-next", (btn) => btn.click());
    await page.waitForFunction(() => Tutor.state.beat === "accounting");
    await action("action_royalties", {}, "sales");

    await page.evaluate(() => {
      for (const [kind, payload] of [
        ["sales_start", {}], ["sales_move", { node: 10, ticket: false }],
        ["sales_flip", { slotId: 17 }], ["sales_collect", { slotId: 17 }], ["sales_end", {}],
      ]) {
        const result = UI.session.dispatch(kind, payload);
        if (!result.ok) throw new Error(`${kind}: ${result.code} ${result.message}`);
      }
      Main.afterHumanMove();
    });
    await page.waitForFunction(() => UI.engine.state.round === 2 && Tutor.state.beat === "free", { timeout: 20000 });
    // the last memo carries a real ending now
    await page.$eval("#tutor-card .tutor-next", (btn) => btn.click());
    check(await page.evaluate(() => !Tutor.active && Tutor.state.finished === true &&
      document.getElementById("tutor-layer").hidden), "FINISH THE LESSON retires the guide and its overlay");

    const completion = await page.evaluate(() => ({
      completed: Tutor.state.completedCore,
      tutorialSave: !!localStorage.getItem("aoc_tutorial_save"),
      normalSave: !!localStorage.getItem("aoc_save"),
      printed: UI.engine.player(UI.humanId).printedCount,
      orderFulfilled: UI.engine.state.mapSlots[17].fulfilled,
    }));
    check(completion.completed && completion.printed === 1, "guided round reaches release and prints the first book");
    check(completion.orderFulfilled === true, "seeded Sales order auto-fulfills instead of remaining as a penalty");
    check(completion.tutorialSave && !completion.normalSave, "tutorial resume data stays separate from the normal solo save");
    check(errors.length === 0, `no page errors during tutorial (${errors.join("; ")})`);
    console.log(`\n${passed} tutorial browser checks passed`);
  } finally {
    await browser.close();
    server.kill();
  }
})().catch((error) => { console.error(error); process.exit(1); });
