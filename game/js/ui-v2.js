// ============================================================================
// AGE OF COMICS — UI V2 art-direction lab
// The living six-room board stays shared with V1; V2 concentrates on a
// no-scroll Publisher Desk and its Sales-map workspace. The engine, scenes,
// save format, AI and atlas remain shared and untouched. Activate with ?ui=v2.
// ============================================================================
"use strict";

const UIV2 = (() => {
  function active() {
    return document.documentElement.classList.contains("ui-v2");
  }

  function afterRender() {
    const mark = document.getElementById("desk-publisher-mark");
    if (!mark || !UI.engine) return;
    const vitals = document.getElementById("desk-vitals");
    vitals.tabIndex = 0;
    vitals.setAttribute("aria-label", "Your publisher resources");
    const p = P(UI.humanId);
    mark.innerHTML = "";
    const logo = el("span", "v2-pub-logo");
    logo.dataset.color = p.color;
    mark.appendChild(logo);
    mark.appendChild(el("span", "v2-pub-name", `<b>${esc(p.pubName)}</b><small>YOUR PUBLISHING HOUSE</small>`));
    renderCompactHand();
    renderCompactNewsroom();
    const nav = document.getElementById("mat-nav");
    if (nav) nav.hidden = true;
  }

  function renderCompactHand() {
    const p = P(UI.humanId), hand = document.getElementById("hud-hand");
    const entries = p.hand.map((id) => ({ id, hyped: false }))
      .concat(p.hyped.map((h) => ({ id: h.cardId, hyped: true, tokens: h.tokens })));
    hand.innerHTML = "";
    hand.dataset.count = entries.length;
    hand.style.setProperty("--v2-hand-rows", Math.max(1, Math.ceil(entries.length / 2)));
    for (const entry of entries) {
      const card = CARD_BY_ID[entry.id];
      const tile = el("div", "v2-hand-tile " + (card.kind ? "creative" : "comic"));
      tile.setAttribute("role", "group");
      if (card.kind) {
        tile.setAttribute("aria-label", `${card.name}: ${GENRE_INFO[card.genre].name} ${card.kind}, value ${card.value}`);
        tile.appendChild(spr(faceOf(entry.id), 0.9));
        tile.appendChild(el("div", "v2-hand-copy",
          `<b>${esc(card.name)}</b><span>${genreDot(card.genre)} ${card.kind} ` +
          `<strong>${"&#10022;".repeat(card.value)}</strong></span>` +
          (card.value === 1 ? `<small>ROOKIE · +1 IDEA</small>` : "")));
        attachZoom(tile, card.sprite,
          `<b>${esc(card.name)}</b><br>${fmtGenre(card.genre)} ${card.kind} &middot; value ${card.value}`);
      } else {
        tile.setAttribute("aria-label", `${card.title}: ${GENRE_INFO[card.genre].name} comic, ${BONUS_CHIP[card.bonus][0]}, costs two ideas plus a team`);
        tile.appendChild(spr(coverOf(entry.id), 0.48));
        tile.appendChild(el("div", "v2-hand-copy",
          `<b>${esc(card.title)}</b><span>${genreDot(card.genre)} ${GENRE_INFO[card.genre].name}</span>` +
          `<span>${bonusChip(card.bonus)}</span><small>COST · 2 IDEAS + TEAM</small>`));
        attachZoom(tile, coverOf(entry.id),
          `<b>${esc(card.title)}</b><br>${fmtGenre(card.genre)} &middot; ${BONUS_CHIP[card.bonus][3]}`);
      }
      if (entry.hyped) tile.appendChild(el("div", "hype-badge", `HYPE +${entry.tokens * 2}`));
      hand.appendChild(tile);
    }
    if (!entries.length) hand.appendChild(el("i", "v2-empty", "your desk is empty"));
  }

  function renderCompactNewsroom() {
    const s = UI.engine.state, mat = document.getElementById("hud-mat");
    const books = s.chart.filter((c) => c.owner === UI.humanId);
    mat.innerHTML = "<div class='mat-plate'>&#9733; THE NEWSROOM &#9733;</div>";
    mat.dataset.count = books.length;
    mat.style.setProperty("--v2-news-cols", Math.min(4, Math.max(1, Math.ceil(books.length / 2))));
    const n = P(UI.humanId).printedCount;
    const next = n < 1 || n >= 6 ? "" :
      ["", "2nd unlocks specials", "3rd · Better Colors", "4th · Marketing / Editor", "5th · Move cube + VP"][n] || "";
    if (next) mat.appendChild(el("div", "v2-news-next", "NEXT · " + next));
    for (const c of books) {
      const tile = el("div", "press-item v2-news-tile" + (c.isRipoff ? " ripoff" : ""));
      tile.dataset.chartIdx = c.idx;
      tile.setAttribute("role", "group");
      tile.setAttribute("aria-label", `${c.title}${c.isRipoff ? " (rip-off)" : ""}: value ${c.value}, ${c.fans} fans`);
      if (c.idx === UI.lastPrintIdx) tile.appendChild(el("div", "new-tag", "NEW!"));
      const cover = el("div", "pi-cover");
      cover.appendChild(spr(comicSprite(c), 0.4));
      cover.appendChild(el("div", "pi-genre", genreDot(c.genre)));
      const value = el("div", "val-plate", "V" + c.value);
      value.dataset.val = c.value;
      value.title = "Comic value " + c.value;
      cover.appendChild(value);
      tile.appendChild(cover);
      const copy = el("div", "v2-news-copy",
        `<b>${esc(c.title)}</b><span>${c.fans}&#9829; · ${GENRE_INFO[c.genre].name}</span>`);
      const team = el("span", "v2-news-team");
      for (const kind of ["writer", "artist"]) {
        const cr = c.creatives[kind];
        const member = el("span", "v2-news-creative" + (cr.genre === c.genre ? " spec" : ""));
        member.appendChild(spr(faceOf(cr.id), 0.46));
        member.appendChild(el("small", "", "&#10022;".repeat(cr.curValue)));
        member.title = `${cr.name}: ${GENRE_INFO[cr.genre].name} ${kind}, value ${cr.curValue}`;
        team.appendChild(member);
      }
      copy.appendChild(team);
      tile.appendChild(copy);
      attachZoom(cover, comicSprite(c),
        `<b>${esc(c.title)}</b>${c.isRipoff ? " (RIP-OFF)" : ""}<br>` +
        `${fmtGenre(c.genre)} &middot; value <b>${c.value}</b> &middot; ${c.fans}&#9829;`);
      mat.appendChild(tile);
    }
    if (!books.length) mat.appendChild(el("i", "v2-empty", "No comics printed yet"));
  }

  return { active, afterRender };
})();
