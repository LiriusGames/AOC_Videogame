// ============================================================================
// AGE OF COMICS — UI core: sprites, components, HUD, chart, dialogue, events
// ============================================================================
"use strict";

// sheet pixel sizes come from the generated atlas (SHEET_SIZES) — never hardcode
const SHEETS = Object.fromEntries(
  Object.entries(SHEET_SIZES).map(([name, sz]) => [name, { file: `assets/${name}.${sz.ext || "png"}`, w: sz.w, h: sz.h }]));

const UI = {
  engine: null,
  humanId: 0,
  eventCursor: 0,
  busy: false,
  autoplay: false,
  // map animation pace: the cab ride is worth watching by default; players
  // in a hurry flip this in the sales run (persisted)
  animFast: (() => { try { return !!localStorage.getItem("aoc-anim-fast"); } catch (_e) { return false; } })(),
};

// ------------------------------------------------------------------ helpers
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
// print-era resolution rule: when the atlas carries an HD twin (hd_ prefix,
// unquantized master), spr() serves it automatically — rescaled to the pixel
// sprite's exact footprint, so no call site changes. The big/sm mips of a
// family (facebig_, bossbig_, bosssm_, mysterybig_) share the base master.
const HD_BASE = [[/^facebig_/, "face_"], [/^mysterybig_/, "mystery_"], [/^boss(?:big|sm)_/, "boss_"]];
function hdTwin(name) {
  if (ATLAS["hd_" + name]) return "hd_" + name;
  for (const [re, base] of HD_BASE) {
    if (re.test(name)) {
      const k = "hd_" + name.replace(re, base);
      if (ATLAS[k]) return k;
    }
  }
  return null;
}
function spr(name, scale = 1, cls = "") {
  let a = ATLAS[name];
  if (a) {
    const hd = hdTwin(name);
    if (hd) {
      scale = scale * (a.w / ATLAS[hd].w);
      a = ATLAS[hd];
    }
    if (hd || name.startsWith("hd_")) cls = "spr-hd" + (cls ? " " + cls : "");
  }
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
// spr() now auto-serves HD twins everywhere; sprHD stays as an alias for the
// call sites written during pass 1.
function sprHD(name, scale = 1, cls = "") { return spr(name, scale, cls); }
function sprHDHTML(name, scale = 1) { return spr(name, scale).outerHTML; }
function genreDot(g) {
  return `<span class="genre-dot" style="background:${GENRE_INFO[g].color}" title="${GENRE_INFO[g].name}"></span>`;
}
// the user-drawn genre symbol (gun/heart/boot/…) — reads at a glance where
// the little color dot needed squinting
function genreMark(g, scale = 0.6) {
  return `<span class="genre-mark" title="${GENRE_INFO[g].name}">${sprHTML("genreicon_" + g, scale)}</span>`;
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
// the high-res twin for any use ≥ ~50px on screen (panels, reveals, zooms)
function faceBigOf(creativeId) { return "facebig_" + creativeId; }
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
  d.style.setProperty("--gc", GENRE_INFO[card.genre].color); // genre top band
  d.appendChild(sprHD(coverOf(cardId), opts.scale || 1.2));
  const info = el("div", "ct-info");
  info.innerHTML = `<div class="ct-title">${esc(card.title)}</div>` +
    `<div>${genreMark(card.genre)} ${bonusChip(card.bonus)}${opts.extra || ""}</div>`;
  d.appendChild(info);
  if (opts.onpick) d.onclick = () => { SFX.play("click"); opts.onpick(d); };
  if (opts.dimmed) d.classList.add("dimmed");
  attachZoom(d, coverOf(cardId));
  return d;
}
// (creatives render via personFigure — the panel-system person; the old
// paper-framed personChip is gone with the de-carding)

// ------------------------------------------------------------ panel system
// Every action dialog shares one anatomy: a vignette-emblem header (title +
// tagline), labeled sections (ON OFFER / YOUR PICK / …), a COST & RESULT
// live footer, and the common button bar (modalButtons).
function panelHead(m, action, title, tagline) {
  const h = el("div", "panel-head");
  const em = el("div", "ph-emblem");
  // print-era: the emblem is the full line-art vignette when the HD sheet
  // carries it (browser downscale beats the quantized 120px plate)
  const key = ATLAS["hd_vig_" + action] ? "hd_vig_" + action : "vig_" + action;
  const a = ATLAS[key];
  em.appendChild(spr(key, Math.min(112 / a.w, 84 / a.h), key.startsWith("hd_") ? "spr-hd" : ""));
  h.appendChild(em);
  const t = el("div", "ph-text");
  t.appendChild(el("h2", "", title));
  if (tagline) t.appendChild(el("div", "ph-tag", tagline));
  h.appendChild(t);
  m.appendChild(h);
  return h;
}
function panelSection(m, label, cls = "") {
  const s = el("div", "panel-section" + (cls ? " " + cls : ""));
  if (label) s.appendChild(el("div", "ps-label", label));
  const body = el("div", "ps-body");
  s.appendChild(body);
  m.appendChild(s);
  return body;
}
// the live cost&benefit strip — a COST & RESULT section whose text follows
// the current selection (aria-live keeps screen readers in the loop)
function panelFooter(m) {
  const body = panelSection(m, "COST &amp; RESULT", "panel-costs");
  const f = el("div", "panel-footer");
  f.setAttribute("aria-live", "polite");
  body.appendChild(f);
  return f;
}
// a creative is a PERSON, not a card: face + name + trade tag + genre icon
// + value stars, standing free — no paper frame
function personFigure(creativeId, opts = {}) {
  const c = CARD_BY_ID[creativeId];
  const d = el("div", "figure" + (opts.cls ? " " + opts.cls : ""));
  const face = el("div", "fig-face");
  face.appendChild(spr(faceBigOf(creativeId), opts.scale || 1)); // 56px native
  d.appendChild(face);
  d.appendChild(el("div", "fig-name", esc(c.name)));
  const meta = el("div", "fig-meta");
  meta.appendChild(spr("tag_" + c.kind, 0.7));
  meta.appendChild(spr("genreicon_" + c.genre, 0.8));
  meta.appendChild(el("b", "fig-val", "&#10022;".repeat(opts.value !== undefined ? opts.value : c.value)));
  d.appendChild(meta);
  if (c.value === 1 && !opts.noRookie)
    d.appendChild(el("div", "fig-extra", `<span class="chip" style="background:#33716c;color:#fff">+IDEA</span> rookie`));
  if (opts.extra) d.appendChild(el("div", "fig-extra", opts.extra));
  d.setAttribute("aria-label", `${c.name} — ${GENRE_INFO[c.genre].name} ${c.kind}, value ${c.value}` +
    (c.value === 1 && !opts.noRookie ? ", rookie: signs with a free idea" : ""));
  if (opts.balloon) d.appendChild(el("div", "balloon", opts.balloon));
  if (opts.onpick) d.onclick = () => { SFX.play("click"); opts.onpick(d); };
  if (opts.dimmed) d.classList.add("dimmed");
  // hover: the face up close + the facts — no trading card at runtime
  attachZoom(d, faceBigOf(creativeId),
    `<b>${esc(c.name)}</b><br>${GENRE_INFO[c.genre].name} ${c.kind} &middot; ${"&#10022;".repeat(c.value)}`);
  return d;
}
// a blind deck draw: the same cream disc as every real face, holding the
// generic trade tools (baked in the pipeline from the user's detailed
// icons) with a gold "?" seal — homogeneous with its neighbors
function mysteryFigure(kind, value, opts = {}) {
  const d = el("div", "figure mystery" + (opts.cls ? " " + opts.cls : ""));
  const face = el("div", "fig-face mystery");
  face.appendChild(spr("mysterybig_" + kind, 1)); // 56px native
  face.appendChild(el("b", "", "?"));
  d.appendChild(face);
  d.appendChild(el("div", "fig-name", opts.name || "Classified ad"));
  const meta = el("div", "fig-meta");
  meta.appendChild(spr("tag_" + kind, 0.7));
  meta.appendChild(el("b", "fig-val", "&#10022;".repeat(value)));
  d.appendChild(meta);
  d.setAttribute("aria-label", `Classified ad — mystery ${kind} of value ${value}, signed blind from the deck`);
  if (opts.onpick) d.onclick = () => { SFX.play("click"); opts.onpick(d); };
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
// (the wide scene-banner strip is gone: action dialogs open with the shared
// panelHead vignette emblem instead)

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
    zr.appendChild(sprHD(spriteName, 3));
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

// (the old benefit chips are gone — the offer band IS the benefit for hire
// and develop, and the queue markers price the other four actions)

const ACTION_HUE = {
  hire: "#4a7fb5", develop: "#8a5a9e", ideas: "#3f8f7a",
  print: "#b5443a", royalties: "#c9973b", sales: "#d97f35",
};
// what's openly available at each location right now (the board's open info)
// what the k-th seat of an action space is worth — written on the empty
// floor marker so "what do I get if I go now?" reads at a glance
function slotPerk(action, i) {
  switch (action) {
    case "royalties": return "$" + ROYALTIES_SLOTS[i];
    case "sales": return String(SALES_SLOTS[i]);
    case "ideas": return "+" + (IDEAS_SLOTS[i] + 2);
    case "print": return i === 0 ? "&times;2" : "";
    default: return "";
  }
}
function spotTitle(action, i) {
  switch (action) {
    case "royalties": return `Open spot — this desk pays $${ROYALTIES_SLOTS[i]}`;
    case "sales": return `Open spot — this seat flips and collects up to ${SALES_SLOTS[i]} orders`;
    case "ideas": return `Open spot — this chair takes ${IDEAS_SLOTS[i]} café token${IDEAS_SLOTS[i] === 1 ? "" : "s"} (+2 from the supply)`;
    default: return "Open spot";
  }
}

function offerStrip(action) {
  const e = UI.engine, s = e.state;
  const strip = el("div", "loc-offer");
  switch (action) {
    case "hire": {
      // the caricature discs (user-preferred over icon chips) with the two
      // facts that matter under each: genre mark + value stars
      const mk = (c, kind) => {
        const card = CARD_BY_ID[c];
        const d = el("div", "offer-person");
        d.appendChild(spr(faceBigOf(c), 0.5));
        d.appendChild(el("span", "op-meta",
          `${sprHTML("genreicon_" + card.genre, 0.42)}<b>${"&#10022;".repeat(card.value)}</b>`));
        d.title = `${card.name} — ${GENRE_INFO[card.genre].name} ${kind} v${card.value}`;
        strip.appendChild(d);
      };
      s.display.writers.forEach((c) => mk(c, "writer"));
      strip.appendChild(el("span", "loc-offer-sep")); // thin rule, not a pencil
      s.display.artists.forEach((c) => mk(c, "artist"));
      break;
    }
    case "develop":
      s.display.comics.forEach((c) => {
        const card = CARD_BY_ID[c];
        // cover + genre icon share ONE muted genre-colored plate: the icon
        // reads as this comic's attribute, not a separate object
        const d = el("div", "offer-comic");
        d.style.setProperty("--gc", GENRE_INFO[card.genre].color);
        d.appendChild(spr(coverOf(c), 0.38));
        d.appendChild(el("span", "oc-dot", genreMark(card.genre, 0.5)));
        d.title = `${card.title} (${GENRE_INFO[card.genre].name})`;
        strip.appendChild(d);
      });
      break;
    case "ideas":
      // all six shown; taken ones fade instead of vanishing
      GENRES.forEach((g) => {
        const d = spr("idea_" + g, 0.7);
        if (s.boardIdeas[g] > 0) d.title = GENRE_INFO[g].name + " idea on the table";
        else { d.classList.add("taken"); d.title = GENRE_INFO[g].name + " idea already taken (back next round)"; }
        strip.appendChild(d);
      });
      break;
    case "print": {
      const p = P(UI.humanId);
      const vals = (kind) => p.hand.filter((c) => CARD_BY_ID[c].kind === kind)
        .map((c) => CARD_BY_ID[c].value).sort((x, y) => x - y);
      const ws = vals("writer"), as2 = vals("artist");
      const comic = p.hand.some((c) => !CARD_BY_ID[c].kind) || p.hyped.length > 0;
      // cash = the team's total value; show the cheapest pair you could field
      const minCost = ws.length && as2.length ? ws[0] + as2[0] : 0;
      const cash = minCost > 0 && p.money >= minCost;
      // originals also burn 2 ideas of the comic's genre (rip-offs don't)
      const ideasOk = [...p.hand, ...p.hyped.map((h) => h.cardId)].some((c) => {
        const card = CARD_BY_ID[c];
        return card && !card.kind && p.ideas[card.genre] >= 2;
      });
      // five requirements on one 46px line: dense type, checkmarks glued
      // to their labels — the loose version clipped at the tile edge
      strip.classList.add("dense");
      const need = (label, ok, title) => {
        const b = el("b", "", `${label}${ok ? "&#10004;" : ""}`);
        if (!ok) b.style.color = "#ffd75e";
        if (title) b.title = title;
        strip.appendChild(b);
        strip.appendChild(document.createTextNode(" "));
      };
      // no "you need:" prefix — the checkmarks say it, and the full list
      // must fit the one 46px line
      need("writer", ws.length > 0);
      need("artist", as2.length > 0);
      need("comic", comic);
      need(minCost > 0 ? `$${minCost}+` : "$&mdash;", cash,
        minCost > 0 ? `Cash equal to the team's total value — your cheapest pair costs $${minCost}`
          : "Cash equal to the team's total value (you need a writer and an artist first)");
      need("2 ideas", ideasOk, "An ORIGINAL needs 2 idea tokens of its genre (rip-offs need none)");
      break;
    }
    case "royalties":
      // the queue markers below already price every desk — no need to repeat
      strip.innerHTML = `<i>the early desks pay better</i>`;
      break;
    case "sales": {
      const up = s.mapSlots.filter((t) => t.takenBy === null && t.faceUp);
      const down = s.mapSlots.filter((t) => t.takenBy === null && !t.faceUp).length;
      const byGenre = {};
      up.forEach((t) => (byGenre[t.genre] = (byGenre[t.genre] || 0) + 1));
      GENRES.forEach((g) => {
        if (!byGenre[g]) return;
        const d = el("span", "offer-genre");
        d.appendChild(spr("genreicon_" + g, 0.8));
        if (byGenre[g] > 1) d.appendChild(el("b", "", "&times;" + byGenre[g]));
        d.title = `${byGenre[g]} ${GENRE_INFO[g].name} order${byGenre[g] > 1 ? "s" : ""} face-up`;
        strip.appendChild(d);
      });
      strip.appendChild(el("span", "", `<i>+${down} hidden</i>`));
      break;
    }
  }
  return strip;
}

function renderLocations() {
  const e = UI.engine, s = e.state;
  const wrap = document.getElementById("locations");
  const focusedAction = wrap.contains(document.activeElement) ? document.activeElement.dataset.action : null;
  wrap.innerHTML = "";
  // a minimized sales run freezes the board: everything stays inspectable,
  // but the only legal move is returning to Manhattan
  const runParked = !!(s.salesSession && P(s.salesSession.player).human);
  const myTurn = s.phase === "actions" && e.currentPlayerId() === UI.humanId && !UI.busy &&
    !s.pending && !s.awaitingSpecial && !runParked;
  for (const action of ACTIONS) {
    const info = ACTION_INFO[action];
    const canGo = myTurn && e.canAct(UI.humanId, action);
    const loc = el("div", "loc" + (canGo ? "" : " disabled"));
    loc.style.setProperty("--ac", ACTION_HUE[action]);
    // action spaces: placed staffers on house-color plinths, open spots as
    // chalked markers carrying the spot's payout; the next free spot pulses
    const slots = el("div", "slots");
    const nAvail = e.slotsAvailable(action);
    const nextFree = e.nextSlot(action);
    for (let i = 0; i < nAvail; i++) {
      const occ = s.actionSpaces[action][i];
      // a staffer still walking over (placement flight) hasn't arrived yet
      const inFlight = UI.placeFlight && UI.placeFlight[action + ":" + i];
      const filled = occ !== undefined && !inFlight;
      const pip = el("div", "slot-pip" + (filled ? " taken" : "") +
        (canGo && i === nextFree ? " next" : ""));
      if (filled) {
        // the exact staffer who left the roster — pip, room and rail agree
        pip.style.setProperty("--house", PUBLISHERS[P(occ).color].color);
        pip.appendChild(spr(`staff_${P(occ).color}_${LocArt.staffCharFor(action, i)}`, 0.45));
        pip.title = `${P(occ).pubName} works here`;
      } else {
        // an empty next-spot with no payout still needs to read as "a place
        // to stand", not a stray gold ring
        const perk = slotPerk(action, i) || (canGo && i === nextFree ? "&#8250;&#8250;" : "");
        if (perk) pip.appendChild(el("span", "spot-perk", perk));
        pip.title = spotTitle(action, i);
      }
      if (action === "print" && i === 0) pip.title = (pip.title ? pip.title + "\n" : "") + "First editor here may print 2 books";
      slots.appendChild(pip);
    }
    // TOP RAIL (opaque, per the user's mockup): [name plate][queue spots]…
    // [★ badge] — identity and placement state read as one line, and the
    // scene below keeps its whole composition
    const head = el("div", "loc-head");
    head.appendChild(el("div", "loc-verb", info.verb.replace("!", "")));
    head.appendChild(slots);
    const sp = e.cubeSpecialFor(UI.humanId, action);
    if (sp) {
      const badge = el("div", "special-badge", "&#9733; " + SPECIALS[sp].name);
      badge.title = SPECIALS[sp].desc;
      head.appendChild(badge);
    }
    loc.appendChild(head);
    // the scene, with the single offer band overlaying its foot
    const stage = el("div", "loc-stage");
    const cv = document.createElement("canvas");
    cv.className = "loc-scene";
    stage.appendChild(cv);
    LocArt.attach(cv, action);
    stage.appendChild(offerStrip(action));
    loc.appendChild(stage);
    // keyboard/screen-reader semantics, with the reason when unavailable
    let reason = "";
    if (!myTurn) reason = runParked ? "finish your sales run first" : "waiting for your turn";
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
    if (runParked && action === "sales") {
      // the parked run lives here: the space itself is the resume button
      loc.classList.remove("disabled");
      loc.removeAttribute("aria-disabled");
      loc.classList.add("resume-run");
      loc.appendChild(el("div", "resume-plate", "&#9654; RESUME THE RUN"));
      loc.title = "Your sales agent is waiting mid-run — click to return to Manhattan.";
      loc.setAttribute("aria-label", "Manhattan Map — resume your sales run in progress");
      loc.onclick = () => { SFX.play("click"); Scenes.salesScene(true); };
    }
    wrap.appendChild(loc);
  }
  if (focusedAction) {
    const t = wrap.querySelector(`[data-action="${focusedAction}"]`);
    if (t) t.focus();
  }
}

const TRACK_MONEY = { 10: 6, 9: 4, 8: 4, 7: 4, 6: 3, 5: 3, 4: 3, 3: 2, 2: 2, 1: 1 };
let inspectedPublisher = null; // which house's dossier is open in the chart

function renderChart() {
  const e = UI.engine, s = e.state;
  const panel = document.getElementById("chart-panel");
  panel.innerHTML = "<h3>&#9733; THE COMIC BOOK CHART &#9733;</h3>";
  const order = s.players.map((p) => p.id).sort((a, b) => e.bestComicFans(b) - e.bestComicFans(a));
  if (inspectedPublisher !== null && !order.includes(inspectedPublisher)) inspectedPublisher = null;
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

  // one full-height colored lane per house; the head opens its dossier
  const grid = el("div", "chart-grid");
  grid.style.setProperty("--lanes", order.length);
  grid.appendChild(el("div", "chart-corner", "$"));
  for (const pid of order) {
    const p = P(pid), pub = PUBLISHERS[p.color];
    const head = el("button", "lane-head");
    head.type = "button";
    head.dataset.player = pid;
    head.style.setProperty("--lane", pub.color);
    head.setAttribute("aria-expanded", String(inspectedPublisher === pid));
    head.setAttribute("aria-label",
      `${p.pubName}${p.human ? ", your publishing house" : `, ${p.name}`}. Open publisher details.`);
    head.appendChild(sprHD(pub.logo, 0.5));
    head.appendChild(el("span", "", esc(p.pubName.split(" ")[0])));
    if (p.human) head.appendChild(el("span", "you-tag", "YOU"));
    head.onclick = () => {
      SFX.play("paper");
      inspectedPublisher = inspectedPublisher === pid ? null : pid;
      renderChart();
      const focus = panel.querySelector(`[data-player="${pid}"]`);
      if (focus) focus.focus();
    };
    grid.appendChild(head);
  }
  for (let fans = 10; fans >= 1; fans--) {
    grid.appendChild(el("div", "chart-fan", `<b>${fans}</b><span>$${TRACK_MONEY[fans]}</span>`));
    for (const pid of order) {
      const p = P(pid);
      const cell = el("div", "chart-cell");
      cell.style.setProperty("--lane", PUBLISHERS[p.color].color);
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
          `<b>${esc(c.title)}</b><br>${genreMark(c.genre, 0.45)} v${c.value} &middot; ${c.fans}&#9829; &middot; ${esc(P(c.owner).pubName)}`);
        cell.appendChild(cc);
      }
      grid.appendChild(cell);
    }
  }
  panel.appendChild(grid);
  const offChart = s.chart.filter((c) => c.fans < 1);
  if (offChart.length)
    panel.appendChild(el("div", "modal-sub", `<span style="color:#9aa;font-size:15px">off-chart: ${offChart.map((c) => esc(c.title)).join(" &middot; ")}</span>`));
  if (inspectedPublisher !== null) panel.appendChild(renderChartDetail(inspectedPublisher));
  // the standings ladder: the projected finish, always visible — a row
  // opens the same dossier as its lane head
  const ladder = el("div", "standings");
  ladder.appendChild(el("div", "standings-title", "&#9733; THE STANDINGS &#9733;"));
  e.scorePreview().forEach((sc, i) => {
    const p = P(sc.player), pub = PUBLISHERS[p.color];
    const row = el("button", "standing-row" + (p.human ? " you" : ""));
    row.type = "button";
    row.style.setProperty("--lane", pub.color);
    row.setAttribute("aria-expanded", String(inspectedPublisher === sc.player));
    const place = `${i + 1}${["st", "nd", "rd", "th"][Math.min(i, 3)]}`;
    // mastery tokens live HERE, per holder (the rail shelf is yours only);
    // a token mid-flight stays hidden until the animation lands it
    const held = GENRES.filter((g) =>
      s.mastery[g] === sc.player && !(UI.masteryFlight && UI.masteryFlight[g]));
    row.setAttribute("aria-label",
      `${place} place: ${p.pubName}${p.human ? " (you)" : ""}, ${sc.total} projected victory points` +
      (held.length ? `, holds ${held.length} mastery token${held.length === 1 ? "" : "s"}` : "") +
      `. Open publisher details.`);
    row.appendChild(el("span", "st-place", place.toUpperCase()));
    row.appendChild(sprHD(pub.logo, 0.42));
    const bestFans = Math.max(0, e.bestComicFans(sc.player));
    row.appendChild(el("span", "st-name",
      `<b>${esc(p.pubName)}${p.human ? " (YOU)" : ""}</b>` +
      `<small>${sc.total} VP &middot; ${bestFans}&#9829; best &middot; ${p.printedCount} book${p.printedCount === 1 ? "" : "s"}` +
      (held.length ? ` &middot; ${held.map((g) => sprHTML("mastery_" + g, 0.3)).join("")}` : "") +
      `</small>`));
    row.onclick = () => {
      SFX.play("paper");
      inspectedPublisher = inspectedPublisher === sc.player ? null : sc.player;
      renderChart();
    };
    ladder.appendChild(row);
  });
  panel.appendChild(ladder);
}

