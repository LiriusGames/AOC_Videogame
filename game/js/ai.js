// ============================================================================
// AGE OF COMICS — AI rival publishers
// Heuristic planners that play the complete rules. Personalities shade the
// weights: chart (fans/rank), ripoff (parasite), quality (specialists), money.
// ============================================================================
"use strict";

const AI = (() => {

  const PERSONA_W = {
    // tuned against test/balance.js — keep personalities, close the gaps:
    // specialists also grant fans, so the chart-chaser values them; the
    // money man deploys capital efficiently instead of hoarding it
    chart:   { fans: 1.35, money: 0.95, ripoff: 0.85, spec: 1.25, orders: 1.25 },
    ripoff:  { fans: 1.0,  money: 1.0, ripoff: 1.6, spec: 0.8, orders: 1.0 },
    quality: { fans: 1.0,  money: 0.9, ripoff: 0.45, spec: 1.35, orders: 1.0 },
    money:   { fans: 1.0,  money: 1.25, ripoff: 0.85, spec: 1.1, orders: 1.1 },
  };
  function W(engine, pid) {
    return PERSONA_W[engine.player(pid).persona] || PERSONA_W.chart;
  }
  function diffNoise(engine) {
    const d = engine.cfg.difficulty || "normal";
    return d === "easy" ? 3.5 : d === "normal" ? 1.2 : 0.25;
  }

  // ------------------------------------------------------------ hand helpers
  const card = (id) => CARD_BY_ID[id];
  function handOf(engine, pid, kind) {
    return engine.player(pid).hand.filter((c) => card(c).kind === kind);
  }
  function handComics(engine, pid) {
    const p = engine.player(pid);
    return p.hand.filter((c) => !card(c).kind).concat(p.hyped.map((h) => h.cardId));
  }

  // Score a print combo (writer, artist, comicCard|ripTarget)
  function comboFans(engine, pid, w, a, genre, isRip, bonus, hypeTokens) {
    let fans = isRip ? 0 : 1;
    if (!isRip && bonus === "fan") fans += 1;
    if (card(w).genre === genre) fans += 1;
    if (card(a).genre === genre) fans += 1;
    fans += (hypeTokens || 0) * 2;
    // mastery estimate
    const s = engine.state;
    if (s.mastery[genre] === pid) fans += 1;
    else if (!s.firstPrinted[genre] && !isRip) fans += 1;
    return fans;
  }
  function specVP(w, a, genre) {
    const spec = (card(w).genre === genre ? 1 : 0) + (card(a).genre === genre ? 1 : 0);
    return spec === 2 ? 6 : spec === 1 ? 4 : 2;
  }
  function orderBonus(engine, pid, genre, value) {
    // fans from own collected unfulfilled orders this print would satisfy
    const s = engine.state, p = engine.player(pid);
    let sum = 0;
    for (const oid of p.orders) {
      const o = s.mapSlots[oid];
      if (!o.fulfilled && o.genre === genre && value >= o.minVal) sum += o.fans;
    }
    return sum;
  }

  // Enumerate feasible + near-feasible print plans
  function printPlans(engine, pid, requireFeasible) {
    const p = engine.player(pid);
    const ws = handOf(engine, pid, "writer");
    const as = handOf(engine, pid, "artist");
    const plans = [];
    const wgt = W(engine, pid);
    for (const w of ws) for (const a of as) {
      const cost = card(w).value + card(a).value;
      // originals
      for (const c of handComics(engine, pid)) {
        const genre = card(c).genre;
        const hy = p.hyped.find((h) => h.cardId === c);
        const feasible = p.money >= cost && p.ideas[genre] >= 2;
        if (requireFeasible && !feasible) continue;
        const fans = comboFans(engine, pid, w, a, genre, false, card(c).bonus, hy ? hy.tokens : 0);
        let score = fans * 2.2 * wgt.fans + specVP(w, a, genre) * 0.9 * wgt.spec
          + orderBonus(engine, pid, genre, cost) * 2 * wgt.orders - cost * 0.25;
        if (card(c).bonus === "money") score += 2;
        if (card(c).bonus === "ticket") score += 1.2;
        if (card(c).bonus === "ideas") score += 1.6;
        plans.push({
          type: "original", comic: c, writer: w, artist: a, genre, cost,
          needIdeas: Math.max(0, 2 - p.ideas[genre]), needMoney: Math.max(0, cost - p.money),
          feasible, score,
        });
      }
      // rip-offs
      if (engine.cfg.useRipoffs) {
        for (const t of engine.state.chart) {
          if (t.isRipoff || t.owner === pid || engine.state.rippedOriginals[t.cardId]) continue;
          const genre = t.genre;
          const feasible = p.money >= cost;
          if (requireFeasible && !feasible) continue;
          const fans = comboFans(engine, pid, w, a, genre, true, null, 0);
          // majority steal potential
          const holder = engine.state.mastery[genre];
          let masteryLure = 0;
          if (holder !== undefined && holder !== pid &&
              engine.genreCount(pid, genre) + 1 > engine.genreCount(holder, genre) &&
              engine.playerHasOriginal(pid, genre)) masteryLure = 4;
          let score = fans * 2.0 * wgt.fans * wgt.ripoff + masteryLure
            + orderBonus(engine, pid, genre, cost) * 2 * wgt.orders - cost * 0.3
            - 1.5; // rips score no origVP/mastery at the end — opportunity cost
          if (fans === 0) score -= 3; // off-chart books earn nothing
          plans.push({
            type: "ripoff", target: t.idx, writer: w, artist: a, genre, cost,
            needIdeas: 0, needMoney: Math.max(0, cost - p.money), feasible, score,
          });
        }
      }
    }
    plans.sort((x, y) => y.score - x.score);
    return plans;
  }

  // ----------------------------------------------------------- action choice
  function chooseAction(engine, pid) {
    const s = engine.state, p = engine.player(pid);
    const wgt = W(engine, pid);
    const noise = diffNoise(engine);
    const cand = [];
    const rnd = () => (engine.rng() - 0.5) * 2 * noise;

    const feasible = printPlans(engine, pid, true);
    const wishful = printPlans(engine, pid, false);
    const bestPlan = feasible[0] || null;
    const bestWish = wishful[0] || null;

    // PRINT
    if (engine.nextSlot("print") >= 0 && bestPlan) {
      let score = 6 + bestPlan.score;
      const slot = engine.nextSlot("print");
      let books = [bestPlan];
      if (slot === 0 && feasible.length > 1) {
        // try to find a compatible second print (different cards)
        const second = feasible.find((pl) =>
          pl !== bestPlan && pl.writer !== bestPlan.writer && pl.artist !== bestPlan.artist &&
          (pl.type === "ripoff" || pl.comic !== bestPlan.comic) &&
          affordTogether(engine, pid, bestPlan, pl));
        if (second) { books = [bestPlan, second]; score += 5 + second.score * 0.5; }
      }
      cand.push({ action: "print", books, score: score + rnd() });
    }

    // HIRE
    if (engine.nextSlot("hire") >= 0 && p.hand.length + p.hyped.length <= HAND_LIMIT - 1) {
      const pick = bestHirePick(engine, pid);
      if (pick) cand.push({ action: "hire", picks: pick.picks, score: pick.score + rnd() });
    }

    // DEVELOP
    if (engine.nextSlot("develop") >= 0 && p.hand.length + p.hyped.length <= HAND_LIMIT - 1) {
      const pick = bestDevelopPick(engine, pid);
      if (pick) cand.push({ action: "develop", pick: pick.pick, score: pick.score + rnd() });
    }

    // IDEAS
    if (engine.nextSlot("ideas") >= 0) {
      const slot = engine.nextSlot("ideas");
      const fromBoard = IDEAS_SLOTS[slot];
      let need = 0;
      if (bestWish && bestWish.type === "original") need = bestWish.needIdeas;
      const totalIdeas = GENRES.reduce((sum, g) => sum + p.ideas[g], 0);
      let score = 2 + fromBoard * 1.2 + (need > 0 ? 4.5 : 0) - totalIdeas * 0.4;
      cand.push({ action: "ideas", score: score + rnd() });
    }

    // ROYALTIES
    if (engine.nextSlot("royalties") >= 0) {
      const amt = ROYALTIES_SLOTS[engine.nextSlot("royalties")];
      const broke = bestWish ? bestWish.needMoney : 0;
      // cash converts to VP at only $4 each — once flush, stop stacking it
      const rich = p.money >= 12 ? 0.6 : 1;
      let score = amt * 0.9 * wgt.money * rich + (broke > 0 && broke <= amt ? 4 : 0) + (p.money < 3 ? 3 : 0);
      cand.push({ action: "royalties", score: score + rnd() });
    }

    // SALES
    if (engine.nextSlot("sales") >= 0) {
      const est = estimateSales(engine, pid);
      if (est.score > 0) cand.push({ action: "sales", est, score: est.score + rnd() });
    }

    cand.sort((a, b) => b.score - a.score);
    return cand[0] || null;
  }

  function affordTogether(engine, pid, p1, p2) {
    const p = engine.player(pid);
    let money = p.money - p1.cost - p2.cost;
    if (p1.type === "original" && card(p1.comic).bonus === "money") money += 4;
    if (money < 0) return false;
    if (p1.type === "original" && p2.type === "original") {
      if (card(p1.comic).genre === card(p2.comic).genre)
        return p.ideas[card(p1.comic).genre] >= 4;
      return p.ideas[card(p1.comic).genre] >= 2 && p.ideas[card(p2.comic).genre] >= 2;
    }
    if (p2.type === "original") return p.ideas[card(p2.comic).genre] >= 2;
    return true;
  }

  function bestHirePick(engine, pid) {
    const s = engine.state, p = engine.player(pid);
    const wgt = W(engine, pid);
    const myComicGenres = handComics(engine, pid).map((c) => card(c).genre);
    const wantGenres = new Set(myComicGenres.concat(s.display.comics.map((c) => card(c).genre)));
    function value(cid) {
      if (!cid) return 0;
      const c = card(cid);
      let v = c.value * 1.1;
      if (wantGenres.has(c.genre)) v += 2.2 * wgt.spec;
      if (c.value === 1) v += 1.2; // free idea
      return v;
    }
    const haveW = handOf(engine, pid, "writer").length;
    const haveA = handOf(engine, pid, "artist").length;
    let bestW = null, bestWv = -1;
    for (const c of s.display.writers) if (value(c) > bestWv) { bestW = c; bestWv = value(c); }
    let bestA = null, bestAv = -1;
    for (const c of s.display.artists) if (value(c) > bestAv) { bestA = c; bestAv = value(c); }
    // consider blind deck draws when display is weak
    if (bestWv < 2.4) { bestW = "deck"; bestWv = 2.2; }
    if (bestAv < 2.4) { bestA = "deck"; bestAv = 2.2; }
    const need = (haveW === 0 ? 3 : 0) + (haveA === 0 ? 3 : 0);
    const surplus = Math.max(0, haveW + haveA - 3);
    return {
      picks: { writer: bestW, artist: bestA },
      score: 1.5 + need + (bestWv + bestAv) * 0.55 - surplus * 1.6,
    };
  }

  function bestDevelopPick(engine, pid) {
    const s = engine.state, p = engine.player(pid);
    const wgt = W(engine, pid);
    const myCreativeGenres = p.hand.filter((c) => card(c).kind).map((c) => card(c).genre);
    const nComics = handComics(engine, pid).length;
    function value(cid) {
      const c = card(cid);
      let v = 2;
      const matches = myCreativeGenres.filter((g) => g === c.genre).length;
      v += matches * 1.8 * wgt.spec;
      if (p.ideas[c.genre] >= 2) v += 1.6;
      if (engine.state.mastery[c.genre] === pid) v += 1;
      if (c.bonus === "money") v += 0.8;
      return v;
    }
    let best = null, bestV = -1;
    for (const c of s.display.comics) if (value(c) > bestV) { best = c; bestV = value(c); }
    let pick = best ? { comic: best } : { comic: "deck" };
    if (bestV < 2.5) { pick = { comic: "deck" }; bestV = 2.4; }
    // search option when rich and a specific genre is hot
    const hotGenre = myCreativeGenres.find((g) => myCreativeGenres.filter((x) => x === g).length >= 2 && p.ideas[g] >= 2);
    if (hotGenre && p.money >= 8 && !s.display.comics.some((c) => card(c).genre === hotGenre)) {
      pick = { searchGenre: hotGenre };
      bestV = 5;
    }
    const surplus = Math.max(0, nComics - 2);
    return { pick, score: 1.2 + bestV - surplus * 1.8 };
  }

  // Sales estimation: pick best node within reach, count collectable value
  function estimateSales(engine, pid) {
    const s = engine.state, p = engine.player(pid);
    const wgt = W(engine, pid);
    const slot = engine.nextSlot("sales");
    if (slot < 0) return { score: -1 };
    const limit = SALES_SLOTS[slot];
    // my printable/printed genres+values
    const myComics = s.chart.filter((c) => c.owner === pid);
    function tileValue(t) {
      if (t.takenBy !== null) return 0;
      const canFill = myComics.some((c) => c.genre === t.genre && c.value >= t.minVal);
      const mightFill = myComics.some((c) => c.genre === t.genre) ||
        handComics(engine, pid).some((c) => card(c).genre === t.genre);
      if (t.faceUp) return canFill ? t.fans * 2.2 : mightFill ? t.fans * 0.9 : -t.fans * 0.5;
      return 0.9; // unknown tile: mild value via flipping
    }
    // evaluate nodes reachable within budget (0..2 cab rides or ticket)
    const nodes = MAP.nodes.map((n) => n.id);
    const dist = bfs(engine, p.agentNode);
    let best = { node: null, value: -1, cost: 0, useTicket: false };
    for (const nd of nodes) {
      const d = dist[nd] ?? 99;
      let cost = Math.max(0, d - 1) * 2;
      let useTicket = false;
      if (cost > p.money - 2 || d > 3) {
        if (p.tickets > 0) { cost = 0; useTicket = true; }
        else continue;
      }
      const tiles = s.mapSlots.filter((t) => t.nodes.includes(nd) && t.takenBy === null);
      const v = tiles.slice().sort((a, b) => tileValue(b) - tileValue(a))
        .slice(0, limit).reduce((sum, t) => sum + Math.max(0, tileValue(t)), 0) - cost * 0.4;
      if (v > best.value) best = { node: nd, value: v, cost, useTicket };
    }
    if (!best.node && best.node !== 0) return { score: -1 };
    return { score: best.value * wgt.orders * 0.85, target: best.node, useTicket: best.useTicket };
  }
  function bfs(engine, from) {
    const dist = {};
    const q = [];
    if (from === "X") { MAP.X_LINKS.forEach((n) => { dist[n] = 1; q.push(n); }); }
    else { dist[from] = 0; q.push(from); }
    while (q.length) {
      const n = q.shift();
      const adj = [];
      for (const [a, b] of MAP.edges) {
        if (a === n) adj.push(b);
        if (b === n) adj.push(a);
      }
      if (MAP.X_LINKS.includes(n)) MAP.X_LINKS.forEach((m) => { if (m !== n) adj.push(m); });
      for (const m of adj) if (dist[m] === undefined) { dist[m] = dist[n] + 1; q.push(m); }
    }
    return dist;
  }

  // --------------------------------------------------------------- execution
  function takeTurn(engine, pid) {
    if (ACTIONS.every((a) => engine.nextSlot(a) < 0)) { engine.actPass(pid); return; }
    const choice = chooseAction(engine, pid);
    if (!choice) {
      // nothing sensible: burn an editor on royalties/ideas fallback
      if (engine.nextSlot("royalties") >= 0) engine.actRoyalties(pid);
      else if (engine.nextSlot("ideas") >= 0) engine.actIdeas(pid, autoIdeas(engine, pid));
      else {
        for (const a of ACTIONS) {
          if (engine.nextSlot(a) < 0) continue;
          if (a === "royalties") { engine.actRoyalties(pid); break; }
          if (a === "ideas") { engine.actIdeas(pid, autoIdeas(engine, pid)); break; }
          if (a === "hire") { engine.actHire(pid, { writer: "deck", artist: "deck" }); break; }
          if (a === "develop") { engine.actDevelop(pid, { comic: "deck" }); break; }
          if (a === "sales") { engine.actSalesStart(pid); engine.salesEnd(pid); break; }
          if (a === "print") continue;
        }
      }
      settle(engine, pid);
      return;
    }
    switch (choice.action) {
      case "print": {
        const books = choice.books.map((pl) => pl.type === "original"
          ? { type: "original", comic: pl.comic, writer: pl.writer, artist: pl.artist }
          : { type: "ripoff", target: pl.target, writer: pl.writer, artist: pl.artist });
        engine.actPrint(pid, { books });
        break;
      }
      case "hire": engine.actHire(pid, choice.picks); break;
      case "develop": engine.actDevelop(pid, choice.pick); break;
      case "ideas": engine.actIdeas(pid, autoIdeas(engine, pid)); break;
      case "royalties": engine.actRoyalties(pid); break;
      case "sales": doSales(engine, pid, choice.est); break;
    }
    settle(engine, pid);
  }

  function autoIdeas(engine, pid) {
    const s = engine.state, p = engine.player(pid);
    const wish = printPlans(engine, pid, false)[0];
    const wantGenre = wish && wish.type === "original" ? wish.genre : null;
    const slot = engine.nextSlot("ideas");
    const n = slot >= 0 ? IDEAS_SLOTS[slot] : 0;
    const board = [];
    const avail = GENRES.filter((g) => s.boardIdeas[g] > 0);
    // prefer wanted genre from board, then own comic genres
    avail.sort((a, b) => (b === wantGenre ? 1 : 0) - (a === wantGenre ? 1 : 0));
    for (let i = 0; i < n && i < avail.length; i++) board.push(avail[i]);
    const supply = [];
    const sup1 = wantGenre || pickHandGenre(engine, pid) || GENRES[(engine.rng() * 6) | 0];
    supply.push(sup1, sup1);
    return { board, supply };
  }
  function pickHandGenre(engine, pid) {
    const cs = handComics(engine, pid);
    return cs.length ? card(cs[0]).genre : null;
  }

  function doSales(engine, pid, est) {
    const s = engine.state, p = engine.player(pid);
    if (!engine.actSalesStart(pid)) return;
    const ses = s.salesSession;
    // move toward target
    if (est && est.target != null && p.agentNode !== est.target) {
      if (est.useTicket) engine.salesMove(pid, est.target, true);
      else {
        // walk/cab along BFS path
        for (let guard = 0; guard < 8 && p.agentNode !== est.target; guard++) {
          const next = nextStep(engine, p.agentNode, est.target);
          if (next == null) break;
          if (!engine.salesMove(pid, next)) break;
        }
      }
    } else if (p.agentNode === "X") {
      engine.salesMove(pid, MAP.X_LINKS[(engine.rng() * 4) | 0]);
    }
    // flip then collect best
    const myComics = s.chart.filter((c) => c.owner === pid);
    function fill(t) { return myComics.some((c) => c.genre === t.genre && c.value >= t.minVal); }
    function might(t) {
      return myComics.some((c) => c.genre === t.genre) ||
        handComics(engine, pid).some((c) => card(c).genre === t.genre);
    }
    let guard = 0;
    while (ses.flipsLeft > 0 && guard++ < 10) {
      const t = engine.slotsAtAgent(pid).find((t) => !t.faceUp);
      if (!t) break;
      if (!engine.salesFlip(pid, t.id)) break;
    }
    const collectables = engine.slotsAtAgent(pid).filter((t) => t.faceUp)
      .sort((a, b) => (fill(b) ? b.fans * 2 : might(b) ? b.fans : -1) - (fill(a) ? a.fans * 2 : might(a) ? a.fans : -1));
    for (const t of collectables) {
      if (ses.collectsLeft <= 0) break;
      const v = fill(t) ? 2 : might(t) ? 1 : 0;
      if (v === 0) continue;
      engine.salesCollect(pid, t.id);
      if (s.pending) resolveOwnPendings(engine, pid);
    }
    engine.salesEnd(pid);
  }
  function nextStep(engine, from, to) {
    // BFS parent walk
    const parent = {};
    const q = [];
    const push = (n, par) => { if (parent[n] === undefined && n !== from) { parent[n] = par; q.push(n); } };
    const adjOf = (n) => {
      const adj = [];
      if (n === "X") return MAP.X_LINKS.slice();
      for (const [a, b] of MAP.edges) {
        if (a === n) adj.push(b);
        if (b === n) adj.push(a);
      }
      if (MAP.X_LINKS.includes(n)) MAP.X_LINKS.forEach((m) => { if (m !== n) adj.push(m); });
      return adj;
    };
    adjOf(from).forEach((n) => push(n, null));
    while (q.length) {
      const n = q.shift();
      if (n === to) {
        let cur = n;
        while (parent[cur] !== null) cur = parent[cur];
        return cur;
      }
      adjOf(n).forEach((m) => push(m, parent[n] === null ? n : parent[n] ?? n));
    }
    return null;
  }

  // resolve pendings, specials, x2 leftovers for AI player
  function settle(engine, pid) {
    let guard = 0;
    while (guard++ < 30) {
      const s = engine.state;
      if (s.pending && s.pending.playerId === pid) { resolveOwnPendings(engine, pid); continue; }
      if (s.awaitingSpecial && s.awaitingSpecial.player === pid) { doSpecial(engine, pid, s.awaitingSpecial.special); continue; }
      break;
    }
  }

  function resolveOwnPendings(engine, pid) {
    const s = engine.state;
    const pd = s.pending;
    if (!pd || pd.playerId !== pid) return;
    const p = engine.player(pid);
    switch (pd.type) {
      case "placeCube": {
        const pref = cubePreference(engine, pid).filter((k) => pd.data.options.includes(k));
        engine.resolvePending(pid, { special: pref[0] || pd.data.options[0] });
        break;
      }
      case "relocateCube":
        engine.resolvePending(pid, {});
        break;
      case "chooseIdeas": {
        const wish = printPlans(engine, pid, false)[0];
        const g = wish && wish.type === "original" ? wish.genre : pickHandGenre(engine, pid) || "superheroes";
        engine.resolvePending(pid, { genres: [g, g] });
        break;
      }
      case "chooseOrderComic": {
        // put fans on current best comic to push rank
        const choices = pd.data.choices.map((i) => s.chart[i]);
        choices.sort((a, b) => b.fans - a.fans);
        engine.resolvePending(pid, { chartIdx: choices[0].idx });
        break;
      }
      case "discard": {
        const p = engine.player(pid);
        // discard lowest-utility cards
        const scored = p.hand.map((c) => {
          const cd = card(c);
          let v = cd.kind ? cd.value : 2.5;
          if (!cd.kind && p.ideas[cd.genre] >= 2) v += 2;
          return { c, v };
        }).sort((a, b) => a.v - b.v);
        const need = (p.hand.length + p.hyped.length) - HAND_LIMIT;
        engine.resolvePending(pid, { cards: scored.slice(0, Math.max(1, need)).map((x) => x.c) });
        break;
      }
      default:
        engine.resolvePending(pid, {});
    }
  }

  function cubePreference(engine, pid) {
    const persona = engine.player(pid).persona;
    switch (persona) {
      case "chart":   return ["ideasconv", "extraeditor", "marketing", "hype", "bettercolor", "reassign"];
      case "ripoff":  return ["extraeditor", "marketing", "ideasconv", "bettercolor", "hype", "reassign"];
      case "quality": return ["hype", "bettercolor", "reassign", "ideasconv", "marketing", "extraeditor"];
      case "money":   return ["marketing", "bettercolor", "extraeditor", "ideasconv", "hype", "reassign"];
      default:        return ["ideasconv", "hype", "bettercolor", "marketing", "extraeditor", "reassign"];
    }
  }

  function doSpecial(engine, pid, sp) {
    const s = engine.state, p = engine.player(pid);
    switch (sp) {
      case "reassign": engine.specialReassign(pid, bestReassign(engine, pid)); break;
      case "hype": {
        // hype a comic we cannot print yet
        const target = handComics(engine, pid).find((c) =>
          !p.hyped.some((h) => h.cardId === c) &&
          (p.ideas[card(c).genre] < 2 || !printPlans(engine, pid, true).some((pl) => pl.comic === c)));
        engine.specialHype(pid, target || null);
        break;
      }
      case "ideasconv": {
        const total = GENRES.reduce((sum, g) => sum + p.ideas[g], 0);
        const wish = printPlans(engine, pid, false)[0];
        const reserved = wish && wish.type === "original" ? 2 : 0;
        const spare = Math.max(0, total - reserved);
        const conversions = [];
        if (spare > 0) {
          const mine = s.chart.filter((c) => c.owner === pid && c.fans >= 1).sort((a, b) => b.fans - a.fans);
          const genresAvail = GENRES.filter((g) => p.ideas[g] > 0)
            .sort((a, b) => (wish && wish.genre === a ? 1 : 0) - (wish && wish.genre === b ? 1 : 0)); // spend non-wish first
          let gi = 0;
          const pool = [];
          for (const g of genresAvail) for (let k = 0; k < p.ideas[g]; k++) pool.push(g);
          for (let i = 0; i < Math.min(3, spare, mine.length); i++)
            conversions.push({ genre: pool[i], chartIdx: mine[i].idx });
        }
        engine.specialIdeasConv(pid, conversions);
        break;
      }
      case "bettercolor": engine.specialBetterColor(pid, true); break;
      case "marketing": {
        const affordable = MARKETING.filter((t) => p.money - t.cost >= 3).pop();
        if (affordable) {
          const mine = s.chart.filter((c) => c.owner === pid && c.fans >= 1).sort((a, b) => b.fans - a.fans);
          if (mine.length) {
            engine.specialMarketing(pid, affordable.cost, [{ chartIdx: mine[0].idx, fans: affordable.fans }]);
            break;
          }
        }
        engine.specialMarketing(pid, 0, []);
        break;
      }
      case "extraeditor": engine.specialExtraEditor(pid, true); break;
      default: engine.skipSpecial(pid);
    }
  }

  function bestReassign(engine, pid) {
    const s = engine.state, p = engine.player(pid);
    // find one upgrade: put a specialized/higher creative from hand onto a comic
    for (const comic of s.chart.filter((c) => c.owner === pid)) {
      for (const kind of ["writer", "artist"]) {
        const cur = comic.creatives[kind];
        const curSpec = cur.genre === comic.genre;
        for (const h of handOf(engine, pid, kind)) {
          const hc = card(h);
          const gain = (hc.genre === comic.genre && !curSpec ? 3 : 0) + (hc.value - cur.curValue);
          const cost = Math.max(0, hc.value - cur.curValue);
          if (gain >= 3 && p.money >= cost) return [{ chartIdx: comic.idx, kind, withCardId: h }];
        }
      }
    }
    return [];
  }

  // increase-value phase
  function doIncrease(engine, pid) {
    const p = engine.player(pid);
    let guard = 0;
    while (guard++ < 6) {
      const opts = engine.increaseOptions(pid);
      if (!opts.length) break;
      // upgrade when it unlocks an order or cheap learn
      const s = engine.state;
      const good = opts.find((o) => {
        const comic = s.chart[o.chartIdx];
        const unlocksOrder = p.orders.some((oid) => {
          const or = s.mapSlots[oid];
          return !or.fulfilled && or.genre === comic.genre && comic.value + 1 >= or.minVal && comic.value < or.minVal;
        });
        return (o.mode === "learn" && p.money >= o.cost + 2) || unlocksOrder && p.money >= o.cost + 1;
      });
      if (!good) break;
      engine.applyIncrease(pid, good);
      if (engine.state.pending) resolveOwnPendings(engine, pid);
    }
    engine.finishIncrease(pid);
  }

  // starting picks (round 1)
  function doStartingPicks(engine, pid) {
    const s = engine.state, p = engine.player(pid);
    const picks = p.startingPicks;
    if (!picks) return;
    // choose comic matching a starting creative genre if possible
    const myGenres = p.hand.map((c) => card(c).genre);
    let comicId = s.decks.comics.slice().reverse().find((c) => myGenres.includes(card(c).genre));
    if (!comicId) comicId = s.decks.comics[s.decks.comics.length - 1];
    const g = card(comicId).genre;
    const ideas = [];
    for (let i = 0; i < picks.ideas; i++) ideas.push(i < 2 ? g : myGenres[0]);
    engine.resolveStartingPicks(pid, comicId, ideas);
  }

  return { takeTurn, doIncrease, doStartingPicks, settle, resolveOwnPendings, chooseAction };
})();

if (typeof module !== "undefined") module.exports = { AI };
