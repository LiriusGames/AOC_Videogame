// ============================================================================
// AGE OF COMICS — animated 2.5D Manhattan: extruded blocks, kiosk corners,
// floating order signs, walking agents, cabs, ticket teleports, hover info.
// ============================================================================
"use strict";

const MapView = (() => {
  const NODE_X = [100, 220, 340, 460];
  const NODE_Y = [66, 160, 254, 348, 442, 536];
  const XPOS = { x: 280, y: 301 };
  const CW = 560, CH = 600;
  const STREET = 16;

  let canvas = null, ctx = null, images = {}, interactive = false, onAction = null;
  let base = null;            // pre-rendered city
  let raf = 0, hover = null, mouse = null;
  const anims = {};           // pid -> [{from:{x,y}, to:{x,y}, t0, dur, mode}]
  const lastPos = {};         // pid -> {x,y} resting position
  const effects = [];         // {x,y,t0,kind}

  // ------------------------------------------------------------- geometry
  function nodePos(id) {
    if (id === "X") return XPOS;
    const n = MAP.nodes[id];
    return { x: NODE_X[n.c], y: NODE_Y[n.r] };
  }
  function slotPos(slot) {
    if (slot.nodes.length === 2) {
      const a = nodePos(slot.nodes[0]), b = nodePos(slot.nodes[1]);
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    const a = nodePos(slot.nodes[0]);
    const geo = slot.geoId !== undefined ? slot.geoId : slot.id;
    if (geo === 38) return { x: a.x, y: a.y - 52 };
    if (geo === 39) return { x: a.x, y: a.y + 52 };
    if (geo === 40) return { x: a.x - 62, y: a.y };
    return { x: a.x + 62, y: a.y };
  }
  function adjOf(n) {
    const adj = [];
    if (n === "X") return MAP.X_LINKS.slice();
    for (const [a, b] of MAP.edges) {
      if (a === n) adj.push(b);
      if (b === n) adj.push(a);
    }
    if (MAP.X_LINKS.includes(n)) MAP.X_LINKS.forEach((m) => { if (m !== n) adj.push(m); });
    return adj;
  }
  function pathTo(from, to) {
    // BFS shortest path, returns node list excluding `from`
    if (from === to) return [];
    const prev = {}, q = [from];
    const seen = { [from]: true };
    while (q.length) {
      const n = q.shift();
      for (const m of adjOf(n)) {
        if (seen[m]) continue;
        seen[m] = true;
        prev[m] = n;
        if (m === to) {
          const path = [to];
          let cur = to;
          while (prev[cur] !== from) { cur = prev[cur]; path.unshift(cur); }
          return path;
        }
        q.push(m);
      }
    }
    return null;
  }

  // ------------------------------------------------------------- sprites
  function loadImages(cb) {
    const names = ["tokens", "cards"];
    let left = names.length;
    for (const n of names) {
      if (images[n] && images[n].complete) { if (--left === 0) cb(); continue; }
      const img = new Image();
      img.onload = () => { if (--left === 0) cb(); };
      img.src = SHEETS[n].file;
      images[n] = img;
    }
  }
  function drawSprite(name, dx, dy, scale = 1) {
    const a = ATLAS[name];
    const img = images[a.sheet];
    if (!img || !img.complete) return;
    ctx.drawImage(img, a.x, a.y, a.w, a.h,
      Math.round(dx - a.w * scale / 2), Math.round(dy - a.h * scale / 2), a.w * scale, a.h * scale);
  }

  // -------------------------------------------------------- static city
  function rand(seed) { let s = seed; return () => (s = (s * 16807 + 11) % 2147483647) / 2147483647; }

  function buildCity() {
    base = document.createElement("canvas");
    base.width = CW; base.height = CH;
    const b = base.getContext("2d");
    b.imageSmoothingEnabled = false;
    // water
    b.fillStyle = "#1f4258";
    b.fillRect(0, 0, CW, CH);
    // island silhouette
    b.fillStyle = "#9d9179";
    b.beginPath();
    b.moveTo(52, 26); b.lineTo(510, 18); b.lineTo(532, 300); b.lineTo(498, 582);
    b.lineTo(72, 574); b.lineTo(32, 300); b.closePath();
    b.fill();
    // streets (under the blocks' shadows)
    b.strokeStyle = "#6e675a";
    b.lineWidth = STREET;
    for (const [a2, c] of MAP.edges) {
      const pa = nodePos(a2), pb = nodePos(c);
      b.beginPath(); b.moveTo(pa.x, pa.y); b.lineTo(pb.x, pb.y); b.stroke();
    }
    for (const n of MAP.X_LINKS) {
      const p = nodePos(n);
      b.beginPath(); b.moveTo(p.x, p.y); b.lineTo(XPOS.x, XPOS.y); b.stroke();
    }
    // center dashes
    b.strokeStyle = "#8b8271";
    b.lineWidth = 2;
    b.setLineDash([5, 7]);
    for (const [a2, c] of MAP.edges) {
      const pa = nodePos(a2), pb = nodePos(c);
      b.beginPath(); b.moveTo(pa.x, pa.y); b.lineTo(pb.x, pb.y); b.stroke();
    }
    b.setLineDash([]);
    // city blocks with extruded buildings (painter: top rows first)
    const rng = rand(1938);
    const xs = [40, ...NODE_X, 520], ys = [26, ...NODE_Y, 588];
    for (let r = 0; r < ys.length - 1; r++) {
      for (let c = 0; c < xs.length - 1; c++) {
        const x0 = xs[c] + STREET * 0.7, x1 = xs[c + 1] - STREET * 0.7;
        const y0 = ys[r] + STREET * 0.7, y1 = ys[r + 1] - STREET * 0.7;
        if (x1 - x0 < 18 || y1 - y0 < 16) continue;
        // central park: rows 0-1, col 1-2 → lawn
        if (r === 1 && (c === 2)) { park(b, x0, y0, x1, y1, rng); continue; }
        // X plaza: skip buildings dead-center
        if (Math.abs((x0 + x1) / 2 - XPOS.x) < 55 && Math.abs((y0 + y1) / 2 - XPOS.y) < 46) {
          plaza(b, x0, y0, x1, y1);
          continue;
        }
        blockBuildings(b, x0, y0, x1, y1, rng);
      }
    }
    // river sparkle base
    b.fillStyle = "#2a5470";
    for (let i = 0; i < 26; i++) {
      const y = 20 + ((i * 83) % 560);
      b.fillRect(i % 2 ? 4 : 12, y, 18, 3);
      b.fillRect(CW - (i % 2 ? 22 : 30), (y + 130) % 580, 18, 3);
    }
    b.font = "14px VT323";
    b.fillStyle = "#14344a";
    b.save();
    b.translate(14, 380); b.rotate(-Math.PI / 2); b.fillText("HUDSON RIVER", 0, 0);
    b.restore();
    b.save();
    b.translate(CW - 6, 250); b.rotate(Math.PI / 2); b.fillText("EAST RIVER", 0, 0);
    b.restore();
  }
  function blockBuildings(b, x0, y0, x1, y1, rng) {
    // sidewalk
    b.fillStyle = "#b3a88f";
    b.fillRect(x0, y0, x1 - x0, y1 - y0);
    const n = Math.max(1, Math.min(3, ((x1 - x0) / 26) | 0));
    const w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const bx = x0 + i * w + 2, bw = w - 4;
      const bh = 10 + rng() * 16;                        // extrusion height
      const gy = y1 - 4;                                 // ground line
      const tone = rng();
      const front = tone < 0.36 ? "#a5705a" : tone < 0.7 ? "#9b8f7a" : "#7e8894";
      const roof  = tone < 0.36 ? "#c08a70" : tone < 0.7 ? "#b8ab92" : "#98a2ae";
      // shadow
      b.fillStyle = "rgba(30,25,15,.25)";
      b.fillRect(bx + 2, gy - 2, bw, 5);
      // front face
      b.fillStyle = front;
      b.fillRect(bx, gy - bh, bw, bh);
      // roof
      b.fillStyle = roof;
      b.fillRect(bx, gy - bh - 5, bw, 6);
      b.fillStyle = "rgba(0,0,0,.28)";
      b.fillRect(bx, gy - bh, bw, 2);
      // windows
      b.fillStyle = rng() < 0.5 ? "#f2dfa0" : "#4b4335";
      for (let wy = gy - bh + 4; wy < gy - 4; wy += 6)
        for (let wx = bx + 3; wx < bx + bw - 3; wx += 6)
          if (rng() < 0.8) b.fillRect(wx, wy, 3, 3);
    }
  }
  function park(b, x0, y0, x1, y1, rng) {
    b.fillStyle = "#7d9c62";
    b.fillRect(x0, y0, x1 - x0, y1 - y0);
    b.fillStyle = "#94ad74";
    b.fillRect(x0 + 4, y0 + 4, x1 - x0 - 8, 3);
    for (let i = 0; i < 8; i++) {
      const tx = x0 + 6 + rng() * (x1 - x0 - 14), ty = y0 + 8 + rng() * (y1 - y0 - 16);
      b.fillStyle = "#3f5d33";
      b.fillRect(tx + 2, ty + 5, 3, 4);
      b.fillStyle = "#5d7f45";
      b.fillRect(tx, ty, 7, 6);
      b.fillStyle = "#6f9455";
      b.fillRect(tx + 1, ty + 1, 3, 2);
    }
    b.fillStyle = "#2e4a28";
    b.font = "12px VT323";
    b.fillText("THE PARK", x0 + 8, y1 - 6);
  }
  function plaza(b, x0, y0, x1, y1) {
    b.fillStyle = "#b3a88f";
    b.fillRect(x0, y0, x1 - x0, y1 - y0);
    b.fillStyle = "#c5bb9f";
    for (let y = y0 + 3; y < y1 - 3; y += 7)
      for (let x = x0 + 3 + (((y / 7) | 0) % 2) * 4; x < x1 - 4; x += 8)
        b.fillRect(x, y, 4, 3);
  }

  // ------------------------------------------------------------ animation
  function queueMove(pid, fromNode, toNode, mode) {
    const from = nodePos(fromNode), to = nodePos(toNode);
    anims[pid] = anims[pid] || [];
    anims[pid].push({ from, to, t0: 0, dur: mode === "ticket" ? 500 : mode === "cab" ? 420 : 520, mode });
    if (mode === "ticket") {
      effects.push({ x: from.x, y: from.y, t0: performance.now(), kind: "poof" });
    }
  }
  function agentDrawPos(pid, now) {
    const e = UI.engine;
    const p = e.player(pid);
    const q = anims[pid];
    if (q && q.length) {
      const a = q[0];
      if (!a.t0) a.t0 = now;
      const t = Math.min(1, (now - a.t0) / a.dur);
      if (t >= 1) {
        q.shift();
        lastPos[pid] = a.to;
        if (a.mode === "ticket") effects.push({ x: a.to.x, y: a.to.y, t0: now, kind: "poof" });
        return { ...a.to, mode: null, t: 0 };
      }
      if (a.mode === "ticket") {
        // vanish then reappear
        return t < 0.5 ? { ...a.from, mode: "fade", t: 1 - t * 2 } : { ...a.to, mode: "fade", t: (t - 0.5) * 2 };
      }
      return {
        x: a.from.x + (a.to.x - a.from.x) * t,
        y: a.from.y + (a.to.y - a.from.y) * t - (a.mode === "cab" ? 0 : Math.abs(Math.sin(t * Math.PI * 4)) * 3),
        mode: a.mode, t,
      };
    }
    const rest = nodePos(p.agentNode);
    lastPos[pid] = rest;
    return { ...rest, mode: null, t: 0 };
  }

  // ---------------------------------------------------------------- frame
  function frame(now) {
    if (!canvas || !canvas.isConnected) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    if (!UI.engine) return;
    const e = UI.engine, s = e.state;
    const ses = s.salesSession;
    ctx.clearRect(0, 0, CW, CH);
    ctx.drawImage(base, 0, 0);

    // animated water shimmer
    ctx.fillStyle = "rgba(255,255,255,.14)";
    const ph = (now / 700) % 8;
    for (let i = 0; i < 14; i++) {
      const y = ((i * 89 + ph * 11) % 560) + 20;
      ctx.fillRect(i % 2 ? 8 : 16, y, 12, 2);
      ctx.fillRect(CW - (i % 2 ? 26 : 34), (y + 200) % 570, 12, 2);
    }

    // X plaza marker
    ctx.fillStyle = "#efe6d0";
    ctx.beginPath(); ctx.arc(XPOS.x, XPOS.y, 12, 0, 7); ctx.fill();
    ctx.strokeStyle = "#221d16"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "#221d16"; ctx.font = "bold 16px VT323"; ctx.textAlign = "center";
    ctx.fillText("X", XPOS.x, XPOS.y + 5);
    ctx.textAlign = "left";

    // node kiosks
    const myPid = ses ? ses.player : UI.humanId;
    const adj = ses ? e.agentAdjacent(myPid) : [];
    for (const n of MAP.nodes) {
      const p = nodePos(n.id);
      kiosk(p.x, p.y, now + n.id * 300);
      if (interactive && ses && adj.includes(n.id)) {
        ctx.strokeStyle = ses.freeWalk ? "#7ab648" : "#f5c86e";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y + 2, 15 + Math.sin(now / 250) * 1.5, 0, 7); ctx.stroke();
      }
      if (interactive && hover && hover.node === n.id) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y + 2, 18, 0, 7); ctx.stroke();
      }
    }

    // order signs (bobbing on poles); collected ones become owner pennants
    for (const t of s.mapSlots) {
      const pos = slotPos(t);
      if (t.takenBy !== null) {
        // collected: a little flag in the owner's color marks who got it
        const col = PUBLISHERS[e.player(t.takenBy).color].color;
        ctx.fillStyle = "rgba(20,15,5,.25)";
        ctx.beginPath(); ctx.ellipse(pos.x, pos.y + 8, 6, 2.4, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#4a4132";
        ctx.fillRect(pos.x - 1, pos.y - 12, 2, 20);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(pos.x + 1, pos.y - 12); ctx.lineTo(pos.x + 15, pos.y - 8); ctx.lineTo(pos.x + 1, pos.y - 4);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#221d16"; ctx.lineWidth = 1.5; ctx.stroke();
        if (t.fulfilled) {
          ctx.fillStyle = "#fff"; ctx.font = "bold 11px VT323"; ctx.textAlign = "center";
          ctx.fillText("✓", pos.x + 7, pos.y - 5);
          ctx.textAlign = "left";
        }
        continue;
      }
      const bob = Math.sin(now / 600 + t.id) * 1.6;
      const y = pos.y + bob;
      const gi = GENRE_INFO[t.genre];
      // shadow + pole
      ctx.fillStyle = "rgba(20,15,5,.3)";
      ctx.beginPath(); ctx.ellipse(pos.x, pos.y + 18, 10, 3.4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#4a4132";
      ctx.fillRect(pos.x - 1, y, 2, 19);
      // board (bigger — the whole point is reading it at a glance)
      ctx.fillStyle = "#221d16";
      ctx.fillRect(pos.x - 20, y - 38, 40, 40);
      if (!t.faceUp) {
        ctx.fillStyle = "#efe6d0";
        ctx.fillRect(pos.x - 18, y - 36, 36, 36);
        drawSprite(gi.icon, pos.x, y - 18, 0.95);
      } else {
        ctx.fillStyle = gi.color;
        ctx.fillRect(pos.x - 18, y - 36, 36, 36);
        ctx.fillStyle = "rgba(0,0,0,.25)";
        ctx.fillRect(pos.x - 18, y - 19, 36, 1);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.font = "bold 16px VT323";
        ctx.fillText("v" + t.minVal + "+", pos.x, y - 23);
        ctx.font = "bold 18px VT323";
        ctx.fillText("+" + t.fans + "★", pos.x, y - 5);
        ctx.textAlign = "left";
      }
      if (interactive && ses && t.nodes.includes(e.player(myPid).agentNode)) {
        ctx.strokeStyle = "#f5c86e";
        ctx.lineWidth = 3;
        ctx.strokeRect(pos.x - 22, y - 40, 44, 44);
      }
      if (interactive && hover && hover.slot && hover.slot.id === t.id) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.strokeRect(pos.x - 24, y - 42, 48, 48);
      }
    }

    // agents
    for (const pl of s.players) {
      const pos = agentDrawPos(pl.id, now);
      const idle = Math.sin(now / 420 + pl.id * 2) * 1.2;
      ctx.globalAlpha = pos.mode === "fade" ? Math.max(0.05, pos.t) : 1;
      ctx.fillStyle = "rgba(20,15,5,.35)";
      ctx.beginPath(); ctx.ellipse(pos.x + pl.id * 5 - 7, pos.y + 8, 8, 3, 0, 0, 7); ctx.fill();
      if (pos.mode === "cab") {
        cab(pos.x + pl.id * 5 - 7, pos.y - 4, now);
      } else {
        drawSprite("meeple_" + pl.color, pos.x + pl.id * 5 - 7, pos.y - 6 + (pos.mode ? 0 : idle));
      }
      ctx.globalAlpha = 1;
    }

    // effects
    for (let i = effects.length - 1; i >= 0; i--) {
      const fx = effects[i];
      const t = (now - fx.t0) / 450;
      if (t >= 1) { effects.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(245,200,110,${1 - t})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, 4 + t * 22, 0, 7); ctx.stroke();
    }

    // hover tooltip
    if (interactive && hover && mouse) tooltip(now);
  }

  function kiosk(x, y, tphase) {
    // little newsstand: box + striped awning
    ctx.fillStyle = "rgba(20,15,5,.3)";
    ctx.beginPath(); ctx.ellipse(x, y + 9, 11, 3.4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#3e5748";
    ctx.fillRect(x - 9, y - 6, 18, 14);
    ctx.fillStyle = "#2c3f34";
    ctx.fillRect(x - 9, y - 6, 18, 3);
    ctx.fillStyle = "#d8ccb2";                     // magazines
    ctx.fillRect(x - 6, y - 1, 12, 6);
    ctx.fillStyle = ["#d94f43", "#3f7fbf", "#e07f2e"][((tphase / 900) | 0) % 3];
    ctx.fillRect(x - 6, y - 1, 4, 6);
    // awning
    ctx.fillStyle = "#b8433a";
    ctx.fillRect(x - 11, y - 10, 22, 5);
    ctx.fillStyle = "#e8e0ce";
    for (let i = 0; i < 5; i++) ctx.fillRect(x - 11 + i * 5 + 2, y - 10, 2, 5);
  }
  function cab(x, y, now) {
    ctx.fillStyle = "rgba(0,0,0,.4)";
    ctx.fillRect(x - 9, y + 4, 18, 3);
    ctx.fillStyle = "#e8b93c";
    ctx.fillRect(x - 9, y - 3, 18, 8);
    ctx.fillStyle = "#f2d06b";
    ctx.fillRect(x - 5, y - 7, 10, 5);
    ctx.fillStyle = "#333";
    ctx.fillRect(x - 4, y - 6, 8, 3);
    ctx.fillStyle = "#222";
    ctx.beginPath(); ctx.arc(x - 5, y + 5, 2.4, 0, 7); ctx.arc(x + 5, y + 5, 2.4, 0, 7); ctx.fill();
    ctx.fillStyle = now % 500 < 250 ? "#fff" : "#f5c86e";
    ctx.fillRect(x - 2, y - 9, 4, 2);
  }

  function tooltip(now) {
    const e = UI.engine, s = e.state, ses = s.salesSession;
    if (!ses) return;
    const p = e.player(ses.player);
    let lines = [];
    if (hover.node !== undefined && hover.node !== "X") {
      if (hover.node === p.agentNode) lines = ["Your agent is here"];
      else {
        const path = pathTo(p.agentNode, hover.node);
        if (path) {
          const steps = path.length;
          const cost = Math.max(0, steps - (ses.freeWalk ? 1 : 0)) * 2;
          lines = [steps === 1 ? (ses.freeWalk ? "WALK — free" : "CAB — $2") : `CAB ${steps} blocks — $${cost}`];
          if (p.tickets > 0) lines.push("(or use a ticket)");
          if (cost > p.money) lines = [`Too far — need $${cost}`, p.tickets > 0 ? "use a ticket!" : "no tickets left"];
        }
      }
    } else if (hover.slot) {
      const t = hover.slot;
      const here = t.nodes.includes(p.agentNode);
      if (t.faceUp) {
        lines = [`${GENRE_INFO[t.genre].name} order`, `needs value ${t.minVal}+ · pays +${t.fans} fan${t.fans > 1 ? "s" : ""}`];
        lines.push(here ? (ses.collectsLeft > 0 ? "click to COLLECT" : "no collections left") : "move your agent here");
      } else {
        lines = [`Face-down ${GENRE_INFO[t.genre].name} order`];
        lines.push(here ? (ses.flipsLeft > 0 ? "click to FLIP" : ses.collectsLeft > 0 ? "click to collect blind" : "nothing left") : "move your agent here");
      }
    } else return;
    ctx.font = "15px VT323";
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12;
    const x = Math.min(CW - w - 4, mouse.x + 14), y = Math.max(20, mouse.y - 12);
    ctx.fillStyle = "rgba(24,20,14,.92)";
    ctx.fillRect(x, y - 14, w, lines.length * 15 + 8);
    ctx.strokeStyle = "#f5c86e";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y - 14, w, lines.length * 15 + 8);
    ctx.fillStyle = "#efe6d0";
    lines.forEach((l, i) => ctx.fillText(l, x + 6, y + i * 15));
  }

  // ------------------------------------------------------------------ input
  function hit(ev) {
    const r = canvas.getBoundingClientRect();
    const x = (ev.clientX - r.left) * (CW / r.width);
    const y = (ev.clientY - r.top) * (CH / r.height);
    const s = UI.engine.state;
    for (const t of s.mapSlots) {
      if (t.takenBy !== null) continue;
      const pos = slotPos(t);
      if (Math.abs(x - pos.x) <= 22 && Math.abs(y - (pos.y - 18)) <= 26) return { slot: t, x, y };
    }
    for (const n of MAP.nodes) {
      const pos = nodePos(n.id);
      if ((x - pos.x) ** 2 + (y - pos.y) ** 2 <= 19 ** 2) return { node: n.id, x, y };
    }
    if ((x - XPOS.x) ** 2 + (y - XPOS.y) ** 2 <= 16 ** 2) return { node: "X", x, y };
    return { x, y };
  }

  function attach(cv, isInteractive, actionCb) {
    canvas = cv;
    ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    interactive = isInteractive;
    onAction = actionCb;
    cv.width = CW; cv.height = CH;
    if (!base) buildCity();
    cv.onclick = (ev) => {
      const h = hit(ev);
      if ((h.node !== undefined || h.slot) && onAction) onAction(h);
    };
    cv.onmousemove = (ev) => {
      const h = hit(ev);
      mouse = { x: h.x, y: h.y };
      hover = h.node !== undefined || h.slot ? h : null;
      cv.style.cursor = hover ? "pointer" : "default";
    };
    cv.onmouseleave = () => { hover = null; mouse = null; };
    loadImages(() => {});
    if (!raf) raf = requestAnimationFrame(frame);
  }

  return { attach, nodePos, slotPos, pathTo, queueMove, CW, CH };
})();