// the dossier: everything public about one publishing house, opened from
// its chart lane and closed from the BACK button (focus round-trips)
function renderChartDetail(pid) {
  const e = UI.engine, s = e.state, p = P(pid), pub = PUBLISHERS[p.color];
  const score = e.scorePlayer(pid);
  const detail = el("section", "chart-detail");
  detail.style.setProperty("--lane", pub.color);
  detail.setAttribute("aria-label", `${p.pubName} publisher details`);
  const head = el("div", "chart-detail-head");
  head.appendChild(spr(bossSprite(pid), 0.7));
  head.appendChild(el("h4", "", `${esc(p.pubName)}${p.human ? "<br>(YOU)" : `<br>${esc(p.name)}`}`));
  const close = el("button", "chart-detail-close", "BACK");
  close.type = "button";
  close.onclick = () => {
    SFX.play("paper");
    inspectedPublisher = null;
    renderChart();
    const lane = document.querySelector(`#chart-panel .lane-head[data-player="${pid}"]`);
    if (lane) lane.focus();
  };
  head.appendChild(close);
  detail.appendChild(head);
  const held = GENRES.filter((g) => s.mastery[g] === pid);
  const unfulfilled = p.orders.map((id) => s.mapSlots[id]).filter((o) => !o.fulfilled).length;
  const stats = el("div", "chart-stats");
  const stat = (label, value) => stats.appendChild(el("div", "chart-stat", `<b>${label}</b>${value}`));
  stat("PROJECTED VP", score.total);
  stat("BEST COMIC", `${Math.max(0, e.bestComicFans(pid))}&#9829;`);
  stat("CASH / TICKETS", `$${p.money} / ${p.tickets}`);
  stat("EDITORS LEFT", `${p.editorsLeft}`);
  stat("PUBLISHED", p.printedCount);
  // the actual tokens, not a count — you can see WHICH genres they've locked
  stat("MASTERY / ORDERS",
    `${held.length ? held.map((g) => sprHTML("mastery_" + g, 0.35)).join("") : "&mdash;"} / ${unfulfilled} open`);
  detail.appendChild(stats);
  detail.appendChild(el("div", "desk-label", "PUBLISHED COMICS"));
  const books = el("div", "chart-books");
  for (const c of s.chart.filter((item) => item.owner === pid)) {
    const cover = sprHD(comicSprite(c), 0.45);
    cover.title = `${c.title}: value ${c.value}, ${c.fans} fans`;
    attachZoom(cover, comicSprite(c), `<b>${esc(c.title)}</b><br>v${c.value} &middot; ${c.fans}&#9829;`);
    books.appendChild(cover);
  }
  if (!books.children.length) books.appendChild(el("i", "", "No comics published yet"));
  detail.appendChild(books);
  return detail;
}

