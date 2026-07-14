// ============================================================================
// AGE OF COMICS — UI core: sprites, components, HUD, chart, dialogue, events
// ============================================================================
"use strict";

// sheet pixel sizes come from the generated atlas (SHEET_SIZES) — never hardcode
const SHEETS = Object.fromEntries(
  Object.entries(SHEET_SIZES).map(([name, sz]) => [name, { file: `assets/${name}.png`, w: sz.w, h: sz.h }]));

const UI = {
  engine: null,
  humanId: 0,
  eventCursor: 0,
  busy: false,
  autoplay: false,
};

// ------------------------------------------------------------------ helpers
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function spr(name, scale = 1, cls = "") {
  const a = ATLAS[name];
  const d = el("div", "spr " + cls);
  if (!a) { d.style.width = "24px"; d.style.height = "24px"; d.style.background = "#f0f"; return d; }
  const sh = SHEETS[a.sheet];
  d.style.width = a.w * scale + "px";
  d.style.height = a.h * scale + "px";
  d.style.backgroundImage = `url(${sh.file})`;
  d.style.backgroundPosition = `${-a.x * scale}px ${-a.y * scale}px`;
  d.style.backgroundSize = `${sh.w * scale}px ${sh.h * scale}px`;
  return d;
}
function sprHTML(name, scale = 1) { return spr(name, scale).outerHTML; }
function genreDot(g) {
  return `<span class="genre-dot" style="background:${GENRE_INFO[g].color}" title="${GENRE_INFO[g].name}"></span>`;
}
function fmtGenre(g) { return `${genreDot(g)} ${GENRE_INFO[g].name}`; }
function P(pid) { return UI.engine.player(pid); }
function isHuman(pid) { return P(pid).human; }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
function pick(arr, rng) { return arr[((rng || Math.random)() * arr.length) | 0]; }

// sprite keys ---------------------------------------------------------------
// comics live as bare covers in the videogame; the card frames stay on decks
function comicSprite(entry) {
  return entry.isRipoff ? "cover_" + entry.sprite : "cover_" + entry.cardId;
}
function coverOf(cardId) { return "cover_" + cardId; }
function faceOf(creativeId) { return "face_" + creativeId; }
function cardSprite(cardId) {
  const c = CARD_BY_ID[cardId];
  return c.kind ? c.sprite : coverOf(cardId);
}
function bossSprite(pid) { return "boss_" + P(pid).color; }

// components ----------------------------------------------------------------
const BONUS_CHIP = {
  // chip backgrounds are darkened variants of the palette so the 8px
  // labels clear WCAG AA against them
  fan:    ["+1 FAN", "#c0392b", "#fff", "Launches with an extra fan"],
  ideas:  ["2 IDEAS", "#33716c", "#fff", "Grants 2 idea tokens of any genre when printed"],
  ticket: ["TICKET", "#c9a26b", "#221d16", "Grants a super-transport ticket when printed"],
  money:  ["+$4", "#f5c86e", "#221d16", "Pays $4 when printed"],
};
function bonusChip(bonus) {
  const [txt, bg, fg, tip] = BONUS_CHIP[bonus];
  return `<span class="chip" style="background:${bg};color:${fg}" title="${tip}">${txt}</span>`;
}
// a comic book: bare cover + genre dot; bonus/fans shown as separate chips
function comicTile(cardId, opts = {}) {
  const card = CARD_BY_ID[cardId];
  const d = el("div", "comic-tile" + (opts.cls ? " " + opts.cls : ""));
  d.appendChild(spr(coverOf(cardId), opts.scale || 1.2));
  const info = el("div", "ct-info");
  info.innerHTML = `<div class="ct-title">${esc(card.title)}</div>` +
    `<div>${genreDot(card.genre)} ${bonusChip(card.bonus)}${opts.extra || ""}</div>`;
  d.appendChild(info);
  if (opts.onpick) d.onclick = () => { SFX.play("click"); opts.onpick(d); };
  if (opts.dimmed) d.classList.add("dimmed");
  attachZoom(d, coverOf(cardId));
  return d;
}
// a creative: caricature face + name + genre + value pips
function personChip(creativeId, opts = {}) {
  const c = CARD_BY_ID[creativeId];
  const d = el("div", "person" + (opts.cls ? " " + opts.cls : ""));
  d.appendChild(spr(faceOf(creativeId), opts.scale || 1.6));
  const info = el("div", "p-info");
  info.innerHTML = `<div class="p-name">${esc(c.name)}</div>` +
    `<div>${genreDot(c.genre)} <span class="p-kind">${c.kind}</span> <b class="p-val">${"&#10022;".repeat(opts.value !== undefined ? opts.value : c.value)}</b>` +
    `${c.value === 1 && !opts.noRookie ? " <span class='chip' style='background:#5ba59f;color:#fff' title='Rookie: comes with a free idea token'>+IDEA</span>" : ""}</div>`;
  d.appendChild(info);
  if (opts.balloon) d.appendChild(el("div", "balloon", opts.balloon));
  if (opts.onpick) d.onclick = () => { SFX.play("click"); opts.onpick(d); };
  if (opts.dimmed) d.classList.add("dimmed");
  attachZoom(d, c.sprite); // hover: the vintage trading card, as a collectible
  return d;
}

// ------------------------------------------------------- accessibility core
// Every interactive element in this UI is a styled <div> with .onclick.
// Rather than converting each creation site, mark them all: keyboard users
// get Enter/Space activation via one delegated handler, and a sweep (kept
// current by a MutationObserver, since scenes rebuild their own DOM) gives
// each clickable element a button role, tab stop, and derived label.
function a11ySweep(root) {
  if (!root) return;
  root.querySelectorAll("*").forEach((d) => {
    if (typeof d.onclick !== "function") return;
    if (d.tagName === "BUTTON" || d.tagName === "A" || d.tagName === "CANVAS" || d.hasAttribute("role")) return;
    d.setAttribute("role", "button");
    d.tabIndex = 0;
    if (!d.getAttribute("aria-label")) {
      const txt = (d.textContent || "").replace(/\s+/g, " ").trim();
      if (txt) d.setAttribute("aria-label", txt.slice(0, 90));
      // the sweep is a safety net: new controls should get an intentional
      // accessible name at their creation site, not inherit raw text
      else console.warn("a11y: interactive element with no accessible name", d);
    }
  });
  root.querySelectorAll(".dimmed, .disabled").forEach((d) => d.setAttribute("aria-disabled", "true"));
}
document.addEventListener("keydown", (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLElement)) return;
  const role = t.getAttribute("role");
  if ((ev.key === "Enter" || ev.key === " ") && (role === "button" || role === "radio")) {
    ev.preventDefault();
    t.click();
    return;
  }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(ev.key)) {
    const group = t.closest('[role="radiogroup"], .choice-group, .card-row');
    if (!group) return;
    const items = [...group.querySelectorAll('[role="radio"], [role="button"], button')].filter((x) => !x.disabled);
    const i = items.indexOf(t);
    if (i < 0) return;
    ev.preventDefault();
    const dir = ev.key === "ArrowRight" || ev.key === "ArrowDown" ? 1 : -1;
    const next = items[(i + dir + items.length) % items.length];
    next.focus();
    if (next.getAttribute("role") === "radio") next.click(); // selection follows focus
  }
});

