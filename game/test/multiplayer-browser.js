// Real-socket multiplayer smoke. Requires `wrangler dev --port 8787`.
"use strict";
const fs = require("fs");
const puppeteer = require("puppeteer-core");

const URL = process.env.AOC_MULTIPLAYER_URL || "http://127.0.0.1:8787/";
function findBrowser() {
  const candidates = [process.env.CHROME_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  throw new Error("no Chrome/Edge found; set CHROME_PATH");
}
function check(value, name) {
  if (!value) throw new Error("FAIL  " + name);
  console.log("  ok  " + name);
}
async function enterName(page, name) {
  await page.waitForSelector("#mp-name", { visible: true });
  await page.$eval("#mp-name", (input) => { input.value = ""; });
  await page.type("#mp-name", name);
  await page.$eval("#mp-name-ok", (button) => button.click());
  try {
    await page.waitForFunction(() => Multiplayer.session && Multiplayer.session.pid, { timeout: 10000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      hasSession: !!Multiplayer.session,
      pid: Multiplayer.session && Multiplayer.session.pid,
      socketState: Multiplayer.session && Multiplayer.session.socket && Multiplayer.session.socket.readyState,
      errorBanner: document.getElementById("err-banner")?.textContent || "",
      toasts: [...document.querySelectorAll(".toast")].map((x) => x.textContent),
    }));
    throw new Error(`room connection timed out: ${JSON.stringify(state)}\n${error.message}`);
  }
}
async function clickText(page, selector, text) {
  const clicked = await page.$$eval(selector, (nodes, wanted) => {
    const node = nodes.find((n) => n.textContent.trim().includes(wanted));
    if (!node) return false;
    node.click();
    return true;
  }, text);
  if (!clicked) {
    const controls = await page.$$eval(selector, (nodes) => nodes.map((n) => n.textContent.trim()));
    const room = await page.evaluate(() => Multiplayer.session && ({
      isHost: Multiplayer.session.isHost, seat: Multiplayer.session.seat,
      seats: Multiplayer.session.seats, pids: Multiplayer.session.pids,
      roster: Multiplayer.session.roster,
    }));
    throw new Error(`control not found: ${text}; controls=${JSON.stringify(controls)} room=${JSON.stringify(room)}`);
  }
}
async function foundingPayload(page) {
  return page.evaluate(() => {
    const s = Multiplayer.session;
    const seat = s.seat;
    const comic = s.engine.state.display.comics[0];
    const count = s.engine.player(seat).startingPicks.ideas;
    return { seat, comic, ideas: Array(count).fill(CARD_BY_ID[comic].genre) };
  });
}
async function dispatch(page, kind, payload) {
  await page.waitForFunction(() => Multiplayer.session && !Multiplayer.session.syncing);
  const result = await page.evaluate((k, p) => Multiplayer.session.dispatch(k, p), kind, payload);
  if (!result.ok) throw new Error(`dispatch ${kind} failed: ${JSON.stringify(result)}`);
}
async function roomState(page) {
  return page.evaluate(() => ({
    hash: engineHash(UI.engine), seq: Multiplayer.session.seq,
    current: UI.engine.currentPlayerId(), phase: UI.engine.state.phase,
    seat: Multiplayer.session.seat, formerSeat: Multiplayer.session.formerSeat,
    seats: Multiplayer.session.seats.slice(), desynced: Multiplayer.session.desynced,
  }));
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true,
    args: ["--no-sandbox", "--disable-gpu"] });
  const hostContext = await browser.createBrowserContext();
  const guestContext = await browser.createBrowserContext();
  const lateContext = await browser.createBrowserContext();
  let host, guest, late;
  const errors = [];
  const watch = (page, who) => page.on("pageerror", (error) => errors.push(`${who}: ${error}`));
  try {
    host = await hostContext.newPage(); watch(host, "host");
    await host.goto(URL, { waitUntil: "networkidle0" });
    await host.click("#btn-private-room");
    await enterName(host, "Ada");
    const room = await host.evaluate(() => Multiplayer.session.room);
    const roomUrl = URL + "?room=" + room;
    check(/^[A-Z2-9]{8}$/.test(room), "host receives a high-entropy shareable room code");

    guest = await guestContext.newPage(); watch(guest, "guest");
    await guest.goto(roomUrl, { waitUntil: "networkidle0" });
    await enterName(guest, "Grace");
    await host.waitForFunction(() => Multiplayer.session.cfg &&
      Multiplayer.session.cfg.seats.filter((s) => s.kind === "human").length === 2);
    check(true, "guest joins and auto-fills the next desk");

    await clickText(host, ".mp-invite button", "LOCK TABLE");
    await host.waitForFunction(() => Multiplayer.session.roster && Multiplayer.session.roster.locked === true);
    late = await lateContext.newPage(); watch(late, "locked visitor");
    await late.goto(roomUrl, { waitUntil: "networkidle0" });
    await late.waitForSelector("#mp-name", { visible: true });
    await late.type("#mp-name", "Locked Visitor");
    await late.$eval("#mp-name-ok", (button) => button.click());
    await late.waitForFunction(() => document.querySelector("#modal-root h2")?.textContent.includes("TABLE LOCKED"));
    check(true, "host can lock the table while known participants retain access");
    await late.close(); late = null;
    await clickText(host, ".mp-invite button", "UNLOCK TABLE");
    await host.waitForFunction(() => Multiplayer.session.roster && Multiplayer.session.roster.locked === false);

    // Keep the default three seats and explicitly fill the last one with a bot.
    await clickText(host, ".mp-seat button", "+ BOT");
    await host.waitForFunction(() => Multiplayer.session.cfg &&
      Multiplayer.session.cfg.seats.length === 3 && !Multiplayer.session.cfg.seats.some((s) => s.kind === "open"));
    await host.waitForFunction(() => {
      const b = [...document.querySelectorAll(".mp-foot button")].find((x) => x.textContent.includes("OPEN THE NEWSROOM"));
      return b && !b.disabled;
    });
    await clickText(host, ".mp-foot button", "OPEN THE NEWSROOM");
    await Promise.all([host.waitForFunction(() => UI.mode === "multiplayer" && UI.engine),
      guest.waitForFunction(() => UI.mode === "multiplayer" && UI.engine)]);
    check(true, "both browsers enter the same three-seat game");

    const hp = await foundingPayload(host);
    await dispatch(host, "starting_picks", { comic: hp.comic, ideas: hp.ideas });
    await guest.waitForFunction(() => UI.engine.currentPlayerId() === Multiplayer.session.seat);
    const gp = await foundingPayload(guest);
    await dispatch(guest, "starting_picks", { comic: gp.comic, ideas: gp.ideas });
    await Promise.all([host.waitForFunction(() => UI.engine.state.phase === "actions"),
      guest.waitForFunction(() => UI.engine.state.phase === "actions")]);
    let hs = await roomState(host), gs = await roomState(guest);
    check(hs.hash === gs.hash && !hs.desynced && !gs.desynced,
      "founding plus the bot's setup remain hash-identical");

    await dispatch(host, "action_royalties", {});
    await guest.waitForFunction(() => UI.engine.currentPlayerId() === Multiplayer.session.seat);
    await dispatch(guest, "action_royalties", {});
    await host.waitForFunction(() => UI.engine.currentPlayerId() === Multiplayer.session.seat);
    hs = await roomState(host); gs = await roomState(guest);
    check(hs.hash === gs.hash && hs.current === 0 && !hs.desynced && !gs.desynced,
      "ordered human moves synchronously include the intervening bot turn");

    const guestPid = await guest.evaluate(() => Multiplayer.session.pid);
    await guest.close(); guest = null;
    await host.waitForFunction((pid) => Multiplayer.session.roster &&
      Multiplayer.session.roster.players.some((p) => p.pid === pid && !p.on), {}, guestPid);
    await host.$eval("#btn-room", (button) => button.click());
    await host.waitForSelector(".mp-room-live");
    await clickText(host, ".mp-room-live button", "HAND TO BOT");
    await host.waitForFunction(() => Multiplayer.session.seats[1] === "bot");
    check(true, "host can hand a disconnected desk to a bot");

    guest = await guestContext.newPage(); watch(guest, "returning guest");
    await guest.goto(roomUrl, { waitUntil: "networkidle0" });
    await enterName(guest, "Grace");
    await guest.waitForFunction(() => UI.mode === "multiplayer" && Multiplayer.session.seat === -1 &&
      Multiplayer.session.formerSeat === 1);
    await guest.$eval("#btn-room", (button) => button.click());
    await clickText(guest, ".mp-room-live button", "RESUME MY DESK");
    await guest.waitForFunction(() => Multiplayer.session.seat === 1 && Multiplayer.session.seats[1] === "human");
    await host.waitForFunction(() => Multiplayer.session.seats[1] === "human");
    hs = await roomState(host); gs = await roomState(guest);
    check(hs.hash === gs.hash && !hs.desynced && !gs.desynced,
      "returning player reclaims the desk with the same game state");

    late = await lateContext.newPage(); watch(late, "late joiner");
    await late.goto(roomUrl, { waitUntil: "networkidle0" });
    await enterName(late, "Mina");
    await late.waitForFunction(() => UI.mode === "multiplayer" && Multiplayer.session.seat === -1 &&
      Multiplayer.session.humanId >= 0);
    await late.$eval("#btn-room", (button) => button.click());
    await clickText(late, ".mp-room-live button", "TAKE THIS DESK");
    await late.waitForFunction(() => Multiplayer.session.seat === 2 && Multiplayer.session.seats[2] === "human");
    await host.waitForFunction(() => Multiplayer.session.seats[2] === "human");
    const ls = await roomState(late); hs = await roomState(host);
    check(ls.hash === hs.hash && !ls.desynced,
      "late joiner can render the game and take an automated desk");
    check(errors.length === 0, "no browser reports an uncaught page error");
    console.log("\n10 multiplayer browser checks passed");
  } finally {
    await Promise.allSettled([hostContext.close(), guestContext.close(), lateContext.close()]);
    await browser.close();
  }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