function renderHUD() {
  const e = UI.engine, s = e.state;
  const p = P(UI.humanId);
  const pub = PUBLISHERS[p.color];

  // ---- the PUBLISHER rail: letterhead with the house mark and the score
  // you'd post if the presses stopped right now (recomputed every render)
  const rail = document.getElementById("desk-status");
  const score = e.scorePlayer(UI.humanId);
  rail.style.setProperty("--pub", pub.color);
  rail.setAttribute("aria-label",
    `Your publisher: ${p.pubName}. Projected score ${score.total} victory points, ${p.editorsLeft} editors available.`);
  const mark = document.getElementById("pub-mark");
  mark.innerHTML = "";
  const logo = el("span", "rail-logo");
  logo.appendChild(sprHD(pub.logo, 1.25)); // fills the 56px square box
  mark.appendChild(logo);
  mark.appendChild(el("span", "rail-name", `<b>${esc(p.pubName)}</b><small>YOUR PUBLISHING HOUSE</small>`));
  const scoreCard = el("div", "rail-score", `<span>PROJECTED VP</span><b>${score.total}</b>`);
  scoreCard.title = `If the game ended now: ${score.fans} fans - ${score.orderPenalty} order penalties + ` +
    `${score.vpTokens} VP tokens + ${score.masteryVP} mastery + ${score.bcVP} better colors + ` +
    `${score.moneyVP} money + ${score.ideasVP} ideas + ${score.origVP + score.extraVP} published comics`;
  mark.appendChild(scoreCard);

  // the staff: editors as PEOPLE of the house, spent ones grayed in place
  const roster = document.getElementById("staff-roster");
  roster.innerHTML = "";
  const totalStaff = p.editors + (p.extraEditorUsed ? 1 : 0);
  roster.classList.toggle("has-temp", totalStaff > 4);
  for (let i = 0; i < totalStaff; i++) {
    const available = i < p.editorsLeft;
    const staff = el("span", "staffer" + (available ? "" : " spent") + (i >= p.editors ? " temp" : ""));
    staff.appendChild(spr(`staff_${p.color}_${i % 4}`, 1.2));
    staff.setAttribute("role", "img");
    const who = i >= p.editors ? "Extra editor" : `Editor ${i + 1}`;
    staff.setAttribute("aria-label", `${who} — ${available ? "available" : "already assigned"}`);
    staff.title = `${who}: ${available ? "available this round" : "already assigned"}`;
    roster.appendChild(staff);
  }

  // resources: stable sockets (dim at zero, never vanishing — a persistent
  // home the eye can always return to)
  const res = document.getElementById("hud-resources");
  res.innerHTML = "";
  const chip = (parent, sprite, scale, html, title, dim = false, cls = "res") => {
    const r = el("span", cls + (dim ? " dim" : ""));
    r.appendChild(spr(sprite, scale));
    r.innerHTML += html;
    if (title) r.title = title;
    parent.appendChild(r);
    return r;
  };
  chip(res, "coin_1", 0.95, ` <b>$${p.money}</b>`, "Cash", false, "res res-cash");
  const duo = el("div", "rail-duo");
  chip(duo, "ticket", 0.55, `<b>${p.tickets}</b>`, "Super-transport tickets", p.tickets === 0);
  chip(duo, "vp_1", 0.6, ` <b>${p.vpTokens}</b>`, "Victory point tokens", p.vpTokens === 0);
  res.appendChild(duo);
  res.appendChild(el("div", "desk-label", "IDEAS"));
  const ideaGrid = el("div", "idea-grid");
  GENRES.forEach((g) =>
    chip(ideaGrid, "idea_" + g, 0.6, `<b>${p.ideas[g]}</b>`, GENRE_INFO[g].name + " ideas", p.ideas[g] === 0));
  res.appendChild(ideaGrid);

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
  // the shelf shows YOUR trophies only (who holds the rest lives in THE
  // STANDINGS); a token still flying in stays hidden until it lands
  GENRES.forEach((g) => {
    const holder = s.mastery[g];
    const inFlight = UI.masteryFlight && UI.masteryFlight[g];
    const mine = holder === UI.humanId && !inFlight;
    const sock = el("span", "award-socket" + (mine ? " won" : ""));
    sock.dataset.genre = g;
    sock.setAttribute("role", "img");
    if (mine) {
      sock.appendChild(spr("mastery_" + g, 0.55));
      sock.title = GENRE_INFO[g].name + " Mastery — yours: +1 fan per book of the genre, 2 VP";
    } else {
      sock.innerHTML = `<span style="opacity:.45">${genreMark(g, 0.6)}</span>`;
      sock.title = `${GENRE_INFO[g].name} Mastery — ` +
        (holder === undefined || holder === null || inFlight
          ? "unclaimed: first original of the genre takes it (+1 fan per book, 2 VP)"
          : `held by ${P(holder).pubName} (see THE STANDINGS)`);
    }
    sock.setAttribute("aria-label", sock.title);
    aw.appendChild(sock);
  });

  // published catalog: every printed comic as a compact cover — the whole
  // newsstand stays visible at once; clicking a cover opens its dossier
  // (team, value, fans) as a detail pane
  const mat = document.getElementById("hud-mat");
  mat.innerHTML = "<div class='mat-plate'>&#9733; ON THE STANDS &#9733;</div>";
  s.chart.filter((c) => c.owner === UI.humanId).forEach((c) => {
    const d = el("div", "press-item" + (c.isRipoff ? " ripoff" : ""));
    d.dataset.chartIdx = c.idx;
    d.setAttribute("role", "button");
    d.tabIndex = 0;
    d.setAttribute("aria-label",
      `${c.title}${c.isRipoff ? " (rip-off)" : ""}: value ${c.value}, ${c.fans} fans. Open details.`);
    if (c.idx === UI.lastPrintIdx) d.appendChild(el("div", "new-tag", "NEW!"));
    const cover = el("div", "pi-cover");
    cover.appendChild(spr(comicSprite(c), 0.6));
    cover.appendChild(el("div", "fans-badge", `${c.fans}&#9829;`));
    cover.appendChild(el("div", "pi-genre", genreMark(c.genre, 0.42)));
    d.appendChild(cover);
    // the current total value, unmistakable and always up to date
    const vp = el("div", "val-plate", "VALUE " + c.value);
    vp.dataset.val = c.value;
    d.appendChild(vp);
    d.onclick = () => comicInfoModal(c);
    mat.appendChild(d);
  });
  const nP = p.printedCount;
  const nxt = nP < 1 ? "" : nP >= 6 ? "" : ["", "2nd unlocks specials", "3rd: Better Colors", "4th: Marketing/Editor", "5th: move a cube +VP", "6th+: +2 VP each"][nP] || "";
  if (nxt) mat.appendChild(el("span", "", `<i style="font-size:14px;color:#9aa;flex-shrink:0">&larr; ${nxt}</i>`));
  updateMatNav();

  // hand: the TEAM & PROJECTS bench, organised by trade — comics as covers,
  // creatives as people
  const hand = document.getElementById("hud-hand");
  hand.innerHTML = "";
  const entries = p.hand.map((c) => ({ id: c, hyped: false }))
    .concat(p.hyped.map((h) => ({ id: h.cardId, hyped: true, tokens: h.tokens })));
  const groups = [
    { kind: "writer", label: "WRITERS", list: [] },
    { kind: "artist", label: "ARTISTS", list: [] },
    { kind: "project", label: "PROJECTS", list: [] },
  ];
  for (const c of entries)
    groups.find((g) => g.kind === (CARD_BY_ID[c.id].kind || "project")).list.push(c);
  if (!entries.length) hand.innerHTML = "<i style='color:#9aa;align-self:center'>your desk is empty</i>";
  else for (const group of groups) {
    const sec = el("section", "hand-group");
    sec.appendChild(el("h4", "", group.label));
    // the shelf scrolls when crowded — it must be reachable from the keyboard
    const body = el("div", "hand-group-body");
    body.tabIndex = 0;
    body.setAttribute("role", "group");
    body.setAttribute("aria-label", group.label.toLowerCase());
    for (const c of group.list) {
      const card = CARD_BY_ID[c.id];
      // compact chips so the whole bench fits without scrolling; the full
      // card (name, stats, needs) opens as a detail pane on click
      let hc;
      if (card.kind) {
        hc = el("div", "team-chip");
        hc.appendChild(spr(faceBigOf(c.id), 0.55));
        hc.appendChild(el("span", "tc-meta", `${genreMark(card.genre, 0.45)}<b>${"&#10022;".repeat(card.value)}</b>`));
        hc.title = `${card.name} — ${GENRE_INFO[card.genre].name} ${card.kind} v${card.value}`;
        hc.setAttribute("aria-label",
          `${card.name}: ${GENRE_INFO[card.genre].name} ${card.kind}, value ${card.value}. Open details.`);
      } else {
        hc = el("div", "project-chip");
        hc.appendChild(spr(coverOf(c.id), 0.55));
        hc.appendChild(el("span", "tc-meta", `${genreMark(card.genre, 0.45)}${bonusChip(card.bonus)}`));
        hc.title = `${card.title} — ${GENRE_INFO[card.genre].name}. Needs 2 ${GENRE_INFO[card.genre].name} ideas + a team to print.`;
        hc.setAttribute("aria-label",
          `${card.title}: ${GENRE_INFO[card.genre].name} comic project. Open details.`);
      }
      hc.dataset.card = c.id; // reveal/fly effects land on the exact chip
      hc.setAttribute("role", "button");
      hc.tabIndex = 0;
      hc.onclick = () => handCardInfoModal(c);
      if (c.hyped) hc.appendChild(el("div", "hype-badge", "HYPE +" + c.tokens * 2));
      body.appendChild(hc);
    }
    if (!group.list.length) body.appendChild(el("i", "hand-group-empty", "&mdash;"));
    sec.appendChild(body);
    hand.appendChild(sec);
  }
}

