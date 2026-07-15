// ============================================================================
// AGE OF COMICS — UI V2 art-direction lab
// The living six-room board stays shared with V1; V2 concentrates on a
// no-scroll Publisher Desk and its Sales-map workspace. The engine, scenes,
// save format, AI and atlas remain shared and untouched. Activate with ?ui=v2.
// ============================================================================
"use strict";

const UIV2 = (() => {
  let inspectedPublisher = null;

  function active() {
    return document.documentElement.classList.contains("ui-v2");
  }

  function afterRender() {
    const mark = document.getElementById("desk-publisher-mark");
    if (!mark || !UI.engine) return;
    setupShell();
    renderPublisher();
    renderCompactHand();
    renderCompactNewsroom();
    renderChartLanes();
    const nav = document.getElementById("mat-nav");
    if (nav) nav.hidden = true;
  }

  function setupShell() {
    const wire = document.getElementById("wire-strip");
    const slot = document.getElementById("top-wire-slot");
    if (wire && slot && wire.parentElement !== slot) slot.appendChild(wire);
    if (wire) wire.title = "Open the Press Wire";
  }

  function renderPublisher() {
    const e = UI.engine, p = P(UI.humanId), score = e.scorePlayer(UI.humanId);
    const status = document.getElementById("desk-status");
    status.style.setProperty("--pub", PUBLISHERS[p.color].color);
    const vitals = document.getElementById("desk-vitals");
    vitals.tabIndex = 0;
    vitals.setAttribute("aria-label", `Your publisher: ${p.pubName}, projected score ${score.total} victory points, ${p.editorsLeft} editors available`);
    const plate = vitals.querySelector(".desk-plate");
    if (plate) plate.innerHTML = "&#9733; PUBLISHER &#9733;";
    const mark = document.getElementById("desk-publisher-mark");
    mark.innerHTML = "";
    const logo = el("span", "v2-pub-logo");
    logo.dataset.color = p.color;
    mark.appendChild(logo);
    mark.appendChild(el("span", "v2-pub-name", `<b>${esc(p.pubName)}</b><small>YOUR PUBLISHING HOUSE</small>`));
    const scoreCard = el("div", "v2-score-card", `<span>PROJECTED VP</span><b>${score.total}</b>`);
    scoreCard.title = `If the game ended now: ${score.fans} fans - ${score.orderPenalty} order penalties + ` +
      `${score.vpTokens} VP tokens + ${score.masteryVP} mastery + ${score.bcVP} better colors + ` +
      `${score.moneyVP} money + ${score.ideasVP} ideas + ${score.origVP + score.extraVP} published comics`;
    mark.appendChild(scoreCard);

    const resources = document.getElementById("hud-resources");
    resources.innerHTML = "";
    const staffBlock = el("div", "v2-publisher-block");
    staffBlock.appendChild(el("span", "v2-publisher-label", "EDITORS AVAILABLE"));
    const totalStaff = p.editors + (p.extraEditorUsed ? 1 : 0);
    const roster = el("div", "v2-staff-roster" + (totalStaff > 4 ? " has-temp" : ""));
    const colorRow = PLAYER_COLORS.indexOf(p.color);
    for (let i = 0; i < totalStaff; i++) {
      const available = i < p.editorsLeft;
      const person = i % 4;
      const staff = el("span", "v2-staffer" + (available ? "" : " spent") + (i >= p.editors ? " temp" : ""));
      staff.style.setProperty("--staff-x", [0, 33.333, 66.667, 100][person] + "%");
      staff.style.setProperty("--staff-y", [0, 33.333, 66.667, 100][colorRow] + "%");
      staff.setAttribute("role", "img");
      staff.setAttribute("aria-label", `${i >= p.editors ? "Extra editor" : `Editor ${i + 1}`} — ${available ? "available" : "already assigned"}`);
      roster.appendChild(staff);
    }
    staffBlock.appendChild(roster);
    resources.appendChild(staffBlock);

    const cashBlock = el("div", "v2-publisher-block");
    const cashRow = el("div", "v2-cash-row");
    const cash = el("span", "v2-resource-big");
    cash.appendChild(spr("coin_1", 0.8)); cash.appendChild(el("b", "", `$${p.money}`)); cash.title = "Cash";
    const tickets = el("span", "v2-resource-big");
    tickets.appendChild(spr("ticket", 0.58)); tickets.appendChild(el("b", "", `${p.tickets}`)); tickets.title = "Super-transport tickets";
    cashRow.appendChild(cash); cashRow.appendChild(tickets); cashBlock.appendChild(cashRow);
    resources.appendChild(cashBlock);

    const ideasBlock = el("div", "v2-publisher-block");
    ideasBlock.appendChild(el("span", "v2-publisher-label", "IDEAS"));
    const ideas = el("div", "v2-idea-grid");
    for (const genre of GENRES) {
      const chip = el("span", "v2-idea-chip" + (p.ideas[genre] ? "" : " dim"));
      chip.appendChild(spr("idea_" + genre, 0.48)); chip.appendChild(el("b", "", String(p.ideas[genre])));
      chip.title = `${GENRE_INFO[genre].name} ideas`;
      ideas.appendChild(chip);
    }
    ideasBlock.appendChild(ideas); resources.appendChild(ideasBlock);
  }

  function renderCompactHand() {
    const p = P(UI.humanId), hand = document.getElementById("hud-hand");
    const entries = p.hand.map((id) => ({ id, hyped: false }))
      .concat(p.hyped.map((h) => ({ id: h.cardId, hyped: true, tokens: h.tokens })));
    hand.innerHTML = "";
    hand.dataset.count = entries.length;
    const groups = [
      { key: "writer", label: "WRITERS", entries: [] },
      { key: "artist", label: "ARTISTS", entries: [] },
      { key: "project", label: "PROJECTS", entries: [] },
    ];
    for (const entry of entries) {
      const card = CARD_BY_ID[entry.id];
      const key = card.kind || "project";
      groups.find((group) => group.key === key).entries.push(entry);
    }
    for (const group of groups) {
      const section = el("section", "v2-hand-group");
      section.setAttribute("aria-label", group.label.toLowerCase());
      section.appendChild(el("h4", "", group.label));
      const body = el("div", "v2-hand-group-body");
      body.style.setProperty("--group-count", Math.max(1, group.entries.length));
      for (const entry of group.entries) body.appendChild(renderHandTile(entry));
      if (!group.entries.length) body.appendChild(el("i", "v2-hand-group-empty", "—"));
      section.appendChild(body); hand.appendChild(section);
    }
  }

  function renderHandTile(entry) {
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
      return tile;
  }

  function renderChartLanes() {
    const e = UI.engine, s = e.state, panel = document.getElementById("chart-panel");
    const order = s.players.map((p) => p.id).sort((a, b) => e.bestComicFans(b) - e.bestComicFans(a));
    if (inspectedPublisher !== null && !order.includes(inspectedPublisher)) inspectedPublisher = null;
    panel.innerHTML = "<h3>&#9733; THE COMIC BOOK CHART &#9733;</h3>";
    const grid = el("div", "v2-chart-grid");
    grid.style.setProperty("--lanes", order.length);
    grid.appendChild(el("div", "v2-chart-corner", "$"));
    for (const pid of order) {
      const p = P(pid), pub = PUBLISHERS[p.color];
      const head = el("button", "v2-lane-head");
      head.type = "button";
      head.dataset.player = pid;
      head.style.setProperty("--lane", pub.color);
      head.setAttribute("aria-expanded", String(inspectedPublisher === pid));
      head.setAttribute("aria-label", `${p.pubName}${p.human ? ", your publishing house" : `, ${p.name}`}. Open publisher details.`);
      head.appendChild(spr(pub.logo, 0.42));
      head.appendChild(el("span", "", esc(p.pubName.split(" ")[0])));
      head.onclick = () => {
        SFX.play("paper");
        inspectedPublisher = inspectedPublisher === pid ? null : pid;
        renderChartLanes();
        const focus = panel.querySelector(`[data-player="${pid}"]`);
        if (focus) focus.focus();
      };
      grid.appendChild(head);
    }
    for (let fans = 10; fans >= 1; fans--) {
      grid.appendChild(el("div", "v2-chart-fan", `<span>$${TRACK_MONEY[fans]}</span><b>${fans}</b>`));
      for (const pid of order) {
        const p = P(pid), pub = PUBLISHERS[p.color];
        const cell = el("div", "v2-chart-cell");
        cell.style.setProperty("--lane", pub.color);
        const best = e.bestComicFans(pid);
        const books = s.chart.filter((comic) => comic.owner === pid && Math.min(10, comic.fans) === fans && comic.fans >= 1);
        for (const comic of books) {
          const tile = el("div", "track-tile" + (comic.isRipoff ? " ripoff" : ""));
          tile.appendChild(spr(comicSprite(comic), 0.25));
          if (comic.fans > 10) tile.appendChild(el("div", "over-badge", "+" + (comic.fans - 10)));
          if (comic.fans === best) tile.classList.add("best");
          tile.title = `${comic.title}: ${comic.fans} fans, value ${comic.value}`;
          attachZoom(tile, comicSprite(comic),
            `<b>${esc(comic.title)}</b><br>${genreDot(comic.genre)} v${comic.value} &middot; ${comic.fans}&#9829; &middot; ${esc(p.pubName)}`);
          cell.appendChild(tile);
        }
        grid.appendChild(cell);
      }
    }
    panel.appendChild(grid);
    if (inspectedPublisher !== null) panel.appendChild(renderPublisherDetails(inspectedPublisher));
  }

  function renderPublisherDetails(pid) {
    const e = UI.engine, s = e.state, p = P(pid), pub = PUBLISHERS[p.color], score = e.scorePlayer(pid);
    const detail = el("section", "v2-chart-detail");
    detail.style.setProperty("--lane", pub.color);
    detail.setAttribute("aria-label", `${p.pubName} publisher details`);
    const head = el("div", "v2-chart-detail-head");
    head.appendChild(spr(bossSprite(pid), 0.7));
    head.appendChild(el("h4", "", `${esc(p.pubName)}${p.human ? "<br>(YOU)" : `<br>${esc(p.name)}`}`));
    const close = el("button", "v2-chart-detail-close", "BACK");
    close.type = "button";
    close.onclick = () => { SFX.play("paper"); inspectedPublisher = null; renderChartLanes(); };
    head.appendChild(close); detail.appendChild(head);
    const mastery = GENRES.filter((genre) => s.mastery[genre] === pid).length;
    const unfulfilled = p.orders.map((id) => s.mapSlots[id]).filter((order) => !order.fulfilled).length;
    const stats = el("div", "v2-chart-stats");
    const stat = (label, value) => stats.appendChild(el("div", "v2-chart-stat", `<b>${label}</b>${value}`));
    stat("PROJECTED VP", score.total);
    stat("BEST COMIC", `${Math.max(0, e.bestComicFans(pid))}&#9829;`);
    stat("CASH / TICKETS", `$${p.money} / ${p.tickets}`);
    stat("EDITORS LEFT", `${p.editorsLeft}`);
    stat("PUBLISHED", p.printedCount);
    stat("MASTERY / ORDERS", `${mastery} / ${unfulfilled} open`);
    detail.appendChild(stats);
    detail.appendChild(el("div", "v2-publisher-label", "PUBLISHED COMICS"));
    const books = el("div", "v2-chart-books");
    for (const comic of s.chart.filter((item) => item.owner === pid)) {
      const cover = spr(comicSprite(comic), 0.45);
      cover.title = `${comic.title}: value ${comic.value}, ${comic.fans} fans`;
      attachZoom(cover, comicSprite(comic), `<b>${esc(comic.title)}</b><br>v${comic.value} &middot; ${comic.fans}&#9829;`);
      books.appendChild(cover);
    }
    if (!books.children.length) books.appendChild(el("i", "", "No comics published yet"));
    detail.appendChild(books);
    return detail;
  }

  function renderCompactNewsroom() {
    const s = UI.engine.state, mat = document.getElementById("hud-mat");
    const books = s.chart.filter((c) => c.owner === UI.humanId);
    mat.innerHTML = "<div class='mat-plate'>&#9733; ON THE STANDS &#9733;</div>";
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
