// ============================================================================
// AGE OF COMICS — interactive scenes: actions, specials, pendings, scoring
// ============================================================================
"use strict";

const Scenes = (() => {
  const me = () => UI.humanId;
  const E = () => UI.engine;
  function command(kind, payload = {}) {
    const result = UI.session.dispatch(kind, payload);
    if (result && typeof result.then === "function") return result;
    if (!result.ok) {
      SFX.play("error");
      toast(result.message || "That move is not available.");
    }
    return result;
  }

  function open(action) {
    switch (action) {
      case "hire": return hireScene();
      case "develop": return developScene();
      case "ideas": return ideasScene();
      case "print": return printScene();
      case "royalties": return royaltiesNow();
      case "sales": return salesScene();
    }
  }

  // ---------------------------------------------------------------- pickers
  function cardPick(container, cardId, opts = {}) {
    const d = el("div", "pick-card" + (opts.cls ? " " + opts.cls : ""));
    d.appendChild(sprHD(opts.back || cardSprite(cardId), opts.scale || 1.4));
    if (opts.label) d.appendChild(el("div", "pc-label", opts.label));
    if (opts.cost) d.appendChild(el("div", "pc-cost", opts.cost));
    if (opts.dimmed) d.classList.add("dimmed");
    d.onclick = () => { if (!opts.dimmed && opts.onpick) { SFX.play("click"); opts.onpick(d); } };
    if (!opts.back && cardId) attachZoom(d, cardSprite(cardId));
    container.appendChild(d);
    return d;
  }
  function selectOne(row, d) {
    row.querySelectorAll(".pick-card,.person,.figure,.comic-tile,.token-btn").forEach((x) => {
      x.classList.remove("selected");
      x.setAttribute("aria-pressed", "false");
    });
    d.classList.add("selected");
    d.setAttribute("aria-pressed", "true");
  }

  function confirmHandOverflow(addCount, actionLabel, onContinue, onBack) {
    const p = P(me());
    const total = p.hand.length + p.hyped.length;
    const discard = Math.max(0, total + addCount - HAND_LIMIT);
    if (!discard) return onContinue();
    openModal((m) => {
      m.appendChild(el("h2", "", "DESK LIMIT CHECK"));
      m.appendChild(el("div", "modal-sub",
        `${actionLabel} adds <b>${addCount} card${addCount === 1 ? "" : "s"}</b>: ` +
        `<b>${total} + ${addCount} = ${total + addCount}</b>, over your ${HAND_LIMIT}-card desk limit.<br><br>` +
        `If you continue, you must discard <b>${discard}</b> card${discard === 1 ? "" : "s"}. ` +
        `Nothing has been drawn or committed yet.`));
      modalButtons(m, [
        { label: "GO BACK & REASSESS", fn: () => { closeModal(); onBack(); } },
        { label: `CONTINUE — DISCARD ${discard}`, cls: "btn-go", fn: onContinue },
      ]);
    }, { width: "620px", onDismiss: () => { onBack(); } });
  }
  // animated pictogram explaining a cube special (drawn in loc-art.js)
  function specialArt(key, wpx = 168) {
    const cv = document.createElement("canvas");
    cv.className = "special-art";
    cv.style.width = wpx + "px";
    LocArt.attachSpecial(cv, key);
    return cv;
  }
  // one shared card for choosing a special action — used by BOTH the initial
  // cube placement and the 5th-book relocation, so the two can never drift
  function specialCard(sp, opts = {}) {
    const info = SPECIALS[sp];
    const d = el("div", "pick-card special-pick");
    d.dataset.sp = sp;
    d.style.maxWidth = (opts.w || 230) + "px";
    d.appendChild(specialArt(sp, opts.art || 200));
    d.appendChild(el("div", "pc-label",
      `<b style="font-family:PressStart;font-size:9px">${info.name}</b><br>` +
      `<i>after ${ACTION_INFO[info.after].verb}</i><br>${info.desc}` +
      (opts.note ? `<br><b class="sp-note">&#9632; ${opts.note}</b>` : "")));
    d.setAttribute("aria-label",
      `${info.name}: triggers after ${ACTION_INFO[info.after].verb}. ${String(info.desc).replace(/<[^>]*>/g, "")}` +
      (opts.note ? ` (${opts.note})` : ""));
    d.setAttribute("aria-pressed", "false");
    return d;
  }

  // ------------------------------------------------------------------- HIRE
  function hireScene(initial = {}) {
    const e = E(), s = e.state;
    const sel = { writer: initial.writer || null, artist: initial.artist || null };
    openModal((m) => {
      panelHead(m, "hire", "TALENT AGENCY &mdash; HIRE",
        "Sign one writer and one artist from the lobby — or gamble on whoever answered the classified ad. &#10022;-rookies bring a free idea.");
      for (const kind of ["writer", "artist"]) {
        const key = kind + "s";
        const body = panelSection(m, `ON OFFER &mdash; ${kind.toUpperCase()}S IN THE LOBBY`);
        const row = el("div", "card-row balloon-row");
        for (const c of s.display[key]) {
          const card = CARD_BY_ID[c];
          const figure = personFigure(c, {
            cls: "pickable",
            balloon: `${kind === "writer" ? "I write" : "I draw"} <b style="color:${GENRE_INFO[card.genre].color}">${GENRE_INFO[card.genre].name}</b>!`,
            onpick: (d) => {
              sel[kind] = c;
              selectOne(row, d);
              if (card.value === 1)
                toast(`${sprHTML("idea_" + card.genre, 0.55)} ${esc(card.name)} is a rookie — signs with a FREE ${GENRE_INFO[card.genre].name} idea!`);
              refresh();
            },
          });
          if (sel[kind] === c) figure.classList.add("selected");
          row.appendChild(figure);
        }
        if (s.decks[key].length + s.discards[key].length > 0) {
          const topVal = s.decks[key].length ? CARD_BY_ID[s.decks[key][s.decks[key].length - 1]].value : 1;
          const mystery = mysteryFigure(kind, topVal, {
            cls: "pickable",
            onpick: (d) => { sel[kind] = "deck"; selectOne(row, d); refresh(); },
          });
          if (sel[kind] === "deck") mystery.classList.add("selected");
          row.appendChild(mystery);
        }
        body.appendChild(row);
      }
      const foot = panelFooter(m);
      modalButtons(m, [
        { label: "CANCEL", fn: () => { closeModal(); } },
        { label: "SIGN THEM", cls: "btn-go", id: "hire-ok", fn: () => {
            closeModal();
            confirmHandOverflow(2, "Hiring this team", () => {
              const result = command("action_hire", sel);
              if (!result.ok) return;
              closeModal();
              Main.afterHumanMove();
            }, () => hireScene(sel));
          }, disabled: true },
      ]);
      function pickName(id, kind) {
        if (!id) return `<b style="color:#8a2f22">pick a ${kind}</b>`;
        if (id === "deck") return `the classified-ad ${kind} <i>(blind)</i>`;
        const c = CARD_BY_ID[id];
        return `<b>${esc(c.name)}</b> (${GENRE_INFO[c.genre].name} ${"&#10022;".repeat(c.value)})`;
      }
      function refresh() {
        const rookies = [sel.writer, sel.artist]
          .filter((c) => c && c !== "deck" && CARD_BY_ID[c].value === 1).length;
        foot.innerHTML = `<b>Free.</b> You sign ${pickName(sel.writer, "writer")} + ${pickName(sel.artist, "artist")}` +
          (rookies ? ` &middot; <b>+${rookies} free idea${rookies > 1 ? "s" : ""}</b> (rookie)` : "");
        m.querySelector("#hire-ok").disabled = !(sel.writer && sel.artist);
      }
      refresh();
    }, { width: "860px", onDismiss: () => {} });
  }

  // ---------------------------------------------------------------- DEVELOP
  function developScene(initial = null) {
    const e = E(), s = e.state;
    let sel = initial ? { ...initial } : null; // {comic} | {searchGenre}
    openModal((m) => {
      panelHead(m, "develop", "WRITERS' ROOM &mdash; DEVELOP",
        "Option one comic for future printing. Getting it on the presses later takes a writer + artist team, their fee, and 2 matching ideas.");
      const body = panelSection(m, "ON OFFER &mdash; PITCHES ON THE TABLE");
      const row = el("div", "card-row");
      for (const c of s.display.comics) {
        const tile = comicTile(c, {
          cls: "pickable",
          onpick: (d) => { sel = { comic: c }; selectOne(m, d); refresh(); },
        });
        if (sel && sel.comic === c) tile.classList.add("selected");
        row.appendChild(tile);
      }
      if (s.decks.comics.length + s.discards.comics.length > 0) {
        // blind draw off the slush pile: a face-down back + the "?" mark
        const blind = cardPick(row, null, {
          back: "back_orig_" + (s.decks.comics.length ? CARD_BY_ID[s.decks.comics[s.decks.comics.length - 1]].genre : "scifi"),
          label: "Slush pile<br><i>blind draw</i>",
          onpick: (d) => { sel = { comic: "deck" }; selectOne(m, d); refresh(); },
        });
        blind.appendChild(el("div", "pc-cost", "?"));
        if (sel && sel.comic === "deck") blind.classList.add("selected");
        blind.setAttribute("aria-label", "Slush pile — option the top comic of the deck, blind");
      }
      body.appendChild(row);
      const gbody = panelSection(m, "OR COMMISSION A GENRE ($4) &mdash; search the deck");
      const grow = el("div", "card-row");
      for (const g of GENRES) {
        const t = el("div", "token-btn" + (P(me()).money < 4 ? " dimmed" : ""));
        t.appendChild(spr("genreicon_" + g, 1.05));
        t.appendChild(el("span", "", GENRE_INFO[g].name));
        t.setAttribute("aria-label", `Commission a ${GENRE_INFO[g].name} original for $4` +
          (P(me()).money < 4 ? " (you can't afford it)" : ""));
        t.onclick = () => {
          if (P(me()).money < 4) { SFX.play("error"); return toast("A commission costs $4 — you're short."); }
          SFX.play("click");
          m.querySelectorAll(".pick-card,.token-btn").forEach((x) => x.classList.remove("selected"));
          t.classList.add("selected");
          sel = { searchGenre: g };
          refresh();
        };
        if (sel && sel.searchGenre === g) t.classList.add("selected");
        grow.appendChild(t);
      }
      gbody.appendChild(grow);
      const foot = panelFooter(m);
      modalButtons(m, [
        { label: "CANCEL", fn: () => closeModal() },
        { label: "OPTION IT", cls: "btn-go", id: "dev-ok", disabled: true, fn: () => {
            closeModal();
            confirmHandOverflow(1, "Optioning this comic", () => {
              const result = command("action_develop", sel);
              if (!result.ok) return;
              closeModal();
              Main.afterHumanMove();
            }, () => developScene(sel));
          } },
      ]);
      function refresh() {
        const p = P(me());
        if (!sel) {
          foot.innerHTML = `<b style="color:#8a2f22">Pick a pitch, the slush pile, or a commission.</b>`;
        } else if (sel.searchGenre) {
          foot.innerHTML = `<b>$4.</b> The deck is searched for the <b>${GENRE_INFO[sel.searchGenre].name}</b> original of your choice.`;
        } else if (sel.comic === "deck") {
          foot.innerHTML = `<b>Free.</b> The top comic of the slush pile lands on your desk — sight unseen.`;
        } else {
          const card = CARD_BY_ID[sel.comic];
          foot.innerHTML = `<b>Free.</b> <b>${esc(card.title)}</b> goes to your desk &middot; ` +
            `printing it later needs <b>2 ${GENRE_INFO[card.genre].name}</b> ideas (you hold ${p.ideas[card.genre]}) ` +
            `&middot; prints with ${bonusLabel(card.bonus)}`;
        }
        m.querySelector("#dev-ok").disabled = !sel;
      }
      refresh();
    }, { width: "860px", onDismiss: () => {} });
  }
  function bonusLabel(b) {
    return { fan: "+1 fan", ideas: "2 ideas", ticket: "transport ticket", money: "+$4" }[b];
  }

  // ------------------------------------------------------------------ IDEAS
  function ideasScene() {
    const e = E(), s = e.state;
    const slot = e.nextSlot("ideas");
    const fromBoard = IDEAS_SLOTS[slot];
    const board = [], supply = [];
    openModal((m) => {
      panelHead(m, "ideas", "CAFE BIZARRE &mdash; IDEAS",
        fromBoard > 0
          ? `Your seat takes up to <b>${fromBoard}</b> coin${fromBoard === 1 ? "" : "s"} off the table, plus <b>2 of your choice</b> from the counter.`
          : `The table's picked clean at this seat — but the counter still pours: take <b>2 coins of your choice</b>.`);
      // ON OFFER: the six genre coins sit physically on the café table;
      // taken ones stay visible but faded (they return next round)
      const offer = panelSection(m, `ON OFFER &mdash; THE TABLE${fromBoard > 0 ? ` (take up to ${fromBoard})` : " (not from your seat)"}`);
      const table = el("div", "cafe-table");
      const tableCoins = {};
      GENRES.forEach((g) => {
        const avail = s.boardIdeas[g] > 0;
        const t = el("div", "table-coin" + (avail ? "" : " taken"));
        t.appendChild(spr("idea_" + g, 1));
        t.appendChild(el("span", "", GENRE_INFO[g].name));
        tableCoins[g] = t;
        t.setAttribute("aria-pressed", "false");
        t.onclick = () => {
          if (!avail) { SFX.play("error"); return toast(`The ${GENRE_INFO[g].name} coin is already taken — back next round.`); }
          if (fromBoard === 0) { SFX.play("error"); return toast("Your seat takes no coins from the table — counter only."); }
          const i = board.indexOf(g);
          if (i >= 0) board.splice(i, 1);
          else if (board.length < fromBoard) board.push(g);
          else { SFX.play("error"); return toast(`Your seat only takes ${fromBoard} from the table — return one first.`); }
          SFX.play("click");
          refresh();
        };
        table.appendChild(t);
      });
      offer.appendChild(table);
      // the counter: the always-available supply, duplicates welcome
      const counter = panelSection(m, "THE COUNTER (take 2 &mdash; doubles welcome)");
      const crow = el("div", "counter-row");
      const counterCoins = {};
      GENRES.forEach((g) => {
        const t = el("div", "table-coin");
        t.dataset.tutGenre = g;
        t.appendChild(spr("idea_" + g, 1));
        t.appendChild(el("span", "", GENRE_INFO[g].name));
        counterCoins[g] = t;
        t.onclick = () => {
          if (supply.length >= 2) { SFX.play("error"); return toast("Your tray already holds 2 counter coins — tap one on the tray to put it back."); }
          SFX.play("click");
          supply.push(g);
          refresh();
        };
        crow.appendChild(t);
      });
      counter.appendChild(crow);
      // YOUR PICK: the tray that carries your haul out the door
      const pickBody = panelSection(m, "YOUR PICK &mdash; THE TRAY");
      const tray = el("div", "pick-tray");
      pickBody.appendChild(tray);
      const foot = panelFooter(m);
      modalButtons(m, [
        { label: "CANCEL", fn: () => closeModal() },
        { label: "BRAINSTORM", cls: "btn-go", id: "ideas-ok", disabled: true, fn: () => {
            const result = command("action_ideas", { board, supply });
            if (!result.ok) return;
            closeModal();
            Main.afterHumanMove();
          } },
      ]);
      function traySlot(g, cap, onremove) {
        const d = el("div", "tray-slot" + (g ? " filled" : ""));
        if (g) {
          d.appendChild(spr("idea_" + g, 0.7));
          d.title = `Put the ${GENRE_INFO[g].name} coin back`;
          d.setAttribute("aria-label", `${GENRE_INFO[g].name} idea in your tray — put it back on the ${cap}`);
          d.onclick = () => { SFX.play("click"); onremove(); refresh(); };
        } else {
          d.title = `Empty tray spot (${cap})`;
        }
        return d;
      }
      function refresh() {
        // the table reflects the tray: picked coins leave a chalk ghost
        GENRES.forEach((g) => {
          const t = tableCoins[g];
          t.classList.toggle("picked", board.includes(g));
          t.setAttribute("aria-pressed", String(board.includes(g)));
          t.setAttribute("aria-label", s.boardIdeas[g] > 0
            ? `${GENRE_INFO[g].name} idea coin on the table${board.includes(g) ? " — in your tray" : ""}`
            : `${GENRE_INFO[g].name} idea coin — already taken, back next round`);
          counterCoins[g].setAttribute("aria-label",
            `Take a ${GENRE_INFO[g].name} idea coin from the counter`);
        });
        tray.innerHTML = "";
        if (fromBoard > 0) {
          const gTable = el("div", "tray-group");
          gTable.appendChild(el("span", "tray-cap", "TABLE"));
          for (let i = 0; i < fromBoard; i++)
            gTable.appendChild(traySlot(board[i], "table", () => board.splice(i, 1)));
          tray.appendChild(gTable);
        }
        const gCnt = el("div", "tray-group");
        gCnt.appendChild(el("span", "tray-cap", "COUNTER"));
        for (let i = 0; i < 2; i++)
          gCnt.appendChild(traySlot(supply[i], "counter", () => supply.splice(i, 1)));
        tray.appendChild(gCnt);
        const total = board.length + supply.length;
        // "up to N" from the table — taking fewer (or none) is always legal;
        // the 2 counter coins are the only requirement
        const ready = supply.length === 2;
        foot.innerHTML = `<b>Free.</b> You leave with <b>${total} idea${total === 1 ? "" : "s"}</b>` +
          (board.length ? ` &middot; ${board.length} from the table` : "") +
          ` &middot; ${supply.length}/2 from the counter` +
          (ready ? "" : ` — <b style="color:#8a2f22">pick ${2 - supply.length} more from the counter</b>`);
        m.querySelector("#ideas-ok").disabled = !ready;
        a11ySweep(m);
      }
      refresh();
    }, { width: "720px", onDismiss: () => {} });
  }

  // ------------------------------------------------------------------ PRINT
  function printScene() {
    const e = E(), s = e.state, p = P(me());
    const slot = e.nextSlot("print");
    const x2 = slot === 0;
    const books = [];
    buildBook(1);

    function buildBook(n) {
      const sel = { type: "original", comic: null, target: null, writer: null, artist: null };
      const usedCards = books.flatMap((b) => [b.writer, b.artist, b.comic].filter(Boolean));
      let recommended = null;
      openModal((m) => {
        const head = panelHead(m, "print", `PRINT FLOOR &mdash; BOOK ${n}${x2 ? " of up to 2" : ""}`, "&nbsp;");
        const sub = head.querySelector(".ph-tag"); // filled per ORIGINAL/RIP-OFF below

        // type toggle
        const ripTargets = s.chart.filter((c) => !c.isRipoff && c.owner !== me() && !s.rippedOriginals[c.cardId]);
        if (e.cfg.useRipoffs && ripTargets.length) {
          const tg = el("div", "choice-group");
          for (const [v, lbl] of [["original", "ORIGINAL"], ["ripoff", "RIP-OFF"]]) {
            const b = el("button", "choice" + (v === sel.type ? " active" : ""), lbl);
            b.onclick = () => {
              SFX.play("click");
              sel.type = v; sel.comic = sel.target = sel.writer = sel.artist = null;
              recommended = null;
              tg.querySelectorAll(".choice").forEach((x) => x.classList.remove("active"));
              b.classList.add("active");
              renderComicRow();
              renderTeamGrid();
              refresh();
            };
            tg.appendChild(b);
          }
          m.appendChild(tg);
        }

        const bookBody = panelSection(m, "ON OFFER &mdash; THE BOOK");
        const comicRow = el("div", "card-row");
        bookBody.appendChild(comicRow);

        const teamBody = panelSection(m, "YOUR TEAM &mdash; MATCHED BY GENRE");
        const teamHint = el("div", "team-recommendation",
          "Choose a book first. The strongest affordable team will be selected for you.");
        const teamGrid = el("div", "print-team-grid");
        teamBody.appendChild(teamHint);
        teamBody.appendChild(teamGrid);

        const preview = panelFooter(m);

        modalButtons(m, [
          { label: books.length ? "PRINT WHAT I HAVE" : "CANCEL", fn: () => {
              closeModal();
              if (books.length) commit();
            } },
          { label: "PRINT IT", cls: "btn-go", id: "print-ok", disabled: true, fn: () => {
              books.push(toSpec());
              closeModal();
              if (x2 && books.length === 1 && canBuildSecond()) askSecond();
              else commit();
            } },
        ]);

        function renderComicRow() {
          comicRow.innerHTML = "";
          if (sel.type === "original") {
            const comics = p.hand.filter((c) => !CARD_BY_ID[c].kind && !usedCards.includes(c))
              .concat(p.hyped.map((h) => h.cardId).filter((c) => !usedCards.includes(c)));
            if (!comics.length) comicRow.appendChild(el("i", "", "No comic projects on your desk — visit the Writers' Room first."));
            for (const c of comics) {
              const card = CARD_BY_ID[c];
              const hy = p.hyped.find((h) => h.cardId === c);
              const resources = projectedResources(card.genre);
              const enough = resources.ideas[card.genre] >= 2;
              const tile = comicTile(c, {
                cls: "pickable",
                extra: (hy ? ` <span class="chip" style="background:#d94f43;color:#fff">HYPE +${hy.tokens * 2}</span>` : "") +
                  `<div style="font-size:14px">${enough ? `needs 2 ${GENRE_INFO[card.genre].name} ideas` : `<b style='color:#a00'>not enough ideas!</b>`}</div>`,
                onpick: (d) => { sel.comic = c; selectOne(comicRow, d); recommendTeam(); refresh(); },
              });
              tile.dataset.cardId = c;
              comicRow.appendChild(tile);
            }
          } else {
            for (const t of ripTargets.filter((target) => !books.some((b) => b.type === "ripoff" && b.target === target.idx))) {
              const idxInGenre = COMICS.filter((c) => c.genre === t.genre).findIndex((c) => c.id === t.cardId) + 1;
              const d = el("div", "comic-tile pickable");
              d.appendChild(sprHD(`cover_rip_${t.genre}_${idxInGenre}`, 1.2));
              d.appendChild(el("div", "ct-info",
                `<div class="ct-title">${esc(RIPOFF_TITLES[t.cardId])}</div>` +
                `<div style="font-size:14px">${genreMark(t.genre, 0.5)} rips off <b>${esc(t.title)}</b><br>(${esc(P(t.owner).pubName)})</div>`));
              d.onclick = () => { SFX.play("click"); sel.target = t.idx; selectOne(comicRow, d); recommendTeam(); refresh(); };
              comicRow.appendChild(d);
            }
          }
        }
        function targetGenre() {
          if (sel.type === "original" && sel.comic) return CARD_BY_ID[sel.comic].genre;
          if (sel.type === "ripoff" && sel.target !== null) return s.chart[sel.target].genre;
          return null;
        }
        function projectedResources(forGenre) {
          let money = p.money;
          const ideas = Object.fromEntries(GENRES.map((g) => [g, p.ideas[g]]));
          let flexibleIdeaBonuses = 0;
          for (const book of books) {
            money -= CARD_BY_ID[book.writer].value + CARD_BY_ID[book.artist].value;
            if (book.type !== "original") continue;
            const comic = CARD_BY_ID[book.comic];
            ideas[comic.genre] -= 2;
            if (comic.bonus === "money") money += 4;
            if (comic.bonus === "ideas") flexibleIdeaBonuses += 2;
          }
          if (forGenre && flexibleIdeaBonuses) ideas[forGenre] += flexibleIdeaBonuses;
          return { money, ideas, flexibleIdeaBonuses };
        }
        function plansForSelection() {
          const genre = targetGenre();
          if (!genre) return [];
          const resources = projectedResources(genre);
          return AI.rankPrintTeams(e, me(), toSpec(), {
            excluded: usedCards, money: resources.money, ideas: resources.ideas,
          });
        }
        function recommendTeam() {
          recommended = plansForSelection()[0] || null;
          sel.writer = recommended ? recommended.writer : null;
          sel.artist = recommended ? recommended.artist : null;
          renderTeamGrid();
        }
        function renderTeamGrid() {
          teamGrid.innerHTML = "";
          const available = p.hand.filter((c) => CARD_BY_ID[c].kind && !usedCards.includes(c));
          const genre = targetGenre();
          const order = genre ? [genre, ...GENRES.filter((g) => g !== genre)] : GENRES;
          for (const g of order) {
            const inGenre = available.filter((id) => CARD_BY_ID[id].genre === g);
            if (!inGenre.length) continue;
            const lane = el("div", "print-genre-lane" + (g === genre ? " target-genre" : ""));
            lane.appendChild(el("div", "print-genre-head", `${genreMark(g, 0.62)} <b>${GENRE_INFO[g].name}</b>${g === genre ? " <span>MATCH</span>" : ""}`));
            for (const kind of ["writer", "artist"]) {
              const row = el("div", "print-role-row");
              row.appendChild(el("div", "print-role-label", `${sprHTML("tag_" + kind, 0.58)}<span>${kind.toUpperCase()}</span>`));
              const cards = inGenre.filter((id) => CARD_BY_ID[id].kind === kind)
                .sort((a, b) => CARD_BY_ID[b].value - CARD_BY_ID[a].value || a.localeCompare(b));
              if (!cards.length) row.appendChild(el("span", "print-role-empty", "—"));
              for (const id of cards) {
                const isBest = recommended && recommended[kind] === id;
                const figure = personFigure(id, {
                  cls: "pickable compact" + (isBest ? " team-best" : ""), noRookie: true, noZoom: true,
                  onpick: (d) => {
                    sel[kind] = id;
                    teamGrid.querySelectorAll(`[data-kind="${kind}"]`).forEach((x) => x.classList.remove("selected"));
                    d.classList.add("selected");
                    refresh();
                  },
                });
                figure.dataset.kind = kind;
                figure.dataset.cardId = id;
                if (sel[kind] === id) figure.classList.add("selected");
                if (isBest) figure.setAttribute("aria-label", figure.getAttribute("aria-label") + ", recommended team");
                row.appendChild(figure);
              }
              lane.appendChild(row);
            }
            teamGrid.appendChild(lane);
          }
          if (!available.some((id) => CARD_BY_ID[id].kind === "writer") ||
              !available.some((id) => CARD_BY_ID[id].kind === "artist")) {
            teamGrid.appendChild(el("i", "", "A print team needs one available writer and one available artist."));
          }
          teamHint.innerHTML = recommended
            ? `<b>RECOMMENDED TEAM PRESELECTED</b> &middot; ${esc(CARD_BY_ID[recommended.writer].name)} + ${esc(CARD_BY_ID[recommended.artist].name)} &middot; ${recommended.fans} projected fans`
            : "Choose a book first. The strongest affordable team will be selected for you.";
        }
        function toSpec() {
          return sel.type === "original"
            ? { type: "original", comic: sel.comic, writer: sel.writer, artist: sel.artist }
            : { type: "ripoff", target: sel.target, writer: sel.writer, artist: sel.artist };
        }
        function refresh() {
          const w = sel.writer && CARD_BY_ID[sel.writer], a = sel.artist && CARD_BY_ID[sel.artist];
          const cost = (w ? w.value : 0) + (a ? a.value : 0);
          const genre = targetGenre();
          const resources = projectedResources(genre);
          const counter = (icon, label, need, have, good) =>
            `<span class="resource-counter ${good ? "ok" : "miss"}">${sprHTML(icon, 0.62)}` +
            `<span><b>${need}</b> needed<br><small>${have} available &middot; ${label}</small></span></span>`;
          const counters = [];
          if (sel.type === "original") {
            const c = sel.comic && CARD_BY_ID[sel.comic];
            if (c) counters.push(counter("idea_" + c.genre, GENRE_INFO[c.genre].name + " ideas",
              2, resources.ideas[c.genre], resources.ideas[c.genre] >= 2));
          }
          counters.push(counter("coin_1", "team fee", `$${cost}`, `$${resources.money}`, resources.money >= cost));
          let txt = "";
          const matchingPlan = plansForSelection().find((plan) => plan.writer === sel.writer && plan.artist === sel.artist);
          let ok = !!matchingPlan && matchingPlan.feasible;
          if (sel.type === "original" && sel.comic && w && a) {
            const c = CARD_BY_ID[sel.comic];
            txt = `<b>${esc(c.title)}</b> &middot; launches with ~<b>${matchingPlan ? matchingPlan.fans : 0} fans</b> &middot; bonus: ${bonusLabel(c.bonus)}`;
          } else if (sel.type === "ripoff" && sel.target !== null && w && a) {
            txt = `No ideas needed &middot; launches with ~<b>${matchingPlan ? matchingPlan.fans : 0} fans</b>`;
          }
          if (resources.flexibleIdeaBonuses && n === 2)
            txt += ` <span class="projection-note">Book 1's idea bonus is assigned before this book.</span>`;
          preview.innerHTML = `<div class="print-ledger">${counters.join("")}</div>` +
            `<div class="print-result">${txt || "Pick a book and a complete team to see the result."}</div>`;
          m.querySelector("#print-ok").disabled = !ok;
          sub.innerHTML = sel.type === "original"
            ? "Choose a comic. A recommended writer + artist team is selected automatically; change either person if you prefer."
            : "Choose a rival original to copy. No ideas are required; the recommended team is selected automatically.";
        }
        renderComicRow();
        renderTeamGrid();
        refresh();
      }, { width: "900px", onDismiss: n === 1 ? () => {} : undefined });
    }
    function canBuildSecond() {
      const used = books.flatMap((b) => [b.writer, b.artist, b.comic].filter(Boolean));
      return p.hand.some((c) => CARD_BY_ID[c].kind === "writer" && !used.includes(c)) &&
             p.hand.some((c) => CARD_BY_ID[c].kind === "artist" && !used.includes(c));
    }
    function askSecond() {
      openModal((m) => {
        m.appendChild(el("h2", "", "THE PRESSES ARE HOT!"));
        m.appendChild(el("div", "modal-sub", "First editor on the print floor may run <b>two books</b> in one action. Print a second one? (Bonuses from the first book can pay for the second.)"));
        modalButtons(m, [
          { label: "JUST THE ONE", fn: () => { closeModal(); commit(); } },
          { label: "PRINT A SECOND!", cls: "btn-go", fn: () => { closeModal(); buildBook(2); } },
        ]);
      });
    }
    function commit() {
      if (!books.length) return;
      const result = command("action_print", { books });
      if (result.ok) Main.afterHumanMove();
    }
  }

  // -------------------------------------------------------------- ROYALTIES
  function royaltiesNow() {
    const e = E();
    const amt = ROYALTIES_SLOTS[e.nextSlot("royalties")];
    const result = command("action_royalties");
    if (!result.ok) return;
    toast(`+$${amt} royalties`);
    Main.afterHumanMove();
  }

  // ------------------------------------------------------------------ SALES
  function salesScene(resume = false) {
    const e = E(), s = e.state;
    if (!resume) {
      // preview first: look at the map, see what the seat offers, back out freely
      const slot = e.nextSlot("sales");
      const n = SALES_SLOTS[slot];
      openModal((m) => {
        m.appendChild(el("h2", "", "MANHATTAN &mdash; SCOUT THE NEWSSTANDS"));
        m.appendChild(el("div", "modal-sub",
          `This seat lets you <b>flip up to ${n}</b> and <b>collect up to ${n}</b> sales orders. No editor placed yet — you can still walk away.`));
        const ref = el("div", "run-ref horizontal");
        renderCatalog(ref);
        m.appendChild(ref);
        const cv = el("canvas");
        cv.id = "map-canvas";
        cv.style.width = "min(840px, calc(102vh / var(--z, 1)))";
        cv.style.alignSelf = "center";
        m.appendChild(cv);
        modalButtons(m, [
          { label: "NOT TODAY", fn: () => closeModal() },
          { label: `START THE RUN (${n}/${n})`, cls: "btn-go", fn: () => {
              const result = command("sales_start");
              if (result.ok) { closeModal(); runModal(); }
            } },
        ]);
        MapView.attach(cv, false, null);
      }, { width: "900px", onDismiss: () => {} });
      return;
    }
    runModal();

    function runModal() {
    UI.salesParked = false; // any (re)opened run un-parks it
    let ticketMode = false;
    openModal((m) => {
      m.classList.add("sales-run-modal");
      m.appendChild(el("h2", "", "MANHATTAN &mdash; SALES RUN"));
      const workspace = el("div", "sales-workspace");
      m.appendChild(workspace);
      const hud = el("div", "map-hud");
      hud.setAttribute("aria-label", "Sales run status");
      workspace.appendChild(hud);
      const mapPane = el("div", "sales-map-pane");
      const cv = el("canvas");
      cv.id = "map-canvas";
      cv.style.width = "min(860px, 100%)";
      cv.style.alignSelf = "center";
      mapPane.appendChild(cv);
      cv.setAttribute("aria-hidden", "true"); // keys + spoken narration are the non-visual path
      // the map region takes real keyboard control: arrows drive the agent
      // directly (the old dispatch button list is gone)
      mapPane.tabIndex = 0;
      mapPane.setAttribute("role", "application");
      mapPane.setAttribute("aria-label",
        "Manhattan sales run. Arrow keys walk or cab one block; on the central X, arrows choose an avenue and Enter departs. " +
        "Space cycles the newsstands at your corner, Enter flips or collects the selected one. " +
        "D cuts across the plaza diagonal, T arms a ticket, E ends the run, M minimizes. Every result is announced.");
      mapPane.appendChild(el("div", "modal-sub sales-legend",
        "<b>&#8592;&#8593;&#8595;&#8594;</b> walk/cab &middot; <b>SPACE</b> next stand &middot; <b>ENTER</b> flip/collect &middot; " +
        "<b>D</b> cut the X &middot; <b>T</b> ticket &middot; <b>E</b> end &middot; <b>M</b> minimize<br>" +
        "<b>GREEN</b> free walk &middot; <b>GOLD</b> $2 cab &middot; <b>RED</b> blocked or rival fee &middot; the mouse works everywhere too."));
      workspace.appendChild(mapPane);
      const dispatchCol = el("div", "dispatch-col");
      // the dispatch desk keeps your catalog pinned in view: which orders you
      // can actually deliver is THE question when deciding where to run
      const refPane = el("div", "run-ref");
      dispatchCol.appendChild(refPane);
      workspace.appendChild(dispatchCol);
      const actionBar = modalButtons(workspace, [
        // park the run and return to the desk: the session survives in the
        // engine and the Manhattan Map space becomes the resume button, so
        // the player can consult hand/projects/chart mid-run
        { label: "&#9662; MINIMIZE", fn: () => {
            SFX.play("paper");
            UI.salesParked = true; // advance() must not auto-reopen the run
            closeModal();
            renderLocations();
            toast("Run parked &mdash; the Manhattan Map space brings you back");
          } },
        { label: "USE TICKET", id: "btn-ticket", fn: (btn) => {
            if (P(me()).tickets <= 0) return;
            ticketMode = !ticketMode;
            btn.classList.toggle("btn-go", ticketMode);
            if (!ticketMode) clearKb();
            toast(ticketMode ? "Ticket armed: click anywhere, or steer the arrows and press Enter" : "Ticket disarmed");
          } },
        { label: (UI.animFast ? "&#9193; FAST: ON" : "&#9193; FAST: OFF"), id: "btn-anim-fast", fn: (btn) => {
            UI.animFast = !UI.animFast;
            try { localStorage.setItem("aoc-anim-fast", UI.animFast ? "1" : ""); } catch (_e) {}
            btn.innerHTML = UI.animFast ? "&#9193; FAST: ON" : "&#9193; FAST: OFF";
            btn.setAttribute("aria-pressed", String(UI.animFast));
            toast(UI.animFast ? "Fast animations on — cab rides hurry along"
              : "Fast animations off — enjoy the cab ride");
          } },
        { label: "END SALES RUN", cls: "btn-danger", id: "btn-end-run", fn: () => {
            if (!command("sales_end").ok) return failed("You owe $2 for this corner — you can't end here.");
            closeModal();
            Main.afterHumanMove();
          } },
      ]);
      actionBar.classList.add("sales-actions");
      refreshHud();
      const act = (h) => {
        const ses = s.salesSession;
        if (!ses) return;
        if (h.node !== undefined) {
          if (h.node === "X") return SFX.play("error");
          const from = P(me()).agentNode;
          if (h.node === from) return;
          if (ticketMode && P(me()).tickets > 0) {
            if (!command("sales_move", { node: h.node, ticket: true }).ok)
              return failed("You can't afford the $2 fee on that rival's corner.");
            MapView.queueMove(me(), from, h.node, "ticket");
            ticketMode = false;
            m.querySelector("#btn-ticket").classList.remove("btn-go");
          } else {
            // walk one block, or hail a cab along the shortest route
            const path = MapView.pathTo(from, h.node);
            if (!path) return failed("No route there.");
            const cost = Math.max(0, path.length - (ses.freeWalk ? 1 : 0)) * 2;
            if (cost > P(me()).money)
              return failed(`That ride costs $${cost}` + (P(me()).tickets > 0 ? " — arm a ticket instead!" : "."));
            let cur = from;
            for (const step of path) {
              const mode = ses.freeWalk ? "walk" : "cab";
              if (!command("sales_move", { node: step, ticket: false }).ok) {
                failed("You can't afford the $2 fee on a rival's corner along that route.");
                break;
              }
              MapView.queueMove(me(), cur, step, mode);
              cur = step;
            }
          }
        } else if (h.slot) {
          const t = h.slot;
          if (!t.nodes.includes(P(me()).agentNode)) return failed("Your agent isn't at that corner.");
          if (!t.faceUp) {
            if (ses.flipsLeft > 0) command("sales_flip", { slotId: t.id });
            else if (ses.collectsLeft > 0) command("sales_collect", { slotId: t.id }); // blind collect
            else return failed("No flips or collections left.");
          } else {
            if (ses.collectsLeft <= 0) return failed("No collections left.");
            command("sales_collect", { slotId: t.id });
          }
        }
        flushEvents();
        refreshHud();
        renderHUD();
        // a collect may trigger a decision (which comic gets the fans)
        if (s.pending && s.pending.playerId === me()) {
          closeModal();
          Main.advance();
        }
      };
      MapView.attach(cv, true, act);

      // ---- direct keyboard control (replaces the old dispatch button list):
      // arrows drive the agent, SPACE/ENTER work the stands, the engine's own
      // legality checks answer every press, and every result is announced
      let kbSlot = -1;   // selected stand at the current corner
      let xSel = -1;     // avenue choice while standing on the X
      let cursor = null; // free destination cursor while a ticket is armed
      const XORDER = [9, 13, 14, 10]; // the four avenues, clockwise
      const DIAG = { 9: 14, 14: 9, 10: 13, 13: 10 };
      const grid = (n) => ({ gx: MAP.nodes[n].r, gy: MAP.nodes[n].c });
      function axisNeighbors(n) {
        const adj = [];
        for (const [a, b] of MAP.edges) {
          if (a === n) adj.push(b);
          if (b === n) adj.push(a);
        }
        return adj;
      }
      function dirTarget(from, dx, dy) {
        if (from === "X") return null;
        const g = grid(from);
        return axisNeighbors(from).find((nd) => {
          const gm = grid(nd);
          return Math.sign(gm.gx - g.gx) === dx && Math.sign(gm.gy - g.gy) === dy;
        });
      }
      function clearKb() { kbSlot = -1; xSel = -1; cursor = null; MapView.setKbFocus(null); }
      function standsSummary() {
        const tiles = e.slotsAtAgent(me());
        if (!tiles.length) return P(me()).agentNode === "X" ? "No stands at the station." : "No free stands here.";
        return tiles.map((t, i) => t.faceUp
          ? `stand ${i + 1}: ${GENRE_INFO[t.genre].name}, needs ${t.minVal}, pays ${t.fans}`
          : `stand ${i + 1}: face-down`).join("; ") + ".";
      }
      function goTo(target) {
        clearKb();
        act({ node: target });
        if (s.salesSession && P(me()).agentNode === target)
          announce(`${cornerName(target)}. ${standsSummary()}`);
      }
      function onKey(ev) {
        if (!s.salesSession) return;
        const key = ev.key;
        const onButton = ev.target && ev.target.tagName === "BUTTON";
        const ARROWS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
        if (ARROWS[key]) {
          ev.preventDefault();
          const [dx, dy] = ARROWS[key];
          const from = P(me()).agentNode;
          if (ticketMode && P(me()).tickets > 0) {
            // the armed ticket steers a free cursor to ANY corner; Enter rides
            const start = cursor !== null ? cursor : from;
            const nxt = start === "X" ? XORDER[0] : dirTarget(start, dx, dy);
            if (nxt === undefined || nxt === null) return failed("No street that way.");
            cursor = nxt;
            MapView.setKbFocus({ node: cursor });
            announce(`Ticket to ${cornerName(cursor)}? Enter to ride.`);
            return;
          }
          if (from === "X") {
            // the plaza's four avenues are diagonal: arrows cycle, Enter departs
            const dir = dx > 0 || dy > 0 ? 1 : -1;
            xSel = ((xSel < 0 ? (dir > 0 ? 0 : XORDER.length - 1) : xSel + dir) + XORDER.length) % XORDER.length;
            const target = XORDER[xSel];
            MapView.setKbFocus({ node: target });
            const chk = e.salesMoveCheck(me(), target);
            announce(`${cornerName(target)} — ${chk.cabFare ? "$2 cab" : "free"}` +
              `${chk.occupied ? ", rival's corner, $2 fee" : ""}${chk.ok ? "" : ", blocked"}. Enter to go.`);
            return;
          }
          const target = dirTarget(from, dx, dy);
          if (target === undefined || target === null) return failed("No street that way.");
          goTo(target);
          return;
        }
        if (key === "d" || key === "D") {
          // cut across the plaza: the diagonal avenue between central corners
          const from = P(me()).agentNode;
          if (DIAG[from] === undefined) return failed("No diagonal avenue at this corner.");
          ev.preventDefault();
          goTo(DIAG[from]);
          return;
        }
        if (key === " " || key === "Enter") {
          if (onButton) return; // buttons keep their native activation
          ev.preventDefault();
          if (key === "Enter" && ticketMode && cursor !== null) {
            const target = cursor;
            clearKb();
            act({ node: target });
            if (s.salesSession && P(me()).agentNode === target)
              announce(`Rode the ticket to ${cornerName(target)}. ${standsSummary()}`);
            return;
          }
          if (P(me()).agentNode === "X") {
            if (key === "Enter" && xSel >= 0) {
              const t2 = XORDER[xSel];
              act({ node: t2 });
              if (s.salesSession && P(me()).agentNode === t2) {
                clearKb();
                announce(`${cornerName(t2)}. ${standsSummary()}`);
              } else {
                MapView.setKbFocus({ node: t2 }); // refused: keep the pick for the next arrow
              }
              return;
            }
            return announce("Use the arrow keys to choose an avenue, then press Enter.");
          }
          const tiles = e.slotsAtAgent(me());
          if (!tiles.length) return failed("No free stands at this corner.");
          if (key === " ") {
            kbSlot = (kbSlot + 1) % tiles.length;
            const t2 = tiles[kbSlot];
            MapView.setKbFocus({ slotId: t2.id });
            announce(`Stand ${kbSlot + 1} of ${tiles.length}: ` + (t2.faceUp
              ? `${GENRE_INFO[t2.genre].name}, needs value ${t2.minVal}, pays ${t2.fans} fans. Enter to collect.`
              : "face-down order. Enter to flip."));
            return;
          }
          const t2 = tiles[kbSlot >= 0 && kbSlot < tiles.length ? kbSlot : 0];
          kbSlot = -1;
          MapView.setKbFocus(null);
          act({ slot: t2 });
          if (s.salesSession) announce(standsSummary());
          return;
        }
        if (key === "Escape") { clearKb(); return; }
        if (key === "t" || key === "T") {
          const b = m.querySelector("#btn-ticket");
          if (b && !b.disabled) { b.click(); if (ticketMode) cursor = null; }
          return;
        }
        if (key === "e" || key === "E") {
          const b = m.querySelector("#btn-end-run");
          if (b) b.click();
          return;
        }
        if (key === "m" || key === "M") {
          const b = [...m.querySelectorAll("button")].find((x) => /MINIMIZE/.test(x.textContent || ""));
          if (b) b.click();
        }
      }
      m.addEventListener("keydown", onKey);

      function failed(msg) { SFX.play("error"); toast(msg); }
      function refreshHud() {
        const ses = s.salesSession;
        if (!ses) return;
        const p = P(me());
        hud.innerHTML =
          `<span><b>FLIPS</b> ${ses.flipsLeft}</span> <span><b>COLLECTS</b> ${ses.collectsLeft}</span>` +
          `<span><b>WALK</b> ${ses.freeWalk ? "free" : "$2/block"}</span>` +
          `<span><b>CASH</b> $${p.money}</span> <span><b>TICKETS</b> ${p.tickets}</span>`;
        const tbtn = m.querySelector("#btn-ticket");
        if (tbtn) tbtn.disabled = p.tickets <= 0;
        renderCatalog(refPane);
      }
    }, { width: "min(1260px, calc(92vw / var(--z, 1)))" });
    // land keyboard players on the map region so the arrows work immediately
    const mp = document.querySelector("#modal-root .sales-map-pane");
    if (mp) mp.focus();
    }
  }

  function cornerName(n) {
    if (n === "X") return "Central Station";
    const nd = MAP.nodes[n];
    // fall back to coordinates so a half-cached load degrades, never crashes
    return (nd && nd.name) || `corner ${"ABCD"[nd.c]}${nd.r + 1}`;
  }

  // what a dispatch decision actually weighs: YOUR books on the chart (an
  // order delivers by itself once you own a same-genre book of value >= its
  // number, and collected fans push one of these up the lanes), the rival to
  // beat, and the orders you already hold
  function renderCatalog(pane) {
    const e = E(), s = e.state, p = P(me());
    pane.innerHTML = "";
    pane.appendChild(el("h3", "sp-title", "YOUR BOOKS ON THE CHART"));
    const mine = s.chart.filter((c) => c.owner === me()).sort((a, b) => b.fans - a.fans);
    if (!mine.length)
      pane.appendChild(el("span", "rr-empty",
        "Nothing printed yet — orders only deliver for genres you publish."));
    for (const c of mine) {
      const row = el("span", "rr-book");
      row.appendChild(sprHD(comicSprite(c), 0.32));
      row.appendChild(el("span", "rr-bk-info",
        `<b>${esc(c.title)}</b><small>${genreMark(c.genre, 0.4)} v${c.value}${c.isRipoff ? " &middot; rip-off" : ""}</small>`));
      row.appendChild(el("b", "rr-fans", `${c.fans}&#9829;`));
      row.title = `${c.title} — value ${c.value}, ${c.fans} fans. ` +
        `Delivers ${GENRE_INFO[c.genre].name} orders needing ${c.value} or less; ` +
        `fans you collect could push it up the chart.`;
      pane.appendChild(row);
    }
    // the race in one line: who you'd have to overtake
    if (mine.length) {
      const top = s.players.filter((pl) => pl.id !== me())
        .map((pl) => ({ pl, f: Math.max(0, e.bestComicFans(pl.id)) }))
        .sort((a, b) => b.f - a.f)[0];
      if (top) {
        const myBest = Math.max(0, e.bestComicFans(me()));
        pane.appendChild(el("span", "rr-lead", myBest > top.f
          ? `&#9733; YOU LEAD the chart at ${myBest}&#9829; &middot; next: ${esc(top.pl.pubName)} ${top.f}&#9829;`
          : `Chart leader: <b>${esc(top.pl.pubName)} ${top.f}&#9829;</b> &middot; your best ${myBest}&#9829;`));
      }
    }
    const open = p.orders.map((oid) => s.mapSlots[oid]).filter((o) => !o.fulfilled);
    if (open.length) {
      pane.appendChild(el("h3", "sp-title", "ORDERS IN HAND"));
      const row = el("span", "rr-row rr-orders");
      for (const o of open) {
        const chip = el("span", "rr-chip");
        chip.innerHTML = `${genreMark(o.genre, 0.4)} ${o.minVal}+&rarr;${o.fans}&#9829;`;
        chip.title = `Undelivered ${GENRE_INFO[o.genre].name} order: you still need a ` +
          `${GENRE_INFO[o.genre].name} book of value ${o.minVal}+ (worth ${o.fans} fans, or -${o.fans} VP unfilled).`;
        row.appendChild(chip);
      }
      pane.appendChild(row);
    }
  }

  // view-only map
  function viewMap() {
    openModal((m) => {
      m.appendChild(el("h2", "", "MANHATTAN — NEWSSTAND ORDERS"));
      const cv = el("canvas");
      cv.id = "map-canvas";
      cv.style.width = "min(880px, calc(108vh / var(--z, 1)))";
      m.appendChild(cv);
      modalButtons(m, [
        { label: "CLOSE", fn: () => closeModal() },
      ]);
      MapView.attach(cv, false, null);
    }, { onDismiss: () => {} });
  }

  // ================================================================ PENDING
  function pendingModal() {
    const e = E(), s = e.state, pd = s.pending;
    switch (pd.type) {
      case "discard": return discardModal(pd);
      case "chooseIdeas": return chooseIdeasModal(pd);
      case "chooseOrderComic": return chooseOrderComicModal(pd);
      case "placeCube": return placeCubeModal(pd);
      case "relocateCube": return relocateCubeModal(pd);
      default: command("pending_resolve", { choice: {} }); Main.advance();
    }
  }

  function discardModal(pd) {
    const p = P(me());
    const need = (p.hand.length + p.hyped.length) - HAND_LIMIT;
    const sel = [];
    openModal((m) => {
      m.appendChild(el("h2", "", "DESK OVERFLOW"));
      m.appendChild(el("div", "modal-sub", `Six cards max on your desk (hyped comics count). Discard <b>${need}</b>.`));
      const row = el("div", "card-row");
      for (const c of p.hand) {
        cardPick(row, c, {
          scale: 1.15,
          label: CARD_BY_ID[c].kind ? CARD_BY_ID[c].name : CARD_BY_ID[c].title,
          onpick: (d) => {
            const i = sel.indexOf(c);
            if (i >= 0) { sel.splice(i, 1); d.classList.remove("selected"); }
            else if (sel.length < need) { sel.push(c); d.classList.add("selected"); }
            m.querySelector("#disc-ok").disabled = sel.length !== need;
          },
        });
      }
      m.appendChild(row);
      modalButtons(m, [{ label: "DISCARD", cls: "btn-danger", id: "disc-ok", disabled: true, fn: () => {
        const result = command("pending_resolve", { choice: { cards: sel } });
        if (!result.ok) return;
        closeModal(); Main.afterHumanMove();
      } }]);
    }, { width: "820px" });
  }

  function chooseIdeasModal(pd) {
    const e = E(), s = e.state, p = P(me());
    const sel = [];
    openModal((m) => {
      panelHead(m, "ideas", "BONUS IDEAS", "&nbsp;");
      m.appendChild(el("div", "modal-sub", `Take <b>${pd.data.count}</b> idea token${pd.data.count > 1 ? "s" : ""} of any genre. Printing an original needs <b>2 matching ideas</b> — here's what's around:`));
      // context: what could use those ideas
      const ctx = el("div", "ctx-strip ctx-rows");
      const ctxRow = (label, items) => {
        if (!items.length) return;
        const row = el("div", "ctx-row");
        row.appendChild(el("b", "", label));
        for (const it of items) row.appendChild(it);
        ctx.appendChild(row);
      };
      const ctxItem = (art, g, title) => {
        const w = el("span", "ctx-item");
        art.title = title;
        w.appendChild(art);
        w.appendChild(el("span", "", genreMark(g, 0.5)));
        return w;
      };
      const myComics = p.hand.filter((c) => !CARD_BY_ID[c].kind).concat(p.hyped.map((h) => h.cardId));
      ctxRow("ON YOUR DESK:", myComics.map((c) => ctxItem(sprHD(coverOf(c), 0.55), CARD_BY_ID[c].genre,
        `${CARD_BY_ID[c].title} — needs 2 ${GENRE_INFO[CARD_BY_ID[c].genre].name} ideas (you have ${p.ideas[CARD_BY_ID[c].genre]})`)));
      ctxRow("WRITERS' ROOM:", s.display.comics.map((c) => ctxItem(sprHD(coverOf(c), 0.55), CARD_BY_ID[c].genre,
        `${CARD_BY_ID[c].title} (${GENRE_INFO[CARD_BY_ID[c].genre].name}) — available to develop`)));
      const talent = s.display.writers.concat(s.display.artists);
      ctxRow("TALENT:", talent.map((c) => ctxItem(spr(facebigOfSafe(c), 0.62), CARD_BY_ID[c].genre,
        `${CARD_BY_ID[c].name} — ${GENRE_INFO[CARD_BY_ID[c].genre].name} ${CARD_BY_ID[c].kind} v${CARD_BY_ID[c].value}`)));
      m.appendChild(ctx);
      const row = el("div", "card-row");
      row.dataset.tut = "bonus";
      const counters = {};
      GENRES.forEach((g) => {
        const t = el("div", "token-btn");
        t.dataset.tutGenre = g;
        t.appendChild(spr("idea_" + g, 0.9));
        const cnt = el("span", "count-badge", "0");
        t.appendChild(cnt);
        counters[g] = cnt;
        t.onclick = () => {
          SFX.play("click");
          if (sel.length >= pd.data.count) sel.shift();
          sel.push(g);
          GENRES.forEach((x) => (counters[x].textContent = sel.filter((y) => y === x).length));
          m.querySelector("#ci-ok").disabled = sel.length !== pd.data.count;
        };
        row.appendChild(t);
      });
      m.appendChild(row);
      modalButtons(m, [{ label: "TAKE THEM", cls: "btn-go", id: "ci-ok", disabled: true, fn: () => {
        const result = command("pending_resolve", { choice: { genres: sel } });
        if (!result.ok) return;
        closeModal(); Main.afterHumanMove();
      } }]);
    });
  }

  function chooseOrderComicModal(pd) {
    const e = E(), s = e.state;
    const o = s.mapSlots[pd.data.orderId];
    openModal((m) => {
      panelHead(m, "sales", "WHICH BOOK TAKES THE ORDER?", "&nbsp;");
      m.appendChild(el("div", "modal-sub", `A ${GENRE_INFO[o.genre].name} order (value ${o.minVal}+) grants <b>+${o.fans} fans</b> to one of these:`));
      const row = el("div", "card-row");
      for (const idx of pd.data.choices) {
        const c = s.chart[idx];
        const d = el("div", "pick-card");
        d.appendChild(sprHD(comicSprite(c), 1.15));
        d.appendChild(el("div", "pc-label", `${esc(c.title)}<br>${c.fans} fans now`));
        d.onclick = () => {
          SFX.play("click");
          const result = command("pending_resolve", { choice: { chartIdx: idx } });
          if (!result.ok) return;
          closeModal(); Main.afterHumanMove();
        };
        row.appendChild(d);
      }
      m.appendChild(row);
    });
  }

  function placeCubeModal(pd) {
    openModal((m) => {
      m.appendChild(el("h2", "", "SPECIAL ACTION UNLOCKED!"));
      m.appendChild(el("div", "modal-sub",
        `Your <b>${["", "", "2nd", "3rd", "4th"][P(me()).printedCount]}</b> book is out! Place a cube on a special action. From now on it triggers every time you take the matching main action.`));
      const row = el("div", "card-row");
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", "Choose a special action");
      for (const sp of pd.data.options) {
        const d = specialCard(sp);
        d.onclick = () => {
          SFX.play("click");
          const result = command("pending_resolve", { choice: { special: sp } });
          if (!result.ok) return;
          closeModal();
          Main.afterHumanMove();
        };
        row.appendChild(d);
      }
      m.appendChild(row);
    }, { width: "820px" });
  }

  function relocateCubeModal(pd) {
    const p = P(me());
    let from = null, to = null;
    openModal((m) => {
      m.appendChild(el("h2", "", "5TH BOOK! REORGANIZE?"));
      m.appendChild(el("div", "modal-sub", "You may move one special-action cube to a different special. (Also: every original now scores +1 VP at the end.)"));
      m.appendChild(el("h3", "", "MOVE WHICH CUBE"));
      const fr = el("div", "card-row");
      fr.setAttribute("role", "group");
      fr.setAttribute("aria-label", "Move which cube");
      for (const sp of p.cubeSpecials) {
        const d = specialCard(sp, { w: 176, art: 132, note: "YOUR CUBE HERE" });
        d.onclick = () => { SFX.play("click"); from = sp; selectOne(fr, d); refresh(); };
        fr.appendChild(d);
      }
      m.appendChild(fr);
      m.appendChild(el("h3", "", "TO WHICH SPECIAL"));
      const toRow = el("div", "card-row");
      toRow.setAttribute("role", "group");
      toRow.setAttribute("aria-label", "To which special");
      for (const sp of Object.keys(SPECIALS)) {
        if (p.cubeSpecials.includes(sp)) continue;
        const d = specialCard(sp, { w: 176, art: 132 });
        d.onclick = () => { SFX.play("click"); to = sp; selectOne(toRow, d); refresh(); };
        toRow.appendChild(d);
      }
      m.appendChild(toRow);
      modalButtons(m, [
        { label: "KEEP AS IS", fn: () => { const r = command("pending_resolve", { choice: {} }); if (r.ok) { closeModal(); Main.afterHumanMove(); } } },
        { label: "MOVE IT", cls: "btn-go", id: "rc-ok", disabled: true, fn: () => {
            const result = command("pending_resolve", { choice: { from, to } });
            if (!result.ok) return;
            closeModal(); Main.afterHumanMove();
          } },
      ]);
      function refresh() { m.querySelector("#rc-ok").disabled = !(from && to); }
    }, { width: "980px" });
  }

  // ================================================================ SPECIALS
  function specialModal(sp) {
    const e = E();
    switch (sp) {
      case "bettercolor": command("special_better_color", { accept: true }); toast("Better Colors! +2 VP token added."); return Main.advance();
      case "extraeditor": command("special_extra_editor", { accept: true }); toast("Extra editor for this round!"); return Main.advance();
      case "reassign": return reassignModal();
      case "hype": return hypeModal();
      case "ideasconv": return ideasConvModal();
      case "marketing": return marketingModal();
      default: command("special_skip"); return Main.advance();
    }
  }

  function reassignModal() {
    const e = E(), s = e.state, p = P(me());
    const swaps = [];
    openModal((m) => {
      m.appendChild(el("h2", "", "&#9733; RE-ASSIGN CREATIVES"));
      m.appendChild(specialArt("reassign", 150)).style.alignSelf = "center";
      m.appendChild(el("div", "modal-sub",
        "Put someone from your hand onto a printed book. <b>Genre match (gold) = specialized</b>: +1 fan and can increase in value at the beginning of each round. " +
        "Pay (or pocket) the value difference. Up to one writer swap and one artist swap."));
      const rows = el("div");
      m.appendChild(rows);
      renderRows();
      modalButtons(m, [
        { label: "SKIP", fn: () => { if (command("special_skip").ok) { closeModal(); Main.advance(); } } },
        { label: "APPLY", cls: "btn-go", id: "ra-ok", disabled: true, fn: () => {
            const result = command("special_reassign", { swaps });
            if (!result.ok) return;
            closeModal(); Main.afterHumanMove();
          } },
      ]);
      // face + genre + value pips — the info that matters, as a little card
      function crCard(cardId, value, bookGenre, opts = {}) {
        const cd = CARD_BY_ID[cardId];
        const d = el("div", "swap-cr" + (cd.genre === bookGenre ? " spec" : "") + (opts.cls ? " " + opts.cls : ""));
        d.appendChild(spr(faceBigOf(cardId), 0.55));
        d.appendChild(el("div", "sc-meta", `${genreMark(cd.genre, 0.45)}<b>${"&#10022;".repeat(value)}</b>`));
        if (opts.label) d.appendChild(el("div", "sc-label", opts.label));
        attachZoom(d, faceBigOf(cardId),
          `<b>${esc(cd.name)}</b><br>${genreMark(cd.genre, 0.5)} ${GENRE_INFO[cd.genre].name} &middot; v${value}` +
          (cd.genre === bookGenre ? "<br><span class='zc-note'>&#9733; would be specialized here</span>" : ""));
        return d;
      }
      function renderRows() {
        rows.innerHTML = "";
        for (const kind of ["writer", "artist"]) {
          const done = swaps.find((x) => x.kind === kind);
          if (done) {
            const c = s.chart[done.chartIdx];
            const line = el("div", "swap-line done");
            line.appendChild(el("b", "", "&#10004;"));
            line.appendChild(crCard(done.withCardId, CARD_BY_ID[done.withCardId].value, c.genre));
            line.appendChild(el("span", "modal-sub", `joins <b>${esc(c.title)}</b>`));
            rows.appendChild(line);
            continue;
          }
          const handCards = p.hand.filter((c) => CARD_BY_ID[c].kind === kind);
          if (!handCards.length) continue;
          rows.appendChild(el("h3", "", `SWAP A ${kind.toUpperCase()} — click who comes IN`));
          for (const comic of s.chart.filter((c) => c.owner === me())) {
            const cur = comic.creatives[kind];
            const line = el("div", "swap-line");
            const bk = el("div", "swap-book");
            bk.appendChild(sprHD(comicSprite(comic), 0.45));
            bk.appendChild(el("span", "", genreMark(comic.genre, 0.45)));
            bk.title = `${comic.title} — ${GENRE_INFO[comic.genre].name}, value v${comic.value}`;
            line.appendChild(bk);
            line.appendChild(crCard(cur.id, cur.curValue, comic.genre, { label: "on the book" }));
            line.appendChild(el("span", "swap-arrow", "&#8646;"));
            for (const h of handCards) {
              const hc = CARD_BY_ID[h];
              const diff = hc.value - cur.curValue;
              const cantPay = diff > 0 && p.money < diff;
              const card = crCard(h, hc.value, comic.genre, {
                cls: "pickable" + (cantPay ? " dimmed" : ""),
                label: diff > 0 ? `pay $${diff}` : diff < 0 ? `pocket $${-diff}` : "even trade",
              });
              if (hc.genre === comic.genre && cur.genre !== comic.genre)
                card.appendChild(el("div", "sc-boost", "+1 FAN"));
              card.onclick = () => {
                if (cantPay) return SFX.play("error");
                SFX.play("click");
                swaps.push({ chartIdx: comic.idx, kind, withCardId: h });
                m.querySelector("#ra-ok").disabled = false;
                renderRows();
              };
              line.appendChild(card);
            }
            rows.appendChild(line);
          }
        }
        if (!rows.children.length)
          rows.appendChild(el("div", "modal-sub", "No creatives in hand to swap in — skip for now."));
      }
    }, { width: "880px" });
  }

  function hypeModal() {
    const e = E(), p = P(me());
    const comics = p.hand.filter((c) => !CARD_BY_ID[c].kind);
    if (!comics.length) { command("special_hype", { cardId: null }); return Main.advance(); }
    openModal((m) => {
      panelHead(m, "hype", "&#9733; BUILD HYPE", "&nbsp;");
      m.appendChild(specialArt("hype", 150)).style.alignSelf = "center";
      m.appendChild(el("div", "modal-sub", "Set one unprinted comic aside. It gains a hype token (2 fans) at the start of every round; all cash in when you finally print it."));
      const row = el("div", "card-row");
      for (const c of comics) {
        cardPick(row, c, {
          scale: 1.15, label: CARD_BY_ID[c].title,
          onpick: () => {
            const result = command("special_hype", { cardId: c });
            if (!result.ok) return;
            closeModal(); Main.afterHumanMove();
          },
        });
      }
      m.appendChild(row);
      modalButtons(m, [{ label: "SKIP", fn: () => { if (command("special_hype", { cardId: null }).ok) { closeModal(); Main.advance(); } } }]);
    });
  }

  function ideasConvModal() {
    const e = E(), s = e.state, p = P(me());
    const total = GENRES.reduce((sum, g) => sum + p.ideas[g], 0);
    const mine = s.chart.filter((c) => c.owner === me());
    if (!total || !mine.length) { command("special_ideas", { conversions: [] }); return Main.advance(); }
    const sel = [];
    openModal((m) => {
      panelHead(m, "ideas", "&#9733; WORD OF MOUTH", "&nbsp;");
      m.appendChild(specialArt("ideasconv", 150)).style.alignSelf = "center";
      m.appendChild(el("div", "modal-sub", `Convert up to ${Math.min(3, total)} idea tokens into +1 fan each (max 1 per comic). Any genre token works.`));
      const row = el("div", "card-row");
      for (const c of mine) {
        const d = el("div", "pick-card");
        d.appendChild(sprHD(comicSprite(c), 1));
        d.appendChild(el("div", "pc-label", `${esc(c.title)}<br>${c.fans} fans`));
        d.onclick = () => {
          SFX.play("click");
          const i = sel.indexOf(c.idx);
          if (i >= 0) { sel.splice(i, 1); d.classList.remove("selected"); }
          else if (sel.length < Math.min(3, total)) { sel.push(c.idx); d.classList.add("selected"); }
        };
        row.appendChild(d);
      }
      m.appendChild(row);
      modalButtons(m, [
        { label: "SKIP", fn: () => { if (command("special_ideas", { conversions: [] }).ok) { closeModal(); Main.advance(); } } },
        { label: "CONVERT", cls: "btn-go", fn: () => {
            // auto-pick which genre tokens to burn (most abundant first)
            const pool = [];
            GENRES.slice().sort((a, b) => p.ideas[b] - p.ideas[a]).forEach((g) => {
              for (let i = 0; i < p.ideas[g]; i++) pool.push(g);
            });
            const conversions = sel.map((idx, i) => ({ genre: pool[i], chartIdx: idx }));
            const result = command("special_ideas", { conversions });
            if (!result.ok) return;
            closeModal(); Main.afterHumanMove();
          } },
      ]);
    });
  }

  function marketingModal() {
    const e = E(), s = e.state, p = P(me());
    const mine = s.chart.filter((c) => c.owner === me() && c.fans >= 1);
    const tiers = MARKETING.filter((t) => p.money >= t.cost);
    if (!mine.length || !tiers.length) { command("special_marketing", { spend: 0, distribution: [] }); return Main.advance(); }
    let tier = null;
    const dist = {};
    openModal((m) => {
      panelHead(m, "hype", "&#9733; MARKETING BLITZ", "&nbsp;");
      m.appendChild(specialArt("marketing", 150)).style.alignSelf = "center";
      m.appendChild(el("div", "modal-sub", "Buy fans: $2 &rarr; 1 fan, $5 &rarr; 2 fans, $9 &rarr; 4 fans. Spread them over your books on the chart."));
      const tg = el("div", "choice-group");
      for (const t of MARKETING) {
        const b = el("button", "choice", `$${t.cost} = ${t.fans} FAN${t.fans > 1 ? "S" : ""}`);
        if (p.money < t.cost) b.classList.add("dimmed"), b.disabled = true;
        b.onclick = () => {
          tier = t;
          tg.querySelectorAll(".choice").forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          refresh();
        };
        tg.appendChild(b);
      }
      m.appendChild(tg);
      const row = el("div", "card-row");
      for (const c of mine) {
        const d = el("div", "pick-card");
        d.appendChild(sprHD(comicSprite(c), 1));
        const badge = el("div", "pc-cost", "+0");
        d.appendChild(badge);
        d.appendChild(el("div", "pc-label", esc(c.title)));
        d.onclick = () => {
          if (!tier) return SFX.play("error");
          const used = Object.values(dist).reduce((a, b) => a + b, 0);
          dist[c.idx] = (dist[c.idx] || 0) + 1;
          if (used >= tier.fans) dist[c.idx] = 0; // cycle back to 0
          badge.textContent = "+" + (dist[c.idx] || 0);
          SFX.play("click");
          refresh();
        };
        row.appendChild(d);
      }
      m.appendChild(row);
      const status = el("div", "modal-sub", "");
      m.appendChild(status);
      modalButtons(m, [
        { label: "SKIP", fn: () => { if (command("special_marketing", { spend: 0, distribution: [] }).ok) { closeModal(); Main.advance(); } } },
        { label: "LAUNCH CAMPAIGN", cls: "btn-go", id: "mk-ok", disabled: true, fn: () => {
            const distribution = Object.entries(dist).map(([idx, fans]) => ({ chartIdx: +idx, fans }));
            const result = command("special_marketing", { spend: tier.cost, distribution });
            if (!result.ok) return;
            closeModal(); Main.afterHumanMove();
          } },
      ]);
      function refresh() {
        const used = Object.values(dist).reduce((a, b) => a + b, 0);
        status.innerHTML = tier ? `Assigned <b>${used}/${tier.fans}</b> fans (click covers to add)` : "Pick a budget.";
        m.querySelector("#mk-ok").disabled = !(tier && used === tier.fans);
      }
    }, { width: "760px" });
  }

  // ======================================================= ROUND-START UI
  function startingPicksModal() {
    const e = E(), s = e.state, p = P(me());
    const picks = p.startingPicks;
    const pub = PUBLISHERS[p.color];
    const tutorial = typeof Tutor !== "undefined" && Tutor.active;
    const remote = UI.session && UI.session.mode === "remote";
    let comic = null;
    let comicGenre = null;
    const ideas = [];
    openModal((m) => {
      // the shared panel anatomy, with the HOUSE MARK as the emblem — this
      // is the founding of your publishing house, not an action room
      const head = el("div", "panel-head");
      const em = el("div", "ph-emblem bare"); // the die-cut mark needs no plaque
      em.appendChild(sprHD(pub.logo, 1.6));
      head.appendChild(em);
      const ht = el("div", "ph-text");
      UI.reviewHint = "HOUSE FOUNDED";
      ht.appendChild(el("h2", "", `FOUNDING CATALOG &mdash; ${pub.name.toUpperCase()}`));
      ht.appendChild(el("div", "ph-tag",
        `Pick the <b>genre</b> of your first comic book project (you draw it face-down — its bonus is a surprise) and <b>${picks.ideas}</b> idea token${picks.ideas === 1 ? "" : "s"}.`));
      head.appendChild(ht);
      m.appendChild(head);
      const teamBody = panelSection(m, "YOUR STARTING TEAM");
      const team = el("div", "card-row");
      for (const c of p.hand) team.appendChild(personFigure(c, { noZoom: true }));
      teamBody.appendChild(team);
      const vaultBody = panelSection(m, "ON OFFER &mdash; PICK A GENRE FROM THE VAULT");
      const row = el("div", "card-row");
      row.dataset.tut = "vault";
      for (const g of GENRES) {
        const inDeck = remote ? [g] : s.decks.comics.filter((c) => CARD_BY_ID[c].genre === g);
        const teamMatch = p.hand.some((c) => CARD_BY_ID[c].genre === g);
        const tutorialAllowed = !tutorial || g === Tutor.SCENARIO.genre;
        // every vault card shares one fixed footprint (cls vault-card): the
        // match note lives in a reserved caption line and a gold ribbon, so
        // it can never warp the row's spacing
        const vaultCard = cardPick(row, null, {
          back: "back_orig_" + g,
          scale: 1.25,
          cls: "vault-card",
          dimmed: inDeck.length === 0 || !tutorialAllowed,
          label: `${genreMark(g, 0.55)} ${GENRE_INFO[g].name}<br>` +
            (teamMatch ? `<span class="match-tag">&#9733; MATCHES YOUR TEAM</span>` : "&nbsp;"),
          onpick: (d) => {
            if (!tutorialAllowed) return toast("Your first assignment is a Crime original.");
            comicGenre = g;
            comic = tutorial ? Tutor.SCENARIO.comic : g;
            selectOne(row, d);
            refresh();
          },
        });
        vaultCard.dataset.tutGenre = g;
      }
      vaultBody.appendChild(row);
      const ideaBody = panelSection(m, `IDEA TOKENS (pick ${picks.ideas} &mdash; doubles welcome)`);
      const irow = el("div", "card-row");
      irow.dataset.tut = "tokens";
      const counters = {};
      GENRES.forEach((g) => {
        const t = el("div", "token-btn");
        t.dataset.tutGenre = g;
        t.appendChild(spr("idea_" + g, 0.85));
        const cnt = el("span", "count-badge", "0");
        t.appendChild(cnt);
        counters[g] = cnt;
        t.onclick = () => {
          SFX.play("click");
          if (tutorial && g !== Tutor.SCENARIO.genre)
            return toast("Take Crime ideas for this guided assignment.");
          if (ideas.length >= picks.ideas) ideas.shift();
          ideas.push(g);
          GENRES.forEach((x) => {
            const n = ideas.filter((y) => y === x).length;
            counters[x].textContent = n;
            counters[x].classList.toggle("has", n > 0); // quiet at 0, gold when picked
          });
          refresh();
        };
        irow.appendChild(t);
      });
      ideaBody.appendChild(irow);
      const foot = panelFooter(m);
      // NOT natively disabled: a blocked button must stay reachable and
      // explain itself (house a11y rule) — pressing it too early answers
      // with what's still missing
      modalButtons(m, [{ label: "FOUND THE HOUSE", cls: "btn-go", id: "sp-ok", fn: () => {
        if (!(comic && ideas.length === picks.ideas)) {
          SFX.play("error");
          return toast("Before opening: " + missing().join(" and ") + ".");
        }
        const payload = tutorial ? { comic, ideas } : { genre: comicGenre, ideas };
        const result = command("starting_picks", payload);
        if (!result.ok) return;
        closeModal();
        Main.afterHumanMove();
      } }]);
      function missing() {
        const parts = [];
        if (!comic) parts.push("pick a genre from the vault");
        if (ideas.length < picks.ideas)
          parts.push(`pick ${picks.ideas - ideas.length} more idea token${picks.ideas - ideas.length === 1 ? "" : "s"}`);
        return parts;
      }
      function refresh() {
        if (typeof Tutor !== "undefined" && Tutor.active) Tutor.pingFounding(!!comic, ideas.length);
        const ok = comic && ideas.length === picks.ideas;
        const btn = m.querySelector("#sp-ok");
        btn.setAttribute("aria-disabled", String(!ok));
        foot.innerHTML = ok
          ? `You open with a face-down <b>${GENRE_INFO[comicGenre || CARD_BY_ID[comic].genre].name}</b> original` +
            ` + ${ideas.map((g) => sprHTML("idea_" + g, 0.55)).join("")} &middot; all set — <b>FOUND THE HOUSE</b>!`
          : `<b style="color:#8a2f22">${missing().map((x) => x[0].toUpperCase() + x.slice(1)).join(" &middot; ")}.</b>` +
            (ideas.length ? ` In the tray: ${ideas.map((g) => sprHTML("idea_" + g, 0.55)).join("")}` : "");
      }
      refresh();
    }, { width: "980px" });
  }

  function increaseModal() {
    const e = E(), p = P(me());
    openModal((m) => {
      const ROMAN = ["", "I", "II", "III", "IV", "V"];
      UI.reviewHint = "CREATIVE DEVELOPMENT";
      panelHead(m, "develop", `ROUND ${ROMAN[e.state.round] || e.state.round} &mdash; CREATIVE DEVELOPMENT`,
        "Specialized creatives on printed books can grow: <b>learn</b> from a stronger specialized teammate ($1) or <b>train</b> (pay the new value). One step per creative per round. Higher team value = higher book value for orders.");
      const list = panelSection(m, "THIS ROUND'S CANDIDATES");
      render();
      modalButtons(m, [{ label: "DONE", cls: "btn-go", fn: () => {
        const result = command("increase_finish");
        if (!result.ok) return;
        closeModal();
        Main.afterHumanMove();
      } }]);
      function render() {
        list.innerHTML = "";
        const opts = e.increaseOptions(me());
        if (!opts.length) list.appendChild(el("div", "modal-sub", "No more upgrades available this round."));
        for (const o of opts) {
          const c = e.state.chart[o.chartIdx];
          const cr = c.creatives[o.kind];
          const line = el("div", "card-row");
          line.appendChild(el("span", "modal-sub",
            `${sprHTML(faceBigOf(cr.id), 0.5)} <b>${esc(cr.name)}</b> (${o.kind} on <b>${esc(c.title)}</b>) v${cr.curValue} &rarr; v${o.newValue} &middot; ${o.mode} for <b>$${o.cost}</b>`));
          const b = el("button", "btn btn-small", o.mode.toUpperCase() + " $" + o.cost);
          b.onclick = () => {
            SFX.play("cash");
            const result = command("increase_apply", { chartIdx: o.chartIdx, kind: o.kind });
            if (!result.ok) return;
            flushEvents();
            renderAll();
            render();
          };
          line.appendChild(b);
          list.appendChild(line);
        }
      }
    }, { width: "780px" });
  }

  // ============================================================== GAME OVER
  function endgameModal(scores) {
    SFX.play("fanfare");
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) FX.confetti(2600);
    const win = scores[0];
    // the 2-3 categories that actually decided it, from the winner's record
    const CAT_LABELS = [
      ["fans", "fans on the stands"], ["origVP", "original books"],
      ["vpTokens", "chart-rank prizes"], ["masteryVP", "genre mastery"],
      ["bcVP", "better colors"], ["moneyVP", "cold cash"],
      ["ideasVP", "spare ideas"], ["extraVP", "prolific printing"],
    ];
    const decisive = CAT_LABELS.map(([k, label]) => ({ label, v: win[k] }))
      .filter((c) => c.v > 0).sort((a, b) => b.v - a.v).slice(0, 3);

    const m = openModal((m) => {
      m.appendChild(el("h2", "", "&#9733; FINAL EDITION &#9733;"));
      const wp = P(win.player);
      m.appendChild(el("div", "eg-headline",
        wp.human ? "YOU OWN THE GOLDEN AGE!" : `${esc(win.pubName).toUpperCase()} OWNS THE GOLDEN AGE!`));
      m.appendChild(el("div", "modal-sub eg-sub",
        `${esc(win.name)} leads <b>${esc(win.pubName)}</b> to the top with <b>${win.total} VP</b>` +
        (decisive.length ? ` — built on ${decisive.map((c) => `<b>${c.v}</b> from ${c.label}`).join(", ")}.` : ".")));

      // podium: ranked publisher cards, winner enlarged and color-framed
      const pod = el("div", "podium");
      const RANK = ["1st", "2nd", "3rd", "4th"];
      scores.forEach((r, i) => {
        const p = P(r.player), pub = PUBLISHERS[p.color];
        const c = el("div", "pod-card" + (i === 0 ? " pod-win" : ""));
        c.style.setProperty("--pc", pub.color);
        c.appendChild(el("div", "pod-rank", RANK[i]));
        c.appendChild(spr(PUBLISHERS[p.color].logo, i === 0 ? 1.6 : 1.15));
        const lg = el("div", "pod-logo");
        lg.appendChild(sprHD(pub.logo, i === 0 ? 0.7 : 0.55));
        c.appendChild(lg);
        c.appendChild(el("div", "pod-name", esc(r.pubName) + (p.human ? "<br>(YOU)" : "")));
        c.appendChild(el("div", "pod-total", r.total + " VP"));
        pod.appendChild(c);
      });
      m.appendChild(pod);

      const mine = scores.find((r) => P(r.player).human);
      if (mine) {
        const title = TITLES.find(([min]) => mine.total >= min)[1];
        m.appendChild(el("div", "eg-career",
          "THE PRESS CLUB CONFERS UPON YOU THE TITLE OF<b>" + title + "</b>" +
          (mine === win ? "<i>the newsboys are shouting your headlines!</i>"
            : "<i>there's always the next golden age.</i>")));
      }

      // the accessible table stays, behind an expandable control
      const tbl = el("table", "score-table");
      tbl.setAttribute("aria-label", "Full scoring breakdown");
      tbl.innerHTML = `<tr><th scope="col">PUBLISHER</th><th scope="col">FANS</th><th scope="col">ORDERS</th>` +
        `<th scope="col">RANK VP</th><th scope="col">MASTERY</th><th scope="col">COLORS</th><th scope="col">$/4</th>` +
        `<th scope="col">IDEAS/4</th><th scope="col">ORIGINALS</th><th scope="col">EXTRA</th><th scope="col">TOTAL</th></tr>`;
      for (const r of scores) {
        const tr = el("tr", r === win ? "winner" : "");
        tr.innerHTML = `<td>${esc(r.pubName)}${P(r.player).human ? " (YOU)" : ""}</td><td>${r.fans}</td><td>${r.orderPenalty ? "-" + r.orderPenalty : 0}</td>` +
          `<td>${r.vpTokens}</td><td>${r.masteryVP}</td><td>${r.bcVP}</td><td>${r.moneyVP}</td><td>${r.ideasVP}</td>` +
          `<td>${r.origVP}</td><td>${r.extraVP}</td><td class="total">${r.total}</td>`;
        tbl.appendChild(tr);
      }
      tbl.hidden = true;
      const tgl = el("button", "btn btn-small", "FULL BREAKDOWN &#9662;");
      tgl.setAttribute("aria-expanded", "false");
      tgl.onclick = () => {
        SFX.play("click");
        const opening = tbl.hidden;
        tbl.hidden = !opening;
        tgl.setAttribute("aria-expanded", String(opening));
        tgl.innerHTML = opening ? "HIDE BREAKDOWN &#9652;" : "FULL BREAKDOWN &#9662;";
      };
      const tglWrap = el("div", "eg-toggle");
      tglWrap.appendChild(tgl);
      m.appendChild(tglWrap);
      m.appendChild(tbl);

      modalButtons(m, [
        { label: "PLAY AGAIN", cls: "btn-go", fn: () => location.reload() },
      ]);
    }, { width: "820px" });
    const again = m.querySelector(".modal-buttons .btn-go");
    if (again) again.focus(); // predictable landing: the primary action
    announce(`${win.pubName} wins the golden age with ${win.total} victory points.`);
  }

  // ------------------------------------------------------------------- help
  // the MENU: picture (look + tube lens), sound channels, screen format —
  // one .choice-group per setting (the setup screen's radiogroup pattern,
  // already covered by the a11y sweep's arrow-key navigation)
  function settingsModal() {
    openModal((m) => {
      m.appendChild(el("h2", "", "&#9733; SETTINGS &#9733;"));
      const section = (label) => {
        const lab = el("div", "ps-label", label);
        m.appendChild(lab);
        const body = el("div", "set-body");
        m.appendChild(body);
        return body;
      };
      const group = (body, rowLabel, options, isActive, onPick) => {
        const row = el("div", "set-row");
        row.appendChild(el("b", "", rowLabel));
        const g = el("div", "choice-group");
        for (const [val, label] of options) {
          const b = el("button", "choice" + (isActive(val) ? " active" : ""), label);
          b.onclick = () => {
            SFX.play("click");
            onPick(val);
            [...g.children].forEach((c) => c.classList.toggle("active", c === b));
          };
          g.appendChild(b);
        }
        row.appendChild(g);
        body.appendChild(row);
      };
      const onOff = (label, body, get, set) =>
        group(body, label, [[true, "ON"], [false, "OFF"]], (v) => v === get(), set);

      const pic = section("PICTURE");
      group(pic, "LOOK", Film.LOOKS.map(([k, name]) => [k, name]),
        (v) => v === Film.getLook(), (v) => Film.setLook(v));
      onOff("TUBE GLASS", pic, () => Film.lensOn(), (v) => Film.setLens(v));
      onOff("FILM GRAIN", pic, () => Film.grainOn(), (v) => Film.setGrain(v));

      const snd = section("SOUND");
      onOff("EFFECTS", snd, () => SFX.enabled, (v) => SFX.setSfx(v));
      onOff("MUSIC", snd, () => SFX.musicOn, (v) => SFX.setMusic(v));

      const scr = section("SCREEN");
      onOff("FULLSCREEN", scr, () => !!document.fullscreenElement, (v) => {
        if (v) document.documentElement.requestFullscreen().catch(() => {});
        else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      });

      m.appendChild(el("div", "modal-sub",
        "The looks are decorative &mdash; grain and flicker sit still when your system asks for reduced motion. P cycles the look any time."));
      modalButtons(m, [{ label: "DONE", fn: () => closeModal() }]);
    }, { width: "620px", onDismiss: () => closeModal() });
  }

  function helpModal() {
    openModal((m) => {
      m.appendChild(el("h2", "", "HOW TO PLAY"));
      m.appendChild(el("div", "modal-sub", `
<p><b>Goal:</b> most VP after 5 rounds. Fans = VP. Also: rank prizes each round, mastery tokens, better colors, money &amp; ideas (4:1), and originals (2/4/6 VP by team specialization).</p>
<p><b>Each round</b> you place your 4 editors on city locations, one per turn:</p>
<p>&#9998; <b>Talent Agency</b> — hire 1 writer + 1 artist.<br>
&#9998; <b>Writers' Room</b> — option a comic (or $4 to pick a genre from the deck).<br>
&#9998; <b>Cafe Bizarre</b> — collect idea tokens.<br>
&#9998; <b>Print Floor</b> — print: comic + writer + artist, pay team value in $, plus 2 matching ideas (originals). Rip-offs skip ideas but start fanless. First editor prints TWO.<br>
&#9998; <b>Accounting</b> — cash. Earlier desks pay more.<br>
&#9998; <b>Manhattan Map</b> — move your agent, flip &amp; collect sales orders. Orders auto-fulfill when you own a matching comic (genre + value) and grant fans. Unfulfilled orders cost VP at the end!</p>
<p><b>Specialized creatives</b> (matching the comic's genre) add +1 fan each at print and can grow in value at the beginning of each publishing cycle.</p>
<p><b>Mastery</b>: first to print a genre (or overtake majority with at least one original) gets +1 fan on every book of that genre and 2 VP.</p>
<p><b>Specials</b>: printing your 2nd/3rd/4th book unlocks cube specials that ride on main actions. 5th book: +1 VP per original. 6th+: +2 VP each.</p>
<p><b>End of round</b>: chart rank pays VP (3/2/1), every comic earns $ by its fans, then every comic loses 1 fan. Turn order reverses rank.</p>`));
      modalButtons(m, [{ label: "GOT IT", fn: () => closeModal() }]);
    }, { width: "800px" });
  }

  return { open, salesScene, viewMap, pendingModal, specialModal, startingPicksModal, increaseModal, endgameModal, helpModal, settingsModal };
})();