// ------------------------------------------------- desk detail panes
// The desk shows compact chips; these dismissable panes carry the full story.
function comicInfoModal(c) {
  SFX.play("paper");
  openModal((m) => {
    // panel anatomy like every other pane: cover as the emblem
    const head = el("div", "panel-head");
    const em = el("div", "ph-emblem bare");
    em.appendChild(sprHD(comicSprite(c), 0.85));
    head.appendChild(em);
    const t = el("div", "ph-text");
    t.appendChild(el("h2", "", esc(c.title) +
      (c.isRipoff ? ' <span style="font-size:12px;color:#8a2f22">(RIP-OFF)</span>' : "")));
    t.appendChild(el("div", "ph-tag", `${genreMark(c.genre, 0.7)} ${GENRE_INFO[c.genre].name} &middot; on the stands`));
    head.appendChild(t);
    m.appendChild(head);
    const row = panelSection(m, "THE LEDGER");
    row.appendChild(el("div", "modal-sub",
      `BOOK VALUE <b>${c.value}</b> &middot; <b>${c.fans}</b>&#9829; fans` +
      (c.bettercolor ? "<br>&#9733; Better Colors (+2 VP at the end)" : "") +
      `<br><span style="font-size:15px;color:#57452c">delivers ${GENRE_INFO[c.genre].name} orders of minimum value up to ${c.value}</span>`));
    const team = panelSection(m, "THE TEAM ON THIS BOOK");
    const teamRow = el("div", "card-row");
    for (const kind of ["writer", "artist"]) {
      const cr = c.creatives[kind];
      const chip = el("div", "swap-cr" + (cr.genre === c.genre ? " spec" : ""));
      chip.appendChild(spr(faceBigOf(cr.id), 0.7));
      chip.appendChild(el("span", "sc-meta", `${genreMark(cr.genre, 0.45)} <b>${"&#10022;".repeat(cr.curValue)}</b>`));
      chip.appendChild(el("span", "sc-label", `${esc(cr.name)}<br>${kind}` +
        (cr.genre === c.genre ? " &middot; &#9733; specialized" : "")));
      attachZoom(chip, faceBigOf(cr.id),
        `<b>${esc(cr.name)}</b><br>${GENRE_INFO[cr.genre].name} ${kind} &middot; v${cr.curValue}`);
      teamRow.appendChild(chip);
    }
    team.appendChild(teamRow);
    modalButtons(m, [{ label: "CLOSE", fn: () => closeModal() }]);
  }, { onDismiss: () => {} });
}

