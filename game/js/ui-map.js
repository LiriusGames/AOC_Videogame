// ============================================================================
// AGE OF COMICS — animated Mode-7 Manhattan: the city recedes to a horizon
// skyline, extruded blocks with 1938 rooftops, ambient cabs and an elevated
// train, kiosk corners, floating order signs, walking agents, ticket
// teleports, hover info. The perspective is permanent (the flat view is gone).
// ============================================================================
"use strict";

const MapView = (() => {
  // the map lies on its side (videogame framing, not the punchboard's):
  // numbers 1-6 run west→east, letters A-D run north→south. Node ids,
  // adjacency and slot ids are untouched — this is presentation only.
  const RX = [90, 234, 378, 522, 666, 810];   // by grid row (1..6)
  const RY = [76, 210, 344, 478];             // by grid col (A..D)
  const XPOS = { x: 450, y: 277 };
  const CW = 900, CH = 560;
  const STREET = 16;
  const HORIZON = 54;                          // sky band above the city
  // the flat painting is wider than the view: the perspective squeeze pulls
  // the far rows inward, and the margins must hold water + the far shores
  // (Hoboken west, Greenpoint east) instead of blank canvas
  const PAD = 140, BW = CW + 2 * PAD;

  let canvas = null, ctx = null, images = {}, interactive = false, onAction = null;
  let base = null;            // pre-rendered city (flat, working space)
  let baseTilt = null;        // the same city, scanline-projected + sky baked
  let raf = 0, hover = null, mouse = null;
  let kbFocus = null;         // keyboard highlight: {node} or {slotId}
  const TILT_Q = 0.38, TILT_S0 = 0.8, TILT_S1 = 1.04;
  const tiltScale = (t) => TILT_S0 + (TILT_S1 - TILT_S0) * t;
  const tiltY = (t) => HORIZON + (CH - HORIZON) * ((1 - TILT_Q) * t + TILT_Q * t * t);
  // view-projection for everything dynamic (markers, agents, rings, labels)
  function vp(p) {
    const t = p.y / CH;
    return { ...p, x: CW / 2 + (p.x - CW / 2) * tiltScale(t), y: tiltY(t) };
  }
  function buildTiltBase() {
    baseTilt = document.createElement("canvas");
    baseTilt.width = CW; baseTilt.height = CH;
    const bt = baseTilt.getContext("2d");
    bt.imageSmoothingEnabled = false;
    sky(bt);
    // water backstop under the whole city area (any pixel the projection
    // misses must read as river, never as bare canvas)
    const wg = bt.createLinearGradient(0, HORIZON, 0, CH);
    wg.addColorStop(0, "#1b3a4e");
    wg.addColorStop(0.65, "#1f4258");
    wg.addColorStop(1, "#265069");
    bt.fillStyle = wg;
    bt.fillRect(0, HORIZON, CW, CH - HORIZON);
    // per-scanline horizontal squeeze of the WIDE painting: far rows narrow
    // (their margins bring the far shores into view), near rows overflow
    const iq = 1 - TILT_Q;
    for (let dy = HORIZON; dy < CH; dy++) {
      const tp = (dy - HORIZON) / (CH - HORIZON);
      const t = (-iq + Math.sqrt(iq * iq + 4 * TILT_Q * tp)) / (2 * TILT_Q);
      const w = BW * tiltScale(t);
      bt.drawImage(base, 0, Math.min(CH - 1, t * CH), BW, 1, CW / 2 - w / 2, dy, w, 1);
    }
    // aerial perspective: the far half of the island sits in light haze
    const haze = bt.createLinearGradient(0, HORIZON, 0, CH * 0.55);
    haze.addColorStop(0, "rgba(186,206,220,.26)");
    haze.addColorStop(1, "rgba(186,206,220,0)");
    bt.fillStyle = haze;
    bt.fillRect(0, HORIZON, CW, CH * 0.55 - HORIZON);
    // gentle vignette so the near corners don't glare
    const vig = bt.createLinearGradient(0, CH - 60, 0, CH);
    vig.addColorStop(0, "rgba(10,14,20,0)");
    vig.addColorStop(1, "rgba(10,14,20,.18)");
    bt.fillStyle = vig;
    bt.fillRect(0, CH - 60, CW, 60);
  }
  function sky(bt) {
    // a warm 1938 afternoon: banded pixel sky down to a hazy skyline
    const bands = ["#5f8cad", "#6f9cbd", "#84aec9", "#9dc0d6", "#c3d3d2", "#e8d9b0"];
    const bh = HORIZON / bands.length;
    bands.forEach((c, i) => { bt.fillStyle = c; bt.fillRect(0, i * bh, CW, bh + 1); });
    // far skyline: midtown in two haze layers (drawn from a fixed seed)
    const rng = rand(1907);
    for (const [col, yb, hmax] of [["rgba(126,152,175,.75)", HORIZON, 22], ["rgba(84,112,138,.9)", HORIZON, 30]]) {
      bt.fillStyle = col;
      let x = -4;
      while (x < CW) {
        const w = 14 + rng() * 26, h = 6 + rng() * hmax;
        bt.fillRect(x, yb - h, w, h);
        if (rng() < 0.22) bt.fillRect(x + w / 2 - 1.5, yb - h - 5, 3, 5); // rooftop mast
        x += w + 2 + rng() * 10;
      }
    }
    // the two spires everyone looks for
    bt.fillStyle = "rgba(70,98,126,.95)";
    bt.fillRect(212, HORIZON - 40, 16, 40);   // Empire State: setbacks + mast
    bt.fillRect(215, HORIZON - 46, 10, 8);
    bt.fillRect(219, HORIZON - 54, 2, 9);
    bt.fillRect(624, HORIZON - 34, 14, 34);   // Chrysler: crown + needle
    bt.fillRect(627, HORIZON - 40, 8, 7);
    bt.fillRect(630, HORIZON - 47, 2, 8);
  }
  const anims = {};           // pid -> [{from:{x,y}, to:{x,y}, t0, dur, mode}]
  const lastPos = {};         // pid -> {x,y} resting position
  const effects = [];         // {x,y,t0,kind}
  const seenFace = {};        // slot id -> faceUp last frame (flip-pop trigger)
  const stacks = [];          // chimneys/tanks that smoke (flat coords)
  let marquee = null;         // Times Square neon (flat coords)

  // ------------------------------------------------------------- geometry
  function nodePos(id) {
    if (id === "X") return XPOS;
    const n = MAP.nodes[id];
    return { x: RX[n.r], y: RY[n.c] };
  }
  const viewPos = (id) => vp(nodePos(id)); // exported: screen-space position
  function slotPos(slot) {
    // markers are small enough to sit honestly at mid-street
    if (slot.nodes.length === 2) {
      const a = nodePos(slot.nodes[0]), b = nodePos(slot.nodes[1]);
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    const a = nodePos(slot.nodes[0]);
    const geo = slot.geoId !== undefined ? slot.geoId : slot.id;
    if (geo === 38) return { x: a.x - 44, y: a.y };  // past the western end
    if (geo === 39) return { x: a.x + 44, y: a.y };  // past the eastern end
    if (geo === 40) return { x: a.x, y: a.y - 46 };  // north bank
    return { x: a.x, y: a.y + 46 };                  // south bank
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
    const names = ["tokens", "cards", "staff"];
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
    stacks.length = 0;
    base = document.createElement("canvas");
    base.width = BW; base.height = CH;
    const b = base.getContext("2d");
    b.imageSmoothingEnabled = false;
    // everything below draws in flat island coordinates; the pad holds the
    // rivers' far banks on both sides
    b.translate(PAD, 0);
    // water: deep uptown, lighter toward the harbor
    const water = b.createLinearGradient(0, 0, 0, CH);
    water.addColorStop(0, "#1b3a4e");
    water.addColorStop(0.65, "#1f4258");
    water.addColorStop(1, "#265069");
    b.fillStyle = water;
    b.fillRect(-PAD, 0, BW, CH);
    farShores(b);
    // island silhouette: Manhattan on its side, filling the frame — the NORTH
    // shore is a straight line parallel to the horizon and the corners stay
    // full (open-water gaps at the edges read as holes in the perspective);
    // the rivers keep a consistent ~50px to the far banks
    const isle = new Path2D();
    isle.moveTo(0, 290);
    isle.lineTo(2, 150); isle.lineTo(18, 64); isle.lineTo(60, 16);   // west shore up to the NW corner
    isle.lineTo(872, 16);                                            // straight north shore
    isle.lineTo(890, 70); isle.lineTo(898, 200); isle.lineTo(900, 330);
    isle.lineTo(886, 442); isle.lineTo(832, 516);                    // east shore
    isle.lineTo(650, 546); isle.lineTo(430, 552); isle.lineTo(228, 546);
    isle.lineTo(96, 516); isle.lineTo(30, 460); isle.lineTo(6, 380); // south + SW corner
    isle.closePath();
    // every building must stand fully on this footprint (checked in canvas
    // coords, so the pad offset applies)
    const onLand = (x, y) => b.isPointInPath(isle, x + PAD, y);
    // surf line under the shore, then the sand, then the shore outline
    b.save();
    b.strokeStyle = "rgba(230,240,240,.35)"; b.lineWidth = 10; b.stroke(isle);
    b.restore();
    b.fillStyle = "#9d9179";
    b.fill(isle);
    b.strokeStyle = "#6f6551"; b.lineWidth = 3; b.stroke(isle);
    // piers into the water (drawn before blocks so they read as docks):
    // bay side only — the straight Harlem River is too narrow for docks
    b.fillStyle = "#7a5c3d";
    const piers = [[300, 528, 30], [560, 534, 26], [760, 522, 30]];
    for (const [px, py, ph] of piers) b.fillRect(px, py, 9, ph);
    b.fillStyle = "#8d6c49";
    for (const [px, py, ph] of piers)
      for (let py2 = py + 2; py2 < py + ph - 2; py2 += 6) b.fillRect(px + 1, py2, 7, 2);
    // a little bridge where the Harlem River narrows (it has plenty)
    b.fillStyle = "#4a4132";
    b.fillRect(556, 8, 8, 8);
    b.fillStyle = "#6b543a";
    b.fillRect(554, 9, 12, 2);
    b.fillRect(554, 13, 12, 2);
    // a couple of steamers working the waterways (plus their wakes)
    for (const [sx, sy] of [[-46, 140], [840, 532]]) {
      b.fillStyle = "rgba(230,240,240,.25)";
      b.fillRect(sx - 16, sy + 3, 14, 2); b.fillRect(sx - 26, sy + 5, 10, 1);
      b.fillStyle = "#3d3a35"; b.fillRect(sx, sy, 22, 7);
      b.fillStyle = "#e8e0ce"; b.fillRect(sx + 4, sy - 5, 12, 5);
      b.fillStyle = "#b8433a"; b.fillRect(sx + 8, sy - 9, 4, 4);
    }
    // the Battery ferry terminal on the western tip
    b.fillStyle = "#7a5c3d"; b.fillRect(20, 282, 26, 8);
    b.fillStyle = "#8a6f4d"; b.fillRect(24, 272, 18, 10);
    b.fillStyle = "#5b4632"; b.fillRect(24, 272, 18, 3);
    b.fillStyle = "#e8e0ce"; b.font = "9px VT323"; b.fillText("FERRY", 26, 281);
    b.fillStyle = "#3d3a35"; b.fillRect(-26, 296, 16, 5);
    b.fillStyle = "#e8e0ce"; b.fillRect(-23, 292, 8, 4);
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
    // crosswalk stripes at every corner approach (faint, under the rings)
    b.fillStyle = "rgba(216,208,188,.5)";
    for (const n of MAP.nodes) {
      const p = nodePos(n.id);
      for (const m of adjOf(n.id)) {
        if (m === "X") continue;
        const q = nodePos(m);
        const dx = Math.sign(q.x - p.x), dy = Math.sign(q.y - p.y);
        if (dx && dy) continue; // no stripes on the diagonal avenues
        for (let i = -1; i <= 1; i++) {
          const sx = p.x + dx * 22 + (dy ? i * 5 : 0), sy = p.y + dy * 22 + (dx ? i * 5 : 0);
          b.fillRect(sx - (dx ? 1.5 : 3.5), sy - (dy ? 1.5 : 3.5), dx ? 3 : 7, dy ? 3 : 7);
        }
      }
    }
    // city blocks with extruded buildings (painter: top rows first), CLIPPED
    // to the island silhouette — the grid overhangs the tapered corners, and
    // nothing may ever stand on water
    const rng = rand(1938);
    b.save();
    b.clip(isle);
    // the outer margins reach the new fuller shores, so the added terrain
    // carries buildings too (onLand keeps every one of them dry)
    const xs = [14, ...RX, 888], ys = [22, ...RY, 542];
    for (let r = 0; r < ys.length - 1; r++) {
      for (let c = 0; c < xs.length - 1; c++) {
        const x0 = xs[c] + STREET * 0.7, x1 = xs[c + 1] - STREET * 0.7;
        const y0 = ys[r] + STREET * 0.7, y1 = ys[r + 1] - STREET * 0.7;
        if (x1 - x0 < 18 || y1 - y0 < 16) continue;
        // the park: a lawn block on the upper east side
        if (r === 1 && c === 4) { park(b, x0, y0, x1, y1, rng); continue; }
        // X plaza: skip buildings dead-center
        if (Math.abs((x0 + x1) / 2 - XPOS.x) < 75 && Math.abs((y0 + y1) / 2 - XPOS.y) < 70) {
          plaza(b, x0, y0, x1, y1);
          continue;
        }
        blockBuildings(b, x0, y0, x1, y1, rng, onLand);
      }
    }
    b.restore();
    // sidewalks may still meet the water: repaint the shoreline over them
    b.strokeStyle = "#6f6551"; b.lineWidth = 3; b.stroke(isle);
    // suspension bridges span both rivers where 2nd Street meets the shores
    sideBridge(b, -56, 14, RY[1]);          // over the Hudson, to Hoboken
    sideBridge(b, 892, CW + 56, RY[1]);     // over the East River, to Greenpoint
    liberty(b);                             // Lady Liberty out in the Upper Bay
    // the X: the two diagonal avenues cross the central block exactly like
    // the printed board. They were always the movement graph (9-14 / 10-13),
    // but the plaza paving used to be drawn OVER the crossing — repaint the
    // avenues on top so the X is unmistakable.
    const diag = [[nodePos(9), nodePos(14)], [nodePos(10), nodePos(13)]];
    b.lineCap = "round";
    b.strokeStyle = "#6e675a";
    b.lineWidth = STREET;
    for (const [pa, pb] of diag) {
      b.beginPath(); b.moveTo(pa.x, pa.y); b.lineTo(pb.x, pb.y); b.stroke();
    }
    b.lineCap = "butt";
    b.strokeStyle = "#8b8271";
    b.lineWidth = 2;
    b.setLineDash([5, 7]);
    for (const [pa, pb] of diag) {
      b.beginPath(); b.moveTo(pa.x, pa.y); b.lineTo(pb.x, pb.y); b.stroke();
    }
    b.setLineDash([]);
    // the elevated line: a trestle ON the southern shore of the island (never
    // over open water) — its train is animated in frame()
    b.strokeStyle = "#4a4132";
    b.lineWidth = 3;
    b.beginPath(); b.moveTo(240, 537); b.lineTo(645, 537); b.stroke();
    b.fillStyle = "#3c352a";
    for (let px = 248; px < 640; px += 26) b.fillRect(px, 537, 3, 7);
    // river sparkle base (rivers run along the top and bottom banks)
    b.fillStyle = "#2a5470";
    for (let i = 0; i < 30; i++) {
      const x = 16 + ((i * 113) % 860);
      b.fillRect(x, i % 2 ? 3 : 9, 18, 3);
      b.fillRect((x + 210) % 870, CH - (i % 2 ? 8 : 14), 18, 3);
    }
    // coherent geography, stylized: Harlem River north (the Bronx behind),
    // Hudson west (Hoboken), East River east (Greenpoint), Upper Bay south
    b.font = "14px VT323";
    b.fillStyle = "#14344a";
    b.fillText("HARLEM RIVER", 44, 26);
    b.fillText("UPPER BAY", CW - 110, CH - 4);
    b.font = "12px VT323";
    "HUDSON".split("").forEach((ch, i) => b.fillText(ch, -34, 168 + i * 13));
    "EAST RIVER".split("").forEach((ch, i) => b.fillText(ch, CW + 28, 148 + i * 13));
    // Times Square: remember where the neon marquee lives (animated later)
    const ts = MAP.nodes.find((n) => n.name === "Times Square");
    marquee = ts ? { x: nodePos(ts.id).x + 34, y: nodePos(ts.id).y - 30 } : null;
  }
  // the far banks: the Bronx along the whole north edge (Manhattan must never
  // read as a lone island in open sea), Hoboken west, Greenpoint east — all
  // low-detail, muted, hazed by distance; pure scenery, never interactive
  function farShores(b) {
    const rng = rand(1846);
    // THE BRONX: a continuous mainland strip under the skyline, so the north
    // water reads as the Harlem River, not ocean
    b.fillStyle = "#7c7f6a";
    b.fillRect(-PAD, 0, BW, 9);
    b.fillStyle = "#6f7259";
    for (let x = -PAD + 6; x < CW + PAD - 6; x += 18) b.fillRect(x, 7 - rng() * 3, 9, 4);
    b.fillStyle = "#75808c";
    for (let x = -PAD + 10; x < CW + PAD - 10; x += 34) b.fillRect(x, 1, 12 + rng() * 10, 5);
    b.strokeStyle = "#5a5d48"; b.lineWidth = 1.5;
    b.beginPath(); b.moveTo(-PAD, 9); b.lineTo(CW + PAD, 9); b.stroke();
    const bank = (x0, x1, edgeX) => {
      // land mass with a slightly jagged shoreline — it runs all the way up
      // to the Bronx strip, so the far coast is continuous from the horizon
      b.fillStyle = "#7c7f6a";
      b.fillRect(x0, 9, x1 - x0, 500);
      b.fillStyle = "#6f7259";
      for (let y = 14, edge = edgeX === x1; y < 505; y += 14)
        b.fillRect(edge ? x1 - 4 - rng() * 5 : x0, y, 5 + rng() * 5, 8);
      b.strokeStyle = "#5a5d48"; b.lineWidth = 2;
      b.strokeRect(x0, 9, x1 - x0, 500);
      // piers reaching into the river
      b.fillStyle = "#6b543a";
      for (let y = 90; y < 480; y += 78) {
        const px = edgeX === x1 ? x1 : x0 - 16;
        b.fillRect(px, y + rng() * 20, 16, 5);
      }
      // low warehouse rows with pinprick windows
      for (let y = 24; y < 480; y += 26) {
        const wx = x0 + 6 + rng() * 14, ww = 22 + rng() * 30;
        if (wx + ww > x1 - 6) continue;
        const tone = rng();
        b.fillStyle = tone < 0.4 ? "#8a7663" : tone < 0.75 ? "#75808c" : "#83816d";
        b.fillRect(wx, y, ww, 12);
        b.fillStyle = "rgba(0,0,0,.25)";
        b.fillRect(wx, y, ww, 2);
        b.fillStyle = "#e8dca8";
        for (let fx2 = wx + 3; fx2 < wx + ww - 3; fx2 += 6)
          if (rng() < 0.6) b.fillRect(fx2, y + 5, 2, 2);
      }
    };
    // HOBOKEN, across the western river (label hugs the inner shore: the
    // projection clips anything deeper into the pad)
    bank(-PAD + 4, -52, -52);
    b.fillStyle = "#514f3c";
    b.font = "bold 13px VT323";
    b.fillText("HOBOKEN", -98, 104);
    // a loading crane on the Hoboken docks
    b.strokeStyle = "#4a4132"; b.lineWidth = 3;
    b.beginPath(); b.moveTo(-70, 300); b.lineTo(-70, 272); b.lineTo(-46, 282); b.stroke();
    // GREENPOINT, across the eastern river — with its famous gas holders
    bank(CW + 52, CW + PAD - 4, CW + 52);
    b.fillStyle = "#514f3c";
    b.fillText("GREENPOINT", CW + 54, 104);
    for (const gy of [200, 352]) {
      b.fillStyle = "#7e8894";
      b.beginPath(); b.arc(CW + 96, gy, 13, 0, 7); b.fill();
      b.strokeStyle = "#5c6672"; b.lineWidth = 1.5;
      for (let ry = -8; ry <= 8; ry += 4) {
        b.beginPath(); b.moveTo(CW + 96 - 12, gy + ry); b.lineTo(CW + 96 + 12, gy + ry); b.stroke();
      }
      b.strokeStyle = "#49525c";
      b.beginPath(); b.arc(CW + 96, gy, 13, 0, 7); b.stroke();
    }
    // current lines on the side rivers (they run vertically here)
    b.fillStyle = "#2a5470";
    for (let y = 70; y < 500; y += 34) {
      b.fillRect(-40 + (y % 3) * 6, y, 3, 12);
      b.fillRect(CW + 22 + (y % 3) * 6, y, 3, 12);
    }
  }

  // the Statue of Liberty on her own islet, off the Battery in the Upper Bay
  function liberty(b) {
    const lx = 38, ly = 520;
    // islet with surf
    b.strokeStyle = "rgba(230,240,240,.35)"; b.lineWidth = 5;
    b.beginPath(); b.ellipse(lx, ly + 4, 17, 6, 0, 0, 7); b.stroke();
    b.fillStyle = "#9d9179";
    b.beginPath(); b.ellipse(lx, ly + 4, 16, 5.5, 0, 0, 7); b.fill();
    b.strokeStyle = "#6f6551"; b.lineWidth = 2; b.stroke();
    // star-fort pedestal
    b.fillStyle = "#8a8578"; b.fillRect(lx - 7, ly - 1, 14, 4);
    b.fillStyle = "#a09a8a"; b.fillRect(lx - 5, ly - 6, 10, 5);
    b.fillStyle = "rgba(0,0,0,.25)"; b.fillRect(lx - 5, ly - 6, 10, 1);
    // the lady, in weathered copper
    b.fillStyle = "#5e8f7a";
    b.fillRect(lx - 3, ly - 16, 6, 10);          // robe
    b.fillRect(lx - 4, ly - 8, 8, 2);            // hem
    b.fillRect(lx - 1.5, ly - 19, 3, 3);         // head
    b.fillRect(lx - 5, ly - 13, 2, 4);           // tablet arm
    for (let i = -2; i <= 2; i++)                // crown spikes
      b.fillRect(lx - 0.5 + i * 1.6, ly - 21.5, 1, 2);
    b.fillRect(lx + 3, ly - 20, 2, 7);           // torch arm, raised
    b.fillStyle = "#79a890";
    b.fillRect(lx - 3, ly - 16, 2, 10);          // lit fold of the robe
    b.fillStyle = "#f2dfa0";
    b.fillRect(lx + 2.5, ly - 23, 3, 3);         // the flame
  }

  // a little suspension bridge across a side river: deck, twin towers,
  // dipping main cables — pure scenery in the baked painting
  function sideBridge(b, xa, xb, y) {
    b.fillStyle = "rgba(20,15,5,.25)";
    b.fillRect(xa, y + 4, xb - xa, 3);                 // deck shadow on the water
    b.fillStyle = "#4a4132";
    b.fillRect(xa, y - 3, xb - xa, 6);                 // deck
    b.fillStyle = "#6b543a";
    b.fillRect(xa, y - 1, xb - xa, 2);                 // roadway stripe
    const t1 = xa + (xb - xa) * 0.3, t2 = xa + (xb - xa) * 0.7;
    b.strokeStyle = "#2f2a20"; b.lineWidth = 1.5;      // main cables dip between towers
    b.beginPath();
    b.moveTo(xa, y - 3);
    b.quadraticCurveTo((xa + t1) / 2, y - 14, t1, y - 15);
    b.quadraticCurveTo((t1 + t2) / 2, y - 4, t2, y - 15);
    b.quadraticCurveTo((t2 + xb) / 2, y - 14, xb, y - 3);
    b.stroke();
    for (const tx of [t1, t2]) {                       // twin towers
      b.fillStyle = "#3c352a";
      b.fillRect(tx - 2, y - 16, 5, 19);
      b.fillRect(tx - 4, y - 10, 9, 3);
      b.fillStyle = "#57503f";
      b.fillRect(tx - 2, y - 16, 2, 19);
    }
  }

  function blockBuildings(b, x0, y0, x1, y1, rng, onLand) {
    // sidewalk (clipped to the island; running to the water's edge is fine)
    b.fillStyle = "#b3a88f";
    b.fillRect(x0, y0, x1 - x0, y1 - y0);
    const n = Math.max(1, Math.min(3, ((x1 - x0) / 26) | 0));
    const w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const bx = x0 + i * w + 2, bw = w - 4;
      const bh = 10 + rng() * 16;                        // extrusion height
      const gy = y1 - 4;                                 // ground line
      const tone = rng();
      // a building either stands fully on land or is not built at all —
      // never sliced by the shoreline, never wet feet
      const roofY = gy - bh - 6;
      if (onLand && !(onLand(bx, gy + 1) && onLand(bx + bw, gy + 1) &&
        onLand(bx, roofY) && onLand(bx + bw, roofY))) continue;
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
      b.fillStyle = "rgba(255,255,255,.25)";
      b.fillRect(bx, gy - bh - 5, bw, 1);          // sun catches the parapet
      b.fillStyle = "rgba(0,0,0,.28)";
      b.fillRect(bx, gy - bh, bw, 2);
      b.fillStyle = "rgba(0,0,0,.22)";
      b.fillRect(bx + bw - 3, gy - bh, 3, bh);     // shaded east face
      // windows
      b.fillStyle = rng() < 0.5 ? "#f2dfa0" : "#4b4335";
      for (let wy = gy - bh + 4; wy < gy - 4; wy += 6)
        for (let wx = bx + 3; wx < bx + bw - 3; wx += 6)
          if (rng() < 0.8) b.fillRect(wx, wy, 3, 3);
      // 1938 rooftops: wooden water tanks and smoking chimneys
      const ry = gy - bh - 5;
      const roll = rng();
      if (roll < 0.3 && bw >= 18) {
        const tx = bx + 3 + rng() * (bw - 12);
        b.fillStyle = "rgba(0,0,0,.3)";
        b.fillRect(tx, ry - 1, 8, 2);                    // legs shadow
        b.fillStyle = "#6b4a30";
        b.fillRect(tx + 1, ry - 3, 1.5, 3); b.fillRect(tx + 5.5, ry - 3, 1.5, 3);
        b.fillStyle = "#8a6242";
        b.fillRect(tx, ry - 9, 8, 6);                    // tank body
        b.fillStyle = "#a37a52";
        b.fillRect(tx, ry - 9, 2, 6);                    // lit side
        b.fillStyle = "#5b4632";
        b.beginPath(); b.moveTo(tx - 1, ry - 9); b.lineTo(tx + 4, ry - 13); b.lineTo(tx + 9, ry - 9);
        b.closePath(); b.fill();                          // conical lid
      } else if (roll < 0.52) {
        const cx = bx + 3 + rng() * (bw - 8);
        b.fillStyle = "#7c5a48";
        b.fillRect(cx, ry - 6, 4, 6);                    // chimney
        b.fillStyle = "#5b4030";
        b.fillRect(cx - 1, ry - 7, 6, 2);
        if (rng() < 0.5 && stacks.length < 9) stacks.push({ x: cx + 2, y: ry - 8 });
      } else if (roll < 0.62) {
        b.fillStyle = "rgba(220,230,240,.5)";
        b.fillRect(bx + bw / 2 - 3, ry - 1, 6, 3);       // skylight glint
      }
    }
  }
  function park(b, x0, y0, x1, y1, rng) {
    b.fillStyle = "#7d9c62";
    b.fillRect(x0, y0, x1 - x0, y1 - y0);
    b.fillStyle = "#94ad74";
    b.fillRect(x0 + 4, y0 + 4, x1 - x0 - 8, 3);
    // a pond with a lit rim and a winding path
    const px = (x0 + x1) / 2 + 8, py = (y0 + y1) / 2 + 6;
    b.fillStyle = "#4f7d92";
    b.beginPath(); b.ellipse(px, py, 16, 9, 0, 0, 7); b.fill();
    b.strokeStyle = "#b9cbc2"; b.lineWidth = 2;
    b.beginPath(); b.ellipse(px, py, 16, 9, 0, 0, 7); b.stroke();
    b.strokeStyle = "#c2b490"; b.lineWidth = 3;
    b.beginPath(); b.moveTo(x0 + 6, y1 - 10); b.quadraticCurveTo(px - 20, py + 14, px - 18, py - 2);
    b.quadraticCurveTo(px - 12, y0 + 12, x1 - 10, y0 + 16); b.stroke();
    for (let i = 0; i < 8; i++) {
      const tx = x0 + 6 + rng() * (x1 - x0 - 14), ty = y0 + 8 + rng() * (y1 - y0 - 16);
      if (Math.abs(tx - px) < 20 && Math.abs(ty - py) < 12) continue; // keep the pond clear
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
    // the cab ride is a little show (checker cab, passenger aboard) — at the
    // old 420ms players missed it entirely. FAST ANIMATIONS (UI.animFast,
    // persisted) restores the quick pace for impatient dispatchers.
    const base = mode === "ticket" ? 500 : mode === "cab" ? 950 : 520;
    const dur = typeof UI !== "undefined" && UI.animFast ? Math.round(base * 0.45) : base;
    anims[pid].push({ from, to, t0: 0, dur, mode });
    if (mode === "ticket") {
      // the super-transport ticket takes a bow before the teleport
      const fv = vp(from);
      effects.push({ x: fv.x, y: fv.y, t0: performance.now(), kind: "ticket" });
      effects.push({ x: fv.x, y: fv.y, t0: performance.now(), kind: "poof" });
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
        if (a.mode === "ticket") { const tv = vp(a.to); effects.push({ x: tv.x, y: tv.y, t0: now, kind: "poof" }); }
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

  // --------------------------------------------------------- ambient life
  // background traffic and rooftop smoke: quiet, small, behind every marker
  function ambient(now) {
    // drifting clouds in the sky band
    ctx.fillStyle = "rgba(240,246,248,.8)";
    for (let i = 0; i < 3; i++) {
      const speed = 26000 + i * 9000;
      const cx = ((now / speed + i * 0.37) % 1.15) * (CW + 120) - 60;
      const cy = 9 + i * 12;
      ctx.fillRect(cx, cy, 34, 5);
      ctx.fillRect(cx + 6, cy - 3, 20, 3);
      ctx.fillRect(cx + 10, cy + 5, 16, 3);
    }
    // rooftop smoke: three slow puffs per stack
    for (let si = 0; si < stacks.length; si++) {
      const sp = vp(stacks[si]);
      for (let k = 0; k < 3; k++) {
        const t = ((now / 2600) + si * 0.31 + k / 3) % 1;
        ctx.fillStyle = `rgba(226,226,220,${0.34 * (1 - t)})`;
        const r = 1.5 + t * 3;
        ctx.fillRect(sp.x - r / 2 + Math.sin((t + si) * 5) * 2.5, sp.y - t * 14 - r / 2, r, r);
      }
    }
    // ambient cabs cruising the avenues (right-hand lane, under the stands)
    for (let i = 0; i < 3; i++) {
      const lane = [RY[0], RY[2], RY[3]][i];
      const dir = i % 2 ? -1 : 1;
      const span = RX[5] - RX[0] - 30;
      const t = ((now / (13000 + i * 4200)) + i * 0.43) % 1;
      const fx = RX[0] + 15 + (dir > 0 ? t : 1 - t) * span;
      const p = vp({ x: fx, y: lane + 5 });
      ctx.globalAlpha = 0.92;
      cab(p.x, p.y - 3, now);
      ctx.globalAlpha = 1;
    }
    // pedestrians idling near a few kiosks
    for (const n of MAP.nodes) {
      if (n.id % 3) continue;
      const p = vp(nodePos(n.id));
      const bob = Math.sin(now / 500 + n.id) * 0.8;
      ctx.fillStyle = "#4d5a6e";
      ctx.fillRect(p.x + 17, p.y + 2 + bob, 4, 7);
      ctx.fillStyle = "#d9b48f";
      ctx.fillRect(p.x + 17.5, p.y - 1 + bob, 3, 3);
    }
    // pigeons work the plaza until somebody walks through
    const XV = vp(XPOS);
    let agentNear = false;
    for (const pid in lastPos) {
      const lp = lastPos[pid];
      if (Math.abs(lp.x - XPOS.x) < 46 && Math.abs(lp.y - XPOS.y) < 46) { agentNear = true; break; }
    }
    for (let i = 0; i < 3; i++) {
      if (agentNear) {
        // scattered: little wing ticks fluttering off
        const t = (now / 900 + i / 3) % 1;
        const ang = i * 2.1 + 0.6;
        const fx = XV.x + Math.cos(ang) * (30 + t * 26), fy = XV.y - 6 - t * 18 + Math.sin(ang) * 8;
        ctx.strokeStyle = "rgba(90,95,105,.8)";
        ctx.lineWidth = 1.5;
        const w = (now / 120 + i) % 2 < 1 ? 3 : 1.5;
        ctx.beginPath(); ctx.moveTo(fx - w, fy); ctx.lineTo(fx, fy + 2); ctx.lineTo(fx + w, fy); ctx.stroke();
      } else {
        const px2 = XV.x + Math.sin(now / 1700 + i * 2.4) * 26 + (i - 1) * 14;
        const py2 = XV.y + 20 + Math.cos(now / 2100 + i) * 5;
        ctx.fillStyle = "#5a5f69";
        ctx.fillRect(px2, py2, 3, 2.5);
        ctx.fillStyle = "#7a7f89";
        ctx.fillRect(px2 + ((now / 400 + i) % 2 < 1 ? 2 : 0), py2 - 1, 1.5, 1.5);
      }
    }
    // the elevated train works its shoreline trestle every so often
    {
      const period = 17000, run = 6200;
      const tt = (now % period) / run;
      if (tt < 1) {
        const fx = 255 + tt * 380;
        const p = vp({ x: fx, y: 534 });
        for (let c = 0; c < 4; c++) {
          const cx = p.x - c * 24;
          if (cx < vp({ x: 240, y: 534 }).x || cx > vp({ x: 645, y: 534 }).x) continue;
          ctx.fillStyle = "#3d4f3f";
          ctx.fillRect(cx - 10, p.y - 8, 21, 8);
          ctx.fillStyle = "#2c3a2e";
          ctx.fillRect(cx - 10, p.y - 8, 21, 2);
          ctx.fillStyle = "#f2dfa0";
          for (let wxi = 0; wxi < 4; wxi++) ctx.fillRect(cx - 7 + wxi * 5, p.y - 5, 3, 3);
        }
        ctx.fillStyle = "#c9c2b0"; // a hiss of steam off the lead car
        ctx.fillRect(p.x + 12, p.y - 12 - (now / 90 % 3), 3, 3);
      }
    }
    // Times Square neon, flickering through the afternoon
    if (marquee) {
      const mp = vp(marquee);
      const on = (now / 700 | 0) % 6 !== 4;
      ctx.fillStyle = "#221d16";
      ctx.fillRect(mp.x - 17, mp.y - 7, 34, 13);
      ctx.strokeStyle = on ? "#e84d6f" : "#7c3346";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(mp.x - 17, mp.y - 7, 34, 13);
      ctx.fillStyle = on ? "#f5c86e" : "#8a7442";
      ctx.font = "bold 10px VT323"; ctx.textAlign = "center";
      ctx.fillText("RIALTO", mp.x, mp.y + 3);
      ctx.textAlign = "left";
      if (on) {
        ctx.fillStyle = "rgba(232,77,111,.16)";
        ctx.fillRect(mp.x - 21, mp.y - 11, 42, 21);
      }
    }
  }

  // ---------------------------------------------------------------- frame
  function frame(now) {
    if (!canvas || !canvas.isConnected) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    if (!UI.engine) return;
    const e = UI.engine, s = e.state;
    const ses = s.salesSession;
    ctx.clearRect(0, 0, CW, CH);
    ctx.drawImage(baseTilt || base, 0, 0);

    // animated water shimmer, projected onto both banks
    ctx.fillStyle = "rgba(255,255,255,.14)";
    const ph = (now / 700) % 8;
    for (let i = 0; i < 16; i++) {
      const x = ((i * 127 + ph * 11) % 860) + 16;
      const topX = CW / 2 + (x - CW / 2) * TILT_S0;
      ctx.fillRect(topX, HORIZON + (i % 2 ? 2 : 7), 12 * TILT_S0, 2);
      ctx.fillRect((x + 260) % 870, CH - (i % 2 ? 7 : 13), 12, 2);
    }

    ambient(now);
    // (no medallion on the plaza: the crossing avenues already draw the X)

    // node kiosks
    const myPid = ses ? ses.player : UI.humanId;
    const adj = ses ? e.agentAdjacent(myPid) : [];
    const currentNode = e.player(myPid).agentNode;
    for (const n of MAP.nodes) {
      const p = vp(nodePos(n.id));
      kiosk(p.x, p.y, now + n.id * 300);
      // corners are named neighborhoods (shown on hover) — the old A1-D6
      // plates were pure noise on the picture
      if (interactive && ses && adj.includes(n.id)) {
        const chk = e.salesMoveCheck(myPid, n.id);
        const occupied = chk.occupied;
        const col = !chk.ok || occupied ? "#d94f43" : chk.cabFare ? "#f5c86e" : "#7ab648";
        ctx.strokeStyle = col;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(p.x, p.y + 2, 15 + Math.sin(now / 250) * 1.5, 0, 7); ctx.stroke();
        const tag = !chk.ok ? "BLOCKED" : occupied ? "+$2 FEE" : chk.cabFare ? "$2 CAB" : "FREE";
        fareTag(p.x, p.y + 17, tag, col, chk.ok && !occupied && !!chk.cabFare);
      }
      if (interactive && hover && hover.node === n.id) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y + 2, 18, 0, 7); ctx.stroke();
      }
    }

    // orders: kraft bundles until revealed, genre medallions once face-up,
    // and the FULL terms open exactly where the decision lives — beside your
    // run (adjacent or current corner) or under the cursor. A fresh flip
    // pops its plate large for a beat. Collected ones become owner pennants.
    for (const t of s.mapSlots) {
      if (t.faceUp && seenFace[t.id] === false) {
        const fp = vp(slotPos(t));
        effects.push({ x: fp.x, y: fp.y, t0: now, kind: "flip", slotId: t.id });
      }
      seenFace[t.id] = t.faceUp;
    }
    for (const t of s.mapSlots) {
      const pos = vp(slotPos(t));
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
      const bob = Math.sin(now / 600 + t.id) * 1.5;
      const y = pos.y + bob;
      const gi = GENRE_INFO[t.genre];
      const atCorner = ses && t.nodes.includes(e.player(myPid).agentNode);
      const near = ses && (atCorner || t.nodes.some((nd) => adj.includes(nd)));
      const hovered = interactive && hover && hover.slot && hover.slot.id === t.id;
      ctx.fillStyle = "rgba(20,15,5,.3)";
      ctx.beginPath(); ctx.ellipse(pos.x, pos.y + 11, 9, 2.6, 0, 0, 7); ctx.fill();
      let mw, mh; // marker box, for the highlight rings
      if (!t.faceUp) {
        bundle(pos.x, y, gi);
        mw = 30; mh = 24;
      } else if (near || hovered) {
        orderPlate(pos.x, y, t);
        mw = 68; mh = 38;
      } else {
        medallion(pos.x, y, t, gi);
        mw = 32; mh = 42;
      }
      if (interactive && ses && atCorner) {
        ctx.strokeStyle = "#f5c86e";
        ctx.lineWidth = 3;
        ctx.strokeRect(pos.x - mw / 2 - 2, y - mh / 2 - 2, mw + 4, mh + 4);
      }
      if (hovered) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.strokeRect(pos.x - mw / 2 - 4, y - mh / 2 - 4, mw + 8, mh + 8);
      }
      if (interactive && kbFocus && kbFocus.slotId === t.id) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = -(now / 60) % 9;
        ctx.strokeRect(pos.x - mw / 2 - 5, y - mh / 2 - 5, mw + 10, mh + 10);
        ctx.setLineDash([]);
      }
    }

    // Decision overlays are deliberately drawn after order signs, so route
    // costs and the player's current corner can never disappear behind a
    // newsstand tile.
    if (interactive && ses) {
      for (const nd of adj) {
        if (nd === "X") continue;
        const p = vp(nodePos(nd)), chk = e.salesMoveCheck(myPid, nd);
        const occupied = chk.occupied;
        const col = !chk.ok || occupied ? "#d94f43" : chk.cabFare ? "#f5c86e" : "#7ab648";
        ctx.strokeStyle = col; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(p.x, p.y + 2, 16, 0, 7); ctx.stroke();
        const tag = !chk.ok ? "BLOCKED" : occupied ? "+$2 FEE" : chk.cabFare ? "$2 CAB" : "FREE";
        fareTag(p.x, p.y + 17, tag, col, chk.ok && !occupied && !!chk.cabFare);
      }
    }
    if (interactive) {
      const p = vp(nodePos(currentNode)), label = currentNode === "X" ? "CENTRAL · YOU" : "YOU";
      ctx.strokeStyle = PUBLISHERS[e.player(myPid).color].color; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y + 2, 22, 0, 7); ctx.stroke();
      ctx.font = "bold 11px VT323";
      const tw = currentNode === "X" ? 78 : 34;
      ctx.fillStyle = "#221d16"; ctx.fillRect(p.x - tw / 2, p.y + 20, tw, 14);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.fillText(label, p.x, p.y + 31); ctx.textAlign = "left";
    }
    // keyboard focus ring on a corner (dashed, marching)
    if (interactive && kbFocus && kbFocus.node !== undefined) {
      const p = vp(nodePos(kbFocus.node));
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -(now / 60) % 11;
      ctx.beginPath(); ctx.arc(p.x, p.y + 2, 19, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
    }

    // agents: the houses' own people out on the street (not meeples)
    for (const pl of s.players) {
      const pos = vp(agentDrawPos(pl.id, now));
      const idle = Math.sin(now / 420 + pl.id * 2) * 1.2;
      const ax = pos.x + pl.id * 7 - 10;
      ctx.globalAlpha = pos.mode === "fade" ? Math.max(0.05, pos.t) : 1;
      ctx.fillStyle = "rgba(20,15,5,.35)";
      ctx.beginPath(); ctx.ellipse(ax, pos.y + 8, 8, 3, 0, 0, 7); ctx.fill();
      if (pos.mode === "cab") {
        cab(ax, pos.y - 4, now);
      } else {
        // the street agent is the very staffer placed on Sales, when known
        const salesIdx = (s.actionSpaces.sales || []).indexOf(pl.id);
        const chIdx = salesIdx >= 0 && typeof LocArt !== "undefined"
          ? LocArt.staffCharFor("sales", salesIdx) : pl.id % 4;
        ctx.save();
        ctx.translate(ax, pos.y - 10 + (pos.mode ? 0 : idle));
        if (pos.mode === "walk") ctx.rotate(Math.sin(now / 90) * 0.09); // stride
        drawSprite(`staff_${pl.color}_${chIdx}`, 0, 0, 0.8);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // effects
    for (let i = effects.length - 1; i >= 0; i--) {
      const fx = effects[i];
      const t = (now - fx.t0) / (fx.kind === "ticket" ? 1050 : fx.kind === "flip" ? 950 : 450);
      if (t >= 1) { effects.splice(i, 1); continue; }
      if (fx.kind === "flip") {
        // a fresh reveal takes a bow: the full terms pop large, then settle
        const slot = s.mapSlots[fx.slotId];
        if (slot && slot.takenBy === null && slot.faceUp) {
          const sc = 1 + 0.45 * Math.sin(Math.min(1, t * 1.25) * Math.PI);
          ctx.save();
          ctx.translate(fx.x, fx.y - 10 - t * 6);
          ctx.scale(sc, sc);
          ctx.globalAlpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
          orderPlate(0, 0, slot);
          ctx.restore();
          ctx.globalAlpha = 1;
        }
        continue;
      }
      if (fx.kind === "ticket") {
        // the ticket itself rises with rays — its use should feel earned
        const ty = fx.y - 34 - t * 14;
        ctx.globalAlpha = t < 0.72 ? 1 : 1 - (t - 0.72) / 0.28;
        ctx.strokeStyle = `rgba(245,200,110,${0.9 - t * 0.6})`;
        ctx.lineWidth = 3;
        for (let r = 0; r < 6; r++) {
          const ang = r * Math.PI / 3 + t * 2.2;
          ctx.beginPath();
          ctx.moveTo(fx.x + Math.cos(ang) * 15, ty + Math.sin(ang) * 15);
          ctx.lineTo(fx.x + Math.cos(ang) * (21 + t * 9), ty + Math.sin(ang) * (21 + t * 9));
          ctx.stroke();
        }
        drawSprite("ticket", fx.x, ty, 1.05);
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.strokeStyle = `rgba(245,200,110,${1 - t})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, 4 + t * 22, 0, 7); ctx.stroke();
    }

    // hover tooltip
    if (interactive && hover && mouse) tooltip(now);
  }

  function kiosk(x, y, tphase) {
    // little newsstand: box + striped awning + NEWS plate
    ctx.fillStyle = "rgba(20,15,5,.3)";
    ctx.beginPath(); ctx.ellipse(x, y + 9, 12, 3.6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#3e5748";
    ctx.fillRect(x - 10, y - 6, 20, 14);
    ctx.fillStyle = "#2c3f34";
    ctx.fillRect(x - 10, y - 6, 20, 3);
    ctx.fillStyle = "#d8ccb2";                     // magazines
    ctx.fillRect(x - 7, y - 1, 14, 6);
    ctx.fillStyle = ["#d94f43", "#3f7fbf", "#e07f2e"][((tphase / 900) | 0) % 3];
    ctx.fillRect(x - 7, y - 1, 4, 6);
    // awning + sign
    ctx.fillStyle = "#b8433a";
    ctx.fillRect(x - 12, y - 10, 24, 5);
    ctx.fillStyle = "#e8e0ce";
    for (let i = 0; i < 5; i++) ctx.fillRect(x - 12 + i * 5 + 2, y - 10, 2, 5);
    ctx.fillStyle = "#14342a";
    ctx.fillRect(x - 9, y - 17, 18, 8);
    ctx.fillStyle = "#e8e0ce";
    ctx.font = "bold 10px VT323"; ctx.textAlign = "center";
    ctx.fillText("NEWS", x, y - 10.5);
    ctx.textAlign = "left";
  }
  // a fare plate; rides that need a taxi show one, so the cost is pictured
  function fareTag(x, y, tag, col, showCab) {
    ctx.font = "bold 11px VT323";
    const tw = Math.max(30, ctx.measureText(tag).width + 8) + (showCab ? 15 : 0);
    ctx.fillStyle = "#221d16";
    ctx.fillRect(x - tw / 2, y, tw, 14);
    if (showCab) cabGlyph(x - tw / 2 + 8, y + 7);
    ctx.fillStyle = col;
    ctx.textAlign = "center";
    ctx.fillText(tag, x + (showCab ? 7 : 0), y + 11);
    ctx.textAlign = "left";
  }
  function cabGlyph(x, y) {
    ctx.fillStyle = "#e8b93c"; ctx.fillRect(x - 5, y - 3, 10, 5);
    ctx.fillStyle = "#f2d06b"; ctx.fillRect(x - 2, y - 5, 5, 2);
    ctx.fillStyle = "#222";
    ctx.fillRect(x - 4, y + 2, 2, 2);
    ctx.fillRect(x + 2, y + 2, 2, 2);
  }
  function heart(x, y, col, s = 1) {
    // pixel heart (the canvas font has no reliable ♥ glyph)
    ctx.fillStyle = col;
    ctx.fillRect(x - 5 * s, y - 4 * s, 4 * s, 3 * s);
    ctx.fillRect(x + 1 * s, y - 4 * s, 4 * s, 3 * s);
    ctx.fillRect(x - 6 * s, y - 1 * s, 12 * s, 3 * s);
    ctx.fillRect(x - 4 * s, y + 2 * s, 8 * s, 2 * s);
    ctx.fillRect(x - 2 * s, y + 4 * s, 4 * s, 2 * s);
  }
  // ------- order markers: three visual weights, by how much they matter now
  function bundle(x, y, gi) {
    ctx.fillStyle = "#221d16"; ctx.fillRect(x - 13, y - 10, 26, 20);
    ctx.fillStyle = "#c9b083"; ctx.fillRect(x - 11, y - 8, 22, 16);
    ctx.fillStyle = "#a68e63"; ctx.fillRect(x - 11, y - 1, 22, 2);
    ctx.fillStyle = "#a68e63"; ctx.fillRect(x - 1, y - 8, 2, 16);
    ctx.fillStyle = gi.color; ctx.fillRect(x + 3, y - 7, 7, 7);
    ctx.strokeStyle = "#221d16"; ctx.lineWidth = 1; ctx.strokeRect(x + 3.5, y - 6.5, 6, 6);
  }
  function medallion(x, y, t, gi) {
    ctx.fillStyle = "#221d16";
    ctx.beginPath(); ctx.arc(x, y - 6, 14, 0, 7); ctx.fill();
    ctx.fillStyle = gi.color;
    ctx.beginPath(); ctx.arc(x, y - 6, 12, 0, 7); ctx.fill();
    drawSprite(gi.icon, x, y - 6, 0.6);
    ctx.fillStyle = "#221d16"; ctx.fillRect(x - 13, y + 8, 26, 13);
    ctx.fillStyle = "#efe6d0"; ctx.fillRect(x - 12, y + 9, 24, 11);
    ctx.fillStyle = "#221d16"; ctx.font = "bold 12px VT323"; ctx.textAlign = "center";
    ctx.fillText("+" + t.fans, x - 4, y + 18);
    heart(x + 6, y + 14, "#c0392b", 0.6);
    ctx.textAlign = "left";
  }
  function orderPlate(x, y, t) {
    const gi = GENRE_INFO[t.genre];
    ctx.fillStyle = "#221d16"; ctx.fillRect(x - 33, y - 18, 66, 36);
    ctx.fillStyle = gi.color; ctx.fillRect(x - 31, y - 16, 20, 32);
    drawSprite(gi.icon, x - 21, y, 0.65);
    ctx.fillStyle = "#efe6d0"; ctx.fillRect(x - 11, y - 16, 42, 32);
    ctx.fillStyle = "#221d16"; ctx.textAlign = "center";
    ctx.font = "bold 14px VT323";
    ctx.fillText("v" + t.minVal + "+", x + 10, y - 3);
    ctx.font = "bold 16px VT323";
    ctx.fillText("+" + t.fans, x + 3, y + 12);
    heart(x + 17, y + 8, "#c0392b", 0.8);
    ctx.textAlign = "left";
  }
  function cab(x, y, now) {
    // sized against the walking agents (a checker cab is longer than a person
    // is tall — the old one read as a toy)
    ctx.fillStyle = "rgba(0,0,0,.4)";
    ctx.fillRect(x - 14, y + 6, 28, 3);
    ctx.fillStyle = "#e8b93c";
    ctx.fillRect(x - 14, y - 4, 28, 11);
    ctx.fillStyle = "#f2d06b";
    ctx.fillRect(x - 8, y - 10, 16, 7);
    ctx.fillStyle = "#333";
    ctx.fillRect(x - 6, y - 9, 12, 4);
    ctx.fillStyle = "#221d16"; // checker band
    for (let k = 0; k < 6; k++) if (k % 2) ctx.fillRect(x - 12 + k * 4, y + 1, 3, 3);
    ctx.fillStyle = "#222";
    ctx.beginPath(); ctx.arc(x - 8, y + 8, 3.2, 0, 7); ctx.arc(x + 8, y + 8, 3.2, 0, 7); ctx.fill();
    ctx.fillStyle = now % 500 < 250 ? "#fff" : "#f5c86e";
    ctx.fillRect(x - 3, y - 13, 6, 3);
  }

  function tooltip(now) {
    const e = UI.engine, s = e.state, ses = s.salesSession;
    if (!ses) return;
    const p = e.player(ses.player);
    let lines = [];
    if (hover.node !== undefined && hover.node !== "X") {
      const where = MAP.nodes[hover.node].name.toUpperCase();
      if (hover.node === p.agentNode) lines = [where, "Your agent is here"];
      else {
        const path = pathTo(p.agentNode, hover.node);
        if (path) {
          const steps = path.length;
          const cost = Math.max(0, steps - (ses.freeWalk ? 1 : 0)) * 2;
          lines = [where, steps === 1 ? (ses.freeWalk ? "WALK — free" : "CAB — $2") : `CAB ${steps} blocks — $${cost}`];
          if (p.tickets > 0) lines.push("(or use a ticket)");
          if (cost > p.money) lines = [where, `Too far — need $${cost}`, p.tickets > 0 ? "use a ticket!" : "no tickets left"];
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
    // corners take priority over billboards: moving is the primary decision,
    // and a stand near a destination must never steal its click
    for (const n of MAP.nodes) {
      const pos = vp(nodePos(n.id));
      if ((x - pos.x) ** 2 + (y - pos.y) ** 2 <= 19 ** 2) return { node: n.id, x, y };
    }
    const XH = vp(XPOS);
    if ((x - XH.x) ** 2 + (y - XH.y) ** 2 <= 16 ** 2) return { node: "X", x, y };
    for (const t of s.mapSlots) {
      if (t.takenBy !== null) continue;
      const pos = vp(slotPos(t));
      if (Math.abs(x - pos.x) <= 28 && Math.abs(y - pos.y) <= 20) return { slot: t, x, y };
    }
    return { x, y };
  }

  function attach(cv, isInteractive, actionCb) {
    canvas = cv;
    ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    interactive = isInteractive;
    onAction = actionCb;
    kbFocus = null;
    cv.width = CW; cv.height = CH;
    if (!base) buildCity();
    if (!baseTilt) buildTiltBase();
    cv.onclick = (ev) => {
      const h = hit(ev);
      kbFocus = null; // the mouse takes over: drop the keyboard ring
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

  function setKbFocus(f) { kbFocus = f; }

  return { attach, nodePos: viewPos, slotPos, pathTo, queueMove, CW, CH, setKbFocus };
})();
