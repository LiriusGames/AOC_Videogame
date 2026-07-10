// ============================================================================
// AGE OF COMICS — loc-art: the six action locations as fully drawn, animated
// 16-bit scenes. Everything here is painted in code (no image assets) at a
// low logical resolution and scaled up with image-rendering: pixelated, so
// each location reads as a little LucasArts room instead of a colored panel.
// ============================================================================
"use strict";

const LocArt = (() => {
  const W = 168, H = 112;
  const INK = "#221d16";

  let g = null; // ctx of the canvas currently being painted
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x | 0, y | 0, w | 0, h | 0); };
  const box = (x, y, w, h, fill) => { R(x - 1, y - 1, w + 2, h + 2, INK); R(x, y, w, h, fill); };

  // ------------------------------------------------------------ shared bits
  function plankFloor(y0, c1, c2) {
    R(0, y0, W, H - y0, c1);
    for (let y = y0 + 6; y < H; y += 8) R(0, y, W, 1, c2);
    for (let i = 0; i < 9; i++) R((i * 41) % W, y0 + 2 + ((i * 17) % (H - y0 - 8)), 1, 6, c2);
    R(0, y0, W, 1, INK);
  }
  function checkerFloor(y0, c1, c2) {
    R(0, y0, W, H - y0, c1);
    for (let y = y0; y < H; y += 6)
      for (let x = (((y - y0) / 6) % 2) * 6; x < W; x += 12) R(x, y, 6, 6, c2);
    R(0, y0, W, 1, INK);
  }
  function windowPane(x, y, w, h, night) {
    box(x, y, w, h, night ? "#1c2340" : "#8fc0dd");
    g.fillStyle = night ? "#0e1226" : "#5d87a8";
    for (let i = 2; i < w - 4; i += 7) {
      const yt = y + h - 9 - ((i * 13) % 10);
      g.fillRect(x + i, yt, 5, y + h - yt); // skyline stops at the sill
    }
    if (night) {
      g.fillStyle = "#f5c86e";
      for (let i = 4; i < w - 2; i += 9) g.fillRect(x + i, y + h - 6 - ((i * 7) % 8), 1, 1);
    }
    R(x + (w >> 1), y, 1, h, INK);
    R(x, y + (h >> 1), w, 1, INK);
  }
  // a small pixel person. y = feet line. sit: on a chair/stool.
  function guy(x, y, o = {}) {
    const skin = o.skin || "#e8b48c", shirt = o.shirt || "#b5443a",
      pants = o.pants || "#2e3350", hair = o.hair || "#3a2a1c";
    const A = o.armL | 0, B = o.armR | 0;
    // ink backing behind head + torso so figures pop against any wall
    if (o.sit) { R(x - 1, y - 12, 11, 8, INK); R(x, y - 18, 9, 8, INK); }
    else { R(x - 1, y - 16, 12, 10, INK); R(x + 1, y - 22, 9, 8, INK); }
    if (o.sit) {
      R(x + 1, y - 5, 2, 5, pants); R(x + 6, y - 5, 2, 5, pants);
      R(x, y - 11, 9, 6, shirt);
      R(x - 1, y - 10 - A, 2, 5, shirt); R(x + 8, y - 10 - B, 2, 5, shirt);
      R(x + 1, y - 17, 7, 6, skin);
      R(x + 1, y - 18, 7, 2, hair); R(x + 1, y - 16, 1, 2, hair);
    } else {
      const s = o.step ? 2 : 0;
      R(x + 1, y - 7, 2, 7, pants); R(x + 6, y - 7 + (s ? 1 : 0), 2, 7 - s, pants);
      R(x, y - 15, 10, 8, shirt);
      R(x - 2, y - 14 - A, 3, 6, shirt); R(x + 9, y - 14 - B, 3, 6, shirt);
      R(x + 2, y - 21, 7, 6, skin);
      R(x + 2, y - 22, 7, 2, hair); R(x + 2, y - 20, 1, 2, hair);
    }
    const top = o.sit ? y - 18 : y - 22;
    if (o.hat) { R(x + (o.sit ? 0 : 1), top, 9, 2, o.hat); R(x + (o.sit ? 1 : 2), top - 2, 7, 2, o.hat); }
    if (o.visor) { R(x + (o.sit ? 0 : 1), top + 1, 10, 2, o.visor); }
  }

  // ========================================================== TALENT AGENCY
  function drawHire(f) {
    R(0, 0, W, 70, "#3e5f88");
    R(0, 52, W, 18, "#33507a"); R(0, 52, W, 1, INK);
    plankFloor(70, "#7a5231", "#5f3f24");
    // ceiling fan lazily turning (right of the marquee)
    R(139, 0, 2, 6, "#222");
    if (f % 2) { R(126, 6, 28, 2, "#4a3a28"); R(138, 4, 4, 6, "#222"); }
    else { R(132, 3, 16, 2, "#4a3a28"); R(136, 6, 8, 2, "#4a3a28"); R(138, 4, 4, 6, "#222"); }
    // worn rug in front of the bench
    R(12, 84, 52, 16, "#8a3f34"); R(14, 86, 48, 12, "#a34c3e");
    R(16, 88, 44, 1, "#c9973b"); R(16, 95, 44, 1, "#c9973b");
    // framed headshots of the agency's stars
    const heads = [["#e8b48c", "#3a2a1c", "#b5443a"], ["#c98d68", "#181818", "#3f8f7a"],
      ["#e8b48c", "#8a2f22", "#c9973b"], ["#d9a67b", "#553311", "#4a7fb5"]];
    for (let i = 0; i < 4; i++) {
      const x = 11 + i * 19;
      box(x, 20, 13, 16, "#efe6d0");
      R(x + 3, 23, 7, 6, heads[i][0]); R(x + 3, 22, 7, 2, heads[i][1]);
      R(x + 3, 30, 7, 4, heads[i][2]);
      R(x - 1, 37, 15, 2, "#8a6a3c");
    }
    // gold star over the frames
    R(42, 12, 3, 1, "#f5c86e"); R(43, 11, 1, 3, "#f5c86e");
    // potted plant, right corner
    box(154, 62, 9, 8, "#8a4a26");
    R(155, 52, 2, 10, "#2e6b3e"); R(159, 50, 2, 12, "#2e6b3e"); R(152, 55, 3, 5, "#3f8f56");
    // "STARS WANTED" poster over the reception desk
    box(112, 14, 22, 26, "#efe6d0");
    R(121, 18, 3, 1, "#d94f43"); R(122, 17, 1, 3, "#d94f43");
    R(115, 23, 16, 2, "#8a2f22"); R(115, 27, 16, 1, "#9a8f77");
    R(115, 30, 12, 1, "#9a8f77"); R(115, 33, 14, 1, "#9a8f77");
    // reception desk with the agent (drawn first so the desk hides her legs)
    guy(126, 59, { shirt: "#8a5a9e", hair: "#181818", armR: (f % 2) * 2 });
    box(104, 50, 54, 18, "#8a5c33");
    R(102, 47, 58, 3, "#a8743f"); R(102, 46, 58, 1, INK);
    box(128, 41, 15, 5, "#2b2f38");
    R(126 + (f % 2) * 3, 39, 16, 2, "#4a505c"); // typewriter carriage slides
    box(110, 41, 6, 5, "#33333d");
    if (f % 7 < 2) { R(108, 36, 10, 2, "#33333d"); R(107 + (f % 2) * 2, 33, 3, 2, "#f5c86e"); } // the phone rings
    // waiting bench with three hopefuls clutching portfolios
    box(8, 60, 58, 4, "#5f3f24");
    R(11, 64, 2, 8, "#3f2a18"); R(59, 64, 2, 8, "#3f2a18");
    guy(13, 70, { sit: true, shirt: "#3f8f7a", hair: "#8a2f22", skin: "#efc7a0" });
    guy(30, 70, { sit: true, shirt: "#c9973b", hair: "#181818", skin: "#c98d68", armR: f % 4 < 2 ? 3 : 0 });
    guy(47, 70, { sit: true, shirt: "#4a7fb5", hair: "#553311", hat: "#6b4a2a" });
    if (f % 2) R(15, 71, 3, 1, "#181818"); // nervous foot tap
    box(66, 66, 11, 7, "#6b4a2a"); R(70, 68, 3, 1, "#f5c86e"); // portfolio case
  }

  // =========================================================== WRITERS' ROOM
  function drawDevelop(f) {
    R(0, 0, W, 68, "#5b4370");
    R(0, 48, W, 20, "#4b3560"); R(0, 48, W, 1, INK);
    plankFloor(68, "#6b4a2c", "#523822");
    // corkboard with pinned story pages (one flutters)
    box(10, 12, 56, 30, "#a67c48");
    R(13, 15, 50, 24, "#8a6238");
    for (let i = 0; i < 4; i++) {
      const fl = i === 3 && f % 2 ? 1 : 0;
      R(16 + i * 12 + fl, 18, 9, 12, "#efe6d0");
      for (let l = 0; l < 3; l++) R(17 + i * 12 + fl, 21 + l * 3, 7, 1, "#9a8f77");
      R(19 + i * 12 + fl, 17, 2, 2, "#d94f43");
    }
    windowPane(122, 12, 36, 28, true);
    // writer's desk: typewriter, page, banker's lamp with flickering glow
    guy(26, 66, { sit: true, shirt: "#b5443a", armL: (f % 2) * 2, armR: ((f + 1) % 2) * 2 });
    box(14, 50, 48, 16, "#8a5c33");
    R(12, 47, 52, 3, "#a8743f"); R(12, 46, 52, 1, INK);
    R(33, 34, 8, 8, "#efe6d0");
    box(30, 41, 14, 5, "#2b2f38");
    if (f % 9 !== 4) { R(48, 42, 12, 2, "rgba(245,200,110,.4)"); R(46, 44, 16, 3, "rgba(245,200,110,.25)"); }
    R(50, 37, 8, 3, "#2e5d43"); R(53, 40, 2, 7, "#181818");
    // artist's drafting board, sketch strokes appearing line by line
    guy(122, 66, { sit: true, shirt: "#3f8f7a", hair: "#8a2f22", armR: (f % 2) * 3 });
    box(100, 52, 44, 14, "#8a5c33");
    R(98, 49, 48, 3, "#a8743f"); R(98, 48, 48, 1, INK);
    box(103, 34, 22, 15, "#efe6d0");
    for (let k = 0; k <= f % 4; k++) R(106 + k * 2, 37 + k * 3, 12 - k * 2, 1, "#4a505c");
    // crumpled drafts on the floor, a stack of finished pages
    R(72, 76, 4, 3, "#efe6d0"); R(66, 86, 3, 3, "#ddd0b0"); R(80, 92, 4, 3, "#efe6d0");
    box(80, 58, 12, 8, "#efe6d0");
    R(82, 60, 8, 1, "#9a8f77"); R(82, 63, 8, 1, "#9a8f77");
    // reference shelf between corkboard and window
    box(72, 16, 24, 26, "#5a4028");
    R(74, 22, 20, 1, "#3d2a18"); R(74, 32, 20, 1, "#3d2a18");
    const sp = ["#8a2f22", "#3f8f7a", "#c9973b", "#4a7fb5", "#8a5a9e"];
    for (let i = 0; i < 5; i++) { R(75 + i * 4, 17, 3, 5, sp[i]); R(75 + i * 4, 24, 3, 8, sp[(i + 2) % 5]); }
    for (let i = 0; i < 4; i++) R(76 + i * 5, 34, 4, 8, sp[(i + 3) % 5]);
    // the office cat, asleep by the artist's desk (tail flicks)
    R(88, 92, 12, 5, "#3a3a42"); R(97, 89, 5, 5, "#3a3a42");
    R(98, 90, 1, 1, "#efe6d0");
    R(86 - (f % 2) * 2, 93, 3 + (f % 2) * 2, 2, "#3a3a42");
  }

  // ============================================================ CAFE BIZARRE
  function drawIdeas(f) {
    R(0, 0, W, 66, "#31584f");
    checkerFloor(66, "#cfc4a6", "#47423a");
    // hanging pendant lamps
    for (const lx of [40, 96]) {
      R(lx, 0, 1, 9, "#181818");
      box(lx - 3, 9, 7, 4, "#c9973b");
      R(lx - 2, 13, 5, 2, "rgba(245,200,110,.5)");
    }
    // back bar: shelf of bottles, espresso machine puffing steam
    R(10, 20, 58, 2, "#4a3018");
    const bots = ["#8a2f22", "#3f8f7a", "#c9973b", "#4a7fb5", "#8a5a9e", "#b5443a"];
    for (let i = 0; i < 6; i++) { R(14 + i * 9, 12, 4, 8, bots[i]); R(15 + i * 9, 10, 2, 2, bots[i]); }
    guy(34, 56, { shirt: "#efe6d0", hat: "#efe6d0", hair: "#181818" }); // barista (bar hides the rest)
    box(8, 40, 62, 26, "#5f3f24");
    R(6, 37, 66, 3, "#7a5231"); R(6, 36, 66, 1, INK);
    box(50, 28, 14, 8, "#9aa3ad"); R(52, 30, 3, 3, "#d94f43");
    for (let k = 0; k < 2; k++) R(57 + ((f + k) % 3), 24 - ((f + k * 2) % 4) * 2, 2, 2, "#e8ebee");
    // window with a flickering neon star
    windowPane(128, 12, 32, 26, true);
    if (f % 5 !== 3) {
      R(139, 24, 11, 1, "#ff6f9d"); R(144, 19, 1, 11, "#ff6f9d");
      R(141, 21, 1, 1, "#ff6f9d"); R(147, 21, 1, 1, "#ff6f9d");
      R(141, 27, 1, 1, "#ff6f9d"); R(147, 27, 1, 1, "#ff6f9d");
    }
    // cafe table: two regulars arguing over steaming coffee...
    guy(76, 76, { sit: true, shirt: "#8a5a9e", skin: "#efc7a0", armR: f % 3 === 1 ? 4 : 0 });
    guy(112, 76, { sit: true, shirt: "#c9973b", hair: "#553311", skin: "#c98d68" });
    R(97, 58, 2, 16, "#3a3f4a");
    R(88, 55, 20, 2, "#7a5231"); box(86, 56, 24, 3, "#8a5c33");
    R(92, 51, 3, 4, "#efe6d0"); R(102, 51, 3, 4, "#efe6d0");
    R(93, 47 - (f % 3), 1, 2, "#cfe3dd"); R(103, 46 - ((f + 1) % 3), 1, 2, "#cfe3dd");
    // ...and the idea striking (blinking bulb)
    if (f % 4 < 2) {
      R(77, 48, 3, 4, "#ffe38a"); R(78, 47, 1, 1, "#fff");
      R(74, 49, 1, 1, "#ffe38a"); R(82, 49, 1, 1, "#ffe38a"); R(78, 44, 1, 1, "#ffe38a");
    }
    // cake stand on the bar + framed jazz poster
    R(24, 30, 12, 2, "#d8cdb4"); R(29, 32, 2, 4, "#d8cdb4");
    R(26, 26, 8, 4, "#e5977a"); R(26, 25, 8, 1, "#d94f43");
    box(84, 14, 16, 20, "#efe6d0");
    R(87, 17, 10, 10, "#221d16"); R(90, 19, 3, 6, "#c9973b"); R(93, 21, 2, 2, "#c9973b");
    R(87, 29, 10, 2, "#8a2f22");
  }

  // ============================================================= PRINT FLOOR
  function drawPrint(f) {
    R(0, 0, W, 64, "#5a332c");
    for (let y = 6; y < 64; y += 7) R(0, y, W, 1, "#48261f");
    for (let y = 6, r = 0; y < 64; y += 7, r++)
      for (let x = (r % 2) * 8; x < W; x += 16) R(x, y, 1, 7, "#48261f");
    R(0, 64, W, H - 64, "#6d675b"); R(0, 64, W, 1, INK);
    R(20, 90, 10, 3, "#5c564b"); R(120, 100, 14, 3, "#5c564b"); // floor stains
    // steam huffs out of the old press
    if (f % 3 === 0) { R(30, 18, 4, 3, "#cfd2d6"); R(34, 13, 3, 3, "#e2e5e8"); }
    // the press: big steel body with two rotating drums
    box(14, 26, 84, 44, "#464e5e");
    R(14, 26, 84, 3, "#5a6478");
    R(16, 62, 80, 6, "#353b48");
    drum(40, 46, 11, f); drum(68, 46, 11, f + 2);
    // gearbox: a little gear ticking back and forth
    box(84, 32, 10, 10, "#2b2f38");
    if (f % 2) { R(88, 33, 2, 8, "#7d8595"); R(85, 36, 8, 2, "#7d8595"); }
    else { for (let k = 0; k < 5; k++) { R(85 + k, 33 + k, 2, 2, "#7d8595"); R(91 - k, 33 + k, 2, 2, "#7d8595"); } }
    // one continuous paper web running over the drums into the pile
    R(4, 31, 24, 3, "#efe6d0"); R(26, 33, 58, 3, "#efe6d0");
    R(82, 37, 30, 3, "#efe6d0"); R(110, 41, 12, 3, "#efe6d0"); R(118, 44, 4, 10, "#efe6d0");
    g.fillStyle = "#c9b98f";
    for (let x = 6 + (f % 3) * 2; x < 82; x += 6) g.fillRect(x, x < 26 ? 32 : 34, 2, 1);
    for (let x = 84 + (f % 3) * 2; x < 110; x += 6) g.fillRect(x, 38, 2, 1);
    // fresh comics landing on the pile
    box(120, 56, 24, 12, "#efe6d0");
    R(120, 56, 24, 2, "#d94f43"); R(120, 60, 24, 2, "#4a7fb5"); R(120, 64, 24, 2, "#c9973b");
    if (f % 2) R(118, 51, 26, 3, "#fff");
    // pressman working the lever
    if (f % 2) R(104, 34, 2, 12, "#8a2f22"); else R(100, 42, 8, 2, "#8a2f22");
    R(103, 44, 4, 3, "#2b2f38");
    guy(106, 84, { shirt: "#4a7fb5", hat: "#3a3f4a", armR: (f % 2) * 5 });
    // ink drums
    box(8, 86, 13, 18, "#b5443a"); R(11, 90, 7, 2, "#efe6d0");
    box(24, 90, 13, 14, "#2e4f8f"); R(27, 94, 7, 2, "#efe6d0");
    // hanging work lamps with light cones
    for (const lx of [40, 120]) {
      R(lx, 0, 1, 7, "#222"); box(lx - 4, 7, 9, 4, "#2b2f38");
      R(lx - 3, 11, 7, 2, "rgba(245,220,150,.4)"); R(lx - 5, 13, 11, 3, "rgba(245,220,150,.22)");
    }
    // sparks off the gearbox now and then
    if (f % 5 === 0) { R(95, 40, 2, 2, "#ffd75e"); R(99, 44, 1, 1, "#fff"); R(93, 46, 1, 1, "#ffd75e"); }
    // steam pipe along the brick wall
    R(0, 20, 14, 3, "#6e747c"); R(12, 20, 3, 46, "#6e747c"); R(11, 30, 5, 2, "#5a606a");
  }
  function drum(cx, cy, r, f) {
    // octagonal drum with an ink rim so it reads as a roller, not a box
    R(cx - r - 1, cy - r + 2, 2 * r + 2, 2 * r - 4, INK);
    R(cx - r + 2, cy - r - 1, 2 * r - 4, 2 * r + 2, INK);
    R(cx - r + 1, cy - r + 1, 2 * r - 2, 2 * r - 2, INK);
    R(cx - r + 1, cy - r + 3, 2 * r - 2, 2 * r - 6, "#8d97a8");
    R(cx - r + 3, cy - r + 1, 2 * r - 6, 2 * r - 2, "#8d97a8");
    R(cx - r + 3, cy - r + 1, 2 * r - 6, 3, "#aab4c4");
    const t = [[0, -r + 4], [r - 5, 0], [0, r - 5], [-r + 4, 0]][f % 4];
    R(cx + t[0] - 1, cy + t[1] - 1, 3, 3, "#222831");
    R(cx - 1, cy - 1, 3, 3, INK);
  }

  // ============================================================== ACCOUNTING
  function drawRoyalties(f) {
    R(0, 0, W, 66, "#75592a");
    R(0, 46, W, 20, "#5f4820"); R(0, 46, W, 1, INK);
    R(0, 66, W, H - 66, "#9a927e");
    for (let i = 0; i < 12; i++) R((i * 29) % W, 68 + ((i * 19) % 40), 2, 1, "#857e6c");
    R(0, 66, W, 1, INK);
    // wall clock, minute hand ticking round
    box(78, 12, 16, 16, "#efe6d0");
    R(80, 14, 12, 12, "#ddd2b8");
    const hand = [[0, -4], [4, 0], [0, 4], [-4, 0]][f % 4];
    R(86, 20, 1, 1, INK); R(86 + hand[0], 20 + hand[1], 1, 1, INK);
    R(86, 16, 1, 1, "#8a6a3c"); R(86, 24, 1, 1, "#8a6a3c"); R(82, 20, 1, 1, "#8a6a3c"); R(90, 20, 1, 1, "#8a6a3c");
    // framed dollar
    box(16, 14, 14, 16, "#efe6d0");
    R(20, 17, 6, 2, "#3f8f7a"); R(20, 21, 6, 2, "#3f8f7a"); R(20, 25, 6, 2, "#3f8f7a");
    R(20, 19, 2, 2, "#3f8f7a"); R(24, 23, 2, 2, "#3f8f7a"); R(22, 15, 2, 13, "#3f8f7a");
    // the office safe
    box(10, 42, 30, 30, "#4a4f5a");
    R(12, 44, 26, 26, "#565c68");
    box(21, 52, 7, 7, "#2b2f38");
    const dial = [[3, 1], [5, 3], [3, 5], [1, 3]][f % 4];
    R(21 + dial[0], 52 + dial[1], 1, 1, "#c9c9c9");
    R(32, 54, 4, 3, "#c9c9c9");
    // money sack
    R(48, 60, 10, 10, "#8a6a3c"); R(50, 58, 6, 3, "#8a6a3c"); R(51, 56, 4, 2, "#6b4f2a");
    R(52, 63, 2, 4, "#3f8f7a");
    // teller counter: the accountant, coin stacks, the big brass register
    guy(110, 58, { shirt: "#efe6d0", visor: "#3f8f7a", hair: "#553311" });
    box(64, 48, 96, 20, "#6b4a2a");
    R(62, 45, 100, 3, "#d8cdb4"); R(62, 44, 100, 1, INK);
    for (let i = 0; i < 4; i++) {
      const hgt = [3, 5, 2, 4][i];
      for (let k = 0; k < hgt; k++) { R(70 + i * 10, 42 - k * 3, 8, 2, "#f5c86e"); R(70 + i * 10, 43 - k * 3, 8, 1, "#c9973b"); }
    }
    R(76, 22 + (f % 3) * 6, 6, 2, "#f5c86e"); // a coin drops onto the stack
    box(122, 28, 26, 17, "#c9973b");
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) R(126 + c * 5, 32 + r * 5, 3, 3, "#efe6d0");
    R(149, 32, 3, 7, "#8a6a1c");
    if (f % 6 < 2) {
      box(124, 46, 24, 4, "#8a6a1c"); R(128, 47, 4, 2, "#f5c86e"); R(136, 47, 4, 2, "#f5c86e"); // drawer pops
      box(128, 20, 12, 7, "#efe6d0"); R(132, 21, 2, 5, "#3f8f7a"); R(130, 22, 6, 1, "#3f8f7a"); // $ flag
    }
    // stock ticker chattering out tape by the safe
    box(46, 34, 12, 8, "#3a3f4a"); R(49, 30, 6, 4, "#c9c9c9");
    R(51, 42, 3, 10 + (f % 4) * 3, "#efe6d0");
    R(51, 46 + (f % 4) * 3, 4, 2, "#e0d6ba");
    // wall sconces
    for (const sx of [58, 110]) { R(sx, 18, 3, 5, "#8a6a1c"); R(sx - 1, 15, 5, 3, f % 9 === 4 ? "#8a7a4a" : "#ffe38a"); }
  }

  // =============================================================== NEWSSTAND
  function drawSales(f) {
    R(0, 0, W, 26, "#7fb2d4");
    const cx = ((f * 2) % (W + 40)) - 20;
    R(cx, 7, 16, 4, "#eef4f8"); R(cx + 4, 5, 10, 3, "#fff");
    R(cx - 60 + W / 2, 14, 12, 3, "#e4edf3");
    // brownstone block
    R(0, 26, W, 40, "#8a5643"); R(0, 26, W, 1, INK);
    for (let r = 0; r < 2; r++)
      for (let x = 8; x < W - 10; x += 22) {
        const lit = (x * 7 + r * 5) % 3 === 0;
        box(x, 30 + r * 16, 10, 11, lit ? "#f5c86e" : "#2c3550");
        R(x, 42 + r * 16, 10, 1, "#6d4334");
      }
    R(0, 62, W, 3, "#6d4334"); R(0, 65, W, 1, INK);
    // sidewalk, curb, asphalt
    R(0, 66, W, 30, "#a09a8a");
    for (let x = 20; x < W; x += 26) R(x, 66, 1, 30, "#7f7a6c");
    R(0, 66, W, 1, INK);
    R(0, 96, W, 3, "#6d675b"); R(0, 99, W, 13, "#3c3f46");
    R(30, 104, 12, 2, "#565961"); R(90, 106, 12, 2, "#565961");
    // fire hydrant + lamppost
    box(18, 86, 8, 9, "#b5443a"); R(20, 83, 4, 3, "#b5443a"); R(16, 88, 2, 3, "#b5443a"); R(26, 88, 2, 3, "#b5443a");
    R(148, 48, 2, 46, "#2b2f38"); box(144, 42, 10, 6, "#2b2f38"); R(146, 44, 6, 2, "#f5c86e");
    // the newsstand: striped awning, vendor, racks bursting with comics
    box(58, 44, 54, 42, "#3f6f4f");
    for (let i = 0; i < 8; i++) {
      R(54 + i * 8, 37, 8, 7, i % 2 ? "#d94f43" : "#efe6d0");
      R(54 + i * 8, 44 + (f % 2 && i % 2 ? 1 : 0), 8, 2, i % 2 ? "#a83730" : "#cfc4a6"); // hem flaps
    }
    R(54, 36, 62, 1, INK);
    R(62, 50, 46, 15, "#1d232e");
    R(80, 53, 7, 6, "#e8b48c"); R(80, 52, 7, 2, "#3a2a1c"); R(78, 59, 11, 6, "#c9973b"); // the vendor
    const covers = ["#d94f43", "#4a7fb5", "#c9973b", "#3f8f7a", "#8a5a9e", "#b5443a"];
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 5; c++) {
        R(63 + c * 9, 68 + r * 9, 7, 7, covers[(r * 5 + c) % 6]);
        R(64 + c * 9, 69 + r * 9, 2, 5, "#efe6d0");
      }
    // readers stroll past both ways; a pigeon works the curb
    const wx = ((f * 4) % (W + 30)) - 15;
    guy(wx, 94, { step: f % 2, shirt: "#4a7fb5", hat: "#2b2f38" });
    const wx2 = W + 15 - ((f * 3) % (W + 30));
    guy(wx2, 92, { step: (f + 1) % 2, shirt: "#8a5a9e", skin: "#c98d68", hair: "#181818" });
    const px0 = 132 + (f % 4 < 2 ? 0 : 3);
    R(px0, 92, 4, 3, "#9aa3ad"); R(px0 + 4, 91 + (f % 5 === 0 ? 2 : 0), 2, 2, "#9aa3ad");
    // a checker cab rattles down the avenue
    const cx2 = ((f * 7) % (W + 60)) - 30;
    R(cx2, 102, 22, 7, "#e8b93c"); R(cx2 + 5, 98, 12, 5, "#f2d06b");
    R(cx2 + 6, 99, 4, 3, "#333"); R(cx2 + 12, 99, 4, 3, "#333");
    R(cx2 + 3, 108, 4, 3, "#222"); R(cx2 + 15, 108, 4, 3, "#222");
    for (let k = 0; k < 5; k++) R(cx2 + 2 + k * 4, 102, 2, 2, k % 2 ? "#221d16" : "#efe6d0");
  }

  const PAINTERS = {
    hire: drawHire, develop: drawDevelop, ideas: drawIdeas,
    print: drawPrint, royalties: drawRoyalties, sales: drawSales,
  };

  // ============================================= SPECIAL-ACTION VIGNETTES
  // small explanatory pictograms for the six cube specials (84x56)
  const heartPx = (x, y, c) => {
    R(x, y, 5, 4, c); R(x + 7, y, 5, 4, c); R(x, y + 4, 12, 4, c);
    R(x + 2, y + 8, 8, 3, c); R(x + 4, y + 11, 4, 2, c);
  };
  const bulbPx = (x, y, on) => {
    R(x, y, 8, 9, on ? "#ffe38a" : "#8a7a4a"); R(x + 2, y - 2, 4, 2, on ? "#fff2c0" : "#8a7a4a");
    R(x + 2, y + 9, 4, 2, "#9aa3ad"); R(x + 2, y + 11, 4, 1, "#6e747c");
    if (on) { R(x - 3, y + 2, 2, 1, "#ffe38a"); R(x + 9, y + 2, 2, 1, "#ffe38a"); R(x + 3, y - 5, 2, 2, "#ffe38a"); }
  };
  const headPx = (x, y, skin, hair, shirt) => {
    R(x, y + 10, 14, 8, INK); R(x + 1, y + 11, 12, 7, shirt);
    R(x + 2, y - 1, 10, 12, INK); R(x + 3, y, 8, 10, skin); R(x + 3, y - 1, 8, 3, hair);
  };
  const arrowR = (x, y, w, c) => { R(x, y, w, 2, c); R(x + w - 3, y - 2, 2, 2, c); R(x + w - 3, y + 2, 2, 2, c); R(x + w - 1, y - 1, 2, 4, c); };
  const arrowL = (x, y, w, c) => { R(x, y, w, 2, c); R(x + 1, y - 2, 2, 2, c); R(x + 1, y + 2, 2, 2, c); R(x - 1, y - 1, 2, 4, c); };

  const SPECIAL_P = {
    reassign(f) { // two creatives trade places
      R(0, 0, 84, 56, "#31435e");
      headPx(12, 18, "#e8b48c", "#3a2a1c", "#b5443a");
      headPx(58, 18, "#c98d68", "#181818", "#3f8f7a");
      arrowR(28, 10, 26, f % 2 ? "#f5c86e" : "#c9973b");
      arrowL(28, 44, 26, f % 2 ? "#c9973b" : "#f5c86e");
    },
    hype(f) { // spotlights on a comic before it even exists
      R(0, 0, 84, 56, "#3a2b4d");
      g.fillStyle = `rgba(245,200,110,${f % 2 ? 0.32 : 0.2})`;
      for (let k = 0; k < 5; k++) { g.fillRect(8 + k * 5, k * 6, 10, 6); g.fillRect(66 - k * 5, k * 6, 10, 6); }
      box(34, 13, 16, 24, "#efe6d0");
      R(36, 15, 12, 4, "#d94f43"); R(36, 21, 12, 10, "#c9973b"); R(38, 23, 5, 5, "#e8b48c");
      const tw = f % 2 ? 1 : 0;
      R(26 - tw, 10, 3, 1, "#fff"); R(27 - tw, 9, 1, 3, "#fff");
      R(56 + tw, 30, 3, 1, "#fff"); R(57 + tw, 29, 1, 3, "#fff");
      for (let k = 0; k < 5; k++) headPx(6 + k * 15, 42, k % 2 ? "#e8b48c" : "#c98d68", k % 3 ? "#181818" : "#553311", ["#b5443a", "#3f8f7a", "#c9973b", "#4a7fb5", "#8a5a9e"][k]);
    },
    ideasconv(f) { // ideas become fans, word of mouth
      R(0, 0, 84, 56, "#2e4f47");
      bulbPx(14, 16, f % 2 === 0);
      arrowR(32, 24, 18, "#efe6d0");
      heartPx(58, 18, f % 2 ? "#d94f43" : "#b5443a");
      if (f % 2) { R(54, 14, 2, 2, "#fff"); R(72, 32, 2, 2, "#fff"); }
    },
    bettercolor(f) { // half the cover bursts into color under the brush
      R(0, 0, 84, 56, "#4a2a2a");
      box(18, 8, 30, 40, "#efe6d0");
      for (let r = 0; r < 8; r++) {
        R(20, 11 + r * 4.4, 12, 3, ["#9a9a9a", "#b5b5b5", "#8a8a8a"][r % 3]);
        R(33, 11 + r * 4.4, 13, 3, ["#d94f43", "#4a7fb5", "#f5c86e", "#3f8f7a", "#8a5a9e"][r % 5]);
      }
      const bob = f % 2 ? 2 : 0;
      R(56, 12 + bob, 4, 16, "#8a5c33"); R(55, 28 + bob, 6, 4, "#9aa3ad"); R(54, 32 + bob, 8, 6, "#3a2a1c");
      if (f % 2) { R(50, 40, 3, 3, "#4ac0dd"); R(60, 44, 2, 2, "#d94f43"); }
    },
    marketing(f) { // the megaphone buys hearts
      R(0, 0, 84, 56, "#54422a");
      R(10, 26, 6, 8, "#8a2f22"); R(16, 22, 8, 16, "#b5443a"); R(24, 17, 9, 26, "#d94f43");
      R(33, 14, 3, 32, "#efe6d0");
      R(14, 34, 4, 10, "#6b4a2a");
      for (let k = 0; k < 3; k++)
        if ((f + k) % 3 !== 2) R(40 + k * 8, 22 - k * 3, 2, 16 + k * 6, "rgba(255,255,255,.55)");
      heartPx(64, 12 + (f % 2 ? -1 : 0), "#d94f43");
      R(66, 34, 8, 8, INK); R(67, 35, 6, 6, "#f5c86e"); R(69, 36, 2, 4, "#8a6a1c");
    },
    extraeditor(f) { // one more meeple clocks in, coffee in hand
      R(0, 0, 84, 56, "#2f3d55");
      R(24, 8, 12, 10, INK); R(26, 9, 8, 8, "#efe6d0");           // meeple head
      R(18, 18, 24, 6, INK); R(20, 19, 20, 5, "#efe6d0");          // arms
      R(22, 24, 16, 18, INK); R(24, 25, 12, 16, "#efe6d0");        // body
      R(48, 16, 12, 2, "#f5c86e"); R(53, 11, 2, 12, "#f5c86e");    // +
      R(66, 11, 4, 16, "#f5c86e"); R(64, 13, 2, 3, "#f5c86e");     // 1
      box(52, 36, 14, 11, "#efe6d0"); R(66, 38, 4, 5, "#efe6d0");  // coffee
      R(55, 38, 8, 3, "#6b4a2a");
      R(56 + (f % 2), 30 - (f % 3), 2, 3, "rgba(240,240,240,.7)"); // steam
    },
  };

  // ------------------------------------------------------- animation ticker
  const live = new Map(); // canvas -> painter fn
  let frame = 0, timer = null;

  function draw(cv, painter) {
    g = cv.getContext("2d");
    g.clearRect(0, 0, cv.width, cv.height);
    painter(frame);
    // soft vignette frame on the big room scenes
    if (cv.width === W) {
      g.fillStyle = "rgba(0,0,0,.22)";
      g.fillRect(0, 0, W, 2); g.fillRect(0, 0, 2, H); g.fillRect(W - 2, 0, 2, H); g.fillRect(0, H - 2, W, 2);
    }
  }
  function start(cv, painter) {
    live.set(cv, painter);
    draw(cv, painter);
    if (!timer) timer = setInterval(tick, 240);
  }
  function tick() {
    frame++;
    let any = false;
    for (const [cv, painter] of live) {
      if (!cv.isConnected) { live.delete(cv); continue; }
      any = true;
      draw(cv, painter);
    }
    if (!any) { clearInterval(timer); timer = null; }
  }
  function attach(cv, action) {
    cv.width = W; cv.height = H;
    start(cv, PAINTERS[action]);
  }
  function attachSpecial(cv, key) {
    cv.width = 84; cv.height = 56;
    if (SPECIAL_P[key]) start(cv, SPECIAL_P[key]);
  }

  return { attach, attachSpecial };
})();