function handCardInfoModal(entry) {
  SFX.play("paper");
  const card = CARD_BY_ID[entry.id];
  openModal((m) => {
    if (card.kind) {
      // a PERSON sheet, not a card: big face disc + the facts (de-carding
      // applies here too — the trading card never appears at runtime)
      const head = el("div", "panel-head");
      const em = el("div", "ph-emblem bare");
      em.appendChild(spr(faceBigOf(entry.id), 1.5));
      head.appendChild(em);
      const t = el("div", "ph-text");
      t.appendChild(el("h2", "", esc(card.name)));
      t.appendChild(el("div", "ph-tag",
        `${sprHTML("tag_" + card.kind, 0.8)} ${genreMark(card.genre, 0.8)} ` +
        `<b>${GENRE_INFO[card.genre].name}</b> ${card.kind} &middot; ` +
        `<b class="fig-val" style="font-style:normal">${"&#10022;".repeat(card.value)}</b>` +
        (card.value === 1 ? ` &middot; rookie` : "")));
      head.appendChild(t);
      m.appendChild(head);
      const body = panelSection(m, "THE CONTRACT");
      body.appendChild(el("div", "modal-sub",
        `Printing a book with them costs their value (<b>$${card.value}</b>) as part of the team fee.<br>` +
        `<span style="font-size:15px;color:#57452c">On a ${GENRE_INFO[card.genre].name} book they are &#9733; specialized: ` +
        `+1 fan at print, and they can train during Creative Development.</span>` +
        (card.value === 1 ? `<br><span style="font-size:15px;color:#33716c"><b>Rookie:</b> signed with a free ${GENRE_INFO[card.genre].name} idea.</span>` : "")));
    } else {
      // same anatomy as the creative sheet: cover emblem + facts section
      const head = el("div", "panel-head");
      const em = el("div", "ph-emblem bare");
      em.appendChild(sprHD(coverOf(entry.id), 0.85));
      head.appendChild(em);
      const t = el("div", "ph-text");
      t.appendChild(el("h2", "", esc(card.title)));
      t.appendChild(el("div", "ph-tag",
        `${genreMark(card.genre, 0.7)} ${GENRE_INFO[card.genre].name} comic project` +
        (entry.hyped ? ` &middot; <b style="color:#8a2f22">HYPED +${entry.tokens * 2}</b>` : "")));
      head.appendChild(t);
      m.appendChild(head);
      const body = panelSection(m, "COST &amp; RESULT");
      body.appendChild(el("div", "modal-sub",
        `PRINT BONUS: ${bonusChip(card.bonus)}<br>` +
        `<span style="font-size:15px;color:#57452c">COST TO PRINT: 2 ${GENRE_INFO[card.genre].name} ideas + a writer + an artist</span>` +
        (entry.hyped ? `<br><b style="color:#8a2f22">HYPED: +${entry.tokens * 2} fans when printed</b>` : "")));
    }
    modalButtons(m, [{ label: "CLOSE", fn: () => closeModal() }]);
  }, { onDismiss: () => {} });
}

