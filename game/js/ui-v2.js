// ============================================================================
// AGE OF COMICS — UI V2 art-direction lab
// Compact action comics + one focused action spread. The engine, scenes,
// save format, AI, atlas and stable V1 interface remain shared and untouched.
// Activate with ?ui=v2.
// ============================================================================
"use strict";

const UIV2 = (() => {
  const ART = {
    hire: "assets/New assets/Hire Handshake.png",
    develop: "assets/New assets/Develop drawing man.png",
    ideas: "assets/New assets/Ideas Thinkin mang.png",
    print: "assets/New assets/Print press.png",
    royalties: "assets/New assets/Royalties lady counting.png",
    sales: "assets/New assets/Sales.png",
  };
  const cache = new Map();
  let selected = "print";

  function active() {
    return document.documentElement.classList.contains("ui-v2");
  }

  function availability(action) {
    const e = UI.engine, s = e.state, p = P(UI.humanId);
    const myTurn = s.phase === "actions" && e.currentPlayerId() === UI.humanId &&
      !UI.busy && !s.pending && !s.awaitingSpecial;
    let reason = "";
    if (!myTurn) reason = "waiting for your turn";
    else if (p.editorsLeft <= 0) reason = "no editors left";
    else if (e.nextSlot(action) < 0) reason = "all spaces taken";
    else if (!e.canAct(UI.humanId, action)) reason = "requirements not met";
    return { ok: !reason, reason };
  }

  function alphaBounds(img) {
    const off = document.createElement("canvas");
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const cx = off.getContext("2d", { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const px = cx.getImageData(0, 0, off.width, off.height).data;
    let x0 = off.width, y0 = off.height, x1 = -1, y1 = -1;
    for (let y = 0; y < off.height; y++) {
      for (let x = 0; x < off.width; x++) {
        if (px[(y * off.width + x) * 4 + 3] < 8) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    return x1 < 0 ? { x: 0, y: 0, w: off.width, h: off.height } :
      { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  function loadArt(action, done) {
    const src = ART[action];
    if (!src) return done(null);
    const known = cache.get(action);
    if (known && known.ready) return done(known);
    if (known) { known.wait.push(done); return; }
    const rec = { img: new Image(), bounds: null, ready: false, wait: [done] };
    cache.set(action, rec);
    rec.img.onload = () => {
      rec.bounds = alphaBounds(rec.img);
      rec.ready = true;
      rec.wait.splice(0).forEach((fn) => fn(rec));
    };
    rec.img.onerror = () => rec.wait.splice(0).forEach((fn) => fn(null));
    rec.img.src = src;
  }

  function quantize(ctx, w, h) {
    const im = ctx.getImageData(0, 0, w, h), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      d[i] = Math.min(255, Math.round(d[i] / 28) * 28);
      d[i + 1] = Math.min(255, Math.round(d[i + 1] / 28) * 28);
      d[i + 2] = Math.min(255, Math.round(d[i + 2] / 28) * 28);
      d[i + 3] = d[i + 3] < 96 ? 0 : d[i + 3] < 210 ? 190 : 255;
    }
    ctx.putImageData(im, 0, 0);
  }

  function attachArt(canvas, action, large = false) {
    canvas.width = large ? 220 : 84;
    canvas.height = large ? 150 : 54;
    canvas.setAttribute("aria-hidden", "true");
    loadArt(action, (rec) => {
      // A cached image can resolve synchronously while this freshly rebuilt
      // canvas is still detached. Canvas drawing does not require connection,
      // so paint it now and let the caller attach the finished bitmap.
      if (!rec) return;
      const ctx = canvas.getContext("2d");
      const b = rec.bounds, pad = large ? 9 : 3;
      const sc = Math.min((canvas.width - pad * 2) / b.w, (canvas.height - pad * 2) / b.h);
      const dw = Math.round(b.w * sc), dh = Math.round(b.h * sc);
      const dx = Math.round((canvas.width - dw) / 2), dy = Math.round(canvas.height - dh - pad);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(rec.img, b.x, b.y, b.w, b.h, dx, dy, dw, dh);
      quantize(ctx, canvas.width, canvas.height);
    });
  }

  function slotPips(action, cls = "") {
    const e = UI.engine, s = e.state;
    const row = el("div", "v2-slot-row " + cls);
    const n = e.slotsAvailable(action);
    for (let i = 0; i < n; i++) {
      const pip = el("span", "v2-slot-pip");
      const occ = s.actionSpaces[action][i];
      pip.setAttribute("role", "img");
      if (occ !== undefined) {
        pip.setAttribute("aria-label", `${P(occ).pubName} editor`);
        pip.appendChild(spr("meeple_" + P(occ).color, 0.72));
      } else pip.setAttribute("aria-label", "open editor space");
      row.appendChild(pip);
    }
    return row;
  }

  function renderLocations() {
    const wrap = document.getElementById("locations");
    const focused = wrap.contains(document.activeElement) ? document.activeElement.dataset.action : null;
    wrap.innerHTML = "";
    wrap.setAttribute("role", "navigation");
    wrap.setAttribute("aria-label", "Action comics");

    for (const action of ACTIONS) {
      const info = ACTION_INFO[action], avail = availability(action);
      const card = el("button", "loc v2-action-card" +
        (selected === action ? " selected" : "") + (avail.ok ? "" : " is-blocked"));
      card.type = "button";
      card.dataset.action = action;
      card.style.setProperty("--ac", ACTION_HUE[action]);
      card.setAttribute("aria-pressed", String(selected === action));
      card.setAttribute("aria-label", `${info.name}: ${info.verb}. ${benefitText(action)}` +
        (avail.reason ? `. Currently ${avail.reason}.` : ". Available."));
      const art = document.createElement("canvas");
      art.className = "v2-action-art";
      attachArt(art, action);
      card.appendChild(art);
      const copy = el("span", "v2-action-copy");
      copy.appendChild(el("b", "v2-action-name", info.verb.replace("!", "")));
      copy.appendChild(el("span", "v2-action-benefit", benefitText(action)));
      copy.appendChild(slotPips(action, "compact"));
      card.appendChild(copy);
      const sp = UI.engine.cubeSpecialFor(UI.humanId, action);
      if (sp) card.appendChild(el("span", "v2-rail-special", "&#9733;"));
      card.onclick = () => {
        SFX.play("paper");
        selected = action;
        renderLocations();
        const next = wrap.querySelector(`[data-action="${action}"]`);
        if (next) next.focus();
        announce(`${info.name} action comic selected.`);
      };
      wrap.appendChild(card);
    }
    renderStage();
    if (focused) {
      const again = wrap.querySelector(`[data-action="${focused}"]`);
      if (again) again.focus();
    }
  }

  function renderStage() {
    const stage = document.getElementById("action-stage");
    const action = selected, info = ACTION_INFO[action], avail = availability(action);
    stage.innerHTML = "";
    stage.dataset.action = action;
    stage.style.setProperty("--ac", ACTION_HUE[action]);

    const book = el("div", "v2-action-book");
    const visual = el("div", "v2-book-page v2-book-visual");
    visual.appendChild(el("div", "v2-book-kicker", "CITY ACTION FILE"));
    visual.appendChild(el("h2", "", info.name.toUpperCase()));
    const art = document.createElement("canvas");
    art.className = "v2-stage-art";
    attachArt(art, action, true);
    visual.appendChild(art);
    visual.appendChild(el("p", "v2-book-caption", info.desc));
    book.appendChild(visual);

    const detail = el("div", "v2-book-page v2-book-detail");
    detail.appendChild(el("div", "v2-book-kicker", "CURRENT OPPORTUNITY"));
    detail.appendChild(el("h2", "", info.verb.replace("!", "")));
    detail.appendChild(el("div", "v2-rule", `<span>REWARD</span><b>${benefitText(action)}</b>`));
    const spaces = el("div", "v2-stage-block");
    spaces.appendChild(el("h3", "", "EDITOR SPACES"));
    spaces.appendChild(slotPips(action));
    detail.appendChild(spaces);
    const offer = offerStrip(action);
    offer.classList.add("v2-stage-offer");
    offer.tabIndex = 0;
    offer.setAttribute("aria-label", `${info.name} current offer`);
    detail.appendChild(offer);
    const sp = UI.engine.cubeSpecialFor(UI.humanId, action);
    if (sp) detail.appendChild(el("div", "v2-stage-special",
      `&#9733; YOUR CUBE: <b>${SPECIALS[sp].name}</b><br><span>${SPECIALS[sp].desc}</span>`));
    const status = el("div", "v2-action-status " + (avail.ok ? "ready" : "blocked"),
      avail.ok ? "READY FOR YOUR EDITOR" : `UNAVAILABLE — ${avail.reason.toUpperCase()}`);
    detail.appendChild(status);
    const go = el("button", "btn btn-go v2-take-action", `OPEN ${info.name.toUpperCase()} &#9654;`);
    go.setAttribute("aria-disabled", String(!avail.ok));
    go.title = avail.ok ? `Take the ${info.name} action` : `Unavailable: ${avail.reason}`;
    go.onclick = () => {
      if (!avail.ok) { SFX.play("error"); toast(`Unavailable: ${avail.reason}.`); return; }
      SFX.play("click");
      Scenes.open(action);
    };
    detail.appendChild(go);
    book.appendChild(detail);
    stage.appendChild(book);
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
  }

  return { active, renderLocations, afterRender };
})();