// polite screen-reader announcements (toasts, banners, errors — not the
// animation feed); replaces content so only the latest message is read
function announce(msg) {
  const r = document.getElementById("aria-status");
  if (r) r.textContent = String(msg).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// scenes rebuild their own DOM on every refresh — keep the sweep current
{
  const mr = document.getElementById("modal-root");
  if (mr) new MutationObserver(() => a11ySweep(mr)).observe(mr, { childList: true, subtree: true });
}

// ------------------------------------------------------------------- modals
let modalOpener = null;
function openModal(build, opts = {}) {
  const root = document.getElementById("modal-root");
  modalOpener = document.activeElement;
  // a dialog takes the stage: any banner still playing yields to it
  document.getElementById("big-banner").classList.remove("show");
  document.querySelectorAll(".fx-celebrate").forEach((node) => node.remove());
  // Hover inspectors live above ordinary UI; dismiss them before a dialog so
  // a stale comic enlargement can never float over the map or a decision.
  const zoom = document.getElementById("zoom-root");
  if (zoom) zoom.style.display = "none";
  document.querySelectorAll(".magnified").forEach((node) => node.classList.remove("magnified"));
  root.innerHTML = "";
  root.classList.add("active");
  const m = el("div", "modal");
  if (opts.width) m.style.width = opts.width;
  build(m);
  root.appendChild(m);
  // dialog semantics + labelled by its heading
  m.setAttribute("role", "dialog");
  m.setAttribute("aria-modal", "true");
  m.tabIndex = -1;
  const h = m.querySelector("h2, h3");
  if (h) { h.id = h.id || "modal-title"; m.setAttribute("aria-labelledby", h.id); }
  a11ySweep(m);
  const focusables = () =>
    [...m.querySelectorAll('button:not([disabled]), [tabindex="0"], [href]')].filter((x) => x.offsetParent !== null);
  (focusables()[0] || m).focus();
  // click on the darkened backdrop = dismiss (only for uncommitted choices);
  // Escape follows the same legality rule
  root.onclick = opts.onDismiss
    ? (ev) => { if (ev.target === root) { SFX.play("paper"); closeModal(); opts.onDismiss(); } }
    : null;
  root.onkeydown = (ev) => {
    if (ev.key === "Escape" && opts.onDismiss) {
      ev.stopPropagation();
      SFX.play("paper");
      closeModal();
      opts.onDismiss();
      return;
    }
    if (ev.key !== "Tab") return; // trap focus inside the dialog
    const items = focusables();
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  };
  SFX.play("paper");
  return m;
}
function closeModal() {
  const root = document.getElementById("modal-root");
  root.classList.remove("active");
  root.onclick = null;
  root.onkeydown = null;
  root.innerHTML = "";
  // restore focus to the opener; screens re-render, so fall back to its
  // re-created twin (same label), then to the location grid
  if (modalOpener && modalOpener.focus) {
    if (document.contains(modalOpener)) modalOpener.focus();
    else {
      const label = modalOpener.getAttribute && modalOpener.getAttribute("aria-label");
      const twin = (label && document.querySelector(`[aria-label="${CSS.escape(label)}"]`)) ||
        document.querySelector('#locations [role="button"]');
      if (twin) twin.focus();
    }
  }
  modalOpener = null;
}
function modalButtons(m, buttons) {
  const bar = el("div", "modal-buttons");
  for (const b of buttons) {
    const btn = el("button", "btn " + (b.cls || ""), b.label);
    btn.onclick = () => { SFX.play("click"); b.fn(btn); };
    if (b.id) btn.id = b.id;
    if (b.disabled) btn.disabled = true;
    bar.appendChild(btn);
  }
  m.appendChild(bar);
  return bar;
}
function sceneBanner(m, action) {
  const info = ACTION_INFO[action];
  const a = ATLAS[info.scene], sh = SHEETS[a.sheet];
  const b = el("div", "scene-banner");
  const scale = 2.2;
  b.style.backgroundImage = `url(${sh.file})`;
  b.style.backgroundPosition = `${-a.x * scale}px ${-(a.y + 10) * scale}px`;
  b.style.backgroundSize = `${sh.w * scale}px ${sh.h * scale}px`;
  b.style.width = Math.round(a.w * scale) + "px";
  b.style.maxWidth = "100%";
  b.style.alignSelf = "center";
  m.appendChild(b);
}

// ------------------------------------------------------------------- toasts
function toast(msg, big = false) {
  const root = document.getElementById("toast-root");
  const t = el("div", "toast" + (big ? " big" : ""), msg);
  root.appendChild(t);
  setTimeout(() => t.remove(), 2600);
  while (root.children.length > 4) root.firstChild.remove();
  announce(msg);
}

// -------------------------------------------------- press wire & the paper
// Two tiers of narration: routine actions arrive as concise BRIEFS off the
// press-wire teleprinter; major beats (cycle open/close, comic debuts,
// mastery changes) get editorialized DAILY SPINNER headlines. Both live in
// the same chronological archive (#dialogue), so nothing is lost.
// speaker-name colors: publisher hues darkened to clear AA on the paper log
// (PUBLISHERS[].dark is tuned for art tinting, not small text)
const BOSS_TEXT = { yellow: "#6f541c", salmon: "#8c4630", teal: "#2f6862", brown: "#5d302e" };
function archiveAppend(node) {
  const box = document.getElementById("dialogue");
  box.appendChild(node);
  box.scrollTop = box.scrollHeight;
  while (box.children.length > 90) box.firstChild.remove();
}
// the newest dispatch feeds off the teleprinter: one short paper advance and
// (rarely) one restrained clack — silent and instant under reduced motion/mute
let wireClackAt = 0;
function wireFeed(html, clack = false) {
  const strip = document.getElementById("wire-latest");
  if (!strip) return;
  strip.innerHTML = html;
  const paper = strip.parentElement;
  if (paper && !REDUCED_MOTION()) {
    paper.classList.remove("feed");
    void paper.offsetWidth;
    paper.classList.add("feed");
  }
  const now = performance.now();
  if (clack && now - wireClackAt > 4000) { wireClackAt = now; SFX.play("wire"); }
}
function say(pid, text, cls = "") {
  const line = el("div", "dlg-line " + (pid === UI.humanId ? "me" : "") + cls);
  if (pid === null) line.innerHTML = `<span class="who" style="color:#5c5346">CITY DESK:</span> ${text}`;
  else {
    const p = P(pid);
    line.innerHTML = `<span class="dlg-face">${sprHTML(bossSprite(pid), 0.5)}</span>` +
      `<span class="who" style="color:${BOSS_TEXT[p.color] || PUBLISHERS[p.color].dark}">${esc(p.name).toUpperCase()}:</span> ${text}`;
  }
  archiveAppend(line);
  wireFeed((pid === null ? "" : `<b>${esc(P(pid).name.split(" ")[0].toUpperCase())}:</b> `) + text);
}
// a major beat: headline + optional deck (subtitle) + publisher quotation
function headline(main, deck = "", quote = "", qpid = null) {
  const h = el("div", "news-head");
  h.innerHTML = `<div class="nh-main">${main}</div>` +
    (deck ? `<div class="nh-deck">${deck}</div>` : "") +
    (quote ? `<div class="nh-quote">&ldquo;${quote}&rdquo;` +
      (qpid !== null ? ` <span class="nh-src">&mdash; ${esc(P(qpid).name)}, ${esc(P(qpid).pubName)}</span>` : "") + `</div>` : "");
  archiveAppend(h);
  wireFeed(`<b>${main}</b>${deck ? " &middot; " + deck : ""}`, true);
}
// a new publishing cycle opens a fresh edition of the paper
function editionMark(round) {
  const ed = el("div", "news-edition");
  ed.innerHTML = `&#9733; THE DAILY SPINNER &#9733;<span>PUBLISHING CYCLE ${["I", "II", "III", "IV", "V"][round - 1] || round} EDITION</span>`;
  archiveAppend(ed);
}
function quip(pid, key, extra = {}) {
  const p = P(pid);
  const tmpl = pick(QUIPS[key] || ["..."]);
  const txt = tmpl.replace("{boss}", esc(p.name)).replace("{pub}", esc(p.pubName))
    .replace("{title}", `<b>${esc(extra.title || "")}</b>`).replace("{names}", esc(extra.names || ""));
  say(pid, txt);
}

// ------------------------------------------------------------- inspecting
// Hover: the item itself magnifies in place; the big art appears docked on
// the OPPOSITE side of the screen so it never hides what you're pointing at.
function attachZoom(elem, spriteName, caption) {
  const zr = document.getElementById("zoom-root");
  elem.addEventListener("mouseenter", (ev) => {
    elem.classList.add("magnified");
    zr.innerHTML = "";
    zr.appendChild(spr(spriteName, 3));
    if (caption) zr.appendChild(el("div", "zoom-cap", caption));
    zr.style.display = "block";
    dock(ev);
  });
  elem.addEventListener("mousemove", dock);
  elem.addEventListener("mouseleave", () => {
    elem.classList.remove("magnified");
    zr.style.display = "none";
  });
  function dock(ev) {
    // the whole UI may be zoomed (fitUI); clientX/Y are real pixels while
    // style.left/top are pre-zoom units, so convert between the two
    const z = parseFloat(document.getElementById("app").style.zoom) || 1;
    const w = (zr.offsetWidth || 74 * 3) * z, h = (zr.offsetHeight || 306) * z;
    const x = ev.clientX < innerWidth / 2 ? innerWidth - w - 24 : 24;
    const y = Math.max(60, Math.min(innerHeight - h - 24, ev.clientY - h / 2));
    zr.style.left = x / z + "px";
    zr.style.top = y / z + "px";
  }
}

// ------------------------------------------------------- turn/round banners
// ------------------------------------------------------------- hero lane
// Central "hero" presentations (banners, celebrations) show one at a time
// and never over an open dialog; a hero that would appear over a dialog is
// summarized in the log instead of being presented late.
const REDUCED_MOTION = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function modalIsOpen() {
  return document.getElementById("modal-root").classList.contains("active");
}
let heroUntil = 0;
function heroSlot(dur) {
  const now = performance.now();
  const wait = Math.max(0, heroUntil - now);
  heroUntil = now + wait + dur;
  return wait;
}
// time until the hero lane is clear — decision dialogs wait for this
function heroRemaining() {
  return Math.max(0, heroUntil - performance.now());
}
function heroToLog(main, sub) {
  say(null, `<b>${main}</b>${sub ? " — " + String(sub).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : ""}`);
}

function showBanner(main, sub = "") {
  announce(main + ". " + sub);
  if (modalIsOpen()) return heroToLog(main, sub);
  const show = () => {
    if (modalIsOpen()) return heroToLog(main, sub); // went stale while queued
    const b = document.getElementById("big-banner");
    b.querySelector(".bb-main").innerHTML = main;
    b.querySelector(".bb-sub").innerHTML = sub;
    b.classList.remove("show");
    void b.offsetWidth; // restart animation
    b.classList.add("show");
    // reduced motion disables the CSS animation that normally hides it
    if (REDUCED_MOTION()) setTimeout(() => b.classList.remove("show"), 1400);
  };
  const wait = heroSlot(1650);
  if (wait) setTimeout(show, wait);
  else show();
}
function setAIStatus(pid) {
  const st = document.getElementById("ai-status");
  if (pid === null || pid === undefined) { st.classList.remove("show"); return; }
  st.innerHTML = `${sprHTML(bossSprite(pid), 0.55)} <span>${esc(P(pid).name)} is working<span class="dots"></span></span>`;
  st.classList.add("show");
}

// =================================================================== RENDER
function renderAll() {
  renderTopbar();
  renderLocations();
  renderChart();
  renderHUD();
}

function renderTopbar() {
  const s = UI.engine.state;
  const cal = document.getElementById("calendar");
  cal.innerHTML = "";
  for (let r = 1; r <= 5; r++) {
    const tile = el("div", "cal-tile" + (r === s.round ? " current" : r > s.round ? " future" : ""));
    const genres = s.calendar[r - 1];
    if (r <= s.round) {
      tile.innerHTML = genres.map((g) => `<span class="genre-dot" style="background:${GENRE_INFO[g].color};width:10px;height:10px"></span>`).join("");
      tile.title = "Round " + r + ": " + genres.map((g) => GENRE_INFO[g].name).join(" + ") + " orders revealed";
    } else {
      tile.textContent = ["I", "II", "III", "IV", "V"][r - 1];
      tile.title = "Round " + r;
    }
    cal.appendChild(tile);
  }
  const undo = document.getElementById("btn-undo");
  if (undo) undo.disabled = !UI.undoSnap || UI.autoplay || s.gameOver;
  const to = document.getElementById("turn-order");
  to.innerHTML = "";
  const curr = UI.engine.currentPlayerId();
  s.turnOrder.forEach((pid) => {
    const p = P(pid);
    const chip = el("div", "order-chip" + (pid === curr && s.phase === "actions" ? " current" : ""));
    chip.dataset.pid = pid; // stable landing pad for AI mastery tokens
    chip.style.background = PUBLISHERS[p.color].color;
    chip.appendChild(spr(bossSprite(pid), 0.42));
    chip.appendChild(el("span", "", `${esc(p.human ? "YOU" : p.name.split(" ")[0])} <b style="font-size:14px">&#9998;${p.editorsLeft}</b>`));
    to.appendChild(chip);
  });
}

function benefitText(action) {
  const e = UI.engine;
  const slot = e.nextSlot(action);
  if (slot < 0) return "FULL";
  switch (action) {
    case "hire": return "writer + artist";
    case "develop": return "new comic";
    case "ideas": return `${IDEAS_SLOTS[slot]}+2 ideas`;
    case "print": return slot === 0 ? "PRINT x2!" : "print";
    case "royalties": return `$${ROYALTIES_SLOTS[slot]}`;
    case "sales": return `${SALES_SLOTS[slot]} order${SALES_SLOTS[slot] === 1 ? "" : "s"}`;
  }
}

const ACTION_HUE = {
  hire: "#4a7fb5", develop: "#8a5a9e", ideas: "#3f8f7a",
  print: "#b5443a", royalties: "#c9973b", sales: "#d97f35",
};
// what's openly available at each location right now (the board's open info)
function offerStrip(action) {
  const e = UI.engine, s = e.state;
  const strip = el("div", "loc-offer");
  const add = (sprite, scale, title) => {
    const d = spr(sprite, scale);
    if (title) d.title = title;
    strip.appendChild(d);
  };
  switch (action) {
    case "hire": {
      // faces WITH the two facts that matter: genre + value
      const mk = (c, kind) => {
        const card = CARD_BY_ID[c];
        const d = el("div", "offer-person");
        d.appendChild(spr(faceOf(c), 1.15));
        d.appendChild(el("span", "op-meta", `${genreDot(card.genre)}<b>${"&#10022;".repeat(card.value)}</b>`));
        d.title = `${card.name} — ${GENRE_INFO[card.genre].name} ${kind} v${card.value}`;
        strip.appendChild(d);
      };
      s.display.writers.forEach((c) => mk(c, "writer"));
      strip.appendChild(el("span", "loc-offer-sep", "&#9998;"));
      s.display.artists.forEach((c) => mk(c, "artist"));
      break;
    }
    case "develop":
      s.display.comics.forEach((c) => {
        const card = CARD_BY_ID[c];
        const d = el("div", "offer-comic");
        d.appendChild(spr(coverOf(c), 0.5));
        d.appendChild(el("span", "oc-dot", genreDot(card.genre)));
        d.title = `${card.title} (${GENRE_INFO[card.genre].name})`;
        strip.appendChild(d);
      });
      break;
    case "ideas":
      // all six shown; taken ones fade instead of vanishing
      GENRES.forEach((g) => {
        const d = spr("idea_" + g, 0.95);
        if (s.boardIdeas[g] > 0) d.title = GENRE_INFO[g].name + " idea on the table";
        else { d.classList.add("taken"); d.title = GENRE_INFO[g].name + " idea already taken (back next round)"; }
        strip.appendChild(d);
      });
      break;
    case "print": {
      const p = P(UI.humanId);
      const w = p.hand.some((c) => CARD_BY_ID[c].kind === "writer");
      const a = p.hand.some((c) => CARD_BY_ID[c].kind === "artist");
      const comic = p.hand.some((c) => !CARD_BY_ID[c].kind) || p.hyped.length > 0;
      strip.innerHTML = `<i>you need:</i> <b style="${w ? "" : "color:#ffd75e"}">writer${w ? " &#10004;" : ""}</b> ` +
        `<b style="${a ? "" : "color:#ffd75e"}">artist${a ? " &#10004;" : ""}</b> ` +
        `<b style="${comic ? "" : "color:#ffd75e"}">comic${comic ? " &#10004;" : ""}</b>`;
      break;
    }
    case "royalties":
      strip.innerHTML = `<i>next desks pay:</i> <b>${ROYALTIES_SLOTS.slice(Math.max(0, e.nextSlot(action)), e.slotsAvailable(action)).map((v) => "$" + v).join(" ")}</b>`;
      break;
    case "sales": {
      const up = s.mapSlots.filter((t) => t.takenBy === null && t.faceUp);
      const down = s.mapSlots.filter((t) => t.takenBy === null && !t.faceUp).length;
      const byGenre = {};
      up.forEach((t) => (byGenre[t.genre] = (byGenre[t.genre] || 0) + 1));
      GENRES.forEach((g) => { if (byGenre[g]) add("gicon_" + g, 0.85, `${byGenre[g]} ${GENRE_INFO[g].name} order${byGenre[g] > 1 ? "s" : ""} face-up`); });
      strip.appendChild(el("span", "", `<i>+${down} hidden</i>`));
      break;
    }
  }
  return strip;
}

function renderLocations() {
  if (typeof UIV2 !== "undefined" && UIV2.active()) return UIV2.renderLocations();
  const e = UI.engine, s = e.state;
  const wrap = document.getElementById("locations");
  const focusedAction = wrap.contains(document.activeElement) ? document.activeElement.dataset.action : null;
  wrap.innerHTML = "";
  const myTurn = s.phase === "actions" && e.currentPlayerId() === UI.humanId && !UI.busy && !s.pending && !s.awaitingSpecial;
  for (const action of ACTIONS) {
    const info = ACTION_INFO[action];
    const canGo = myTurn && e.canAct(UI.humanId, action);
    const loc = el("div", "loc" + (canGo ? "" : " disabled"));
    loc.style.setProperty("--ac", ACTION_HUE[action]);
    // the whole space is a drawn, animated scene (see loc-art.js)
    const cv = document.createElement("canvas");
    cv.className = "loc-scene";
    loc.appendChild(cv);
    LocArt.attach(cv, action);
    // verb marquee
    loc.appendChild(el("div", "loc-verb", info.verb.replace("!", "")));
    // action spaces
    const slots = el("div", "slots");
    const nAvail = e.slotsAvailable(action);
    for (let i = 0; i < nAvail; i++) {
      const pip = el("div", "slot-pip");
      const occ = s.actionSpaces[action][i];
      if (occ !== undefined) pip.appendChild(spr("meeple_" + P(occ).color, 0.9));
      if (action === "print" && i === 0) pip.title = "First editor here may print 2 books";
      slots.appendChild(pip);
    }
    loc.appendChild(slots);
    // special cube badge
    const sp = e.cubeSpecialFor(UI.humanId, action);
    if (sp) loc.appendChild(el("div", "special-badge", "&#9733; " + SPECIALS[sp].name));
    // live "on offer" strip + name plaque + benefit chip
    loc.appendChild(offerStrip(action));
    loc.appendChild(el("div", "loc-name", `<span>${info.name}</span>`));
    loc.appendChild(el("div", "loc-chip", benefitText(action)));
    // keyboard/screen-reader semantics, with the reason when unavailable
    let reason = "";
    if (!myTurn) reason = "waiting for your turn";
    else if (P(UI.humanId).editorsLeft <= 0) reason = "no editors left";
    else if (e.nextSlot(action) < 0) reason = "all spaces taken";
    loc.title = info.desc + (reason ? `\nUnavailable: ${reason}.` : "");
    loc.setAttribute("role", "button");
    loc.tabIndex = 0;
    loc.dataset.action = action;
    loc.setAttribute("aria-label", `${info.name} — ${info.verb}` + (reason ? ` (unavailable: ${reason})` : ""));
    if (!canGo) loc.setAttribute("aria-disabled", "true");
    loc.onclick = () => {
      if (!canGo) { SFX.play("error"); if (reason) toast(`Unavailable: ${reason}.`); return; }
      SFX.play("click");
      Scenes.open(action);
    };
    wrap.appendChild(loc);
  }
  if (focusedAction) {
    const t = wrap.querySelector(`[data-action="${focusedAction}"]`);
    if (t) t.focus();
  }
}

const TRACK_MONEY = { 10: 6, 9: 4, 8: 4, 7: 4, 6: 3, 5: 3, 4: 3, 3: 2, 2: 2, 1: 1 };

function renderChart() {
  const e = UI.engine, s = e.state;
  const panel = document.getElementById("chart-panel");
  panel.innerHTML = "<h3>&#9733; THE COMIC BOOK CHART &#9733;</h3>";
  const order = s.players.map((p) => p.id).sort((a, b) => e.bestComicFans(b) - e.bestComicFans(a));
  // compact summary chip (laptop widths, where the sidebar becomes a drawer)
  const mini = document.getElementById("chart-mini");
  if (mini) {
    const leader = P(order[0]);
    const meRank = order.indexOf(UI.humanId) + 1;
    const sfx = ["", "st", "nd", "rd", "th"][Math.min(meRank, 4)];
    mini.innerHTML = `&#9733; CHART &middot; 1st ${esc(leader.pubName)}${leader.human ? " (YOU)" : ` &middot; you ${meRank}${sfx}`}`;
    mini.setAttribute("aria-label",
      `Open the comic book chart. ${leader.pubName} leads${leader.human ? " (you)" : `, you are ${meRank}${sfx}`}.`);
  }

  const track = el("div", "track");
  track.style.gridTemplateColumns = `30px repeat(${s.players.length}, 1fr)`;
  track.appendChild(el("div", "track-money", "$"));
  for (const pid of order) {
    const p = P(pid);
    const h = el("div", "track-head");
    h.style.background = PUBLISHERS[p.color].color;
    h.appendChild(spr(PUBLISHERS[p.color].logo, 0.55));
    h.title = p.pubName + (p.human ? " (you)" : ` — ${p.name}`);
    track.appendChild(h);
  }
  for (let fans = 10; fans >= 1; fans--) {
    track.appendChild(el("div", "track-money", `<span>$${TRACK_MONEY[fans]}</span><b>${fans}</b>`));
    for (const pid of order) {
      const cell = el("div", "track-cell");
      cell.style.background = fans % 2 ? "" : PUBLISHERS[P(pid).color].color + "33";
      const best = e.bestComicFans(pid);
      const comics = s.chart.filter((c) => c.owner === pid && Math.min(10, c.fans) === fans && c.fans >= 1);
      for (const c of comics) {
        const cc = el("div", "track-tile" + (c.isRipoff ? " ripoff" : ""));
        cc.appendChild(spr(comicSprite(c), 0.3));
        if (c.fans > 10) cc.appendChild(el("div", "over-badge", "+" + (c.fans - 10)));
        if (c.fans === best) cc.classList.add("best");
        cc.title = `${c.title}${c.isRipoff ? " (RIP-OFF)" : ""} — ${c.fans} fans, value ${c.value}` +
          (c.fans === best ? " — chart leader for this house" : "");
        attachZoom(cc, comicSprite(c),
          `<b>${esc(c.title)}</b><br>${genreDot(c.genre)} v${c.value} &middot; ${c.fans}&#9829; &middot; ${esc(P(c.owner).pubName)}`);
        cell.appendChild(cc);
      }
      track.appendChild(cell);
    }
  }
  panel.appendChild(track);
  const offChart = s.chart.filter((c) => c.fans < 1);
  if (offChart.length)
    panel.appendChild(el("div", "modal-sub", `<span style="color:#9aa;font-size:15px">off-chart: ${offChart.map((c) => esc(c.title)).join(" &middot; ")}</span>`));

  for (const pid of order) {
    const p = P(pid);
    const pub = PUBLISHERS[p.color];
    const cp = el("div", "chart-player");
    const head = el("div", "cp-head");
    head.style.background = pub.color;
    head.appendChild(spr(bossSprite(pid), 0.55));
    head.appendChild(el("span", "", esc(p.human ? p.pubName + " (YOU)" : p.pubName)));
    head.appendChild(el("span", "money", `$${p.money}&nbsp; &#9733;${p.vpTokens}`));
    cp.appendChild(head);
    const badges = el("div", "cp-badges");
    GENRES.forEach((g) => {
      if (s.mastery[g] === pid) {
        const b = spr("mastery_" + g, 0.55);
        b.title = GENRE_INFO[g].name + " Mastery (+1 fan per book of the genre, 2 VP)";
        badges.appendChild(b);
      }
    });
    for (let i = 0; i < p.tickets; i++) badges.appendChild(spr("ticket", 0.5));
    badges.appendChild(el("span", "", `<span style="font-size:15px">&#128218; ${p.printedCount} printed</span>`));
    cp.appendChild(badges);
    panel.appendChild(cp);
  }
  // cafe table supply
  const sup = el("div", "chart-player");
  sup.appendChild(el("div", "cp-head", "<span style='font-size:15px'>CAFE TABLE (ideas)</span>"));
  const row = el("div", "chart-comics");
  GENRES.forEach((g) => {
    const t = spr("idea_" + g, 0.8);
    if (s.boardIdeas[g] > 0) t.title = GENRE_INFO[g].name + " idea available at Cafe Bizarre";
    else {
      t.style.cssText = "opacity:.25;filter:grayscale(1)";
      t.title = GENRE_INFO[g].name + " idea taken this round";
    }
    row.appendChild(t);
  });
  sup.appendChild(row);
  panel.appendChild(sup);
}

function renderHUD() {
  const e = UI.engine, s = e.state;
  const p = P(UI.humanId);
  const compactDesk = typeof UIV2 !== "undefined" && UIV2.active();
  // publisher desk: stable resource sockets (dim at zero, never vanishing —
  // a persistent home the eye can always return to)
  const res = document.getElementById("hud-resources");
  res.innerHTML = "";
  const chip = (parent, sprite, scale, html, title, dim = false) => {
    const r = el("span", "res" + (dim ? " dim" : ""));
    r.appendChild(spr(sprite, scale));
    r.innerHTML += html;
    if (title) r.title = title;
    parent.appendChild(r);
    return r;
  };
  chip(res, "coin_1", compactDesk ? 0.55 : 0.9, ` <b>$${p.money}</b>`, "Cash");
  chip(res, "meeple_" + p.color, compactDesk ? 0.62 : 1, ` <b>x${p.editorsLeft}</b>`, "Editors left this round");
  chip(res, "vp_1", compactDesk ? 0.44 : 0.65, ` <b>${p.vpTokens}</b>`, "Victory point tokens", p.vpTokens === 0);
  chip(res, "ticket", compactDesk ? 0.4 : 0.6, `<b>${p.tickets}</b>`, "Super-transport tickets", p.tickets === 0);
  GENRES.forEach((g) =>
    chip(res, "idea_" + g, compactDesk ? 0.5 : 0.75, `<b>${p.ideas[g]}</b>`, GENRE_INFO[g].name + " ideas", p.ideas[g] === 0));

  // collected orders: shown openly so you always know what you must deliver
  const ord = document.getElementById("desk-orders");
  ord.innerHTML = "";
  if (!p.orders.length) ord.innerHTML = "<i>no orders collected yet</i>";
  for (const oid of p.orders) {
    const o = s.mapSlots[oid];
    const r = el("span", "res");
    r.style.cssText = o.fulfilled ? "opacity:.55" : "";
    r.appendChild(spr("gicon_" + o.genre, 0.6));
    r.innerHTML += o.fulfilled
      ? ` <b style="color:#7ab648">&#10004;+${o.fans}</b>`
      : ` <b>${o.minVal}+&rarr;${o.fans}&#9829;</b>`;
    r.title = o.fulfilled
      ? `${GENRE_INFO[o.genre].name} order delivered (+${o.fans} fans)`
      : `${GENRE_INFO[o.genre].name} order: delivers by itself once you own a ${GENRE_INFO[o.genre].name} book of value ${o.minVal}+ (then +${o.fans} fans). Undelivered = -${o.fans} VP at the end!`;
    ord.appendChild(r);
  }

  // awards shelf: one persistent socket per genre — mastery tokens land
  // here and STAY visible (this is also the fly-to destination)
  const aw = document.getElementById("desk-awards");
  aw.innerHTML = "";
  GENRES.forEach((g) => {
    const holder = s.mastery[g];
    const sock = el("span", "award-socket" + (holder === UI.humanId ? " won" : ""));
    sock.dataset.genre = g;
    if (holder === UI.humanId) {
      sock.appendChild(spr("mastery_" + g, 0.55));
      sock.title = GENRE_INFO[g].name + " Mastery: +1 fan per book of the genre, 2 VP";
    } else {
      sock.innerHTML = `<span style="opacity:.5">${genreDot(g)}</span>`;
      sock.title = GENRE_INFO[g].name + " Mastery — " +
        (holder === undefined || holder === null ? "unclaimed" : `held by ${P(holder).pubName}`);
    }
    aw.appendChild(sock);
  });

  // newsroom: every printed comic with the team working on it
  const mat = document.getElementById("hud-mat");
  mat.innerHTML = "<div class='mat-plate'>&#9733; THE NEWSROOM &#9733;</div>";
  s.chart.filter((c) => c.owner === UI.humanId).forEach((c) => {
    const d = el("div", "press-item" + (c.isRipoff ? " ripoff" : ""));
    d.dataset.chartIdx = c.idx;
    d.setAttribute("role", "group");
    d.setAttribute("aria-label", `${c.title}${c.isRipoff ? " (rip-off)" : ""}: value ${c.value}, ${c.fans} fans`);
    if (c.idx === UI.lastPrintIdx) d.appendChild(el("div", "new-tag", "NEW!"));
    const cover = el("div", "pi-cover");
    cover.appendChild(spr(comicSprite(c), 0.66));
    cover.appendChild(el("div", "fans-badge", `${c.fans}&#9829;`));
    cover.appendChild(el("div", "pi-genre", genreDot(c.genre)));
    d.appendChild(cover);
    // the current total value, unmistakable and always up to date
    const vp = el("div", "val-plate", "VALUE " + c.value);
    vp.dataset.val = c.value;
    d.appendChild(vp);
    const team = el("div", "pi-team");
    for (const kind of ["writer", "artist"]) {
      const cr = c.creatives[kind];
      const mCr = el("div", "pi-cr" + (cr.genre === c.genre ? " spec" : ""));
      mCr.appendChild(spr(faceOf(cr.id), 0.85));
      mCr.appendChild(el("span", "pi-val", `${genreDot(cr.genre)}<b>${"&#10022;".repeat(cr.curValue)}</b>`));
      // hover: their vintage trading card, like everywhere else
      attachZoom(mCr, CARD_BY_ID[cr.id].sprite,
        `<b>${esc(cr.name)}</b><br>${genreDot(cr.genre)} ${GENRE_INFO[cr.genre].name} ${kind} &middot; v${cr.curValue}` +
        (cr.genre === c.genre ? `<br><span class="zc-note">&#9733; specialized: +1 fan at print, can train</span>` : ""));
      team.appendChild(mCr);
    }
    d.appendChild(team);
    attachZoom(cover, comicSprite(c),
      `<b>${esc(c.title)}</b>${c.isRipoff ? " (RIP-OFF)" : ""}<br>` +
      `${genreDot(c.genre)} <b>${GENRE_INFO[c.genre].name}</b> &middot; book value <b>v${c.value}</b> &middot; ${c.fans}&#9829;<br>` +
      `<span class="zc-note">fulfills ${GENRE_INFO[c.genre].name} orders up to min. value ${c.value}</span>`);
    mat.appendChild(d);
  });
  const nP = p.printedCount;
  const nxt = nP < 1 ? "" : nP >= 6 ? "" : ["", "2nd unlocks specials", "3rd: Better Colors", "4th: Marketing/Editor", "5th: move a cube +VP", "6th+: +2 VP each"][nP] || "";
  if (nxt) mat.appendChild(el("span", "", `<i style="font-size:14px;color:#9aa;flex-shrink:0">&larr; ${nxt}</i>`));
  updateMatNav();

  // hand: comics as covers, creatives as people
  const hand = document.getElementById("hud-hand");
  hand.innerHTML = "";
  const entries = p.hand.map((c) => ({ id: c, hyped: false }))
    .concat(p.hyped.map((h) => ({ id: h.cardId, hyped: true, tokens: h.tokens })));
  for (const c of entries) {
    const card = CARD_BY_ID[c.id];
    const hc = el("div", "hand-card");
    if (card.kind) {
      hc.appendChild(personChip(c.id, { scale: 1.3 }));
    } else {
      const ct = el("div", "hand-comic");
      ct.appendChild(spr(coverOf(c.id), 0.9));
      ct.appendChild(el("div", "hc-chips", `${genreDot(card.genre)}${bonusChip(card.bonus)}`));
      hc.appendChild(ct);
      hc.title = `${card.title} — ${GENRE_INFO[card.genre].name}. Needs 2 ${GENRE_INFO[card.genre].name} ideas + a team to print.`;
      attachZoom(hc, coverOf(c.id));
    }
    if (c.hyped) hc.appendChild(el("div", "hype-badge", "HYPE +" + c.tokens * 2));
    hand.appendChild(hc);
  }
  if (!entries.length) hand.innerHTML = "<i style='color:#9aa'>your desk is empty</i>";
  if (compactDesk) UIV2.afterRender();
}

// the newsroom shelf can outgrow its column: show the nudge buttons whenever
// it actually scrolls (the rail is styled visible too — never a hidden one)
function updateMatNav() {
  const mat = document.getElementById("hud-mat"), nav = document.getElementById("mat-nav");
  if (!mat || !nav) return;
  requestAnimationFrame(() => { nav.hidden = mat.scrollWidth <= mat.clientWidth + 4; });
}

// ======================================================== EVENT ANIMATION
function flushEvents() {
  const e = UI.engine;
  let delay = 0;
  while (UI.eventCursor < e.events.length) {
    const ev = e.events[UI.eventCursor++];
    delay = Math.max(delay, animateEvent(ev));
  }
  return delay;
}
function animateEvent(ev) {
  const e = UI.engine;
  switch (ev.type) {
    case "roundStart": {
      const genres = UI.engine.state.calendar[ev.round - 1];
      showBanner(`ROUND ${["I", "II", "III", "IV", "V"][ev.round - 1]}`,
        `${genres.map((g) => GENRE_INFO[g].name).join(" & ")} orders hit the newsstands`);
      SFX.play("fanfare");
      return 900;
    }
    case "calendar":
      editionMark(ev.round);
      headline(`A NEW PUBLISHING CYCLE BEGINS`,
        `<b>${ev.genres.map((g) => GENRE_INFO[g].name).join(" & ")}</b> orders flip face-up across Manhattan`);
      return 300;
    case "hire": {
      const names = ev.cards.map((c) => CARD_BY_ID[c].name).join(" & ");
      if (ev.player !== UI.humanId) quip(ev.player, "hire", { names });
      else toast(`${ev.cards.map((c) => sprHTML(faceOf(c), 0.7)).join("")} Signed: <b>${esc(names)}</b>`);
      SFX.play("click");
      return 500;
    }
    case "develop":
      if (ev.player !== UI.humanId) quip(ev.player, "develop");
      else if (ev.cardId) toast(`${sprHTML(coverOf(ev.cardId), 0.5)} ${ev.searched ? "Commissioned" : "Optioned"}: <b>${esc(CARD_BY_ID[ev.cardId].title)}</b>`);
      else toast("The slush pile came up empty!");
      SFX.play("paper");
      return 450;
    case "ideas":
      if (ev.player !== UI.humanId) quip(ev.player, "ideas");
      else {
        const all = (ev.board || []).concat(ev.supply || []);
        toast(`Brainstormed: ${all.map((g) => sprHTML("idea_" + g, 0.6)).join("")}`);
      }
      return 400;
    case "royalties":
      say(ev.player, ev.player === UI.humanId ? `Collected <b>$${ev.amount}</b> in royalties.` : `${esc(P(ev.player).pubName)} collects <b>$${ev.amount}</b>.`);
      if (ev.player === UI.humanId) FX.burstEl(document.getElementById("hud-resources"), ["#f5c86e", "#c9973b", "#fff"], 12);
      SFX.play("cash");
      return 450;
    case "print": {
      // a comic debut is front-page news: headline + the publisher's quote
      {
        const p = P(ev.player);
        const quote = pick(QUIPS[ev.isRipoff ? "print_rip" : "print_orig"] || ["..."])
          .replace("{boss}", esc(p.name)).replace("{pub}", esc(p.pubName))
          .replace("{title}", `<b>${esc(ev.title)}</b>`).replace("{names}", "");
        headline(
          ev.isRipoff ? `${esc(ev.title).toUpperCase()} MUSCLES ONTO THE STANDS` : `${esc(ev.title).toUpperCase()} DEBUTS!`,
          `${esc(p.pubName)} prints a ${GENRE_INFO[ev.genre].name}${ev.isRipoff ? " rip-off" : " original"} &mdash; ${ev.fans} fan${ev.fans === 1 ? "" : "s"} at the debut`,
          quote, ev.player);
      }
      const sprite = comicSprite(e.state.chart[ev.chartIdx]);
      const mine = ev.player === UI.humanId;
      if (mine) UI.lastPrintIdx = ev.chartIdx;
      FX.celebrate({
        sprite, scale: mine ? 2.4 : 1.8,
        title: mine ? "HOT OFF THE PRESS!" : `${esc(P(ev.player).pubName).toUpperCase()} PRINTS!`,
        sub: `<b>${esc(ev.title)}</b> ${ev.isRipoff ? "(RIP-OFF) " : ""}debuts with ${ev.fans} fan${ev.fans === 1 ? "" : "s"}`,
        hue: PUBLISHERS[P(ev.player).color].color + "44",
        dur: mine ? 1900 : 1400,
      });
      setTimeout(() => FX.flyToChart(sprite, mine ? 1 : 0.8), mine ? 1300 : 950);
      SFX.play("print");
      setTimeout(() => SFX.play(mine ? "tada" : "fan"), 350);
      return mine ? 2000 : 1500;
    }
    case "mastery": {
      headline(
        ev.prev === undefined || ev.prev === null
          ? `${GENRE_INFO[ev.genre].name.toUpperCase()} MASTERY CLAIMED ${sprHTML("mastery_" + ev.genre, 0.5)}`
          : `${GENRE_INFO[ev.genre].name.toUpperCase()} MASTERY CHANGES HANDS ${sprHTML("mastery_" + ev.genre, 0.5)}`,
        `<b>${esc(P(ev.player).pubName)}</b> now rules the genre` +
          (ev.prev !== undefined && ev.prev !== null ? `, wresting it from ${esc(P(ev.prev).pubName)}` : ""));
      // how long the celebration will wait in the hero lane — the token
      // flight below launches relative to when it actually shows
      const queueWait = heroRemaining();
      FX.celebrate({
        sprite: "mastery_" + ev.genre, scale: 2,
        title: `${GENRE_INFO[ev.genre].name.toUpperCase()} MASTERY!`,
        sub: ev.player === UI.humanId
          ? "You rule the genre: +1 fan on every book of it, 2 VP"
          : `<b>${esc(P(ev.player).pubName)}</b> now rules the genre` +
            (ev.prev === UI.humanId ? " — <b style='color:#a00'>you lost it!</b>" : ""),
        hue: ev.prev === UI.humanId ? "rgba(217,79,67,.3)" : undefined,
        dur: 1800,
      });
      // after the celebration, the token visibly travels to its persistent
      // home: your awards shelf, or the rival's turn-order chip. When it
      // changes hands it launches from the previous owner's spot.
      {
        const g = ev.genre;
        const hasPrev = ev.prev !== undefined && ev.prev !== null;
        const destFor = (pid) => pid === UI.humanId
          ? document.querySelector(`#desk-awards .award-socket[data-genre="${g}"]`)
          : document.querySelector(`#turn-order .order-chip[data-pid="${pid}"]`);
        setTimeout(() => FX.flyToken("mastery_" + g, hasPrev ? destFor(ev.prev) : null, () => destFor(ev.player)),
          REDUCED_MOTION() ? 0 : queueWait + 1250);
        announce(`${P(ev.player).pubName} ${hasPrev ? "takes" : "claims"} ${GENRE_INFO[g].name} mastery` +
          (hasPrev ? ` from ${P(ev.prev).pubName}` : "") + ".");
      }
      SFX.play(ev.prev === UI.humanId ? "womp" : "tada");
      return 1600;
    }
    case "fans":
      if (ev.delta > 0 && (ev.source === "order" || ev.source === "marketing" || ev.source === "wordofmouth")) SFX.play("fan");
      return 120;
    case "orderFulfilled":
      say(null, `${esc(P(ev.player).pubName)} fulfills a ${GENRE_INFO[ev.genre].name} order: <b>+${ev.fans} fans</b>.`);
      if (ev.player === UI.humanId) {
        toast(`&#128220; ORDER DELIVERED! +${ev.fans} fan${ev.fans === 1 ? "" : "s"}`, true);
        FX.burstEl(document.getElementById("chart-panel"), ["#d94f43", "#f5c86e", "#fff"], 14);
      }
      SFX.play("fan");
      return 500;
    case "gainIdea":
      if (ev.from === "rookie") {
        if (ev.player === UI.humanId) {
          toast(`ROOKIE BONUS! ${sprHTML("idea_" + ev.genre, 0.8)} free <b>${GENRE_INFO[ev.genre].name}</b> idea!`, true);
          FX.burstEl(document.getElementById("hud-resources"), [GENRE_INFO[ev.genre].color, "#f5c86e", "#fff"], 14);
          SFX.play("fan");
        } else {
          say(ev.player, `Our rookie brings a fresh ${GENRE_INFO[ev.genre].name} idea!`);
        }
        return 600;
      }
      return 120;
    case "flip": SFX.play("paper"); return 250;
    case "collect":
      if (ev.player !== UI.humanId) say(ev.player, `Snagged a ${GENRE_INFO[ev.genre].name} order (val ${ev.minVal}+, +${ev.fans} fans).`);
      else toast(`${sprHTML("gicon_" + ev.genre, 0.7)} Order secured: needs a <b>${GENRE_INFO[ev.genre].name}</b> book of value <b>${ev.minVal}+</b> &rarr; +${ev.fans} fans (delivers by itself)`);
      SFX.play("stamp");
      return 350;
    case "agentMove": SFX.play(ev.ticket ? "cab" : "walk"); return 200;
    case "cab": SFX.play("cab"); return 120;
    case "occupancyFee":
      say(null, `${esc(P(ev.from).pubName)} pays $2 to ${esc(P(ev.to).pubName)} for crowding their corner.`);
      SFX.play("coin");
      return 350;
    case "hypeStart":
      say(ev.player, `We're building HYPE for <b>${esc(ev.title)}</b>...`);
      return 350;
    case "bettercolor":
      say(ev.player, `<b>${esc(ev.title)}</b> gets the deluxe four-color treatment!`);
      return 350;
    case "marketing":
      say(ev.player, `Marketing blitz! $${ev.spend} buys ${ev.fans} fan${ev.fans === 1 ? "" : "s"}.`);
      SFX.play("cash");
      return 400;
    case "extraEditor":
      say(ev.player, `Overtime! An extra editor joins this round.`);
      return 350;
    case "cubePlaced":
      say(null, `${esc(P(ev.player).pubName)} unlocks the <b>${SPECIALS[ev.special].name}</b> special action.`);
      return 400;
    case "increase":
      say(ev.player, `${ev.mode === "learn" ? "Mentorship" : "Training"}: a creative on <b>${esc(ev.title)}</b> rises to value ${ev.newValue}.`);
      return 350;
    case "reshuffle": return 100;
    case "pass":
      say(ev.player, "Nothing left to do this round.");
      return 250;
    case "roundEnd": {
      const lead = ev.rankInfo[0];
      const lines = ev.rankInfo.map((r) => `${r.place}. ${esc(P(r.player).pubName)} (${r.best >= 0 ? r.best + " fans" : "no comics"}) ${r.vp ? "+" + r.vp + " VP" : ""}`).join(" &middot; ");
      headline(`CYCLE ${["I", "II", "III", "IV", "V"][ev.round - 1] || ev.round} CLOSES: ${esc(P(lead.player).pubName).toUpperCase()} ON TOP`, lines);
      ev.pay.forEach((pp) => { if (pp.amount) say(null, `${esc(P(pp.player).pubName)} earns <b>$${pp.amount}</b> from the chart.`); });
      SFX.play("fanfare");
      return 1200;
    }
    case "turn":
      renderAll();
      return 150;
    case "gameOver":
      headline("FINAL EDITION: THE GOLDEN AGE HAS ITS OWNER", "The presses stop &mdash; final standings inside");
      FX.confetti(3000);
      return 100;
  }
  return 100;
}