// the published catalog can outgrow its column: show the nudge buttons whenever
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
      // blind signings get the theatrical flip: who actually answered the ad?
      if (ev.player === UI.humanId && ev.blind && ev.blind.length) {
        FX.reveal(ev.blind.map((c) => {
          const cd = CARD_BY_ID[c];
          return {
            sprite: faceBigOf(c), scale: 1.15, round: true,
            front: "mysterybig_" + cd.kind, frontRound: true, frontScale: 1.15,
            title: cd.name.toUpperCase(),
            sub: `${GENRE_INFO[cd.genre].name} ${cd.kind} &middot; <b>${"&#10022;".repeat(cd.value)}</b>` +
              (cd.value === 1 ? " &middot; rookie (+1 idea)" : ""),
            toRef: () => document.querySelector(`#hud-hand [data-card="${c}"]`) ||
              document.getElementById("hud-hand"),
          };
        }));
        return 1500 + (ev.blind.length - 1) * 650 + 350;
      }
      return 500;
    }
    case "develop":
      if (ev.player !== UI.humanId) quip(ev.player, "develop");
      else if (ev.cardId) toast(`${sprHTML(coverOf(ev.cardId), 0.5)} ${ev.searched ? "Commissioned" : "Optioned"}: <b>${esc(CARD_BY_ID[ev.cardId].title)}</b>`);
      else toast("The slush pile came up empty!");
      SFX.play("paper");
      // the slush pile pays off face-down — flip it over center stage
      if (ev.player === UI.humanId && ev.blind && ev.cardId) {
        const cd = CARD_BY_ID[ev.cardId];
        FX.reveal([{
          sprite: coverOf(ev.cardId), scale: 1.5,
          front: "back_orig_" + cd.genre,
          title: cd.title.toUpperCase(),
          sub: `${GENRE_INFO[cd.genre].name} original &middot; prints with ${BONUS_CHIP[cd.bonus][0]}`,
          toRef: () => document.querySelector(`#hud-hand [data-card="${ev.cardId}"]`) ||
            document.getElementById("hud-hand"),
        }]);
        return 1850;
      }
      return 450;
    case "ideas":
      if (ev.player !== UI.humanId) quip(ev.player, "ideas");
      else {
        const all = (ev.board || []).concat(ev.supply || []);
        toast(`Brainstormed: ${all.map((g) => sprHTML("idea_" + g, 0.45)).join("")}`);
      }
      return 400;
    case "royalties":
      say(ev.player, ev.player === UI.humanId ? `Collected <b>$${ev.amount}</b> in royalties.` : `${esc(P(ev.player).pubName)} collects <b>$${ev.amount}</b>.`);
      if (ev.player === UI.humanId) FX.burstEl(document.getElementById("hud-resources"), ["#f5c86e", "#c9973b", "#fff"], 12);
      SFX.play("cash");
      return 450;
    case "placeEditor": {
      // the very staffer leaves the rail (or the rival's chip) and travels to
      // the white square; the pip and the room seat them on landing. When a
      // dialog is up (e.g. the sales run) the flight would fly over it — skip
      // the trip and let the state show instantly.
      if (document.getElementById("modal-root").classList.contains("active")) return 0;
      const key = ev.action + ":" + ev.slot;
      (UI.placeFlight = UI.placeFlight || {})[key] = true;
      const reveal = () => {
        if (UI.placeFlight) delete UI.placeFlight[key];
        renderLocations();
      };
      const chIdx = typeof LocArt !== "undefined" ? LocArt.staffCharFor(ev.action, ev.slot) : ev.player % 4;
      const from = P(ev.player).human
        ? document.querySelectorAll("#staff-roster .staffer")[P(ev.player).editorsLeft]
        : document.querySelector(`#turn-order .order-chip[data-pid="${ev.player}"]`);
      const dest = () => {
        const loc = document.querySelector(`#locations .loc[data-action="${ev.action}"]`);
        return loc ? loc.querySelectorAll(".slot-pip")[ev.slot] : null;
      };
      renderLocations(); // the pip renders empty under the flight flag
      FX.flyToken(`staff_${P(ev.player).color}_${chIdx}`, from, dest, { onLand: reveal, scale: 0.9 });
      return 260;
    }
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
        // the token must not sit at home before it visibly arrives: renders
        // during the wait+flight treat it as still airborne, and the landing
        // reveals it (shelf socket / standings row) with the flash
        (UI.masteryFlight = UI.masteryFlight || {})[g] = true;
        const reveal = () => {
          if (UI.masteryFlight) delete UI.masteryFlight[g];
          renderHUD();
          renderChart();
        };
        const destFor = (pid) => pid === UI.humanId
          ? document.querySelector(`#desk-awards .award-socket[data-genre="${g}"]`)
          : document.querySelector(`#turn-order .order-chip[data-pid="${pid}"]`);
        setTimeout(() => FX.flyToken("mastery_" + g, hasPrev ? destFor(ev.prev) : null, () => destFor(ev.player),
          { onLand: reveal }),
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
          toast(`ROOKIE BONUS! ${sprHTML("idea_" + ev.genre, 0.6)} free <b>${GENRE_INFO[ev.genre].name}</b> idea!`, true);
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
