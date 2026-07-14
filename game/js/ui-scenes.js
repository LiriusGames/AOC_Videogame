// ============================================================================
// AGE OF COMICS — interactive scenes: actions, specials, pendings, scoring
// ============================================================================
"use strict";

const Scenes = (() => {
  const me = () => UI.humanId;
  const E = () => UI.engine;

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
    const d = el("div", "pick-card");
    d.appendChild(spr(opts.back || cardSprite(cardId), opts.scale || 1.4));
    if (opts.label) d.appendChild(el("div", "pc-label", opts.label));
    if (opts.cost) d.appendChild(el("div", "pc-cost", opts.cost));
    if (opts.dimmed) d.classList.add("dimmed");
    d.onclick = () => { if (!opts.dimmed && opts.onpick) { SFX.play("click"); opts.onpick(d); } };
    if (!opts.back && cardId) attachZoom(d, cardSprite(cardId));
    container.appendChild(d);
    return d;
  }
  function selectOne(row, d) {
    row.querySelectorAll(".pick-card,.person,.comic-tile,.token-btn").forEach((x) => {
      x.classList.remove("selected");
      x.setAttribute("aria-pressed", "false");
    });
    d.classList.add("selected");
    d.setAttribute("aria-pressed", "true");
  }
  // animated pictogram explaining a cube special (drawn in loc-art.js)
  function specialArt(key, wpx = 168) {
    const cv = document.createElement("canvas");
    cv.className = "special-art";
    cv.style.width = wpx + "px";
    LocArt.attachSpecial(cv, key);
    return cv;
  }

  // ------------------------------------------------------------------- HIRE
  function hireScene() {
    const e = E(), s = e.state;
    const sel = { writer: null, artist: null };
    openModal((m) => {
      sceneBanner(m, "hire");
      m.appendChild(el("h2", "", "TALENT AGENCY &mdash; HIRE"));
      m.appendChild(el("div", "modal-sub", "Sign one writer AND one artist waiting in the lobby — or take a gamble on whoever answered the classified ad (blind). Value-1 rookies bring a free idea."));
      for (const kind of ["writer", "artist"]) {
        const key = kind + "s";
        m.appendChild(el("h3", "", kind.toUpperCase() + "S IN THE LOBBY"));
        const row = el("div", "card-row balloon-row");
        for (const c of s.display[key]) {
          const card = CARD_BY_ID[c];
          const chip = personChip(c, {
            cls: "pickable",
            balloon: `${kind === "writer" ? "I write" : "I draw"} <b style="color:${GENRE_INFO[card.genre].color}">${GENRE_INFO[card.genre].name}</b>!`,
            onpick: (d) => {
              sel[kind] = c;
              selectOne(row, d);
              if (card.value === 1)
                toast(`${sprHTML("idea_" + card.genre, 0.7)} ${esc(card.name)} is a rookie — signs with a FREE ${GENRE_INFO[card.genre].name} idea!`);
              refresh();
            },
          });
          row.appendChild(chip);
        }
        if (s.decks[key].length + s.discards[key].length > 0) {
          const topVal = s.decks[key].length ? CARD_BY_ID[s.decks[key][s.decks[key].length - 1]].value : 1;
          const blind = el("div", "person pickable");
          blind.appendChild(spr(`back_${kind}_${topVal}`, 0.42));
          blind.appendChild(el("div", "p-info",
            `<div class="p-name">Classified ad</div><div><span class="p-kind">mystery ${kind}</span> <b class="p-val">${"&#10022;".repeat(topVal)}</b></div>`));
          blind.onclick = () => { SFX.play("click"); sel[kind] = "deck"; selectOne(row, blind); refresh(); };
          row.appendChild(blind);
        }
        m.appendChild(row);
      }
      modalButtons(m, [
        { label: "CANCEL", fn: () => { closeModal(); } },
        { label: "SIGN THEM", cls: "btn-go", id: "hire-ok", fn: () => {
            closeModal();
            e.actHire(me(), sel);
            Main.afterHumanMove();
          }, disabled: true },
      ]);
      function refresh() {
        m.querySelector("#hire-ok").disabled = !(sel.writer && sel.artist);
      }
    }, { width: "860px", onDismiss: () => {} });
  }

  // ---------------------------------------------------------------- DEVELOP
  function developScene() {
    const e = E(), s = e.state;
    let sel = null; // {comic} | {searchGenre}
    openModal((m) => {
      sceneBanner(m, "develop");
      m.appendChild(el("h2", "", "WRITERS' ROOM &mdash; DEVELOP"));
      m.appendChild(el("div", "modal-sub", "Option one comic book for future printing. Printing needs 2 matching idea tokens + a creative team."));
      m.appendChild(el("h3", "", "PITCHES ON THE TABLE"));
      const row = el("div", "card-row");
      for (const c of s.display.comics) {
        row.appendChild(comicTile(c, {
          cls: "pickable",
          onpick: (d) => { sel = { comic: c }; selectOne(m, d); refresh(); },
        }));
      }
      if (s.decks.comics.length + s.discards.comics.length > 0)
        cardPick(row, null, {
          back: "back_orig_" + (s.decks.comics.length ? CARD_BY_ID[s.decks.comics[s.decks.comics.length - 1]].genre : "scifi"),
          label: "Slush pile<br><i>blind draw</i>",
          onpick: (d) => { sel = { comic: "deck" }; selectOne(m, d); refresh(); },
        });
      m.appendChild(row);
      m.appendChild(el("h3", "", `COMMISSION A GENRE ($4) — search the deck`));
      const grow = el("div", "card-row");
      for (const g of GENRES) {
        const t = el("div", "token-btn" + (P(me()).money < 4 ? " dimmed" : ""));
        t.appendChild(spr("idea_" + g, 1.1));
        t.appendChild(el("span", "", GENRE_INFO[g].name));
        t.onclick = () => {
          if (P(me()).money < 4) return SFX.play("error");
          SFX.play("click");
          m.querySelectorAll(".pick-card,.token-btn").forEach((x) => x.classList.remove("selected"));
          t.classList.add("selected");
          sel = { searchGenre: g };
          refresh();
        };
        grow.appendChild(t);
      }
      m.appendChild(grow);
      modalButtons(m, [
        { label: "CANCEL", fn: () => closeModal() },
        { label: "OPTION IT", cls: "btn-go", id: "dev-ok", disabled: true, fn: () => {
            closeModal();
            e.actDevelop(me(), sel);
            Main.afterHumanMove();
          } },
      ]);
      function refresh() { m.querySelector("#dev-ok").disabled = !sel; }
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
      sceneBanner(m, "ideas");
      m.appendChild(el("h2", "", "CAFE BIZARRE &mdash; IDEAS"));
      m.appendChild(el("div", "modal-sub",
        `Take up to <b>${fromBoard}</b> token${fromBoard === 1 ? "" : "s"} from the cafe table, plus <b>2 of your choice</b> from the supply.`));
      m.appendChild(el("h3", "", `CAFE TABLE (pick ${fromBoard})`));
      const brow = el("div", "card-row");
      if (fromBoard === 0) brow.appendChild(el("i", "", "None at this seat — supply only."));
      GENRES.forEach((g) => {
        if (fromBoard === 0) return;
        const avail = s.boardIdeas[g] > 0;
        const t = el("div", "token-btn" + (avail ? "" : " dimmed"));
        t.appendChild(spr("idea_" + g, 1.2));
        t.appendChild(el("span", "", GENRE_INFO[g].name));
        t.onclick = () => {
          if (!avail) return SFX.play("error");
          SFX.play("click");
          const i = board.indexOf(g);
          if (i >= 0) { board.splice(i, 1); t.classList.remove("selected"); }
          else if (board.length < fromBoard) { board.push(g); t.classList.add("selected"); }
          refresh();
        };
        brow.appendChild(t);
      });
      m.appendChild(brow);
      m.appendChild(el("h3", "", "SUPPLY (pick 2, duplicates ok)"));
      const srow = el("div", "card-row");
      const counters = {};
      GENRES.forEach((g) => {
        const t = el("div", "token-btn");
        t.appendChild(spr("idea_" + g, 1.2));
        const cnt = el("span", "count-badge", "0");
        t.appendChild(cnt);
        counters[g] = cnt;
        t.onclick = () => {
          SFX.play("click");
          if (supply.length >= 2) {
            // reset this genre or all? remove first occurrence of g, else clear oldest
            const i = supply.indexOf(g);
            if (i >= 0) supply.splice(i, 1);
            else supply.shift();
          }
          if (supply.length < 2) supply.push(g);
          GENRES.forEach((x) => (counters[x].textContent = supply.filter((y) => y === x).length));
          refresh();
        };
        srow.appendChild(t);
      });
      m.appendChild(srow);
      modalButtons(m, [
        { label: "CANCEL", fn: () => closeModal() },
        { label: "BRAINSTORM", cls: "btn-go", id: "ideas-ok", disabled: true, fn: () => {
            closeModal();
            e.actIdeas(me(), { board, supply });
            Main.afterHumanMove();
          } },
      ]);
      function refresh() {
        // "up to N" from the table — taking fewer (or none) is always legal
        m.querySelector("#ideas-ok").disabled = supply.length !== 2;
      }
    }, { width: "760px", onDismiss: () => {} });
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
      openModal((m) => {
        sceneBanner(m, "print");
        m.appendChild(el("h2", "", `PRINT FLOOR &mdash; BOOK ${n}${x2 ? " of up to 2" : ""}`));
        const sub = el("div", "modal-sub");
        m.appendChild(sub);

        // type toggle
        const ripTargets = s.chart.filter((c) => !c.isRipoff && c.owner !== me() && !s.rippedOriginals[c.cardId]);
        if (e.cfg.useRipoffs && ripTargets.length) {
          const tg = el("div", "choice-group");
          for (const [v, lbl] of [["original", "ORIGINAL"], ["ripoff", "RIP-OFF"]]) {
            const b = el("button", "choice" + (v === sel.type ? " active" : ""), lbl);
            b.onclick = () => {
              SFX.play("click");
              sel.type = v; sel.comic = sel.target = null;
              tg.querySelectorAll(".choice").forEach((x) => x.classList.remove("active"));
              b.classList.add("active");
              renderComicRow();
              refresh();
            };
            tg.appendChild(b);
          }
          m.appendChild(tg);
        }

        m.appendChild(el("h3", "", "THE BOOK"));
        const comicRow = el("div", "card-row");
        m.appendChild(comicRow);

        m.appendChild(el("h3", "", "THE TEAM (from your roster)"));
        const wRow = el("div", "card-row");
        const aRow = el("div", "card-row");
        for (const [kind, row] of [["writer", wRow], ["artist", aRow]]) {
          const cards = p.hand.filter((c) => CARD_BY_ID[c].kind === kind && !usedCards.includes(c));
          if (!cards.length) row.appendChild(el("i", "", `No ${kind}s on the roster — visit the Talent Agency first.`));
          for (const c of cards) {
            row.appendChild(personChip(c, {
              cls: "pickable",
              onpick: (d) => { sel[kind] = c; selectOne(row, d); refresh(); },
            }));
          }
          m.appendChild(row);
        }

        const preview = el("div", "modal-sub", "");
        m.appendChild(preview);

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
              const enough = p.ideas[card.genre] >= 2;
              comicRow.appendChild(comicTile(c, {
                cls: "pickable",
                extra: (hy ? ` <span class="chip" style="background:#d94f43;color:#fff">HYPE +${hy.tokens * 2}</span>` : "") +
                  `<div style="font-size:14px">${enough ? `needs 2 ${GENRE_INFO[card.genre].name} ideas` : `<b style='color:#a00'>not enough ideas!</b>`}</div>`,
                onpick: (d) => { sel.comic = c; selectOne(comicRow, d); refresh(); },
              }));
            }
          } else {
            for (const t of ripTargets) {
              const idxInGenre = COMICS.filter((c) => c.genre === t.genre).findIndex((c) => c.id === t.cardId) + 1;
              const d = el("div", "comic-tile pickable");
              d.appendChild(spr(`cover_rip_${t.genre}_${idxInGenre}`, 1.2));
              d.appendChild(el("div", "ct-info",
                `<div class="ct-title">${esc(RIPOFF_TITLES[t.cardId])}</div>` +
                `<div style="font-size:14px">${genreDot(t.genre)} rips off <b>${esc(t.title)}</b><br>(${esc(P(t.owner).pubName)})</div>`));
              d.onclick = () => { SFX.play("click"); sel.target = t.idx; selectOne(comicRow, d); refresh(); };
              comicRow.appendChild(d);
            }
          }
        }
        function toSpec() {
          return sel.type === "original"
            ? { type: "original", comic: sel.comic, writer: sel.writer, artist: sel.artist }
            : { type: "ripoff", target: sel.target, writer: sel.writer, artist: sel.artist };
        }
        function refresh() {
          const w = sel.writer && CARD_BY_ID[sel.writer], a = sel.artist && CARD_BY_ID[sel.artist];
          const cost = (w ? w.value : 0) + (a ? a.value : 0);
          let txt = `Printing cost: <b>$${cost}</b> (team value)`;
          let ok = false;
          if (sel.type === "original" && sel.comic) {
            const c = CARD_BY_ID[sel.comic];
            txt += ` + <b>2 ${GENRE_INFO[c.genre].name} ideas</b> (you have ${p.ideas[c.genre]})`;
            if (w && a) {
              let fans = 1 + (c.bonus === "fan" ? 1 : 0) + (w.genre === c.genre ? 1 : 0) + (a.genre === c.genre ? 1 : 0);
              const hy = p.hyped.find((h) => h.cardId === sel.comic);
              if (hy) fans += hy.tokens * 2;
              if (s.mastery[c.genre] === me()) fans += 1;
              txt += ` &rarr; launches with ~<b>${fans} fans</b>, bonus: ${bonusLabel(c.bonus)}`;
              ok = e.canPrintBook(me(), toSpec());
            }
          } else if (sel.type === "ripoff" && sel.target !== null) {
            if (w && a) {
              const t = s.chart[sel.target];
              const fans = (w.genre === t.genre ? 1 : 0) + (a.genre === t.genre ? 1 : 0) + (s.mastery[t.genre] === me() ? 1 : 0);
              txt += ` &rarr; no ideas needed &middot; launches with ~<b>${fans} fans</b>${fans === 0 ? " (off the chart until it gains one!)" : ""}`;
              ok = e.canPrintBook(me(), toSpec());
            }
          }
          if (w && a && cost > p.money) txt += ` — <b style="color:#a00">you only have $${p.money}!</b>`;
          preview.innerHTML = txt;
          m.querySelector("#print-ok").disabled = !ok;
        }
        sub.innerHTML = sel.type === "original"
          ? "Choose a comic + writer + artist. Pay the team's value in $ and 2 matching ideas."
          : "Copy a rival's original: team + $ only. No fans for originality, obviously.";
        renderComicRow();
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
      E().actPrint(me(), { books });
      Main.afterHumanMove();
    }
  }

  // -------------------------------------------------------------- ROYALTIES
  function royaltiesNow() {
    const e = E();
    const amt = ROYALTIES_SLOTS[e.nextSlot("royalties")];
    e.actRoyalties(me());
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
        const cv = el("canvas");
        cv.id = "map-canvas";
        cv.style.width = "min(680px, calc(66vh / var(--z, 1)))";
        cv.style.alignSelf = "center";
        m.appendChild(cv);
        modalButtons(m, [
          { label: "NOT TODAY", fn: () => closeModal() },
          { label: `START THE RUN (${n}/${n})`, cls: "btn-go", fn: () => {
              closeModal();
              if (e.actSalesStart(me())) runModal();
            } },
        ]);
        MapView.attach(cv, false, null);
      }, { width: "700px", onDismiss: () => {} });
      return;
    }
    runModal();

    function runModal() {
    let ticketMode = false;
    openModal((m) => {
      m.appendChild(el("h2", "", "MANHATTAN &mdash; SALES RUN"));
      const hud = el("div", "map-hud");
      m.appendChild(hud);
      const cv = el("canvas");
      cv.id = "map-canvas";
      cv.style.width = "min(680px, calc(68vh / var(--z, 1)))";
      cv.style.alignSelf = "center";
      m.appendChild(cv);
      cv.setAttribute("aria-hidden", "true"); // the panel below mirrors the map for keyboard/SR users
      m.appendChild(el("div", "modal-sub", "Click a <b>circle</b> to move (first step free, then $2/block by cab). " +
        "Click a <b>tile</b> next to your agent to flip / collect it. Landing on a rival's corner costs $2."));
      const panel = el("div", "sales-panel");
      panel.setAttribute("aria-label", "Sales run controls");
      m.appendChild(panel);
      modalButtons(m, [
        { label: "USE TICKET", id: "btn-ticket", fn: (btn) => {
            if (P(me()).tickets <= 0) return;
            ticketMode = !ticketMode;
            btn.classList.toggle("btn-go", ticketMode);
            toast(ticketMode ? "Ticket armed: click anywhere on the map" : "Ticket disarmed");
          } },
        { label: "END SALES RUN", cls: "btn-danger", fn: () => {
            if (!e.salesEnd(me())) return failed("You owe $2 for this corner — you can't end here.");
            closeModal();
            Main.afterHumanMove();
          } },
      ]);
      refreshHud();
      MapView.attach(cv, true, (h) => {
        const ses = s.salesSession;
        if (!ses) return;
        if (h.node !== undefined) {
          if (h.node === "X") return SFX.play("error");
          const from = P(me()).agentNode;
          if (h.node === from) return;
          if (ticketMode && P(me()).tickets > 0) {
            if (!e.salesMove(me(), h.node, true))
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
              if (!e.salesMove(me(), step)) {
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
            if (ses.flipsLeft > 0) e.salesFlip(me(), t.id);
            else if (ses.collectsLeft > 0) e.salesCollect(me(), t.id); // blind collect
            else return failed("No flips or collections left.");
          } else {
            if (ses.collectsLeft <= 0) return failed("No collections left.");
            e.salesCollect(me(), t.id);
          }
        }
        flushEvents();
        refreshHud();
        MapView.draw();
        renderHUD();
        // a collect may trigger a decision (which comic gets the fans)
        if (s.pending && s.pending.playerId === me()) {
          closeModal();
          Main.advance();
        }
      });
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
        renderPanel();
      }
      function afterPanelAction() {
        flushEvents();
        refreshHud();
        MapView.draw();
        renderHUD();
        if (s.pending && s.pending.playerId === me()) {
          closeModal();
          Main.advance();
        }
      }
      // DOM twin of the canvas map: everything a sales run can do, as real
      // buttons, derived from the engine's own legality checks
      function renderPanel() {
        const ses = s.salesSession;
        if (!ses) return;
        const p = P(me());
        const a = document.activeElement;
        const prevKey = a && a.dataset ? a.dataset.pkey : null;
        panel.innerHTML = "";
        const feeOwed = ses.unpaidNode != null && !ses.feePaid;
        panel.appendChild(el("div", "sp-status",
          `You are at <b>${cornerName(p.agentNode)}</b> &middot; $${p.money} &middot; ` +
          `${p.tickets} ticket${p.tickets === 1 ? "" : "s"} &middot; next step ${ses.freeWalk ? "free" : "$2 cab"}` +
          (feeOwed ? " &middot; <b>owes a $2 fee at this corner</b>" : "")));

        const mkBtn = (label, key, opts = {}) => {
          const b = el("button", "btn btn-small", label);
          b.dataset.pkey = key;
          b.setAttribute("aria-label", opts.desc || label);
          if (opts.disabledReason) {
            // stays focusable so keyboard users can reach the explanation:
            // aria-disabled + described-by reason + activation blocked in code
            b.setAttribute("aria-disabled", "true");
            b.title = opts.disabledReason;
            const r = el("span", "sr-only", "Unavailable: " + opts.disabledReason);
            r.id = "sp-why-" + key;
            b.appendChild(r);
            b.setAttribute("aria-describedby", r.id);
            b.onclick = () => failed(`Unavailable: ${opts.disabledReason}.`);
          } else if (opts.fn) b.onclick = () => { SFX.play("click"); opts.fn(); };
          return b;
        };

        // walk/cab destinations
        const dests = el("div", "sp-row");
        dests.appendChild(el("span", "sp-lab", "GO TO"));
        for (const nd of e.agentAdjacent(me())) {
          if (nd === "X") continue;
          const chk = e.salesMoveCheck(me(), nd);
          const desc = `Move to ${cornerName(nd)} — ${chk.cabFare ? "$2 cab" : "free step"}` +
            (chk.occupied ? ", a rival's corner: $2 fee to act or stop there" : "");
          dests.appendChild(mkBtn(
            `${cornerName(nd).replace("corner ", "")}${chk.occupied ? " &#9873;" : ""} (${chk.cabFare ? "$2" : "free"})`,
            "dest-" + nd, {
              desc,
              disabledReason: chk.ok ? null : chk.reason,
              fn: () => {
                const mode = ses.freeWalk ? "walk" : "cab";
                const from = p.agentNode;
                if (e.salesMove(me(), nd)) MapView.queueMove(me(), from, nd, mode);
                afterPanelAction();
              },
            }));
        }
        panel.appendChild(dests);

        // ticket teleport: native select + ride
        if (p.tickets > 0) {
          const trow = el("div", "sp-row");
          trow.appendChild(el("span", "sp-lab", "TICKET"));
          const sel = el("select");
          sel.dataset.pkey = "ticket-sel";
          sel.setAttribute("aria-label", "Ticket destination");
          for (const nd of MAP.nodes) {
            if (nd.id === p.agentNode) continue;
            const o = el("option", "", cornerName(nd.id));
            o.value = nd.id;
            sel.appendChild(o);
          }
          trow.appendChild(sel);
          trow.appendChild(mkBtn("RIDE", "ticket-go", {
            desc: "Use a super-transport ticket to ride to the selected corner",
            fn: () => {
              const nd = +sel.value;
              const chk = e.salesMoveCheck(me(), nd, true);
              if (!chk.ok) return failed(`Can't ride there: ${chk.reason}.`);
              const from = p.agentNode;
              if (e.salesMove(me(), nd, true)) MapView.queueMove(me(), from, nd, "ticket");
              afterPanelAction();
            },
          }));
          panel.appendChild(trow);
        }

        // orders at the current corner
        const here = el("div", "sp-row");
        here.appendChild(el("span", "sp-lab", "HERE"));
        const tiles = e.slotsAtAgent(me());
        if (!tiles.length)
          here.appendChild(el("span", "sp-none",
            p.agentNode === "X" ? "no newsstands at the station" : "no free orders at this corner"));
        const feeBlock = feeOwed && p.money < 2 ? "owes the $2 fee and can't pay it" : null;
        const feeNote = feeOwed ? " (pays the $2 fee first)" : "";
        for (const t of tiles) {
          const name = t.faceUp
            ? `${fmtGenre(t.genre)} order — needs value ${t.minVal}, worth ${t.fans} fan${t.fans > 1 ? "s" : ""}`
            : "a face-down order";
          if (!t.faceUp && ses.flipsLeft > 0)
            here.appendChild(mkBtn("FLIP ?", "flip-" + t.id, {
              desc: `Flip ${name} at ${cornerName(p.agentNode)}${feeNote}`,
              disabledReason: feeBlock,
              fn: () => { if (!e.salesFlip(me(), t.id)) failed("Can't flip that."); afterPanelAction(); },
            }));
          if (ses.collectsLeft > 0)
            here.appendChild(mkBtn(t.faceUp ? `COLLECT ${fmtGenre(t.genre)} ${t.minVal}+/${t.fans}` : "COLLECT ? (blind)", "collect-" + t.id, {
              desc: `Collect ${name}${feeNote}`,
              disabledReason: feeBlock,
              fn: () => { if (!e.salesCollect(me(), t.id)) failed("Can't collect that."); afterPanelAction(); },
            }));
        }
        panel.appendChild(here);

        // predictable focus after every rerender: same control, else its
        // group, else the first live button in the panel
        if (prevKey) {
          const live = ':not([aria-disabled="true"])';
          const target = panel.querySelector(`[data-pkey="${prevKey}"]${live}`) ||
            panel.querySelector(`[data-pkey^="${prevKey.split("-")[0]}"]${live}`) ||
            panel.querySelector("button" + live);
          if (target) target.focus();
        }
      }
    }, { width: "720px" });
    }
  }

  function cornerName(n) {
    if (n === "X") return "Central Station";
    const nd = MAP.nodes[n];
    return `corner ${"ABCD"[nd.c]}${nd.r + 1}`;
  }

  // view-only map
  function viewMap() {
    openModal((m) => {
      m.appendChild(el("h2", "", "MANHATTAN — NEWSSTAND ORDERS"));
      const cv = el("canvas");
      cv.id = "map-canvas";
      cv.style.width = "min(760px, calc(80vh / var(--z, 1)))";
      m.appendChild(cv);
      modalButtons(m, [{ label: "CLOSE", fn: () => closeModal() }]);
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
      default: e.resolvePending(me(), {}); Main.advance();
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
        closeModal();
        E().resolvePending(me(), { cards: sel });
        Main.afterHumanMove();
      } }]);
    }, { width: "820px" });
  }

  function chooseIdeasModal(pd) {
    const e = E(), s = e.state, p = P(me());
    const sel = [];
    openModal((m) => {
      m.appendChild(el("h2", "", "BONUS IDEAS"));
      m.appendChild(el("div", "modal-sub", `Take <b>${pd.data.count}</b> idea token${pd.data.count > 1 ? "s" : ""} of any genre. Printing an original needs <b>2 matching ideas</b> — here's what's around:`));
      // context: what could use those ideas
      const ctx = el("div", "ctx-strip");
      const myComics = p.hand.filter((c) => !CARD_BY_ID[c].kind).concat(p.hyped.map((h) => h.cardId));
      if (myComics.length) {
        ctx.appendChild(el("b", "", "ON YOUR DESK:"));
        myComics.forEach((c) => {
          const d = spr(coverOf(c), 0.42);
          d.title = `${CARD_BY_ID[c].title} — needs 2 ${GENRE_INFO[CARD_BY_ID[c].genre].name} ideas (you have ${p.ideas[CARD_BY_ID[c].genre]})`;
          ctx.appendChild(d);
          ctx.appendChild(el("span", "", genreDot(CARD_BY_ID[c].genre)));
        });
      }
      if (s.display.comics.length) {
        ctx.appendChild(el("b", "", "WRITERS' ROOM:"));
        s.display.comics.forEach((c) => {
          const d = spr(coverOf(c), 0.42);
          d.title = `${CARD_BY_ID[c].title} (${GENRE_INFO[CARD_BY_ID[c].genre].name}) — available to develop`;
          ctx.appendChild(d);
          ctx.appendChild(el("span", "", genreDot(CARD_BY_ID[c].genre)));
        });
      }
      const talent = s.display.writers.concat(s.display.artists);
      if (talent.length) {
        ctx.appendChild(el("b", "", "TALENT:"));
        talent.forEach((c) => {
          const d = spr(faceOf(c), 0.8);
          d.title = `${CARD_BY_ID[c].name} — ${GENRE_INFO[CARD_BY_ID[c].genre].name} ${CARD_BY_ID[c].kind} v${CARD_BY_ID[c].value}`;
          ctx.appendChild(d);
          ctx.appendChild(el("span", "", genreDot(CARD_BY_ID[c].genre)));
        });
      }
      m.appendChild(ctx);
      const row = el("div", "card-row");
      const counters = {};
      GENRES.forEach((g) => {
        const t = el("div", "token-btn");
        t.appendChild(spr("idea_" + g, 1.2));
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
        closeModal();
        E().resolvePending(me(), { genres: sel });
        Main.afterHumanMove();
      } }]);
    });
  }

  function chooseOrderComicModal(pd) {
    const e = E(), s = e.state;
    const o = s.mapSlots[pd.data.orderId];
    openModal((m) => {
      m.appendChild(el("h2", "", "WHICH BOOK TAKES THE ORDER?"));
      m.appendChild(el("div", "modal-sub", `A ${GENRE_INFO[o.genre].name} order (value ${o.minVal}+) grants <b>+${o.fans} fans</b> to one of these:`));
      const row = el("div", "card-row");
      for (const idx of pd.data.choices) {
        const c = s.chart[idx];
        const d = el("div", "pick-card");
        d.appendChild(spr(comicSprite(c), 1.15));
        d.appendChild(el("div", "pc-label", `${esc(c.title)}<br>${c.fans} fans now`));
        d.onclick = () => {
          SFX.play("click");
          closeModal();
          e.resolvePending(me(), { chartIdx: idx });
          Main.afterHumanMove();
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
      for (const sp of pd.data.options) {
        const info = SPECIALS[sp];
        const d = el("div", "pick-card");
        d.style.maxWidth = "230px";
        d.appendChild(specialArt(sp, 200));
        d.appendChild(el("div", "pc-label",
          `<b style="font-family:PressStart;font-size:9px">${info.name}</b><br>` +
          `<i>after ${ACTION_INFO[info.after].verb}</i><br>${info.desc}`));
        d.onclick = () => {
          SFX.play("click");
          closeModal();
          E().resolvePending(me(), { special: sp });
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
      const fr = el("div", "choice-group");
      for (const sp of p.cubeSpecials) {
        const b = el("button", "choice", SPECIALS[sp].name);
        b.onclick = () => { from = sp; fr.querySelectorAll(".choice").forEach((x) => x.classList.remove("active")); b.classList.add("active"); refresh(); };
        fr.appendChild(b);
      }
      m.appendChild(fr);
      m.appendChild(el("h3", "", "TO WHICH SPECIAL"));
      const toRow = el("div", "choice-group");
      for (const sp of Object.keys(SPECIALS)) {
        if (p.cubeSpecials.includes(sp)) continue;
        const b = el("button", "choice", SPECIALS[sp].name + " (after " + ACTION_INFO[SPECIALS[sp].after].verb + ")");
        b.onclick = () => { to = sp; toRow.querySelectorAll(".choice").forEach((x) => x.classList.remove("active")); b.classList.add("active"); refresh(); };
        toRow.appendChild(b);
      }
      m.appendChild(toRow);
      modalButtons(m, [
        { label: "KEEP AS IS", fn: () => { closeModal(); E().resolvePending(me(), {}); Main.afterHumanMove(); } },
        { label: "MOVE IT", cls: "btn-go", id: "rc-ok", disabled: true, fn: () => {
            closeModal();
            E().resolvePending(me(), { from, to });
            Main.afterHumanMove();
          } },
      ]);
      function refresh() { m.querySelector("#rc-ok").disabled = !(from && to); }
    });
  }

  // ================================================================ SPECIALS
  function specialModal(sp) {
    const e = E();
    switch (sp) {
      case "bettercolor": e.specialBetterColor(me(), true); toast("Better Colors! +2 VP token added."); return Main.advance();
      case "extraeditor": e.specialExtraEditor(me(), true); toast("Extra editor for this round!"); return Main.advance();
      case "reassign": return reassignModal();
      case "hype": return hypeModal();
      case "ideasconv": return ideasConvModal();
      case "marketing": return marketingModal();
      default: e.skipSpecial(me()); return Main.advance();
    }
  }

  function reassignModal() {
    const e = E(), s = e.state, p = P(me());
    const swaps = [];
    openModal((m) => {
      m.appendChild(el("h2", "", "&#9733; RE-ASSIGN CREATIVES"));
      m.appendChild(specialArt("reassign", 150)).style.alignSelf = "center";
      m.appendChild(el("div", "modal-sub",
        "Put someone from your hand onto a printed book. <b>Genre match (gold) = specialized</b>: +1 fan and can train each morning. " +
        "Pay (or pocket) the value difference. Up to one writer swap and one artist swap."));
      const rows = el("div");
      m.appendChild(rows);
      renderRows();
      modalButtons(m, [
        { label: "SKIP", fn: () => { closeModal(); e.skipSpecial(me()); Main.advance(); } },
        { label: "APPLY", cls: "btn-go", id: "ra-ok", disabled: true, fn: () => {
            closeModal();
            e.specialReassign(me(), swaps);
            Main.afterHumanMove();
          } },
      ]);
      // face + genre + value pips — the info that matters, as a little card
      function crCard(cardId, value, bookGenre, opts = {}) {
        const cd = CARD_BY_ID[cardId];
        const d = el("div", "swap-cr" + (cd.genre === bookGenre ? " spec" : "") + (opts.cls ? " " + opts.cls : ""));
        d.appendChild(spr(faceOf(cardId), 1.15));
        d.appendChild(el("div", "sc-meta", `${genreDot(cd.genre)}<b>${"&#10022;".repeat(value)}</b>`));
        if (opts.label) d.appendChild(el("div", "sc-label", opts.label));
        attachZoom(d, cd.sprite,
          `<b>${esc(cd.name)}</b><br>${genreDot(cd.genre)} ${GENRE_INFO[cd.genre].name} &middot; v${value}` +
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
            bk.appendChild(spr(comicSprite(comic), 0.45));
            bk.appendChild(el("span", "", genreDot(comic.genre)));
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
    if (!comics.length) { e.specialHype(me(), null); return Main.advance(); }
    openModal((m) => {
      m.appendChild(el("h2", "", "&#9733; BUILD HYPE"));
      m.appendChild(specialArt("hype", 150)).style.alignSelf = "center";
      m.appendChild(el("div", "modal-sub", "Set one unprinted comic aside. It gains a hype token (2 fans) at the start of every round; all cash in when you finally print it."));
      const row = el("div", "card-row");
      for (const c of comics) {
        cardPick(row, c, {
          scale: 1.15, label: CARD_BY_ID[c].title,
          onpick: () => {
            closeModal();
            e.specialHype(me(), c);
            Main.afterHumanMove();
          },
        });
      }
      m.appendChild(row);
      modalButtons(m, [{ label: "SKIP", fn: () => { closeModal(); e.specialHype(me(), null); Main.advance(); } }]);
    });
  }

  function ideasConvModal() {
    const e = E(), s = e.state, p = P(me());
    const total = GENRES.reduce((sum, g) => sum + p.ideas[g], 0);
    const mine = s.chart.filter((c) => c.owner === me());
    if (!total || !mine.length) { e.specialIdeasConv(me(), []); return Main.advance(); }
    const sel = [];
    openModal((m) => {
      m.appendChild(el("h2", "", "&#9733; WORD OF MOUTH"));
      m.appendChild(specialArt("ideasconv", 150)).style.alignSelf = "center";
      m.appendChild(el("div", "modal-sub", `Convert up to ${Math.min(3, total)} idea tokens into +1 fan each (max 1 per comic). Any genre token works.`));
      const row = el("div", "card-row");
      for (const c of mine) {
        const d = el("div", "pick-card");
        d.appendChild(spr(comicSprite(c), 1));
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
        { label: "SKIP", fn: () => { closeModal(); e.specialIdeasConv(me(), []); Main.advance(); } },
        { label: "CONVERT", cls: "btn-go", fn: () => {
            // auto-pick which genre tokens to burn (most abundant first)
            const pool = [];
            GENRES.slice().sort((a, b) => p.ideas[b] - p.ideas[a]).forEach((g) => {
              for (let i = 0; i < p.ideas[g]; i++) pool.push(g);
            });
            closeModal();
            e.specialIdeasConv(me(), sel.map((idx, i) => ({ genre: pool[i], chartIdx: idx })));
            Main.afterHumanMove();
          } },
      ]);
    });
  }

  function marketingModal() {
    const e = E(), s = e.state, p = P(me());
    const mine = s.chart.filter((c) => c.owner === me() && c.fans >= 1);
    const tiers = MARKETING.filter((t) => p.money >= t.cost);
    if (!mine.length || !tiers.length) { e.specialMarketing(me(), 0, []); return Main.advance(); }
    let tier = null;
    const dist = {};
    openModal((m) => {
      m.appendChild(el("h2", "", "&#9733; MARKETING BLITZ"));
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
        d.appendChild(spr(comicSprite(c), 1));
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
        { label: "SKIP", fn: () => { closeModal(); e.specialMarketing(me(), 0, []); Main.advance(); } },
        { label: "LAUNCH CAMPAIGN", cls: "btn-go", id: "mk-ok", disabled: true, fn: () => {
            closeModal();
            e.specialMarketing(me(), tier.cost, Object.entries(dist).map(([idx, fans]) => ({ chartIdx: +idx, fans })));
            Main.afterHumanMove();
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
    let comic = null;
    const ideas = [];
    openModal((m) => {
      m.appendChild(el("h2", "", "FOUNDING CATALOG"));
      m.appendChild(el("div", "modal-sub",
        `Pick the <b>genre</b> of your first comic book project (you draw it face-down — its bonus is a surprise) and <b>${picks.ideas}</b> idea tokens.`));
      m.appendChild(el("h3", "", "YOUR STARTING TEAM"));
      const team = el("div", "card-row");
      for (const c of p.hand) team.appendChild(personChip(c, { scale: 2 }));
      m.appendChild(team);
      m.appendChild(el("h3", "", "PICK A GENRE FROM THE VAULT"));
      const row = el("div", "card-row");
      for (const g of GENRES) {
        const inDeck = s.decks.comics.filter((c) => CARD_BY_ID[c].genre === g);
        const teamMatch = p.hand.some((c) => CARD_BY_ID[c].genre === g);
        cardPick(row, null, {
          back: "back_orig_" + g,
          scale: 1.25,
          dimmed: inDeck.length === 0,
          label: `${fmtGenre(g)}${teamMatch ? "<br><b>&#9733; matches your team!</b>" : "<br>&nbsp;"}`,
          onpick: (d) => {
            comic = inDeck[(e.rng() * inDeck.length) | 0]; // seeded: reproducible + undo-safe
            selectOne(row, d);
            refresh();
          },
        });
      }
      m.appendChild(row);
      m.appendChild(el("h3", "", `IDEA TOKENS (${picks.ideas})`));
      const irow = el("div", "card-row");
      const counters = {};
      GENRES.forEach((g) => {
        const t = el("div", "token-btn");
        t.appendChild(spr("idea_" + g, 1.1));
        const cnt = el("span", "count-badge", "0");
        t.appendChild(cnt);
        counters[g] = cnt;
        t.onclick = () => {
          SFX.play("click");
          if (ideas.length >= picks.ideas) ideas.shift();
          ideas.push(g);
          GENRES.forEach((x) => (counters[x].textContent = ideas.filter((y) => y === x).length));
          refresh();
        };
        irow.appendChild(t);
      });
      m.appendChild(irow);
      modalButtons(m, [{ label: "FOUND THE HOUSE", cls: "btn-go", id: "sp-ok", disabled: true, fn: () => {
        closeModal();
        e.resolveStartingPicks(me(), comic, ideas);
        e.advanceIncrease();
        Main.afterHumanMove();
      } }]);
      function refresh() { m.querySelector("#sp-ok").disabled = !(comic && ideas.length === picks.ideas); }
    }, { width: "980px" });
  }

  function increaseModal() {
    const e = E(), p = P(me());
    openModal((m) => {
      m.appendChild(el("h2", "", "MORNING TRAINING"));
      m.appendChild(el("div", "modal-sub",
        "Specialized creatives on printed books can grow: <b>learn</b> from a stronger specialized teammate ($1) or <b>train</b> (pay the new value). One step per creative per round. Higher team value = higher book value for orders."));
      const list = el("div");
      m.appendChild(list);
      render();
      modalButtons(m, [{ label: "DONE", cls: "btn-go", fn: () => {
        closeModal();
        e.finishIncrease(me());
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
            `${sprHTML(faceOf(cr.id), 1.1)} <b>${esc(cr.name)}</b> (${o.kind} on <b>${esc(c.title)}</b>) v${cr.curValue} &rarr; v${o.newValue} &middot; ${o.mode} for <b>$${o.cost}</b>`));
          const b = el("button", "btn btn-small", o.mode.toUpperCase() + " $" + o.cost);
          b.onclick = () => {
            SFX.play("cash");
            e.applyIncrease(me(), o);
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
        c.appendChild(spr(i === 0 ? "bossbig_" + p.color : "boss_" + p.color, i === 0 ? 1.15 : 1.1));
        const lg = el("div", "pod-logo");
        lg.appendChild(spr(pub.logo, i === 0 ? 0.7 : 0.55));
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
<p><b>Specialized creatives</b> (matching the comic's genre) add +1 fan each at print and can grow in value each morning.</p>
<p><b>Mastery</b>: first to print a genre (or overtake majority with at least one original) gets +1 fan on every book of that genre and 2 VP.</p>
<p><b>Specials</b>: printing your 2nd/3rd/4th book unlocks cube specials that ride on main actions. 5th book: +1 VP per original. 6th+: +2 VP each.</p>
<p><b>End of round</b>: chart rank pays VP (3/2/1), every comic earns $ by its fans, then every comic loses 1 fan. Turn order reverses rank.</p>`));
      modalButtons(m, [{ label: "GOT IT", fn: () => closeModal() }]);
    }, { width: "800px" });
  }

  return { open, salesScene, viewMap, pendingModal, specialModal, startingPicksModal, increaseModal, endgameModal, helpModal };
})();
