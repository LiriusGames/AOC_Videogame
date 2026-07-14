// ============================================================================
// Contrast audit (report tool, like balance.js — not a CI gate).
// Scans every visible text element across the main screens, composites its
// effective background, and reports WCAG AA ratios (4.5 normal / 3 large).
// Text over images/canvas can't be computed — it's listed for manual review.
// Screenshots land in game/test/shots/ for visual inspection.
// Run: node game/test/contrast.js
// ============================================================================
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer-core");

const PORT = 8493;
const URL = `http://localhost:${PORT}/`;
const SHOTS = path.join(__dirname, "shots");

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

// runs inside the page: scan visible text, composite backgrounds, rate WCAG
function scanPage() {
  const parse = (c) => {
    const m = /rgba?\(([\d.]+), ?([\d.]+), ?([\d.]+)(?:, ?([\d.]+))?\)/.exec(c);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const blend = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  });
  const out = [];
  const seen = new Set();
  for (const elx of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(elx);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const text = [...elx.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
    if (!text) continue;
    const rect = elx.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const fg = parse(cs.color);
    if (!fg || fg.a < 0.1) continue;
    // composite the background up the ancestor chain
    let bg = { r: 0, g: 0, b: 0, a: 0 }, overImage = false, node = elx;
    const layers = [];
    while (node && node !== document.documentElement) {
      const ns = getComputedStyle(node);
      if (ns.backgroundImage !== "none") overImage = true;
      const c = parse(ns.backgroundColor);
      if (c && c.a > 0) layers.push(c);
      if (c && c.a >= 0.99) break;
      node = node.parentElement;
    }
    if (!layers.length || layers[layers.length - 1].a < 0.99) overImage = true;
    let eff = layers.length ? layers[layers.length - 1] : { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 2; i >= 0; i--) eff = blend(layers[i], eff);
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const key = (elx.className || elx.tagName) + "|" + cs.color + "|" + text.slice(0, 12);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      sel: (elx.className ? "." + String(elx.className).trim().split(/\s+/).join(".") : elx.tagName.toLowerCase()),
      text: text.slice(0, 34),
      size: +size.toFixed(1),
      ratio: overImage ? null : +ratio(fg, eff).toFixed(2),
      need: large ? 3 : 4.5,
      overImage,
    });
  }
  return out;
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = spawn(process.execPath, [path.join(__dirname, "..", "tools", "serve.js"), String(PORT)], { stdio: "ignore" });
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1620,920"],
    defaultViewport: { width: 1600, height: 900 },
  });
  const results = {};
  try {
    const page = await browser.newPage();
    const grab = async (name) => {
      await page.screenshot({ path: path.join(SHOTS, name + ".png") });
      results[name] = await page.evaluate(scanPage);
    };

    await page.goto(URL, { waitUntil: "networkidle0" });
    await page.evaluate(() => localStorage.clear());
    await grab("title");

    await page.$eval("#btn-new-game", (b) => b.click());
    await grab("setup");

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
    await grab("game");

    await page.evaluate(() => { UI.engine.actSalesStart(UI.humanId); Scenes.salesScene(true); });
    await grab("sales-panel");
    await page.evaluate(() => { UI.engine.salesEnd(UI.humanId); closeModal(); });

    await page.evaluate(() => { UI.engine.finishGame(); Main.advance(); });
    await page.waitForFunction(() => !!document.querySelector("#modal-root .modal"));
    await grab("endgame");
  } finally {
    await browser.close();
    server.kill();
  }

  let fails = 0, manual = 0;
  for (const [screen, rows] of Object.entries(results)) {
    const bad = rows.filter((r) => !r.overImage && r.ratio < r.need).sort((a, b) => a.ratio - b.ratio);
    const over = rows.filter((r) => r.overImage);
    manual += over.length;
    console.log(`\n== ${screen}: ${rows.length} text styles, ${bad.length} below AA, ${over.length} over images (manual)`);
    for (const r of bad) {
      fails++;
      console.log(`   ${String(r.ratio).padStart(5)} (needs ${r.need})  ${r.sel}  ${r.size}px  "${r.text}"`);
    }
    for (const r of over.slice(0, 6))
      console.log(`   manual: ${r.sel} ${r.size}px "${r.text}"`);
  }
  console.log(`\n${fails} measurable AA failures, ${manual} styles over imagery for manual review`);
  console.log(`screenshots: ${SHOTS}`);
})().catch((err) => { console.error(err); process.exit(1); });
