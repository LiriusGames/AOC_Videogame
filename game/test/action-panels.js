// Focused browser regressions for Hire/Develop overflow and Print-team UX.
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer-core");

const PORT = 8492;
const URL = `http://localhost:${PORT}/`;
function browserPath() {
  const candidates = [process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].filter(Boolean);
  const found = candidates.find(fs.existsSync);
  if (!found) throw new Error("no Chrome/Edge found; set CHROME_PATH");
  return found;
}
let passed = 0, failed = 0;
function check(value, label) {
  if (value) { passed++; console.log("  ok  " + label); }
  else { failed++; console.error("FAIL  " + label); }
}

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, "..", "tools", "serve.js"), String(PORT)], { stdio: "ignore" });
  const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(URL, { waitUntil: "networkidle0" });
    await page.evaluate(() => localStorage.clear());
    await page.$eval("#btn-new-game", (button) => button.click());
    await page.$eval("#btn-start", (button) => button.click());
    await page.waitForFunction(() => typeof UI !== "undefined" && !!UI.engine);

    // Put the local player in a deterministic, legal action turn.
    await page.evaluate(() => {
      const e = UI.engine, s = e.state, pid = UI.humanId, p = e.player(pid);
      s.phase = "actions"; s.pending = null; s.pendingQueue = []; s.awaitingSpecial = null;
      s.turnOrder = [pid, ...s.players.map((x) => x.id).filter((id) => id !== pid)]; s.turnIdx = 0;
      s.actionSpaces.hire = []; s.actionSpaces.print = []; p.editorsLeft = 4;
      const remove = (id) => {
        for (const key of ["writers", "artists", "comics"])
          for (const list of [s.decks[key], s.discards[key], s.display[key]]) {
            const at = list.indexOf(id); if (at >= 0) list.splice(at, 1);
          }
      };
      p.hand = [];
      for (const id of ["orig_1", "orig_2", "orig_3", "orig_4", "orig_8"]) { remove(id); p.hand.push(id); }
      closeModal();
    });

    await page.evaluate(() => Scenes.open("hire"));
    await page.$$eval("#modal-root .balloon-row", (rows) => rows.forEach((row) => row.querySelector(".figure").click()));
    const beforeHire = await page.evaluate(() => JSON.stringify(UI.engine.state));
    await page.$eval("#hire-ok", (button) => button.click());
    check(await page.$eval("#modal-root", (root) => /GO BACK & REASSESS/.test(root.textContent)),
      "overflow warning offers reassessment before Hire commits");
    check(await page.evaluate((before) => JSON.stringify(UI.engine.state) === before, beforeHire),
      "overflow warning reveals and mutates nothing");
    await page.evaluate(() => [...document.querySelectorAll("#modal-root button")]
      .find((button) => /GO BACK/.test(button.textContent)).click());
    check(await page.$eval("#hire-ok", (button) => !button.disabled), "returning to Hire preserves both picks");
    await page.$eval("#hire-ok", (button) => button.click());
    await page.evaluate(() => [...document.querySelectorAll("#modal-root button")]
      .find((button) => /CONTINUE/.test(button.textContent)).click());
    check(await page.evaluate(() => UI.engine.state.pending && UI.engine.state.pending.type === "discard" &&
      UI.engine.state.pending.data.count === 1), "continuing Hire creates the mandatory discard");

    await page.evaluate(() => {
      const e = UI.engine, s = e.state, pid = UI.humanId, p = e.player(pid);
      s.pending = null; s.pendingQueue = []; s.awaitingSpecial = null; s.phase = "actions";
      s.turnOrder = [pid, ...s.players.map((x) => x.id).filter((id) => id !== pid)]; s.turnIdx = 0;
      s.actionSpaces.develop = []; p.editorsLeft = 4;
      p.hand = ["orig_1", "orig_2", "orig_3", "orig_4", "orig_8", "orig_9"];
      closeModal(); Scenes.open("develop");
    });
    await page.$eval("#modal-root .comic-tile", (tile) => tile.click());
    const beforeDevelop = await page.evaluate(() => JSON.stringify(UI.engine.state));
    await page.$eval("#dev-ok", (button) => button.click());
    check(await page.$eval("#modal-root", (root) => /GO BACK & REASSESS/.test(root.textContent)) &&
      await page.evaluate((before) => JSON.stringify(UI.engine.state) === before, beforeDevelop),
      "Develop also offers a mutation-free reassessment before overflow");
    await page.evaluate(() => [...document.querySelectorAll("#modal-root button")]
      .find((button) => /GO BACK/.test(button.textContent)).click());
    check(await page.$eval("#dev-ok", (button) => !button.disabled), "returning to Develop preserves the pitch");

    // Reconfigure only the local engine for a focused Print-panel inspection.
    await page.evaluate(() => {
      const e = UI.engine, s = e.state, pid = UI.humanId, p = e.player(pid);
      s.pending = null; s.pendingQueue = []; s.awaitingSpecial = null; s.printX2 = null;
      s.phase = "actions"; s.turnOrder = [pid, ...s.players.map((x) => x.id).filter((id) => id !== pid)]; s.turnIdx = 0;
      s.actionSpaces.print = []; p.editorsLeft = 4; p.money = 10;
      const ids = ["orig_1", "writer_crime_3", "writer_scifi_2", "artist_crime_3", "artist_scifi_2"];
      for (const id of ids)
        for (const key of ["writers", "artists", "comics"])
          for (const list of [s.decks[key], s.discards[key], s.display[key]]) {
            const at = list.indexOf(id); if (at >= 0) list.splice(at, 1);
          }
      p.hand = ids.slice();
      for (const g of GENRES) p.ideas[g] = 5;
      closeModal(); Scenes.open("print");
    });
    await page.$eval("#modal-root .comic-tile", (tile) => tile.click());
    const panel = await page.evaluate(() => {
      const lanes = [...document.querySelectorAll(".print-genre-lane")];
      const selected = [...document.querySelectorAll(".print-team-grid .figure.selected")];
      return {
        lanes: lanes.length,
        aligned: lanes.every((lane) => lane.querySelectorAll(":scope > .print-role-row").length === 2),
        best: document.querySelectorAll(".print-team-grid .team-best").length,
        selected: selected.length,
        selectedIds: selected.map((node) => node.dataset.cardId),
        counters: document.querySelectorAll(".resource-counter .spr").length,
        enabled: !document.querySelector("#print-ok").disabled,
        recommendation: /RECOMMENDED TEAM PRESELECTED/.test(document.querySelector(".team-recommendation").textContent),
      };
    });
    check(panel.lanes >= 2 && panel.aligned, "Print aligns writer and artist rows inside genre lanes");
    check(panel.best === 2 && panel.selected === 2 && panel.recommendation,
      "Print immediately shows and selects the recommended pair");
    check(panel.counters >= 2, "Print uses the real idea and coin sprites as counters");
    check(panel.enabled, "recommended affordable team is immediately printable");
    const expected = await page.evaluate(() => {
      const e = UI.engine, comic = document.querySelector("#modal-root .comic-tile.selected");
      const id = comic && UI.engine.player(UI.humanId).hand.find((cardId) => !CARD_BY_ID[cardId].kind);
      const best = AI.rankPrintTeams(e, UI.humanId, { type: "original", comic: id })[0];
      return [best.writer, best.artist];
    });
    check(expected.every((id) => panel.selectedIds.includes(id)), "visible recommendation matches shared team ranking");

    // Book one may fund book two: the preview must use the post-bonus ledger.
    await page.evaluate(() => {
      const e = UI.engine, s = e.state, pid = UI.humanId, p = e.player(pid);
      const ids = ["orig_4", "orig_15", "writer_western_3", "artist_western_3", "writer_scifi_2", "artist_scifi_2"];
      for (const id of ids)
        for (const key of ["writers", "artists", "comics"])
          for (const list of [s.decks[key], s.discards[key], s.display[key]]) {
            const at = list.indexOf(id); if (at >= 0) list.splice(at, 1);
          }
      p.hand = ids; p.money = 6; p.editorsLeft = 4;
      for (const g of GENRES) p.ideas[g] = 5;
      s.actionSpaces.print = []; s.pending = null; s.printX2 = null;
      closeModal(); Scenes.open("print");
    });
    await page.$eval('.comic-tile[data-card-id="orig_4"]', (tile) => tile.click());
    await page.$eval("#print-ok", (button) => button.click());
    await page.evaluate(() => [...document.querySelectorAll("#modal-root button")]
      .find((button) => /PRINT A SECOND/.test(button.textContent)).click());
    await page.$eval('.comic-tile[data-card-id="orig_15"]', (tile) => tile.click());
    const secondBook = await page.evaluate(() => ({
      enabled: !document.querySelector("#print-ok").disabled,
      ledger: document.querySelector(".print-ledger").textContent,
    }));
    check(secondBook.enabled && /\$4 available/.test(secondBook.ledger),
      "book-two preview includes book one's $4 bonus before judging affordability");
    if (errors.length) console.error(errors.join("\n"));
    check(errors.length === 0, "no browser JavaScript errors");
  } finally {
    await browser.close(); server.kill();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})().catch((error) => { console.error(error); process.exit(1); });
