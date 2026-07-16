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

  // ===================================================== HI-DETAIL (2x) ROOMS
  // Selected rooms repainted at twice the logical resolution (336x224) for the
  // richness of a proper adventure-game background. Composition, props, palette
  // and every animation beat are the 1x scene's, with all coordinates doubled;
  // only the rendering gains shading ramps, materials, dithering and hand-AA.
  const HDW = 336, HDH = 224;

  const P1 = (x, y, c) => R(x, y, 1, 1, c); // one deliberate pixel
  const SH = (x, y, w, h, a) => { g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(x, y, w, h); };
  const GLOW = (x, y, w, h, a) => { g.fillStyle = `rgba(245,200,110,${a})`; g.fillRect(x, y, w, h); };
  const COOL = (x, y, w, h, a) => { g.fillStyle = `rgba(150,180,230,${a})`; g.fillRect(x, y, w, h); };
  // shade a hex color: k<1 pulls toward black, k>1 toward white
  function tone(c, k) {
    const n = parseInt(c.slice(1), 16);
    let r = (n >> 16) & 255, gr = (n >> 8) & 255, b = n & 255;
    if (k <= 1) { r *= k; gr *= k; b *= k; }
    else { const t = Math.min(k - 1, 1); r += (255 - r) * t; gr += (255 - gr) * t; b += (255 - b) * t; }
    return `rgb(${r | 0},${gr | 0},${b | 0})`;
  }
  // ordered 50% dither, for gradient hand-offs that stay pixel-art
  function dith(x, y, w, h, c, ph = 0) {
    g.fillStyle = c;
    for (let yy = 0; yy < h; yy++)
      for (let xx = (yy + ph) & 1; xx < w; xx += 2) g.fillRect(x + xx, y + yy, 1, 1);
  }

  // the 2x person painter: guy()'s exact skeleton with every coordinate doubled,
  // plus shaded cloth, hands, shoes, a face and a hairline. Arm lifts (armL/armR)
  // are given in 2x pixels, i.e. double the 1x values.
  function hguy(x, y, o = {}) {
    const skin = o.skin || "#e8b48c", shirt = o.shirt || "#b5443a",
      pants = o.pants || "#2e3350", hair = o.hair || "#3a2a1c";
    const A = o.armL | 0, B = o.armR | 0, fc = o.face | 0;
    const shD = tone(shirt, .74), shL = tone(shirt, 1.14);
    const skD = tone(skin, .78), skL = tone(skin, 1.12);
    const pnD = tone(pants, .7);
    if (o.sit) { R(x - 2, y - 24, 22, 16, INK); R(x, y - 36, 18, 16, INK); }
    else { R(x - 2, y - 32, 24, 20, INK); R(x + 2, y - 44, 18, 16, INK); }
    if (o.sit) {
      R(x + 2, y - 10, 4, 10, pants); R(x + 12, y - 10, 4, 10, pants);
      R(x + 5, y - 10, 1, 10, pnD); R(x + 15, y - 10, 1, 10, pnD);
      R(x + 2, y - 2, 5, 2, "#16130e"); R(x + 12, y - 2, 5, 2, "#16130e");
      R(x, y - 22, 18, 12, shirt);
      R(x + 15, y - 22, 3, 12, shD); R(x, y - 12, 18, 2, shD); R(x + 1, y - 21, 2, 8, shL);
      R(x - 2, y - 20 - A, 4, 10, shirt); R(x - 2, y - 20 - A, 1, 10, shL);
      R(x + 16, y - 20 - B, 4, 10, shirt); R(x + 19, y - 20 - B, 1, 10, shD);
      R(x - 2, y - 13 - A, 4, 3, skin); R(x + 16, y - 13 - B, 4, 3, skin); // hands
      R(x + 2, y - 34, 14, 12, skin);
      R(x + 14, y - 34, 2, 12, skD); R(x + 2, y - 25, 14, 3, skD); R(x + 3, y - 33, 2, 6, skL);
      const ex = x + 6 + fc; // a one-px glance keeps both eyes clear of fringe/shade
      R(ex, y - 30, 2, 2, "#2b2018"); R(ex + 6, y - 30, 2, 2, "#2b2018");
      R(ex + 1, y - 26, 5, 1, tone(skin, .62));
      R(x + 2, y - 36, 14, 4, hair); R(x + 2, y - 32, 2, 4, hair); R(x + 15, y - 33, 1, 3, hair);
      R(x + 5, y - 35, 7, 1, tone(hair, 1.5));
    } else {
      const s = o.step ? 4 : 0;
      R(x + 2, y - 14, 4, 14, pants); R(x + 5, y - 14, 1, 14, pnD);
      const by = y - 14 + (s ? 2 : 0), bh = 14 - s;
      R(x + 12, by, 4, bh, pants);
      R(x + 2, y - 2, 5, 2, "#16130e"); R(x + 12, by + bh - 2, 5, 2, "#16130e");
      R(x, y - 30, 20, 16, shirt);
      R(x + 17, y - 30, 3, 16, shD); R(x, y - 16, 20, 2, shD); R(x + 1, y - 29, 2, 12, shL);
      R(x - 4, y - 28 - A, 6, 12, shirt); R(x - 4, y - 28 - A, 2, 12, shL);
      R(x + 18, y - 28 - B, 6, 12, shirt); R(x + 22, y - 28 - B, 2, 12, shD);
      R(x - 4, y - 19 - A, 6, 3, skin); R(x + 18, y - 19 - B, 6, 3, skin);
      R(x + 4, y - 42, 14, 12, skin);
      R(x + 16, y - 42, 2, 12, skD); R(x + 4, y - 33, 14, 3, skD); R(x + 5, y - 41, 2, 6, skL);
      const ex = x + 8 + fc;
      R(ex, y - 38, 2, 2, "#2b2018"); R(ex + 6, y - 38, 2, 2, "#2b2018");
      R(ex + 1, y - 34, 5, 1, tone(skin, .62));
      R(x + 4, y - 44, 14, 4, hair); R(x + 4, y - 40, 2, 4, hair); R(x + 17, y - 41, 1, 3, hair);
      R(x + 7, y - 43, 7, 1, tone(hair, 1.5));
    }
    const top = o.sit ? y - 36 : y - 44;
    if (o.hat) {
      R(x + (o.sit ? 0 : 2), top, 18, 4, o.hat);
      R(x + (o.sit ? 2 : 4), top - 4, 14, 4, o.hat);
      R(x + (o.sit ? 2 : 4), top - 1, 14, 1, tone(o.hat, .8)); // crown/brim crease
    }
    if (o.visor) R(x + (o.sit ? 0 : 2), top + 2, 20, 4, o.visor);
  }

  function checkerFloorHD(y0) {
    for (let row = 0, y = y0; y < HDH; y += 12, row++)
      for (let col = 0, x = 0; x < HDW; x += 12, col++) {
        const dark = (row + col) % 2 === 0; // same phase as the 1x floor
        const v = (col * 7 + row * 13) % 4; // deterministic per-tile character
        R(x, y, 12, 12, dark ? ["#47423a", "#4a4540", "#443f37", "#47423a"][v]
          : ["#cfc4a6", "#d3c8ab", "#cabf9f", "#cfc4a6"][v]);
        R(x, y, 12, 1, dark ? "#524c42" : "#dcd2b6"); // raked light on the tile edge
        R(x, y + 11, 12, 1, dark ? "#3b362f" : "#bfb497");
        R(x + 11, y + 1, 1, 10, dark ? "#3f3a33" : "#c4b99b");
        if (v === 2) R(x + 3 + (row % 4), y + 5, 2, 1, dark ? "#524c42" : "#bdb296"); // scuffs
      }
    SH(0, y0, HDW, 8, .14); SH(0, y0 + 8, HDW, 6, .07); // the room falls away at the back
    dith(0, y0 + 14, HDW, 4, "rgba(0,0,0,.06)");
    R(0, y0, HDW, 2, INK);
  }

  // ------------------------------------------------- the café regulars (2x)
  // Two of the publisher's creatives on a coffee break, styled after the game's
  // caricature portrait sheet and sized to the room (~54px/m: seated figures
  // run feet-to-crown ~73px, so the 42px bistro table lands at mid-chest).
  // Same seats and the same animation beats as the pair they replace.
  function cafeWriter(f) {
    const up = f % 3 === 1; // the beat that raised the 1x arm now jabs a point
    // his chair (mostly hidden behind him once he's drawn)
    R(144, 128, 28, 4, "#5c3d1f"); R(144, 128, 28, 1, "#6f4a2b");
    R(146, 132, 3, 20, "#3f2a18"); R(166, 132, 3, 20, "#3f2a18");
    P1(146, 132, "#5c3d1f"); P1(166, 132, "#5c3d1f");
    R(149, 144, 17, 2, "#4a3018"); // stretcher
    // ink backing, hugging the silhouette so it reads as outline, not slab
    R(149, 78, 23, 15, INK); R(152, 90, 21, 13, INK); // head profile
    R(146, 103, 28, 21, INK); R(146, 124, 29, 8, INK); // torso + arms
    if (up) R(173, 77, 8, 25, INK); // the raised arm
    // legs, side-on toward the table
    R(150, 128, 16, 8, "#2e3350"); R(150, 128, 14, 1, "#3a4066");
    R(157, 136, 4, 14, "#262b45"); R(157, 150, 5, 2, "#111318"); // far leg + shoe
    R(162, 136, 5, 16, "#2e3350"); R(165, 136, 2, 16, "#232840");
    R(162, 150, 9, 2, "#16130e"); // near shoe, toe toward the table
    // waistcoat torso, rows stepping forward: he leans into the argument
    R(148, 122, 20, 6, "#8a5a9e"); R(150, 112, 20, 10, "#8a5a9e"); R(152, 105, 20, 7, "#8a5a9e");
    R(148, 126, 20, 2, "#6d477e"); R(148, 122, 2, 6, "#6d477e");
    R(150, 112, 2, 10, "#6d477e"); R(152, 105, 2, 7, "#6d477e"); // his back in shadow
    R(168, 112, 2, 10, "#9f74b2"); R(170, 105, 2, 7, "#9f74b2"); // key light, table side
    R(154, 105, 16, 1, "#a682b8");
    P1(167, 114, "#5c3c6b"); P1(167, 118, "#5c3c6b"); P1(166, 122, "#5c3c6b"); // buttons
    P1(160, 120, "#f5c86e"); P1(162, 121, "#f5c86e"); P1(164, 120, "#f5c86e"); // watch chain
    R(164, 105, 6, 5, "#efe6d0"); // shirt front
    R(165, 107, 3, 3, "#b5443a"); R(169, 107, 3, 3, "#b5443a"); R(168, 108, 2, 2, "#8a2f22"); // bow tie
    // back arm: rolled sleeve, hand on his thigh
    R(148, 108, 6, 12, "#e3d9c0"); R(148, 108, 1, 12, "#cfc4a6");
    R(148, 118, 6, 2, "#cfc4a6"); // rolled cuff
    R(149, 120, 6, 8, "#e3d9c0"); R(150, 127, 5, 4, "#efc7a0");
    // head: slicked side-part, long nose, chin up
    R(158, 96, 7, 9, "#efc7a0"); R(158, 100, 7, 4, "#d1a67d"); // neck under the jaw
    R(150, 79, 20, 5, "#181818"); R(153, 80, 10, 1, "#4d4d4d"); // hair + sheen
    R(150, 84, 5, 14, "#181818"); R(151, 96, 3, 3, "#181818"); // back of the head
    R(155, 84, 14, 16, "#efc7a0"); // face
    R(162, 79, 8, 4, "#181818"); P1(169, 83, "#181818"); // the side-part falls forward
    R(156, 85, 4, 3, "#f7dcbd"); // forehead catch-light
    R(154, 89, 3, 5, "#d1a67d"); P1(155, 91, "#b98a63"); // ear
    R(163, 88, 5, 2, "#2b2018"); // raised brow
    R(165, 91, 3, 2, "#2b2018"); P1(164, 91, "#f7dcbd"); // eye, fixed on his rival
    R(169, 92, 4, 3, "#efc7a0"); R(169, 94, 4, 1, "#c9a077"); P1(172, 92, "#f7dcbd"); // the nose
    P1(168, 95, "#d1a67d"); // cheek line
    if (up) { R(166, 96, 4, 3, "#69392f"); P1(167, 96, "#e8dcc0"); } // mid-rant
    else R(166, 97, 5, 1, "#b9805e"); // ...lips pressed between points
    R(165, 99, 5, 2, "#efc7a0"); P1(169, 100, "#efc7a0"); // the chin juts
    R(164, 101, 6, 4, "#efe6d0"); // shirt collar rises to meet the chin
    // front arm: jabs the point home on the beat
    if (up) {
      R(167, 100, 5, 6, "#efe6d0"); R(170, 97, 6, 5, "#efe6d0"); // shoulder + elbow
      R(174, 86, 5, 12, "#efe6d0"); R(174, 86, 1, 12, "#f8f1de"); R(174, 96, 5, 2, "#cfc4a6");
      R(174, 80, 5, 6, "#efc7a0"); // open palm, fingers spread
      P1(174, 78, "#efc7a0"); P1(176, 78, "#efc7a0"); P1(178, 83, "#efc7a0");
    } else {
      R(167, 107, 5, 9, "#efe6d0"); R(171, 107, 1, 9, "#cfc4a6");
      R(167, 116, 6, 2, "#cfc4a6"); R(167, 118, 6, 8, "#e3d9c0");
      R(167, 125, 6, 4, "#efc7a0"); // hand on the knee
    }
  }
  function cafeEditor() {
    // his chair
    R(222, 128, 28, 4, "#5c3d1f"); R(222, 128, 28, 1, "#6f4a2b");
    R(224, 132, 3, 20, "#3f2a18"); R(244, 132, 3, 20, "#3f2a18");
    P1(224, 132, "#5c3d1f"); P1(244, 132, "#5c3d1f");
    R(228, 144, 17, 2, "#4a3018"); // stretcher
    // ink backing, hugging the silhouette
    R(221, 80, 21, 9, INK); R(219, 87, 25, 7, INK); // dome + brow line
    R(214, 92, 29, 8, INK); R(218, 99, 27, 6, INK); // nose, mustache, jowls
    R(220, 104, 28, 26, INK); // torso + folded arms
    // legs toward the table
    R(226, 128, 16, 8, "#2e3350"); R(228, 128, 14, 1, "#3a4066");
    R(231, 136, 4, 14, "#262b45"); R(230, 150, 5, 2, "#111318"); // far leg + shoe
    R(225, 136, 5, 16, "#2e3350"); R(225, 136, 2, 16, "#232840");
    R(221, 150, 9, 2, "#16130e");
    // stocky cardigan torso, settled back into the chair
    R(222, 122, 22, 6, "#c9973b"); R(222, 112, 22, 10, "#c9973b"); R(224, 105, 20, 7, "#c9973b");
    R(222, 126, 22, 2, "#a3782c"); R(241, 112, 3, 16, "#a3782c"); R(241, 105, 3, 7, "#a3782c");
    R(222, 112, 2, 10, "#dcae55"); R(224, 105, 2, 7, "#dcae55"); R(226, 105, 14, 1, "#e0b45e");
    COOL(243, 106, 1, 22, .25); // the window's cool rim down his back
    R(228, 105, 10, 3, "#a3782c"); R(230, 105, 6, 3, "#efe6d0"); // shawl collar + shirt
    // arms folded across the chest
    R(222, 113, 20, 8, "#bd8c35"); R(222, 113, 20, 1, "#d8a94e"); R(222, 120, 20, 1, "#8f6a26");
    R(231, 113, 2, 8, "#a3782c"); // the forearms cross here
    R(223, 114, 5, 4, "#c98d68"); P1(223, 118, "#a9714f"); // near hand
    R(237, 116, 4, 3, "#c98d68"); // far hand tucked
    // head: bald dome, horseshoe hair, walrus mustache, one heavy brow
    R(228, 99, 9, 7, "#c98d68"); R(228, 102, 9, 4, "#a9714f"); // thick neck in shadow
    R(223, 82, 15, 7, "#c98d68"); R(226, 82, 7, 2, "#dba57e"); // the dome catches the lamp
    R(236, 86, 4, 13, "#553311"); P1(235, 86, "#553311"); P1(239, 98, "#553311"); // horseshoe
    R(221, 88, 16, 14, "#c98d68"); // face
    R(222, 90, 6, 3, "#3a2517"); // the brow comes down
    R(224, 94, 3, 2, "#2b2018"); P1(226, 93, "#a9714f"); // skeptical squint
    R(216, 93, 6, 5, "#c98d68"); R(216, 97, 6, 1, "#a9714f"); P1(217, 93, "#dba57e"); // big nose
    R(217, 98, 10, 4, "#553311"); P1(217, 102, "#553311"); P1(226, 102, "#553311"); // walrus mustache
    R(227, 101, 9, 4, "#c98d68"); R(228, 104, 8, 1, "#a9714f"); P1(233, 101, "#a9714f"); // jowls
    R(234, 92, 3, 5, "#a9714f"); P1(235, 94, "#8a5a3c"); // ear
    COOL(236, 84, 2, 12, .16); // night light down the back of his head
  }
  // the barista at his machine: at room scale his head and shoulders clear the
  // counter, with the bottle shelf riding just above his cap
  function cafeBarista() {
    R(68, 26, 20, 10, INK); R(69, 34, 18, 17, INK); // cap + head, hugging the shape
    R(62, 51, 32, 21, INK); // shoulders + arms
    R(70, 29, 16, 5, "#efe6d0"); R(72, 27, 12, 3, "#f8f1de"); R(70, 32, 16, 2, "#d8cdb4"); // soda-jerk cap
    R(70, 34, 16, 2, "#181818"); // dark hair at the cap's edge
    R(71, 36, 14, 13, "#e8b48c"); R(72, 37, 4, 2, "#f2cda6"); // face
    R(73, 40, 3, 1, "#3a2a1c"); R(80, 40, 3, 1, "#3a2a1c"); // brows
    R(74, 41, 2, 2, "#2b2018"); R(80, 41, 2, 2, "#2b2018"); // both eyes: he watches the room
    R(77, 43, 2, 3, "#c9926b"); // nose
    R(75, 46, 6, 1, "#3a2a1c"); // pencil mustache
    R(76, 48, 4, 1, "#a56a4a"); // easy smile
    P1(70, 42, "#c9926b"); P1(84, 42, "#c9926b"); // ears
    R(75, 49, 7, 4, "#d69a72"); // neck
    R(66, 52, 24, 20, "#efe6d0"); R(66, 52, 24, 2, "#f8f1de"); // whites
    R(86, 54, 4, 18, "#d8cdb4"); R(66, 70, 24, 2, "#d8cdb4");
    R(75, 53, 6, 3, "#221d16"); P1(77, 54, "#3a3a3a"); // black bow tie
    R(64, 55, 4, 15, "#e3d9c0"); R(88, 55, 4, 15, "#e3d9c0"); // arms, busy at the machine
  }

  // ------------------------------------------- shared 2x scenery + people
  function plankFloorHD(y0, c1, c2) {
    R(0, y0, HDW, HDH - y0, c1);
    const cL = tone(c1, 1.08), cD = tone(c2, .85);
    for (let y = y0 + 12, r = 0; y < HDH; y += 16, r++) {
      R(0, y, HDW, 2, c2); R(0, y - 1, HDW, 1, cL); // board gap + edge catch-light
      for (let x = ((r % 3) * 44 + 20) % 120; x < HDW; x += 120) R(x, y - 14, 2, 14, c2); // butt joints
    }
    g.fillStyle = cD; // nail heads
    for (let i = 0; i < 14; i++) g.fillRect((i * 47 + 12) % HDW, y0 + 6 + ((i * 31) % (HDH - y0 - 10)), 1, 1);
    SH(0, y0, HDW, 8, .15); SH(0, y0 + 8, HDW, 5, .07); // the room falls away at the back
    SH(0, HDH - 18, HDW, 18, .06); // foreground falloff
    R(0, y0, HDW, 2, INK);
  }
  // room-scale caricature head (~54px/m). x = center, cy = chin line.
  // o: dir (0 front, ±1 profile), skin/hair, style ("slick","curly","bald",
  // "rolls","cap","fedora","visor"), hatC, mo (mustache), gl (glasses), talk.
  function cMask(x, cy, o) {
    R(x - 11, cy - 27, 22, 10, INK); R(x - 10, cy - 20, 20, 21, INK);
    if (o.style === "fedora") R(x - 13, cy - 21, 26, 4, INK);
    const d = o.dir | 0;
    if (d) R(x + (d > 0 ? 9 : -13), cy - 12, 4, 6, INK);
  }
  function cHead(x, cy, o) {
    const d = o.dir | 0, skin = o.skin || "#e8b48c", hair = o.hair || "#3a2a1c",
      st = o.style || "slick", skD = tone(skin, .78), skL = tone(skin, 1.12);
    const hT = cy - 19;
    R(x - 8, hT, 16, 19, skin);
    R(x - 7 + (d < 0 ? 3 : 0), hT + 1, 4, 3, skL); // forehead catch-light
    R(x + 6, hT, 2, 19, skD); R(x - 8, cy - 3, 16, 3, skD); // turned side + jaw
    if (d === 0) {
      R(x - 6, hT + 5, 4, 2, tone(hair, .8)); R(x + 2, hT + 5, 4, 2, tone(hair, .8)); // brows
      R(x - 5, hT + 8, 2, 2, "#2b2018"); R(x + 3, hT + 8, 2, 2, "#2b2018"); // eyes
      R(x - 1, hT + 8, 2, 5, skD); R(x - 1, hT + 13, 3, 1, tone(skin, .7)); // nose
      if (o.talk) R(x - 2, cy - 6, 5, 3, "#69392f"); else R(x - 2, cy - 4, 5, 1, tone(skin, .62));
      R(x - 9, hT + 8, 1, 4, skD); R(x + 8, hT + 8, 1, 4, skD); // ears
      if (o.mo) { R(x - 4, cy - 7, 9, 3, hair); P1(x - 4, cy - 4, hair); P1(x + 4, cy - 4, hair); }
      if (o.gl) {
        R(x - 7, hT + 7, 6, 4, INK); R(x - 6, hT + 8, 4, 2, "#cfe3dd");
        R(x + 1, hT + 7, 6, 4, INK); R(x + 2, hT + 8, 4, 2, "#cfe3dd");
        R(x - 1, hT + 9, 2, 1, INK);
        P1(x - 5, hT + 9, "#2b2018"); P1(x + 3, hT + 9, "#2b2018");
      }
    } else {
      const n = d > 0 ? x + 8 : x - 12;
      R(x + d * 2 - 2, hT + 5, 5, 2, tone(hair, .8)); // brow
      R(x + d * 3 - 1, hT + 8, 3, 2, "#2b2018"); // eye
      R(n, hT + 9, 4, 3, skin); R(n, hT + 12, 4, 1, skD); P1(d > 0 ? n + 3 : n, hT + 9, skL); // nose
      if (o.talk) R(x + d * 2, cy - 5, 3, 2, "#69392f"); else R(x + d * 2 - 1, cy - 4, 4, 1, tone(skin, .62));
      R(x - d * 5, hT + 8, 3, 5, skD); P1(x - d * 4, hT + 10, tone(skin, .68)); // ear
      if (o.mo) { R(x + (d > 0 ? 1 : -9), cy - 7, 8, 3, hair); P1(x + d * 4, cy - 4, hair); }
      if (o.gl) {
        R(x + d * 3 - 3, hT + 7, 6, 4, INK); R(x + d * 3 - 2, hT + 8, 4, 2, "#cfe3dd");
        P1(x + d * 3 - 1, hT + 9, "#2b2018");
        R(x - d * 4, hT + 8, 4, 1, INK); // temple arm
      }
    }
    if (st === "slick") {
      R(x - 9, hT - 4, 18, 5, hair); R(x - 6, hT - 3, 9, 1, tone(hair, 1.5));
      if (d) R(d > 0 ? x - 9 : x + 7, hT, 2, 9, hair);
      else { R(x - 9, hT, 1, 4, hair); R(x + 8, hT, 1, 4, hair); }
    } else if (st === "curly") {
      R(x - 9, hT - 5, 18, 6, hair);
      P1(x - 9, hT - 6, hair); P1(x - 4, hT - 7, hair); P1(x + 1, hT - 6, hair); P1(x + 5, hT - 7, hair); P1(x + 8, hT - 6, hair);
      R(x - 10, hT - 2, 2, 8, hair); R(x + 8, hT - 2, 2, 8, hair);
    } else if (st === "bald") {
      R(x - 8, hT - 4, 16, 5, skin); R(x - 5, hT - 4, 7, 1, skL);
      R(x - 9, hT + 2, 2, 8, hair); R(x + 7, hT + 2, 2, 8, hair);
    } else if (st === "rolls") {
      R(x - 9, hT - 5, 18, 6, hair); R(x - 6, hT - 4, 8, 1, tone(hair, 1.4));
      R(x - 11, hT - 2, 3, 9, hair); R(x + 8, hT - 2, 3, 9, hair); // victory rolls
      P1(x - 10, hT + 7, hair); P1(x + 9, hT + 7, hair);
      if (d) R(x - d * 11, hT + 2, 3, 6, hair);
    } else if (st === "cap") {
      R(x - 8, hT, 16, 2, hair);
      R(x - 9, hT - 5, 18, 6, o.hatC); R(x - 6, hT - 4, 8, 1, tone(o.hatC, 1.25));
      R(d >= 0 ? x + 1 : x - 10, hT + 1, 9, 2, tone(o.hatC, .75)); // brim
    } else if (st === "fedora") {
      R(x - 8, hT - 7, 16, 6, o.hatC); R(x - 8, hT - 2, 16, 2, tone(o.hatC, .55)); // crown + band
      R(x - 11, hT, 22, 2, o.hatC); P1(x - 11, hT + 2, tone(o.hatC, .8)); P1(x + 10, hT + 2, tone(o.hatC, .8));
      R(x - 5, hT - 7, 8, 1, tone(o.hatC, 1.2));
    } else if (st === "visor") {
      R(x - 8, hT - 4, 16, 5, hair);
      R(x - 9, hT + 3, 18, 2, "#3f8f7a"); R(x - 9, hT + 5, 18, 1, "#2e6b57"); // celluloid visor
    }
  }
  // standing figure ~95px (feet at y). Extra o: shirt/pants, armF/armB lifts,
  // step (1/2 stride poses for profile walkers).
  function cGuy(x, y, o = {}) {
    const d = o.dir | 0, skin = o.skin || "#e8b48c", shirt = o.shirt || "#b5443a",
      pants = o.pants || "#2e3350", A = o.armF | 0, B = o.armB | 0;
    const shD = tone(shirt, .74), shL = tone(shirt, 1.14);
    cMask(x, y - 72, o);
    R(x - 14, y - 71, 28, 34, INK);
    if (o.dress) { // '50s skirt to the knee, stockinged calves, little heels
      const sk = o.skirtC || tone(shirt, .9);
      R(x - 11, y - 40, 22, 9, sk); R(x - 13, y - 32, 26, 7, sk);
      R(x - 11, y - 40, 22, 1, tone(sk, 1.25)); R(x - 13, y - 26, 26, 1, tone(sk, .7));
      R(x - 6, y - 25, 4, 23, skin); R(x + 3, y - 25, 4, 23, skin);
      R(x - 4, y - 25, 1, 23, tone(skin, .8)); R(x + 5, y - 25, 1, 23, tone(skin, .8));
      R(x - 7, y - 2, 6, 2, "#16130e"); R(x + 2, y - 2, 6, 2, "#16130e");
      P1(x - 1, y - 1, "#16130e"); P1(x + 8, y - 1, "#16130e"); // heels
    } else if (d && o.step) { // stride
      const f1 = o.step === 1;
      const nx = x + (f1 ? d * 4 : -d), fx = x + (f1 ? -d * 5 : d * 2);
      R(fx - 3, y - 37, 6, 34, tone(pants, .72)); R(fx - 3 + d, y - 4, 7, 2, "#111318");
      R(nx - 3, y - 38, 6, 37, pants); R(nx - 3 + d * 2, y - 2, 7, 2, "#16130e");
    } else {
      R(x - 9, y - 38, 6, 37, pants); R(x + 3, y - 38, 6, 37, pants);
      R(x - 5, y - 38, 2, 37, tone(pants, .74)); R(x + 7, y - 38, 2, 37, tone(pants, .74));
      R(x - 10, y - 2, 8, 2, "#16130e"); R(x + 2, y - 2, 8, 2, "#16130e");
    }
    R(x - 11, y - 68, 22, 30, shirt);
    R(x - 11, y - 41, 22, 3, shD); R(x + 8, y - 68, 3, 28, shD);
    R(x - 10, y - 67, 2, 26, shL); R(x - 9, y - 68, 18, 1, tone(shirt, 1.2));
    // wardrobe details that make the four staffers unmistakable
    if (o.susp) { R(x - 8, y - 67, 3, 26, o.susp); R(x + 5, y - 67, 3, 26, o.susp); }
    if (o.tie) {
      R(x - 3, y - 67, 6, 18, "#f4eede"); // shirt placket under the jacket
      R(x - 1, y - 66, 2, 12, o.tie); R(x - 2, y - 55, 4, 5, o.tie);
    }
    if (o.belt) R(x - 11, y - 41, 22, 3, o.belt);
    if (!o.noArmB) {
      R(x - 15, y - 66 - B, 5, 22, shirt); R(x - 15, y - 66 - B, 1, 22, shL);
      R(x - 15, y - 47 - B, 5, 4, skin);
    }
    R(x + 10, y - 66 - A, 5, 22, shirt); R(x + 14, y - 66 - A, 1, 22, shD);
    R(x + 10, y - 47 - A, 5, 4, skin);
    R(x - 4, y - 73, 8, 6, skin); R(x - 4, y - 70, 8, 3, tone(skin, .78));
    cHead(x, y - 72, o);
  }
  // seated figure ~73px (feet at y). o.desk: arms reach forward (dir side)
  // to a work surface, lifted by armF/armB for typing/drawing beats.
  function cSitGuy(x, y, o = {}) {
    const d = o.dir | 0, skin = o.skin || "#e8b48c", shirt = o.shirt || "#b5443a",
      pants = o.pants || "#2e3350", A = o.armF | 0, B = o.armB | 0;
    const shD = tone(shirt, .74), shL = tone(shirt, 1.14);
    cMask(x, y - 54, o);
    R(x - 13, y - 53, 26, 30, INK);
    if (o.dress) { // a full '50s skirt over the knees, calves and heels below
      const sk = o.skirtC || tone(shirt, .9);
      R(x - 13, y - 26, 26, 8, sk); R(x - 14, y - 19, 28, 5, sk);
      R(x - 13, y - 26, 26, 1, tone(sk, 1.25)); R(x - 14, y - 15, 28, 1, tone(sk, .7));
      R(x - 6, y - 14, 4, 12, skin); R(x + 3, y - 14, 4, 12, skin);
      R(x - 4, y - 14, 1, 12, tone(skin, .8)); R(x + 5, y - 14, 1, 12, tone(skin, .8));
      R(x - 7, y - 2, 6, 2, "#16130e"); R(x + 2, y - 2, 6, 2, "#16130e");
      P1(x - 3, y - 1, "#16130e"); P1(x + 6, y - 1, "#16130e"); // little heels
    } else {
      R(x - 12, y - 24, 24, 9, pants); R(x - 12, y - 24, 24, 1, tone(pants, 1.25)); // lap, knees out
      P1(x - 10, y - 23, tone(pants, 1.2)); P1(x + 7, y - 23, tone(pants, 1.2)); // kneecaps
      R(x - 10, y - 15, 6, 13, pants); R(x + 4, y - 15, 6, 13, pants);
      R(x - 6, y - 15, 2, 13, tone(pants, .74)); R(x + 8, y - 15, 2, 13, tone(pants, .74));
      R(x - 12, y - 2, 9, 2, "#16130e"); R(x + 3, y - 2, 9, 2, "#16130e"); // feet splayed
    }
    R(x - 11, y - 50, 22, 26, shirt);
    R(x - 11, y - 26, 22, 2, shD); R(x + 8, y - 50, 3, 24, shD);
    R(x - 10, y - 49, 2, 22, shL); R(x - 9, y - 50, 18, 1, tone(shirt, 1.2));
    // wardrobe details (same set as the standing figure)
    if (o.susp) { R(x - 8, y - 49, 3, 22, o.susp); R(x + 5, y - 49, 3, 22, o.susp); }
    if (o.tie) {
      R(x - 3, y - 49, 6, 15, "#f4eede");
      R(x - 1, y - 48, 2, 10, o.tie); R(x - 2, y - 39, 4, 4, o.tie);
    }
    if (o.belt) R(x - 11, y - 27, 22, 3, o.belt);
    if (o.desk) { // both arms forward to the work surface
      R(x + d * 4 - 2, y - 48 - B, 6, 14, shirt);
      R(x + d * 8 - 2, y - 38 - B, 8, 4, shirt); R(x + d * 13 - 2, y - 38 - B, 5, 4, skin);
      R(x + d * 5 - 2, y - 46 - A, 6, 14, shirt);
      R(x + d * 10 - 2, y - 35 - A, 8, 4, shirt); R(x + d * 15 - 2, y - 35 - A, 5, 4, skin);
    } else {
      R(x - 14, y - 48 - B, 5, 18, shirt); R(x - 14, y - 48 - B, 1, 18, shL);
      R(x - 14, y - 33 - B, 5, 4, skin); // hand on lap
      R(x + 9, y - 48 - A, 5, 18, shirt); R(x + 13, y - 48 - A, 1, 18, shD);
      R(x + 9, y - 33 - A, 5, 4, skin);
    }
    R(x - 4, y - 55, 8, 5, skin); R(x - 4, y - 53, 8, 3, tone(skin, .78));
    cHead(x, y - 54, o);
  }
  // street-scale figure ~62px for the exterior newsstand block
  function streetGuy(x, y, o = {}) {
    const d = o.dir | 0, skin = o.skin || "#e8b48c", coat = o.coat || "#4a7fb5",
      pants = o.pants || "#2e3350", hair = o.hair || "#3a2a1c";
    R(x - 8, y - 68, 16, 12, INK); R(x - 8, y - 61, 16, 18, INK); R(x - 10, y - 46, 20, 24, INK);
    const f1 = o.step === 1;
    const nx = x + (f1 ? d * 3 : -d), fx = x + (f1 ? -d * 4 : d * 2);
    if (o.dress) { // swing skirt, stockinged calves, heels
      const sk = o.skirtC || coat;
      R(x - 10, y - 28, 20, 6, sk); R(x - 11, y - 23, 22, 4, sk);
      R(x - 11, y - 20, 22, 1, tone(sk, .7));
      R(fx - 2, y - 17, 3, 14, tone(skin, .82)); P1(fx - 2 + d, y - 3, "#111318");
      R(nx - 2, y - 19, 4, 17, skin); R(nx - 2 + d, y - 2, 5, 2, "#16130e"); P1(nx + d * 3, y - 1, "#16130e");
    } else {
      R(fx - 2, y - 23, 5, 20, tone(pants, .72)); R(fx - 2 + d, y - 4, 6, 2, "#111318");
      R(nx - 2, y - 24, 5, 23, pants); R(nx - 2 + d * 2, y - 2, 6, 2, "#16130e");
    }
    R(x - 8, y - 44, 16, 22, coat);
    R(x - 8, y - 25, 16, 3, tone(coat, .74)); R(x + 5, y - 44, 3, 20, tone(coat, .74));
    R(x - 7, y - 43, 2, 18, tone(coat, 1.14));
    // wardrobe details, street scale
    if (o.susp) { R(x - 5, y - 43, 2, 19, o.susp); R(x + 3, y - 43, 2, 19, o.susp); }
    if (o.tie) { R(x - 2, y - 43, 4, 12, "#f4eede"); R(x - 1, y - 42, 2, 9, o.tie); }
    if (o.belt) R(x - 8, y - 30, 16, 2, o.belt);
    R(x + (f1 ? -d * 3 : d * 2) - 2, y - 42, 4, 15, tone(coat, .88)); // swinging arm
    P1(x + (f1 ? -d * 3 : d * 2) - 1, y - 27, skin);
    R(x - 3, y - 48, 6, 5, skin);
    R(x - 6, y - 60, 12, 13, skin); R(x + (d > 0 ? 4 : -6), y - 60, 2, 13, tone(skin, .8));
    P1(x + d * 3, y - 55, "#2b2018"); // eye
    R(d > 0 ? x + 6 : x - 8, y - 54, 3, 2, skin); P1(d > 0 ? x + 8 : x - 8, y - 53, tone(skin, .74)); // nose
    R(x + d * 2 - 1, y - 50, 3, 1, tone(skin, .62)); // mouth
    R(x - 6, y - 62, 12, 3, hair); R(x - d * 6, y - 60, 2, 8, hair);
    if (o.bob) { R(x - d * 7, y - 60, 3, 11, hair); P1(x - d * 7 + (d > 0 ? 0 : 2), y - 49, hair); } // curled bob
    if (o.bun) { R(x - 3, y - 66, 6, 5, hair); R(x - 2, y - 67, 4, 1, tone(hair, 1.3)); } // victory-roll updo
    if (o.mo) R(x + d * 2 - 2, y - 52, 6, 2, "#4a3a2c"); // walrus mustache
    if (o.talk && o.mo) R(x + d * 2 - 1, y - 49, 3, 2, "#5a3a30"); // chatting under it
    if (o.cap) { // low flat cap, brim toward where he's looking
      R(x - 6, y - 66, 12, 4, o.cap); R(x - 6, y - 63, 12, 1, tone(o.cap, .6));
      R(x + d * 3 - 1, y - 62, 6, 2, o.cap);
    }
    if (o.hat) {
      R(x - 6, y - 67, 12, 5, o.hat); R(x - 6, y - 63, 12, 2, tone(o.hat, .55));
      R(x - 9, y - 61, 18, 2, o.hat);
    }
    if (o.pill) { R(x - 4, y - 66, 9, 4, o.pill); R(x - 4, y - 66, 9, 1, tone(o.pill, 1.25)); } // pillbox hat
    if (o.bag) { // handbag on her arm
      R(x - d * 9, y - 31, 6, 8, "#6b4a2a"); R(x - d * 9, y - 31, 6, 1, "#7c5836");
      R(x - d * 9 + 1, y - 34, 4, 1, "#4a3018"); P1(x - d * 9 + 1, y - 33, "#4a3018"); P1(x - d * 9 + 4, y - 33, "#4a3018");
    }
  }

  // ====================================================== CAFE BIZARRE (2x)
  function drawIdeasHD(f) {
    // walls: café green with a darker crown, baseboard, warm bloom by the lamps
    R(0, 0, HDW, 132, "#31584f");
    R(0, 0, HDW, 20, "#2a4a42"); dith(0, 20, HDW, 6, "#2a4a42");
    R(0, 0, HDW, 4, "#243f39");
    R(0, 112, HDW, 12, "#2c4f47"); dith(0, 106, HDW, 6, "#2c4f47", 1);
    R(0, 124, HDW, 8, "#26433c"); R(0, 124, HDW, 1, "#3d6a5e");
    g.fillStyle = "#2c4f47"; // plaster flecks
    for (let i = 0; i < 24; i++) g.fillRect((i * 53 + 9) % HDW, 28 + ((i * 37) % 76), 1, 1);
    // two-source lighting: the table pendant is the warm key, the window a cool
    // fill; the corners away from both fall off darker
    SH(0, 0, 10, 132, .13); dith(10, 0, 6, 132, "rgba(0,0,0,.09)");
    SH(326, 4, 10, 128, .09);
    GLOW(58, 26, 44, 58, .04); GLOW(69, 26, 22, 58, .05); // bar pendant
    GLOW(168, 24, 48, 64, .05); GLOW(180, 26, 26, 60, .07); // table pendant, the key
    COOL(322, 26, 14, 52, .07); COOL(246, 30, 10, 46, .04); // night spill by the window
    // checkerboard floor + grounded shadows for everything standing on it
    checkerFloorHD(132);
    GLOW(164, 132, 60, 20, .05); GLOW(178, 132, 34, 10, .05); // warm pool under the key light
    COOL(302, 132, 34, 24, .05); // cool wash below the window
    SH(0, 132, 24, 92, .09); SH(0, 200, HDW, 24, .06); // dark corner + foreground falloff
    SH(14, 132, 132, 6, .3); dith(14, 138, 132, 3, "rgba(0,0,0,.2)"); // under the bar
    SH(178, 132, 38, 6, .12); SH(182, 134, 30, 4, .18); // under the table (lifted with it)
    SH(142, 134, 38, 5, .16); SH(210, 134, 38, 5, .16); // under the regulars
    // hanging pendant lamps
    for (const lx of [80, 192]) {
      R(lx - 5, 0, 12, 4, "#14110d"); R(lx - 5, 3, 12, 1, "#2a251d"); // ceiling rose
      R(lx, 4, 2, 14, "#181818"); R(lx, 9, 1, 6, "#2a2723");
      box(lx - 6, 18, 14, 8, "#c9973b");
      R(lx - 6, 18, 14, 2, "#8a6a1c"); // top of the shade turns away from the bulb
      R(lx - 6, 24, 14, 2, "#e8b95a"); // ...the rim catches it
      R(lx - 4, 20, 2, 4, "#e0ae4e"); R(lx + 5, 20, 1, 6, "#a87c2c");
      P1(lx - 6, 18, "#a87c2c"); P1(lx + 7, 18, "#a87c2c"); // hand-AA'd shoulders
      R(lx - 2, 26, 6, 3, "#ffe38a"); P1(lx, 26, "#fff6d8"); // the bulb
      GLOW(lx - 4, 26, 10, 4, .5); GLOW(lx - 6, 27, 14, 6, .22); GLOW(lx - 9, 29, 20, 7, .1);
    }
    // back bar: bracketed shelf, six bottles each with its own pour level
    R(20, 40, 116, 4, "#4a3018"); R(20, 40, 116, 1, "#6b4626"); R(20, 43, 116, 1, "#33210f");
    R(20, 44, 116, 1, INK);
    R(64, 40, 32, 1, "#8a5f33"); // the bar pendant grazes the shelf lip
    SH(20, 45, 116, 3, .16); SH(20, 48, 116, 2, .07); // shelf shadow cast on the wall
    R(38, 45, 4, 5, "#3a2513"); R(114, 45, 4, 5, "#3a2513"); // brackets
    const bots = ["#8a2f22", "#3f8f7a", "#c9973b", "#4a7fb5", "#8a5a9e", "#b5443a"];
    for (let i = 0; i < 6; i++) {
      const bx = 28 + i * 18, c = bots[i], lvl = 28 + ((i * 5) % 7);
      R(bx + 2, 18, 4, 2, "#6b4a2a"); // cork
      R(bx + 2, 20, 4, 4, tone(c, .85)); // neck
      R(bx, 25, 8, 15, c); R(bx + 1, 24, 6, 1, tone(c, 1.1)); // body + shoulder
      R(bx, 25, 1, 15, tone(c, 1.22)); R(bx + 7, 25, 1, 15, tone(c, .66));
      R(bx + 1, lvl, 6, 1, tone(c, 1.35)); // the pour line
      R(bx + 2, 26, 1, 6, "rgba(255,255,255,.5)"); // specular
      R(bx + 1, 32, 6, 5, "#efe6d0"); R(bx + 2, 34, 4, 1, "#9a8f77"); R(bx + 2, 36, 3, 1, "#9a8f77");
      R(bx, 40, 8, 1, "rgba(0,0,0,.28)"); // contact shadow on the shelf
    }
    // the barista, working the machine (the bar hides him from the waist down)
    cafeBarista();
    // the bar: paneled oak front, grained counter, kickplate
    box(16, 80, 124, 52, "#5f3f24");
    SH(16, 80, 124, 4, .34); R(16, 80, 124, 1, "rgba(0,0,0,.3)"); // counter overhang AO
    for (let p = 0; p < 3; p++) {
      const pox = 24 + p * 40; // recessed panels; the middle one sits under the lamp
      R(pox, 90, 32, 34, "#4a3018");
      R(pox + 2, 92, 28, 30, p === 1 ? "#5c3b21" : "#57381f");
      R(pox + 2, 92, 28, 2, "#3d2814"); R(pox + 2, 92, 2, 30, "#452c16"); // recess AO
      R(pox + 2, 121, 28, 1, "#6f4a2b"); R(pox + 29, 92, 1, 30, "#6f4a2b");
      for (let k = 0; k < 3; k++) R(pox + 6 + k * 9, 95 + k * 2, 1, 22 - k * 3, "#4d3119"); // grain
      P1(pox + 2, 92, "#3a2513");
    }
    R(16, 126, 124, 6, "#3f2a18"); R(16, 126, 124, 1, "#2c1d10"); // kickplate
    g.fillStyle = "#6f4a2b"; // worn stile edges
    for (let i = 0; i < 6; i++) g.fillRect(20 + i * 22, 84 + (i % 3), 1, 2);
    R(12, 74, 132, 6, "#7a5231");
    R(12, 74, 132, 1, "#96683c"); R(58, 74, 46, 1, "#ab8148"); // polished top, hot under the lamp
    R(12, 79, 132, 1, "#5c3d1f"); R(12, 78, 132, 1, "#6b4626");
    g.fillStyle = "#5f3f24"; // counter grain
    for (let i = 0; i < 7; i++) g.fillRect(16 + i * 19, 76 + (i % 2), 8 + (i % 3) * 2, 1);
    R(12, 72, 132, 2, INK);
    // espresso machine: chrome, pilot light, gauge, huffing stack
    R(112, 50, 6, 6, "#7d8595"); R(114, 50, 2, 2, "#2b2f38"); P1(112, 50, "#9aa3ad");
    box(100, 56, 28, 16, "#9aa3ad");
    R(101, 57, 26, 3, "#c2c9d1"); R(101, 68, 26, 3, "#6e747c");
    R(101, 57, 2, 14, "#b3bac2"); R(125, 57, 2, 14, "#828a95");
    R(114, 57, 1, 14, "#7d8595"); // body seam
    P1(101, 57, "#7d8595"); P1(126, 57, "#7d8595");
    P1(101, 70, "#565c68"); P1(126, 70, "#565c68"); // corner rivets
    R(103, 59, 8, 8, "#2b2f38"); R(104, 60, 6, 6, "#d94f43"); R(105, 61, 2, 2, "#ff9282"); // pilot
    R(119, 59, 8, 8, "#2b2f38"); R(120, 60, 6, 6, "#efe6d0"); R(122, 62, 3, 1, "#8a2f22"); // gauge
    R(106, 70, 10, 2, "#565c68"); R(116, 70, 5, 2, "#3a2a1c"); // portafilter + handle
    R(101, 58, 2, 2, "#e8dcbe"); // warm glint off the chrome, from the bar pendant
    SH(100, 72, 30, 2, .2); // seated into the counter
    for (let k = 0; k < 2; k++) { // steam puffs on the same beat as the 1x room
      const sx = 114 + ((f + k) % 3) * 2, sy = 48 - ((f + k * 2) % 4) * 4;
      R(sx, sy, 4, 4, "#e8ebee"); P1(sx + 1, sy, "#f7f9fa");
      R(sx + 1, sy - 2, 2, 2, "rgba(232,235,238,.45)");
    }
    // window: deep-set night glass. Across the street: rooftops, irregular lit
    // windows, a shop still open, and a theatre's vertical sign flickering on
    // the beat the old neon used.
    R(254, 22, 68, 56, INK);
    R(256, 24, 64, 52, "#6b4626"); R(256, 24, 64, 2, "#7d5330"); R(256, 24, 2, 52, "#5c3d1f");
    R(257, 25, 62, 50, "#4a3018"); R(257, 73, 62, 2, "#33210f"); // rebate, darkest low
    R(260, 28, 56, 44, "#1c2340");
    R(260, 28, 56, 10, "#161c33"); dith(260, 38, 56, 4, "#161c33");
    R(260, 60, 56, 12, "#28305c"); dith(260, 56, 56, 4, "#28305c", 1); // city glow
    g.fillStyle = "#cdd4ea"; // stars
    for (const [sx, sy] of [[266, 31], [297, 30], [310, 34], [280, 39], [304, 42], [286, 33]]) g.fillRect(sx, sy, 1, 1);
    P1(283, 35, "#efe6d0");
    for (const [bx, bt, bw] of [[262, 50, 10], [276, 46, 8], [290, 48, 12], [306, 52, 9]])
      R(bx, bt, bw, 72 - bt, "#171f3d"); // the back rank, lost in haze
    for (const [bx, bt, bw] of [[260, 56, 12], [270, 50, 10], [282, 60, 10], [294, 52, 12], [308, 58, 8]]) {
      R(bx, bt, bw, 72 - bt, "#0e1226"); R(bx + bw - 1, bt, 1, 72 - bt, "#1a2445");
    }
    R(272, 45, 6, 5, "#0e1226"); R(273, 44, 4, 1, "#0e1226"); P1(272, 50, "#1a2445"); // water tank
    R(299, 46, 1, 6, "#0e1226"); // antenna
    g.fillStyle = "#f5c86e"; // irregular lit windows across the way
    for (const [wx, wy, ww, wh] of [[263, 60, 2, 2], [267, 64, 2, 2], [277, 58, 2, 2], [284, 62, 1, 2],
      [295, 56, 2, 2], [299, 60, 2, 2], [303, 57, 1, 2], [309, 62, 2, 2], [312, 66, 2, 1]]) g.fillRect(wx, wy, ww, wh);
    g.fillStyle = "#a3873f"; // ...and a few turning in for the night
    for (const [wx, wy] of [[262, 66], [285, 66], [297, 66], [311, 59], [277, 54]]) g.fillRect(wx, wy, 2, 2);
    R(262, 68, 8, 4, "#33291f"); R(263, 69, 6, 2, "#8a6a3c"); P1(265, 69, "#f5c86e"); // a shop still open
    R(297, 68, 9, 4, "#2c231a"); R(298, 69, 3, 2, "#6e5530"); R(302, 69, 3, 2, "#8a6a3c");
    // the Bijou's vertical sign (letters too far to read), same flicker beat
    const lit = f % 5 !== 3;
    R(268, 64, 2, 6, "#1a1420"); // support pole down to the roof
    R(264, 34, 10, 30, "#1a1420"); R(266, 36, 6, 26, "#38202e");
    if (lit) { g.fillStyle = "rgba(255,111,157,.09)"; g.fillRect(260, 31, 18, 36); }
    for (let i = 0; i < 5; i++) {
      R(267, 38 + i * 5, 4, 3, lit ? "#ff6f9d" : "#5a2c3e");
      if (lit) P1(268, 39 + i * 5, "#ffc9db");
    }
    if (lit) {
      P1(264, 34, "#f5c86e"); P1(273, 34, "#f5c86e"); P1(264, 63, "#f5c86e"); P1(273, 63, "#f5c86e"); // marquee bulbs
      R(264, 64, 10, 2, "rgba(255,111,157,.25)"); // spill on the rooftop below
    }
    R(287, 28, 2, 44, INK); R(289, 28, 1, 44, "rgba(255,255,255,.05)"); // mullions
    R(260, 49, 56, 2, INK); R(260, 51, 56, 1, "rgba(255,255,255,.05)");
    g.fillStyle = "rgba(255,255,255,.07)"; // diagonal reflection on the glass
    for (let k = 0; k < 13; k++) g.fillRect(262 + k, 30 + k, 2, 1);
    g.fillStyle = "rgba(255,255,255,.04)";
    for (let k = 0; k < 9; k++) g.fillRect(269 + k, 30 + k, 2, 1);
    GLOW(296, 31, 10, 5, .09); GLOW(299, 32, 4, 3, .16); // the pendants, reflected in the pane
    GLOW(305, 41, 6, 4, .06); GLOW(307, 42, 3, 2, .12);
    R(252, 76, 72, 4, "#6b4626"); R(252, 76, 72, 1, "#8a5f33"); R(252, 80, 72, 1, INK); // sill
    SH(252, 81, 72, 2, .22); SH(254, 74, 68, 2, .12); // AO under the sill and the rebate
    // café table with two bentwood chairs: the seats belong to whoever
    // placed an editor here (the barista is the house's own man and stays).
    // The whole tableau sits 14px higher than it used to — the tile's
    // bottom overlays were cropping the chairs and the sitters' laps.
    g.save();
    g.translate(0, -14);
    for (const [chx, chd] of [[162, 1], [230, -1]]) {
      R(chx - chd * 13, 116, 3, 33, "#5f3f24"); // bentwood back
      R(chx - 9, 146, 18, 3, "#5f3f24");        // seat edge
      R(chx - 8, 149, 2, 12, "#3f2a18"); R(chx + 6, 149, 2, 12, "#3f2a18");
    }
    const cafeOcc = roomOccupants("ideas");
    [[162, 150, 1], [230, 150, -1]].forEach(([sx, sy, sd], i) => {
      const o2 = cafeOcc[i];
      if (!o2) return;
      worker(sx, sy, o2.pid, {
        sit: true, dir: sd, desk: true, char: staffCharFor("ideas", o2.slot),
        armF: (f % 2) * 4, talk: (f + i) % 4 < 2,
      });
    });
    // the rest lean on the bar, trading gossip for ideas
    [[54, 178, -1], [88, 182, -1], [266, 178, 1]].forEach(([sx, sy, sd], i) => {
      const o2 = cafeOcc[2 + i];
      if (o2) worker(sx, sy, o2.pid, { dir: sd, armB: 3, talk: (f + i) % 3 < 1, char: staffCharFor("ideas", o2.slot) });
    });
    // cast-iron pedestal + grained top (drawn over their knees, like the 1x room)
    R(194, 116, 4, 32, "#3a3f4a"); R(194, 116, 1, 32, "#4c525e"); COOL(197, 118, 1, 28, .16);
    R(193, 120, 6, 2, "#2f333d"); // collar
    R(190, 144, 12, 2, "#3a3f4a"); R(188, 146, 16, 4, "#33383f"); R(188, 149, 16, 1, "#22262d");
    R(176, 110, 40, 4, "#7a5231"); R(176, 110, 40, 1, "#96683c"); R(182, 110, 28, 1, "#ab8148"); // hot under the lamp
    box(172, 112, 48, 6, "#8a5c33");
    R(173, 113, 46, 1, "#a8743f"); R(173, 117, 46, 1, "#6b4626");
    SH(178, 118, 36, 2, .12); // the top's shadow drops behind the apron
    g.fillStyle = "#6b4626"; // grain on the apron
    for (let i = 0; i < 4; i++) g.fillRect(178 + i * 11, 115, 6, 1);
    // cups on saucers, wisps on the same beats
    for (const [cux, ph] of [[184, 0], [204, 1]]) {
      R(cux - 3, 108, 12, 2, "#e5dcc2"); R(cux - 3, 109, 12, 1, "#c9bfa4"); // saucer
      R(cux - 1, 109, 9, 1, "rgba(0,0,0,.15)"); // cup seated into its saucer
      R(cux, 102, 6, 8, "#efe6d0"); R(cux, 102, 6, 1, "#f8f1de"); // lamplit rim
      R(cux + 5, 102, 1, 6, "#d8cdb4"); P1(cux, 103, "#fff");
      R(cux + 1, 103, 4, 1, "#6b4a2a"); // the coffee
      R(cux + (ph ? 6 : -2), 103, 2, 4, "#efe6d0"); P1(cux + (ph ? 7 : -2), 104, "#d8cdb4"); // handle
      const st = (f + ph) % 3;
      R(cux + 2, (ph ? 92 : 94) - st * 2, 2, 4, "#cfe3dd");
      R(cux + 3, (ph ? 88 : 90) - st * 2, 1, 2, "rgba(207,227,221,.5)");
    }
    // ...and the idea striking (same blink, now a proper glass bulb with glow)
    if (f % 4 < 2) { // raised to clear the room-scale head below it
      GLOW(151, 56, 16, 12, .1); GLOW(154, 58, 10, 9, .14);
      R(156, 62, 6, 8, "#ffe38a");
      P1(156, 62, "#e8c96a"); P1(161, 62, "#e8c96a"); // rounded shoulders
      R(157, 63, 2, 3, "#fff"); // specular
      R(158, 67, 2, 2, "#e0a83c"); // filament
      R(157, 70, 4, 2, "#9aa3ad"); R(157, 71, 4, 1, "#6e747c"); // screw base
      R(150, 64, 2, 2, "#ffe38a"); R(166, 64, 2, 2, "#ffe38a"); R(158, 54, 2, 2, "#ffe38a");
      P1(159, 55, "#fff");
    }
    g.restore(); // end of the lifted café-table tableau
    // cake stand on the bar
    R(52, 52, 16, 8, "#e5977a"); R(52, 52, 3, 8, "#f0ab8e"); R(64, 52, 4, 8, "#cf8168");
    R(53, 56, 14, 1, "#c9755f"); // sponge seam
    R(52, 50, 16, 2, "#d94f43"); P1(54, 50, "#ff7d6d"); P1(60, 50, "#ff7d6d");
    P1(53, 52, "#d94f43"); P1(66, 52, "#d94f43"); // frosting drips
    R(48, 60, 24, 4, "#d8cdb4"); R(48, 60, 24, 1, "#e8dfc6"); R(48, 63, 24, 1, "#b9ae92");
    R(58, 64, 4, 8, "#d8cdb4"); R(56, 70, 8, 2, "#c9bfa4"); // stem + foot
    R(50, 64, 20, 1, "rgba(0,0,0,.15)"); // plate shadow
    // the jazz poster
    box(168, 28, 32, 40, "#efe6d0");
    R(168, 28, 32, 1, "#f8f1de"); R(168, 67, 32, 1, "#d6c9ab"); R(199, 29, 1, 38, "#ddd0b0");
    R(173, 33, 22, 22, "#c9bfa4"); // mat bevel
    R(174, 34, 20, 20, "#1a1511"); R(174, 34, 20, 3, "#221d16");
    g.fillStyle = "#2c251c"; // smoke curling off the bell
    for (const [qx, qy] of [[190, 37], [189, 38], [188, 40], [189, 42], [190, 44]]) g.fillRect(qx, qy, 1, 1);
    R(181, 37, 3, 10, "#c9973b"); R(181, 37, 1, 10, "#e8b95a"); // sax tube
    R(181, 46, 6, 3, "#c9973b"); R(186, 43, 3, 6, "#c9973b"); // bow + bell
    R(186, 42, 4, 2, "#e8b95a"); P1(189, 41, "#e8b95a"); // bell flare
    P1(182, 40, "#ffe38a"); P1(182, 43, "#ffe38a"); P1(183, 46, "#ffe38a"); // keys
    R(182, 35, 2, 2, "#8a6a1c"); // mouthpiece
    R(174, 58, 20, 4, "#8a2f22");
    R(176, 59, 6, 2, "#c9776b"); R(185, 59, 8, 2, "#c9776b"); // title type
    g.fillStyle = "rgba(255,255,255,.06)"; // glass glare
    for (let k = 0; k < 8; k++) g.fillRect(176 + k, 36 + k, 2, 1);
    COOL(199, 29, 1, 38, .12); // window light skims the frame's right edge
    SH(170, 69, 32, 2, .18); SH(200, 32, 2, 36, .08); // it hangs off the wall
  }

  // ====================================================== TALENT AGENCY (2x)
  function drawHireHD(f) {
    // walls: agency blue with a picture-height dado, lit warmest over the desk
    R(0, 0, HDW, 140, "#3e5f88");
    R(0, 0, HDW, 18, "#35517a"); dith(0, 18, HDW, 6, "#35517a"); R(0, 0, HDW, 4, "#2c4666");
    R(0, 104, HDW, 36, "#33507a"); R(0, 104, HDW, 2, INK); R(0, 106, HDW, 1, "#40639b");
    R(0, 134, HDW, 6, "#2a4160"); R(0, 134, HDW, 1, "#476a9e");
    g.fillStyle = "#35517a";
    for (let i = 0; i < 20; i++) g.fillRect((i * 61 + 14) % HDW, 24 + ((i * 41) % 74), 1, 1);
    SH(0, 0, 12, 140, .12); dith(12, 0, 6, 140, "rgba(0,0,0,.08)");
    GLOW(196, 16, 128, 118, .04); GLOW(220, 24, 84, 110, .05); // key over reception
    COOL(0, 76, 70, 62, .04); // cold morning light from the door, off-screen left
    plankFloorHD(140, "#7a5231", "#5f3f24");
    GLOW(210, 140, 100, 24, .05); // warm pool by the desk
    SH(16, 142, 120, 4, .18); SH(206, 138, 112, 5, .2); // bench + desk grounded
    // ceiling fan, lazily turning on the same beat
    R(276, 0, 4, 10, "#222"); R(276, 0, 1, 10, "#3a3a3a");
    if (f % 2) {
      R(252, 12, 56, 4, "#4a3a28"); R(252, 12, 56, 1, "#5f4c34");
      R(276, 8, 8, 12, "#222"); P1(277, 9, "#4a4a4a");
    } else {
      R(264, 6, 32, 4, "#4a3a28"); R(272, 12, 16, 4, "#4a3a28"); R(264, 6, 32, 1, "#5f4c34");
      R(276, 8, 8, 12, "#222"); P1(277, 9, "#4a4a4a");
    }
    // worn rug in front of the bench
    R(24, 168, 104, 32, "#8a3f34"); R(28, 172, 96, 24, "#a34c3e");
    R(32, 176, 88, 2, "#c9973b"); R(32, 190, 88, 2, "#c9973b");
    R(40, 182, 24, 1, "#8a3f34"); R(76, 184, 30, 1, "#8a3f34"); // worn through
    for (let i = 0; i < 12; i++) { P1(24 + i * 9, 167, "#c9973b"); P1(24 + i * 9, 200, "#c9973b"); } // fringe
    SH(26, 196, 100, 4, .08);
    // framed comic-book pages — the agency's proudest credits
    const pgs = [["#4a7fb5", "#d94f43", "#c9973b", "#3f8f7a"], ["#d94f43", "#8a5a9e", "#4a7fb5", "#c9973b"],
      ["#3f8f7a", "#c9973b", "#8a5a9e", "#d94f43"], ["#c9973b", "#4a7fb5", "#d94f43", "#3f8f7a"]];
    for (let i = 0; i < 4; i++) {
      const x = 22 + i * 38, pg = pgs[i];
      R(x - 2, 40, 30, 34, "#8a6a3c"); // gilt frame
      box(x, 42, 26, 30, "#efe6d0");
      R(x + 2, 44, 10, 12, pg[0]); R(x + 14, 44, 10, 12, pg[1]); // four panels
      R(x + 2, 58, 10, 12, pg[2]); R(x + 14, 58, 10, 12, pg[3]);
      R(x + 2, 44, 10, 1, tone(pg[0], 1.25)); R(x + 14, 58, 10, 1, tone(pg[3], 1.25));
      R(x + 4, 48, 3, 6, "#221d16"); R(x + 8, 45, 3, 2, "#efe6d0"); // hero + balloon
      R(x + 17, 50, 4, 4, "#221d16"); P1(x + 16, 46, "#ffe38a"); // villain + burst
      R(x + 4, 63, 5, 3, "#221d16"); P1(x + 10, 60, "#efe6d0"); // getaway car...
      R(x + 18, 60, 3, 7, "#221d16"); R(x + 15, 59, 3, 2, "#efe6d0"); // ...and the chase
      g.fillStyle = "rgba(255,255,255,.08)";
      for (let k = 0; k < 6; k++) g.fillRect(x + 3 + k, 45 + k, 2, 1); // glass glare
      R(x - 2, 74, 30, 4, "#8a6a3c"); R(x - 2, 74, 30, 1, "#a3824c"); // display ledge
      SH(x - 1, 78, 29, 2, .16);
    }
    // gold star over the frames (filled, showbiz — not a light)
    g.fillStyle = "#f5c86e";
    g.fillRect(85, 20, 2, 2); g.fillRect(84, 22, 4, 2); g.fillRect(81, 24, 10, 2);
    g.fillRect(83, 26, 6, 2); g.fillRect(82, 28, 3, 2); g.fillRect(87, 28, 3, 2);
    P1(85, 22, "#fff2c0");
    // potted plant, right corner
    box(308, 124, 18, 16, "#8a4a26"); R(309, 125, 16, 2, "#a35c30"); R(309, 138, 16, 2, "#6d3a1e");
    R(310, 104, 4, 20, "#2e6b3e"); R(318, 100, 4, 24, "#2e6b3e"); R(304, 110, 6, 10, "#3f8f56");
    R(314, 106, 4, 8, "#3f8f56"); P1(311, 102, "#3f8f56"); P1(319, 98, "#3f8f56"); P1(305, 108, "#57a86b");
    SH(306, 140, 26, 3, .15);
    // "STARS WANTED" poster over the reception desk
    box(224, 28, 44, 52, "#efe6d0");
    R(224, 28, 44, 1, "#f8f1de"); R(224, 79, 44, 1, "#d6c9ab");
    P1(226, 30, "#d94f43"); P1(265, 30, "#d94f43"); P1(226, 77, "#d94f43"); P1(265, 77, "#d94f43"); // pushpins
    g.fillStyle = "#d94f43"; // the star of the poster
    g.fillRect(244, 33, 2, 2); g.fillRect(243, 35, 4, 2); g.fillRect(240, 37, 10, 2);
    g.fillRect(242, 39, 6, 2); g.fillRect(241, 41, 3, 2); g.fillRect(246, 41, 3, 2);
    R(230, 46, 32, 4, "#8a2f22"); R(230, 52, 32, 2, "#9a8f77");
    R(230, 58, 24, 2, "#9a8f77"); R(230, 64, 28, 2, "#9a8f77"); R(230, 70, 20, 2, "#9a8f77");
    SH(226, 81, 44, 2, .15);
    // the reception side of the desk belongs to whoever placed an editor:
    // the publisher's own people do the interviewing (the hopefuls on the
    // bench ARE the offer, so they stay)
    // YOUR editors interview the prospects: the first takes the desk chair,
    // the others review portfolios standing (rivals never share this office)
    const hireOcc = roomOccupants("hire");
    [
      [252, 140, { sit: true, dir: 1, desk: true }],
      [222, 140, { sit: true, dir: 1, desk: true }],
      [288, 140, { sit: true, dir: 1, desk: true }],
      [186, 196, { dir: -1, armF: 6 }],
      [148, 202, { dir: -1, armB: 3 }],
    ].forEach(([sx, sy, so], i) => {
      const o2 = hireOcc[i];
      if (!o2) return;
      worker(sx, sy, o2.pid, {
        char: staffCharFor("hire", o2.slot),
        armF: ((f + i) % 2) * 4, armB: ((f + i + 1) % 2) * 4, talk: (f + i) % 4 < 2,
        ...so,
      });
    });
    // reception desk: paneled front, grained top
    box(208, 100, 108, 36, "#8a5c33");
    SH(208, 100, 108, 3, .3);
    for (let p = 0; p < 2; p++) {
      const pox = 216 + p * 50;
      R(pox, 108, 42, 22, "#6d4626"); R(pox + 2, 110, 38, 18, "#7c5030");
      R(pox + 2, 110, 38, 2, "#5c3a1e"); R(pox + 38, 112, 2, 16, "#96683c");
    }
    R(210, 136, 8, 4, "#5c3a1e"); R(298, 136, 8, 4, "#5c3a1e"); // feet
    R(204, 94, 116, 6, "#a8743f"); R(204, 94, 116, 1, "#c08a4e"); R(204, 99, 116, 1, "#7c5030");
    g.fillStyle = "#8a5c33";
    for (let i = 0; i < 6; i++) g.fillRect(210 + i * 19, 96 + (i % 2), 9, 1);
    R(204, 92, 116, 2, INK);
    // typewriter, carriage sliding on the beat
    box(256, 82, 30, 10, "#2b2f38");
    for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) P1(260 + c * 4, 86 + r * 3, "#4a505c");
    R(252 + (f % 2) * 6, 78, 32, 4, "#4a505c"); R(252 + (f % 2) * 6, 78, 32, 1, "#5d6470");
    // the phone rings on the old beat
    box(220, 82, 12, 10, "#33333d"); R(222, 84, 8, 2, "#22222c");
    if (f % 7 < 2) {
      R(216, 72, 20, 4, "#33333d"); R(218, 70, 4, 4, "#33333d"); R(230, 70, 4, 4, "#33333d");
      R(214 + (f % 2) * 4, 66, 6, 4, "#f5c86e"); P1(212 + (f % 2) * 4, 64, "#f5c86e"); // it jangles
    } else R(218, 78, 16, 4, "#2a2a34"); // handset at rest
    // the waiting bench, three hopefuls clutching their chances
    box(16, 120, 116, 8, "#5f3f24"); R(16, 120, 116, 1, "#7a5231");
    R(22, 128, 4, 14, "#3f2a18"); R(118, 128, 4, 14, "#3f2a18");
    R(26, 132, 92, 2, "#4a3018"); // stretcher
    SH(18, 128, 112, 4, .14);
    cSitGuy(36, 140, { style: "rolls", hair: "#8a2f22", shirt: "#5b6a8a", skin: "#efc7a0", dress: true }); // civilian slate — house colors are reserved for placed workers
    R(34, 82, 5, 1, "#b5443a"); // lipstick
    P1(27, 80, "#f5c86e"); P1(44, 80, "#f5c86e"); // earrings
    P1(32, 89, "#efe6d0"); P1(35, 90, "#efe6d0"); P1(38, 89, "#efe6d0"); // pearls
    R(22, 107, 5, 4, "#efe6d0"); R(45, 107, 5, 4, "#efe6d0"); // white gloves
    if (f % 2) R(28, 136, 5, 2, "#16130e"); // the nervous heel taps
    cSitGuy(70, 140, {
      style: "slick", hair: "#181818", shirt: "#6e6a3f", skin: "#c98d68",
      armF: f % 4 < 2 ? 8 : 0, talk: f % 4 < 2,
    });
    R(64, 116, 12, 6, "#efe6d0"); R(66, 118, 8, 1, "#9a8f77"); // clutched pages
    cSitGuy(104, 140, { style: "fedora", hatC: "#6b4a2a", hair: "#553311", shirt: "#4a7fb5", mo: true });
    // portfolio case at his feet
    box(132, 132, 22, 14, "#6b4a2a"); R(133, 133, 20, 2, "#7c5836");
    R(140, 136, 6, 2, "#f5c86e"); R(138, 128, 10, 4, "#553311"); R(140, 130, 6, 2, "#3e5f88");
    SH(133, 146, 22, 3, .18);
  }

  // ====================================================== WRITERS' ROOM (2x)
  function drawDevelopHD(f) {
    const lampLit = f % 9 !== 4; // the banker's lamp is the warm key
    R(0, 0, HDW, 136, "#5b4370");
    R(0, 0, HDW, 18, "#4d3860"); dith(0, 18, HDW, 6, "#4d3860"); R(0, 0, HDW, 4, "#3f2e50");
    R(0, 96, HDW, 40, "#4b3560"); R(0, 96, HDW, 2, INK); R(0, 98, HDW, 1, "#5e4675");
    R(0, 130, HDW, 6, "#3e2b50"); R(0, 130, HDW, 1, "#6a5180");
    g.fillStyle = "#4d3860";
    for (let i = 0; i < 20; i++) g.fillRect((i * 59 + 8) % HDW, 22 + ((i * 43) % 70), 1, 1);
    SH(0, 0, 10, 136, .12); SH(326, 4, 10, 132, .08);
    if (lampLit) { GLOW(56, 60, 96, 74, .05); GLOW(76, 70, 56, 62, .06); }
    COOL(238, 26, 84, 62, .05); COOL(316, 30, 20, 100, .05); // night through the glass
    plankFloorHD(136, "#6b4a2c", "#523822");
    if (lampLit) GLOW(36, 136, 96, 18, .04);
    SH(26, 134, 104, 5, .2); SH(198, 136, 96, 5, .2); // desks grounded
    // corkboard with pinned story pages (one flutters on the old beat)
    box(20, 24, 112, 60, "#a67c48"); R(21, 25, 110, 2, "#b98c54"); R(21, 81, 110, 2, "#8a6238");
    R(26, 30, 100, 48, "#8a6238");
    g.fillStyle = "#7a5630";
    for (let i = 0; i < 16; i++) g.fillRect(28 + ((i * 37) % 96), 32 + ((i * 23) % 44), 1, 1);
    for (let i = 0; i < 4; i++) {
      const fl = i === 3 && f % 2 ? 2 : 0;
      SH(33 + i * 24 + fl, 38, 18, 25, .18);
      R(32 + i * 24 + fl, 36, 18, 24, "#efe6d0");
      if (fl) { P1(48 + i * 24 + fl, 58, "#5b4370"); R(46 + i * 24 + fl, 59, 4, 1, "#ddd0b0"); } // corner curls
      for (let l = 0; l < 5; l++) R(34 + i * 24 + fl, 40 + l * 4, 14 - (l % 2) * 3, 1, "#9a8f77");
      P1(40 + i * 24 + fl, 34, "#d94f43"); P1(40 + i * 24 + fl, 35, "#8a2f22"); // pin
    }
    // the night window (framed like the café's, its own skyline)
    R(242, 22, 76, 60, INK);
    R(244, 24, 72, 56, "#6b4626"); R(244, 24, 72, 2, "#7d5330"); R(244, 24, 2, 56, "#5c3d1f");
    R(245, 25, 70, 54, "#4a3018");
    R(248, 28, 64, 48, "#1c2340");
    R(248, 28, 64, 10, "#161c33"); dith(248, 38, 64, 4, "#161c33");
    R(248, 64, 64, 12, "#28305c"); dith(248, 60, 64, 4, "#28305c", 1);
    g.fillStyle = "#cdd4ea";
    for (const [sx, sy] of [[254, 31], [270, 34], [286, 30], [300, 36], [308, 31], [278, 39]]) g.fillRect(sx, sy, 1, 1);
    for (const [bx, bt, bw] of [[250, 52, 12], [266, 48, 10], [280, 54, 14], [298, 50, 12]])
      R(bx, bt, bw, 76 - bt, "#171f3d");
    for (const [bx, bt, bw] of [[248, 58, 14], [264, 54, 12], [280, 62, 12], [296, 56, 14], [310, 60, 6]]) {
      R(bx, bt, bw, 76 - bt, "#0e1226"); R(bx + bw - 1, bt, 1, 76 - bt, "#1a2445");
    }
    R(300, 48, 1, 8, "#0e1226"); // the tall antenna
    if (f % 4 < 2) P1(300, 47, "#d94f43"); // its warning beacon blinks
    R(268, 49, 6, 5, "#0e1226"); R(269, 48, 4, 1, "#0e1226"); // water tank
    g.fillStyle = "#f5c86e";
    for (const [wx, wy, ww, wh] of [[251, 62, 2, 2], [257, 66, 2, 2], [267, 58, 2, 2], [283, 66, 1, 2],
      [299, 60, 2, 2], [303, 64, 2, 2], [312, 63, 2, 2]]) g.fillRect(wx, wy, ww, wh);
    g.fillStyle = "#a3873f";
    for (const [wx, wy] of [[250, 68], [271, 64], [285, 70], [297, 66]]) g.fillRect(wx, wy, 2, 2);
    R(279, 28, 2, 48, INK); R(281, 28, 1, 48, "rgba(255,255,255,.05)");
    R(248, 51, 64, 2, INK); R(248, 53, 64, 1, "rgba(255,255,255,.05)");
    g.fillStyle = "rgba(255,255,255,.06)";
    for (let k = 0; k < 12; k++) g.fillRect(250 + k, 30 + k, 2, 1);
    R(240, 80, 80, 4, "#6b4626"); R(240, 80, 80, 1, "#8a5f33"); R(240, 84, 80, 1, INK);
    SH(240, 85, 80, 2, .2);
    // reference shelf between corkboard and window
    box(144, 32, 48, 52, "#5a4028"); R(145, 33, 46, 2, "#6b4c30");
    R(148, 44, 40, 2, "#3d2a18"); R(148, 64, 40, 2, "#3d2a18");
    SH(148, 34, 40, 3, .2); SH(148, 46, 40, 3, .16); SH(148, 66, 40, 3, .16);
    const sp = ["#8a2f22", "#3f8f7a", "#c9973b", "#4a7fb5", "#8a5a9e"];
    for (let i = 0; i < 5; i++) {
      R(150 + i * 8, 34, 6, 10, sp[i]); R(150 + i * 8, 34, 1, 10, tone(sp[i], 1.2));
      R(150 + i * 8, 48, 6, 16, sp[(i + 2) % 5]); R(150 + i * 8, 48, 6, 1, tone(sp[(i + 2) % 5], 1.2));
    }
    P1(153, 36, "#efe6d0"); P1(169, 52, "#efe6d0"); // title dots
    for (let i = 0; i < 4; i++) { R(152 + i * 10, 68, 8, 16, sp[(i + 3) % 5]); R(152 + i * 10, 68, 1, 16, tone(sp[(i + 3) % 5], 1.2)); }
    // the writer — she types on alternating beats
    cSitGuy(46, 132, {
      dir: 1, desk: true, style: "rolls", hair: "#553311", shirt: "#b5443a",
      skin: "#efc7a0", gl: true, armB: (f % 2) * 4, armF: ((f + 1) % 2) * 4,
    });
    R(47, 74, 4, 1, "#8a2f22"); // lipstick
    P1(42, 73, "#f5c86e"); // earring
    P1(44, 79, "#efe6d0"); P1(47, 80, "#efe6d0"); P1(50, 79, "#efe6d0"); // pearls
    box(28, 100, 96, 32, "#8a5c33");
    SH(28, 100, 96, 3, .3);
    R(34, 108, 38, 18, "#6d4626"); R(36, 110, 34, 14, "#7c5030"); R(36, 110, 34, 2, "#5c3a1e");
    R(80, 108, 38, 18, "#6d4626"); R(82, 110, 34, 14, "#7c5030"); R(82, 110, 34, 2, "#5c3a1e");
    R(24, 94, 104, 6, "#a8743f"); R(24, 94, 104, 1, "#c08a4e"); R(24, 99, 104, 1, "#7c5030");
    if (lampLit) R(84, 94, 36, 1, "#d8a95c"); // lamplight pools on the desktop
    R(24, 92, 104, 2, INK);
    R(66, 68, 16, 16, "#efe6d0"); R(67, 70, 13, 1, "#9a8f77"); R(67, 74, 11, 1, "#9a8f77"); // page in the machine
    box(60, 82, 28, 10, "#2b2f38");
    for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) P1(65 + c * 4, 86 + r * 3, "#4a505c");
    if (lampLit) { GLOW(92, 84, 28, 4, .4); GLOW(88, 88, 36, 6, .22); }
    R(100, 74, 16, 6, "#2e5d43"); R(100, 74, 16, 2, "#3f7a58"); R(100, 79, 16, 1, "#1f4230"); // the banker's lamp
    R(106, 80, 4, 14, "#181818"); R(104, 92, 8, 2, "#181818"); P1(106, 80, "#3a3a3a");
    if (lampLit) R(102, 79, 12, 1, "#ffe38a"); // bulb line under the shade
    // the artist at the drafting board, strokes appearing line by line
    cSitGuy(262, 132, {
      dir: -1, desk: true, style: "cap", hatC: "#3e5f88", hair: "#181818",
      shirt: "#4d5a6e", skin: "#c98d68", armF: (f % 2) * 6,
    });
    box(200, 104, 88, 28, "#8a5c33");
    SH(200, 104, 88, 3, .3);
    R(206, 110, 34, 16, "#6d4626"); R(208, 112, 30, 12, "#7c5030"); R(208, 112, 30, 2, "#5c3a1e");
    R(248, 110, 34, 16, "#6d4626"); R(250, 112, 30, 12, "#7c5030"); R(250, 112, 30, 2, "#5c3a1e");
    R(196, 98, 96, 6, "#a8743f"); R(196, 98, 96, 1, "#c08a4e"); R(196, 103, 96, 1, "#7c5030");
    R(196, 96, 96, 2, INK);
    box(206, 68, 44, 30, "#efe6d0"); R(207, 69, 42, 2, "#f8f1de");
    P1(208, 70, "#9aa3ad"); P1(247, 70, "#9aa3ad"); // board clips
    R(210, 96, 4, 6, "#5a4028"); R(242, 96, 4, 6, "#5a4028"); // its stand
    for (let k = 0; k <= f % 4; k++) R(212 + k * 4, 74 + k * 6, 24 - k * 4, 2, "#4a505c");
    // the stack of finished pages (the crumpled floor drafts are gone — they
    // read as noise, not flavor)
    box(160, 120, 24, 16, "#efe6d0"); R(161, 124, 22, 1, "#d6c9ab"); R(161, 130, 22, 1, "#d6c9ab");
    R(164, 124, 16, 1, "#9a8f77"); R(164, 130, 16, 1, "#9a8f77");
    SH(161, 136, 24, 3, .16);
    // the office cat, sitting up asleep atop the reference shelf; only the
    // tail keeps working
    g.save();
    g.translate(-24, -159);
    SH(180, 191, 28, 3, .14);
    R(176 - (f % 2) * 4, 189, 16 + (f % 2) * 4, 3, "#3a3a42"); P1(174 - (f % 2) * 4, 188, "#3a3a42"); // tail
    R(183, 180, 14, 12, "#3a3a42"); R(181, 184, 4, 8, "#3a3a42"); // haunch
    R(192, 174, 8, 18, "#3a3a42"); // chest
    R(189, 166, 13, 10, "#3a3a42"); // head
    R(190, 163, 3, 3, "#3a3a42"); R(198, 163, 3, 3, "#3a3a42"); // ears
    P1(191, 164, "#e5977a"); P1(199, 164, "#e5977a"); // pink inner ears
    R(193, 176, 4, 14, "#4a4a54"); // pale chest fur
    R(184, 182, 10, 1, "#2e2e36"); R(184, 186, 10, 1, "#2e2e36"); // tabby stripes
    R(192, 170, 4, 1, "#efe6d0"); R(197, 170, 3, 1, "#efe6d0"); // eyes shut tight
    P1(195, 172, "#e5977a"); // nose
    P1(187, 172, "#9aa3ad"); P1(203, 172, "#9aa3ad"); // whiskers
    R(191, 190, 10, 2, "#4a4a54"); P1(196, 190, "#2e2e36"); // front paws together
    g.restore(); // the cat's perch
    // visiting editors look over the work in progress (the writer and the
    // artist are the room's own people — they're MAKING the projects on offer)
    const devOcc = roomOccupants("develop");
    const devStations = [
      [166, 198, -1, { armF: 8 }],           // reading the finished stack
      [128, 204, 1, { armB: 3 }],            // over the writer's shoulder
      [242, 206, -1, { armF: 4 }],           // checking the drafting board
      [64, 210, 1, {}],
      [300, 208, -1, {}],
    ];
    devOcc.forEach((o2, k) => {
      if (!devStations[k]) return;
      const [sx, sy, sd, so] = devStations[k];
      worker(sx, sy, o2.pid, { dir: sd, talk: (f + k) % 4 < 2, char: staffCharFor("develop", o2.slot), ...so });
    });
  }

  // ======================================================== PRINT FLOOR (2x)
  // ------------------------------------------------ visiting workers (2x)
  // Placed editors appear IN the rooms doing the room's job, wearing their
  // house colors. Same quartet identity as the small staff sprites: fedora
  // man / updo woman / slick man / auburn woman, chosen by player id.
  // Room logic: venue professionals (pressman, barista, accountant, vendor)
  // and people who ARE the offer (waiting creatives) stay; the ACTOR seat is
  // what the placed worker fills.
  const WORKER_LOOKS = [
    { style: "fedora", skin: "#ecbc94", hair: "#4a3222" },
    { style: "rolls",  skin: "#966442", hair: "#1c1818" },
    { style: "slick",  skin: "#c48e60", hair: "#201c1c" },
    { style: "curly",  skin: "#f0c4a0", hair: "#924a2a" },
  ];
  // which placed workers are visible INSIDE a room. The café and the street
  // are public — rivals mingle there. Every other room is your company's own
  // session (writers' room, print floor, accounting, the agency interview):
  // rivals stay on the queue outside (the slot pips); only your people enter.
  // Returned compacted as {pid, slot} so your workers take the prime stations
  // first, while `slot` keeps the true identity via staffCharFor.
  const PUBLIC_ROOMS = { ideas: true, sales: true };
  function roomOccupants(action) {
    if (typeof UI === "undefined" || !UI.engine) return [];
    const arr = UI.engine.state.actionSpaces[action] || [];
    const out = [];
    arr.forEach((pid, i) => {
      if (pid === undefined) return;
      if (UI.placeFlight && UI.placeFlight[action + ":" + i]) return; // still walking over
      if (!PUBLIC_ROOMS[action] && pid !== UI.humanId) return;        // private session
      out.push({ pid, slot: i });
    });
    return out;
  }
  // WHICH of the player's four staffers went to this particular slot: the
  // rail roster grays its people from the right AS PLACEMENTS HAPPEN, so a
  // player's k-th placement (in TIME order, from the engine's placement
  // diary) is staffer editors-k. Rooms, slot pips, the rail and the map
  // agent all agree on who exactly left the office — and identities never
  // reshuffle retroactively when a later placement lands in an earlier room.
  function staffCharFor(action, slot) {
    const s = UI.engine.state, counts = {};
    if (s.placeSeq) {
      for (const e of s.placeSeq) {
        counts[e.player] = (counts[e.player] || 0) + 1;
        if (e.action === action && e.slot === slot)
          return ((UI.engine.player(e.player).editors - counts[e.player]) % 4 + 4) % 4;
      }
    }
    // no diary entry (old save, or state injected directly by tests):
    // canonical ACTIONS-order counting, from a fresh tally
    const c2 = {};
    for (const a of ACTIONS) {
      const arr = s.actionSpaces[a] || [];
      for (let i = 0; i < arr.length; i++) {
        const pid = arr[i];
        if (pid === undefined) continue;
        c2[pid] = (c2[pid] || 0) + 1;
        if (a === action && i === slot)
          return ((UI.engine.player(pid).editors - c2[pid]) % 4 + 4) % 4;
      }
    }
    return 0;
  }
  // one wardrobe per staffer, copied from the rail sprites so the room render
  // is unmistakably the SAME person, just closer:
  // 0 fedora man — house suit over white shirt, dark tie
  // 1 updo woman — white blouse, house pencil skirt
  // 2 slick man  — white shirtsleeves, house suspenders, house trousers
  // 3 bob woman  — house day dress with a dark belt
  const WORKER_WHITE = "#f4eede";
  function workerAttire(ch, pub) {
    return [
      { shirt: pub.color, pants: pub.dark, tie: pub.dark },
      { shirt: WORKER_WHITE, dress: true, skirtC: pub.color },
      { shirt: WORKER_WHITE, pants: pub.color, susp: pub.color },
      { shirt: pub.color, dress: true, skirtC: pub.color, belt: pub.dark },
    ][ch];
  }
  function worker(x, y, pid, o = {}) {
    const p = UI.engine.player(pid), pub = PUBLISHERS[p.color];
    const ch = o.char !== undefined ? o.char : pid % 4;
    const look = WORKER_LOOKS[ch];
    const opts = {
      hatC: pub.dark, skin: look.skin, hair: look.hair, style: look.style,
      ...workerAttire(ch, pub), ...o,
    };
    if (!o.sit) SH(x - 15, y - 3, 30, 4, .16);
    (o.sit ? cSitGuy : cGuy)(x, y, opts);
  }

  function drawPrintHD(f) {
    // brick wall, greasy and warm only under the two work lamps
    R(0, 0, HDW, 128, "#5a332c");
    for (let y = 12, r = 0; y < 128; y += 14, r++) {
      R(0, y, HDW, 2, "#48261f");
      for (let x = (r % 2) * 16; x < HDW; x += 32) R(x, y - 12, 2, 12, "#48261f");
      for (let x = (r % 2) * 16 + ((r * 13) % 32); x < HDW; x += 96) R(x + 4, y - 10, 10, 8, r % 3 ? "#61382f" : "#532e27"); // odd bricks
    }
    dith(0, 0, HDW, 8, "#3f211b"); R(0, 0, HDW, 3, "#3f211b");
    SH(0, 0, 12, 128, .16); SH(324, 0, 12, 128, .16);
    GLOW(56, 8, 48, 116, .05); GLOW(216, 8, 48, 116, .05); // only the lamps love this room
    R(0, 128, HDW, HDH - 128, "#6d675b");
    for (let x = 52; x < HDW; x += 76) R(x, 130, 2, HDH - 130, "#605a4f"); // expansion joints
    R(40, 180, 20, 6, "#5c564b"); R(240, 200, 28, 6, "#5c564b"); P1(70, 204, "#5c564b"); // stains
    SH(0, 128, HDW, 8, .16); SH(0, 206, HDW, 18, .08);
    R(0, 128, HDW, 2, INK);
    SH(26, 138, 176, 6, .22); // the press sits heavy
    // steam pipe along the brick
    R(0, 40, 28, 6, "#6e747c"); R(24, 40, 6, 92, "#6e747c"); R(24, 40, 2, 92, "#7d838c");
    R(22, 60, 10, 4, "#5a606a"); R(22, 96, 10, 4, "#5a606a"); P1(23, 61, "#8d939c");
    // steam huffs out of the old press on the old beat
    if (f % 3 === 0) { R(60, 36, 8, 6, "#cfd2d6"); R(68, 26, 6, 6, "#e2e5e8"); P1(70, 24, "#eef0f2"); }
    // the press: riveted steel, two rolling drums
    box(28, 52, 168, 88, "#464e5e");
    R(28, 52, 168, 6, "#5a6478"); R(29, 53, 166, 1, "#6b7690");
    R(32, 124, 160, 12, "#353b48"); R(32, 124, 160, 2, "#2c313c");
    R(96, 58, 2, 66, "#3a4150"); R(160, 58, 2, 66, "#3a4150"); // panel seams
    g.fillStyle = "#5a6478";
    for (let i = 0; i < 8; i++) { P1(34 + i * 22, 56, "#6b7690"); P1(34 + i * 22, 120, "#3a4150"); } // rivets
    R(36, 112, 12, 8, "#c9973b"); R(38, 114, 8, 1, "#221d16"); R(38, 117, 8, 1, "#221d16"); // warning plate
    drumHD(80, 92, 22, f); drumHD(136, 92, 22, f + 2);
    // gearbox, ticking back and forth
    box(168, 64, 20, 20, "#2b2f38"); R(169, 65, 18, 2, "#3a4048");
    if (f % 2) { R(176, 66, 4, 16, "#7d8595"); R(170, 72, 16, 4, "#7d8595"); P1(177, 67, "#9aa3b3"); }
    else for (let k = 0; k < 5; k++) { R(170 + k * 2, 66 + k * 2, 4, 4, "#7d8595"); R(182 - k * 2, 66 + k * 2, 4, 4, "#7d8595"); }
    // one continuous paper web running over the drums into the pile
    R(8, 62, 48, 6, "#efe6d0"); R(52, 66, 116, 6, "#efe6d0");
    R(164, 74, 60, 6, "#efe6d0"); R(220, 82, 24, 6, "#efe6d0"); R(236, 88, 8, 20, "#efe6d0");
    R(8, 62, 48, 1, "#f8f1de"); R(52, 66, 116, 1, "#f8f1de");
    g.fillStyle = "#c9b98f";
    for (let x = 12 + (f % 3) * 4; x < 164; x += 12) g.fillRect(x, x < 52 ? 64 : 68, 4, 2);
    for (let x = 168 + (f % 3) * 4; x < 220; x += 12) g.fillRect(x, 76, 4, 2);
    // fresh comics landing on the pile
    SH(238, 134, 52, 4, .2);
    box(240, 112, 48, 24, "#efe6d0");
    R(240, 112, 48, 4, "#d94f43"); R(240, 120, 48, 4, "#4a7fb5"); R(240, 128, 48, 4, "#c9973b");
    g.fillStyle = "#d6c9ab";
    for (let i = 0; i < 5; i++) g.fillRect(242 + i * 9, 117, 5, 1);
    if (f % 2) { R(236, 102, 52, 6, "#fff"); P1(232, 104, "#efe6d0"); P1(290, 103, "#efe6d0"); }
    // the pressman hauls the lever on the beat
    cGuy(228, 168, {
      dir: -1, style: "cap", hatC: "#3a3f4a", hair: "#3a2a1c", shirt: "#4a7fb5",
      skin: "#e8b48c", mo: true, noArmB: true,
    });
    SH(212, 166, 36, 4, .18);
    R(206, 82, 8, 6, "#2b2f38"); // the pivot housing, high on the press
    if (f % 2) { // lever up: he reaches for the grip
      R(208, 62, 4, 20, "#8a2f22"); P1(209, 62, "#c9776b");
      R(214, 86, 6, 14, "#3f6ea3"); // rolled sleeve
      R(211, 72, 6, 16, "#e8b48c"); // bare forearm
      R(207, 64, 7, 6, "#e8b48c"); // the grip
    } else { // lever thrown forward, arm following through
      R(200, 78, 16, 4, "#8a2f22"); P1(200, 79, "#c9776b");
      R(214, 88, 6, 12, "#3f6ea3");
      R(206, 82, 8, 5, "#e8b48c"); R(200, 76, 8, 5, "#e8b48c");
    }
    // ink drums
    SH(14, 206, 32, 4, .2); SH(46, 206, 32, 4, .2);
    box(16, 172, 26, 36, "#b5443a"); R(17, 173, 24, 2, "#c95a4e"); R(16, 184, 26, 2, "#8a2f22"); R(16, 198, 26, 2, "#8a2f22");
    R(22, 180, 14, 4, "#efe6d0"); P1(24, 181, "#8a2f22"); P1(30, 181, "#8a2f22");
    P1(20, 208, "#7a241c"); P1(36, 209, "#7a241c"); // drips
    box(48, 180, 26, 28, "#2e4f8f"); R(49, 181, 24, 2, "#3d63ad"); R(48, 192, 26, 2, "#223c6e");
    R(54, 188, 14, 4, "#efe6d0"); P1(56, 189, "#2e4f8f"); P1(62, 189, "#2e4f8f");
    // hanging work lamps with light cones
    for (const lx of [80, 240]) {
      R(lx, 0, 2, 14, "#222"); box(lx - 8, 14, 18, 8, "#2b2f38");
      R(lx - 8, 14, 18, 2, "#1f232b"); R(lx - 8, 20, 18, 2, "#3a4048");
      R(lx - 4, 22, 10, 2, "#ffe38a");
      GLOW(lx - 6, 22, 14, 4, .4); GLOW(lx - 10, 26, 22, 6, .2); GLOW(lx - 14, 32, 30, 8, .09);
    }
    // stray sheets that missed the pile
    R(300, 150, 10, 6, "#efe6d0"); R(302, 152, 6, 1, "#c9b98f"); P1(300, 150, "#d6c9ab");
    R(314, 168, 8, 5, "#e5dcc2"); P1(316, 170, "#c9b98f");
    // sparks off the gearbox now and then
    if (f % 5 === 0) { R(190, 80, 4, 4, "#ffd75e"); R(198, 88, 2, 2, "#fff"); R(186, 92, 2, 2, "#ffd75e"); }
    // the visiting editors run their print jobs (the pressman is the shop's
    // own man; each placed publisher works a station in house colors)
    const stations = [
      { x: 116, y: 174, o: (fr) => ({ dir: 1, armF: fr % 2 ? 12 : 8 }) },        // checking the web
      { x: 298, y: 188, o: (fr) => ({ dir: -1, armF: fr % 2 ? 3 : 9 }) },        // stacking fresh comics
      { x: 152, y: 216, o: (fr) => ({ dir: 0, talk: fr % 4 < 2 }) },             // fronting the press
      { x: 66, y: 214, o: (fr) => ({ dir: 1, armF: fr % 2 ? 6 : 2 }) },          // minding the ink drums
      { x: 206, y: 216, o: (fr) => ({ dir: 1, armB: 4 }) },                      // waiting on the run
    ];
    roomOccupants("print").forEach((o2, k) => {
      if (!stations[k]) return;
      worker(stations[k].x, stations[k].y, o2.pid, { char: staffCharFor("print", o2.slot), ...stations[k].o(f) });
    });
  }
  function drumHD(cx, cy, r, f) {
    R(cx - r - 2, cy - r + 4, 2 * r + 4, 2 * r - 8, INK);
    R(cx - r + 4, cy - r - 2, 2 * r - 8, 2 * r + 4, INK);
    R(cx - r + 2, cy - r + 2, 2 * r - 4, 2 * r - 4, INK);
    R(cx - r + 2, cy - r + 6, 2 * r - 4, 2 * r - 12, "#8d97a8");
    R(cx - r + 6, cy - r + 2, 2 * r - 12, 2 * r - 4, "#8d97a8");
    R(cx - r + 6, cy - r + 2, 2 * r - 12, 6, "#aab4c4");
    R(cx - r + 6, cy + r - 8, 2 * r - 12, 6, "#6f7889");
    const t = [[0, -r + 8], [r - 10, 0], [0, r - 10], [-r + 8, 0]][f % 4];
    R(cx + t[0] - 2, cy + t[1] - 2, 6, 6, "#222831"); P1(cx + t[0] - 1, cy + t[1] - 1, "#454c5a");
    R(cx - 2, cy - 2, 6, 6, INK); P1(cx - 1, cy - 1, "#39404e");
  }

  // ========================================================= ACCOUNTING (2x)
  function drawRoyaltiesHD(f) {
    const lit = f % 9 !== 4; // both sconces gutter on the old beat
    R(0, 0, HDW, 132, "#75592a");
    R(0, 0, HDW, 18, "#644b22"); dith(0, 18, HDW, 6, "#644b22"); R(0, 0, HDW, 4, "#54401e");
    R(0, 92, HDW, 40, "#5f4820"); R(0, 92, HDW, 2, INK); R(0, 94, HDW, 1, "#75592a");
    R(0, 126, HDW, 6, "#4e3a1a"); R(0, 126, HDW, 1, "#8a6a34");
    g.fillStyle = "#644b22";
    for (let i = 0; i < 18; i++) g.fillRect((i * 67 + 21) % HDW, 24 + ((i * 39) % 62), 1, 1);
    SH(0, 0, 12, 132, .13); SH(324, 0, 12, 132, .1);
    if (lit) { GLOW(96, 30, 48, 96, .06); GLOW(200, 30, 48, 96, .06); }
    R(0, 132, HDW, HDH - 132, "#9a927e");
    for (let x = 48; x < HDW; x += 48) R(x, 132, 1, HDH - 132, "#8a8370"); // stone joints
    g.fillStyle = "#857e6c";
    for (let i = 0; i < 24; i++) g.fillRect((i * 29) % HDW, 136 + ((i * 19) % 80), 2, 1);
    SH(0, 132, HDW, 8, .14); SH(0, 206, HDW, 18, .07);
    R(0, 132, HDW, 2, INK);
    SH(22, 142, 62, 5, .2); SH(126, 134, 198, 5, .22);
    // wall clock, the minute hand grinding around
    box(156, 24, 32, 32, "#efe6d0"); R(157, 25, 30, 2, "#f8f1de");
    R(160, 28, 24, 24, "#ddd2b8"); P1(160, 28, "#efe6d0"); P1(183, 28, "#efe6d0");
    P1(171, 30, "#8a6a3c"); P1(171, 52, "#8a6a3c"); P1(161, 41, "#8a6a3c"); P1(181, 41, "#8a6a3c");
    const hd = f % 4;
    if (hd === 0) R(171, 33, 2, 8, "#221d16"); else if (hd === 1) R(172, 40, 8, 2, "#221d16");
    else if (hd === 2) R(171, 41, 2, 8, "#221d16"); else R(164, 40, 8, 2, "#221d16");
    R(168, 40, 5, 2, "#4a3a28"); P1(171, 41, "#221d16"); // stubby hour hand + pin
    SH(158, 57, 32, 2, .14);
    // framed dollar
    box(32, 28, 28, 32, "#efe6d0"); R(33, 29, 26, 2, "#f8f1de");
    R(36, 32, 20, 24, "#2e6b4e"); R(38, 34, 16, 20, "#3f8f7a"); R(38, 34, 16, 2, "#57a68e");
    R(45, 36, 2, 16, "#efe6d0"); // the $: bar...
    R(42, 38, 8, 2, "#efe6d0"); R(42, 40, 2, 2, "#efe6d0"); R(42, 42, 8, 2, "#efe6d0");
    R(48, 44, 2, 2, "#efe6d0"); R(42, 46, 8, 2, "#efe6d0"); // ...and the S around it
    SH(34, 61, 28, 2, .14);
    // the office safe
    box(20, 84, 60, 60, "#4a4f5a");
    R(24, 88, 52, 52, "#565c68"); R(24, 88, 52, 3, "#6b7280");
    R(28, 92, 44, 44, "#505662"); R(28, 92, 44, 2, "#3f4450"); R(28, 92, 2, 44, "#3f4450");
    R(70, 94, 2, 42, "#6b7280"); R(30, 134, 42, 2, "#6b7280");
    P1(30, 94, "#2b2f38"); P1(69, 94, "#2b2f38"); P1(30, 133, "#2b2f38"); P1(69, 133, "#2b2f38"); // bolts
    R(30, 94, 40, 1, "#8a6a1c"); // gold pinstripe
    box(42, 104, 14, 14, "#2b2f38"); R(44, 106, 10, 10, "#3a4048");
    const dl = [[6, 2], [10, 6], [6, 10], [2, 6]][f % 4];
    R(42 + dl[0], 104 + dl[1], 2, 2, "#c9c9c9"); P1(48, 110, "#565c68");
    R(64, 108, 8, 6, "#c9c9c9"); R(64, 108, 8, 2, "#e2e2e2"); // the handle
    R(38, 128, 24, 6, "#8a6a1c"); R(41, 130, 6, 2, "#54401e"); R(50, 130, 8, 2, "#54401e"); // maker's plate
    R(22, 86, 2, 12, "#3a4048"); R(22, 128, 2, 12, "#3a4048"); // hinges
    // money sack (leaning against the ticker's stand)
    SH(80, 138, 26, 4, .18);
    R(82, 120, 20, 20, "#8a6a3c"); R(83, 121, 4, 16, "#a3824c");
    P1(82, 120, "#75592a"); P1(101, 120, "#75592a"); P1(82, 139, "#75592a"); P1(101, 139, "#75592a");
    R(86, 116, 12, 6, "#8a6a3c"); R(88, 112, 8, 4, "#6b4f2a");
    R(90, 126, 4, 8, "#3f8f7a"); P1(94, 128, "#3f8f7a"); P1(94, 132, "#3f8f7a");
    // the accountant behind the counter (visor, spectacles, sleeve garters)
    cGuy(230, 126, { style: "visor", hair: "#553311", shirt: "#efe6d0", skin: "#e8b48c", gl: true });
    R(224, 62, 12, 4, "#2e3350"); // his necktie, tucked
    // teller counter with the marble top
    box(128, 96, 192, 40, "#6b4a2a");
    SH(128, 96, 192, 3, .3);
    for (let p = 0; p < 3; p++) {
      const pox = 138 + p * 62;
      R(pox, 104, 50, 26, "#573b20"); R(pox + 2, 106, 46, 22, "#634428");
      R(pox + 2, 106, 46, 2, "#472f18"); R(pox + 46, 108, 2, 20, "#7a5231");
    }
    R(124, 90, 200, 6, "#d8cdb4"); R(124, 90, 200, 1, "#e8dfc6"); R(124, 95, 200, 1, "#b9ae92");
    g.fillStyle = "#c3b89c"; // marble veins
    for (let k = 0; k < 10; k++) g.fillRect(136 + k * 19, 92 + (k % 3), 8, 1);
    R(124, 88, 200, 2, INK);
    // coin stacks, one coin dropping on the old beat
    for (let i = 0; i < 4; i++) {
      const hgt = [3, 5, 2, 4][i];
      for (let k = 0; k < hgt; k++) {
        R(140 + i * 16, 87 - k * 4, 10, 3, "#f5c86e"); R(140 + i * 16, 89 - k * 4, 10, 1, "#c9973b");
        P1(142 + i * 16, 87 - k * 4, "#fff2c0");
      }
    }
    R(153, 52 + (f % 3) * 10, 8, 3, "#f5c86e"); P1(155, 52 + (f % 3) * 10, "#fff2c0");
    box(198, 84, 18, 6, "#2e5d43"); R(199, 88, 16, 1, "#efe6d0"); // the day's ledger
    // the big brass register
    box(244, 56, 52, 34, "#c9973b");
    R(245, 57, 50, 3, "#e0b45e"); R(245, 86, 50, 3, "#8a6a1c"); R(292, 58, 3, 30, "#a3782c");
    P1(248, 60, "#f5c86e"); P1(290, 60, "#f5c86e"); // filigree glints
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
      R(252 + c * 10, 64 + r * 10, 6, 6, "#efe6d0"); R(252 + c * 10, 68 + r * 10, 6, 2, "#c9bfa4");
    }
    R(298, 64, 6, 14, "#8a6a1c"); R(300, 62, 4, 4, "#a3782c"); // the crank
    if (f % 6 < 2) {
      box(248, 92, 48, 8, "#8a6a1c"); R(256, 94, 8, 4, "#f5c86e"); R(272, 94, 8, 4, "#f5c86e"); // drawer pops
      box(256, 40, 24, 14, "#efe6d0"); // the $ flag
      R(267, 41, 2, 12, "#3f8f7a");
      R(264, 43, 8, 2, "#3f8f7a"); R(264, 45, 2, 2, "#3f8f7a"); R(264, 47, 8, 2, "#3f8f7a");
      R(270, 49, 2, 2, "#3f8f7a"); R(264, 51, 8, 2, "#3f8f7a");
    }
    // stock ticker chattering out tape
    R(100, 84, 4, 48, "#8a6a1c"); R(96, 130, 12, 4, "#8a6a1c"); // its brass stand
    box(92, 68, 24, 16, "#3a3f4a"); R(93, 69, 22, 2, "#4c525e");
    R(98, 60, 12, 8, "#c9c9c9"); R(99, 61, 4, 3, "#eeeeee"); // glass dome
    R(102, 84, 6, 20 + (f % 4) * 6, "#efe6d0");
    R(102, 92 + (f % 4) * 6, 8, 4, "#e0d6ba");
    P1(104, 88, "#9a8f77"); P1(104, 96, "#9a8f77"); // printed figures
    // wall sconces
    for (const sx of [116, 220]) {
      R(sx, 36, 6, 10, "#8a6a1c"); R(sx + 1, 37, 2, 8, "#a3823c");
      R(sx - 2, 30, 10, 6, lit ? "#ffe38a" : "#8a7a4a");
      if (lit) { P1(sx + 2, 31, "#fff6d8"); GLOW(sx - 6, 28, 18, 12, .18); }
    }
    // the publishers' people queue to collect (the accountant is the house's
    // own — he counts, they pocket)
    const royOcc = roomOccupants("royalties");
    const royStations = [
      [258, 202, -1, { armF: 10 }],          // hand out for the payout
      [206, 206, 1, { armB: 2 }],            // next in line
      [154, 210, 1, {}],
      [104, 212, 1, {}],
      [58, 210, 1, {}],
    ];
    royOcc.forEach((o2, k) => {
      if (!royStations[k]) return;
      const [sx, sy, sd, so] = royStations[k];
      worker(sx, sy, o2.pid, { dir: sd, talk: (f + k) % 5 < 2, char: staffCharFor("royalties", o2.slot), ...so });
    });
  }

  // ========================================================== NEWSSTAND (2x)
  function drawSalesHD(f) {
    // a slim ribbon of morning sky — the street is the star, not the weather
    R(0, 0, HDW, 26, "#7fb2d4");
    R(0, 0, HDW, 6, "#6ca4cb"); dith(0, 6, HDW, 3, "#6ca4cb");
    R(0, 20, HDW, 6, "#93bfdc"); dith(0, 17, HDW, 3, "#93bfdc", 1);
    const cx = ((f * 4) % (HDW + 80)) - 40;
    R(cx, 4, 32, 6, "#eef4f8"); R(cx + 8, 1, 20, 5, "#fff"); R(cx + 2, 10, 28, 2, "#dfe9f0");
    R(cx + 48, 12, 24, 5, "#e4edf3"); R(cx + 52, 15, 16, 2, "#d5e2ec");
    // the city runs on behind the block: two hazy skyline layers + the spires
    // (same silhouette language as the map's horizon)
    for (let i = 0; i < 14; i++) {
      const sx = (i * 47 + 11) % (HDW + 20) - 10, sw = 14 + (i * 13) % 18, sh = 7 + (i * 11) % 10;
      R(sx, 26 - sh, sw, sh, "#9db9cc");
    }
    for (let i = 0; i < 12; i++) {
      const sx = (i * 61 + 27) % (HDW + 20) - 10, sw = 12 + (i * 17) % 16, sh = 4 + (i * 7) % 7;
      R(sx, 26 - sh, sw, sh, "#84a4bb");
    }
    R(96, 6, 8, 20, "#84a4bb"); R(98, 2, 4, 4, "#84a4bb"); R(99, 0, 2, 2, "#84a4bb");    // Empire State
    R(258, 10, 7, 16, "#9db9cc"); R(260, 6, 3, 4, "#9db9cc"); R(261, 2, 1, 4, "#9db9cc"); // Chrysler
    // the whole street block rides 26px HIGHER (the space the sky gave up):
    // the skyline stays visible over the two-storey roofline, and the
    // newsstand action clears the tile's bottom overlays
    g.save();
    g.translate(0, -26);
    // the brownstone block
    R(0, 52, HDW, 80, "#8a5643"); R(0, 52, HDW, 2, INK);
    for (let y = 60; y < 124; y += 8) R(0, y, HDW, 1, "#82503e");
    R(0, 54, HDW, 3, "#6d4334"); // cornice shadow
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 7; c++) {
        const x = 16 + c * 44, lit = ((8 + c * 22) * 7 + r * 5) % 3 === 0;
        R(x - 2, 58 + r * 32, 24, 3, "#7a4a39"); // lintel
        box(x, 60 + r * 32, 20, 22, lit ? "#f5c86e" : "#2c3550");
        if (lit) { R(x + 2, 62 + r * 32, 6, 18, "#e0b45e"); P1(x + 12, 70 + r * 32, "#8a6a1c"); }
        else { P1(x + 3, 63 + r * 32, "#48557a"); P1(x + 14, 66 + r * 32, "#48557a"); } // sky glints
        R(x + 9, 60 + r * 32, 2, 22, "#221d16"); // sash bar
        R(x - 2, 84 + r * 32, 24, 3, "#6d4334"); SH(x - 2, 87 + r * 32, 24, 2, .18); // sill
      }
    // a brownstone stoop and a fire escape on the far bay
    R(254, 96, 24, 3, "#7a4a39"); // door lintel
    R(256, 98, 20, 26, "#3a2a1c"); R(258, 100, 7, 20, "#4a3626"); R(267, 100, 7, 20, "#4a3626");
    P1(265, 110, "#c9973b"); // brass knob
    R(276, 80, 28, 2, "#262a31"); R(276, 74, 28, 1, "#262a31"); // escape platform + rail
    R(276, 74, 1, 6, "#262a31"); R(303, 74, 1, 6, "#262a31");
    for (let k = 0; k < 6; k++) P1(281 + k * 4, 75, "#262a31"); // balusters
    for (let k = 0; k < 5; k++) R(266 - k * 2, 84 + k * 3, 8, 1, "#262a31"); // drop ladder rungs
    R(0, 124, HDW, 6, "#6d4334"); R(0, 124, HDW, 1, "#7a4a39");
    for (let x = 4; x < HDW; x += 12) P1(x, 126, "#5c3a2c"); // dentils
    R(0, 130, HDW, 2, INK);
    R(254, 124, 24, 3, "#8f897a"); R(252, 127, 28, 3, "#7f7a6c"); // the stoop's two steps
    // sidewalk, curb, asphalt — afternoon sun coming from the left.
    // Slab joints fan outward toward the viewer: the ground reads as a
    // receding plane instead of a flat band
    R(0, 132, HDW, 60, "#a09a8a");
    for (let x0 = 40; x0 < HDW; x0 += 52)
      for (let s = 0; s < 6; s++)
        R(Math.round(168 + (x0 - 168) * (1 + s * 0.045)), 132 + s * 10, 2, 10, "#7f7a6c");
    R(0, 162, HDW, 1, "#8f897a"); // slab midline
    SH(0, 132, HDW, 7, .16);
    R(0, 132, HDW, 2, INK);
    R(0, 192, HDW, 6, "#6d675b"); R(0, 192, HDW, 1, "#7d776a"); R(0, 198, HDW, 2, INK);
    R(0, 200, HDW, 24, "#3c3f46");
    R(60, 208, 24, 4, "#565961"); R(180, 212, 24, 4, "#565961");
    dith(0, 216, HDW, 8, "#33363c");
    // fire hydrant + lamppost
    SH(52, 186, 14, 4, .15);
    box(36, 172, 16, 18, "#b5443a"); R(37, 173, 3, 16, "#c95a4e");
    R(40, 166, 8, 6, "#b5443a"); R(41, 164, 6, 2, "#8a2f22"); P1(42, 167, "#c95a4e");
    R(32, 176, 4, 6, "#b5443a"); R(52, 176, 4, 6, "#8a2f22"); // sun side / shade side
    P1(34, 184, "#8a2f22"); P1(48, 186, "#8a2f22"); // rust
    SH(298, 184, 12, 4, .15);
    R(296, 96, 4, 92, "#2b2f38"); R(296, 96, 1, 92, "#454c5a");
    R(294, 184, 8, 6, "#2b2f38"); box(288, 84, 20, 12, "#2b2f38"); R(292, 88, 12, 4, "#c9b06a");
    // the newsstand: striped awning, vendor, racks bursting with comics.
    // Its cast shadow skews away from the sun in steps — a flat blob read
    // as a smudge, a raked one reads as depth
    for (let s = 0; s < 5; s++) SH(226 + s * 5, 136 + s * 7, 26, 7, .09);
    box(116, 88, 108, 84, "#3f6f4f");
    R(118, 90, 2, 80, "#4f8560"); R(220, 90, 3, 80, "#2f5540"); // sun side / shade side
    for (let x = 128; x < 216; x += 12) R(x, 92, 1, 76, "#356047"); // slats
    // cabinet-projected east face: the booth is a BOX, not a flat
    for (let s = 0; s < 8; s++) R(224 + s, 88 - (s >> 1), 1, 84 + (s >> 1), s < 2 ? "#2f5540" : "#26473a");
    R(224, 86, 8, 2, "#356047"); // roof edge running back
    // the vendor in his window — STREET scale, like everyone outdoors:
    // flat cap, walrus mustache, chatting with whoever stops by
    R(150, 100, 40, 30, "#1d232e");
    streetGuy(170, 170, {
      dir: 1, coat: "#5b6a8a", skin: "#e8b48c", hair: "#3a2a1c",
      cap: "#3a3f4a", mo: true, talk: f % 4 < 2,
    });
    R(158, 126, 8, 3, "#efe6d0"); // his polishing rag on the counter
    R(124, 100, 26, 30, "#1d232e"); R(190, 100, 26, 30, "#1d232e"); // the dim ends of the booth
    R(126, 102, 8, 26, "#3a3f4a"); R(192, 102, 8, 26, "#3a3f4a"); // stacked bundles
    R(124, 128, 92, 4, "#2c5a3f"); R(124, 128, 92, 1, "#3f7a54"); // the counter ledge
    // awning
    for (let i = 0; i < 8; i++) {
      R(108 + i * 16, 74, 16, 14, i % 2 ? "#d94f43" : "#efe6d0");
      R(108 + i * 16, 74, 16, 2, i % 2 ? "#e8695c" : "#f8f1de");
      R(108 + i * 16, 88 + (f % 2 && i % 2 ? 2 : 0), 16, 4, i % 2 ? "#a83730" : "#cfc4a6"); // hems flap
    }
    R(108, 72, 124, 2, INK);
    for (let s = 0; s < 6; s++) R(232 + s, 74 - (s >> 1), 1, 16, "#a83730"); // awning side flap, receding
    SH(118, 92, 104, 5, .22); // awning shade on the booth
    P1(112, 88, "#2b2f38"); P1(228, 88, "#2b2f38"); // support arms
    g.fillStyle = "#efe6d0"; // NEWS on the fascia
    g.fillRect(150, 93, 2, 6); g.fillRect(155, 93, 2, 6); // N
    P1(152, 94, "#efe6d0"); P1(153, 95, "#efe6d0"); P1(154, 96, "#efe6d0");
    g.fillStyle = "#efe6d0";
    g.fillRect(160, 93, 2, 6); g.fillRect(160, 93, 6, 1); g.fillRect(160, 95, 5, 1); g.fillRect(160, 98, 6, 1); // E
    g.fillRect(169, 93, 2, 6); g.fillRect(175, 93, 2, 6); g.fillRect(172, 95, 1, 3); // W
    P1(170, 98, "#efe6d0"); P1(174, 98, "#efe6d0");
    g.fillStyle = "#efe6d0";
    g.fillRect(179, 93, 6, 1); g.fillRect(179, 94, 2, 2); g.fillRect(179, 96, 6, 1);
    g.fillRect(183, 97, 2, 1); g.fillRect(179, 98, 6, 1); // S
    // comic racks
    R(124, 133, 92, 2, "#2c5a3f");
    const covers = ["#d94f43", "#4a7fb5", "#c9973b", "#3f8f7a", "#8a5a9e", "#b5443a"];
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 5; c++) {
        const cc = covers[(r * 5 + c) % 6];
        R(126 + c * 18, 136 + r * 18, 14, 14, cc); R(126 + c * 18, 136 + r * 18, 14, 1, tone(cc, 1.2));
        R(128 + c * 18, 138 + r * 18, 4, 10, "#efe6d0");
        P1(134 + c * 18, 140 + r * 18, tone(cc, 1.3)); P1(136 + c * 18, 145 + r * 18, tone(cc, .7));
      }
    R(124, 152, 92, 1, "#2c5a3f"); R(124, 170, 92, 2, "#2c5a3f");
    // readers stroll past both ways; a pigeon works the curb
    const wx = ((f * 8) % (HDW + 60)) - 30;
    SH(wx - 10, 186, 26, 3, .14);
    streetGuy(wx, 188, { dir: 1, step: 1 + (f % 2), coat: "#4a7fb5", hat: "#2b2f38", skin: "#e8b48c" });
    R(wx + 7, 150, 7, 4, "#efe6d0"); R(wx + 8, 151, 5, 1, "#9a8f77"); // paper under his arm
    const wx2 = HDW + 30 - ((f * 6) % (HDW + 60));
    SH(wx2 - 10, 182, 26, 3, .14);
    streetGuy(wx2, 184, {
      dir: -1, step: 1 + ((f + 1) % 2), coat: "#8a5a9e", skin: "#efc7a0", hair: "#553311",
      dress: true, pill: "#d94f43", bob: true, bag: true,
    });
    R(wx2 - 3, 134, 4, 1, "#b5443a"); // lipstick
    const px0 = 264 + (f % 4 < 2 ? 0 : 6);
    R(px0, 184, 8, 6, "#9aa3ad"); R(px0, 184, 8, 2, "#b3bac2");
    R(px0 + 8, 182 + (f % 5 === 0 ? 4 : 0), 4, 4, "#9aa3ad");
    P1(px0 + 12, 183 + (f % 5 === 0 ? 4 : 0), "#c9973b"); P1(px0 + 9, 183 + (f % 5 === 0 ? 4 : 0), "#221d16");
    P1(px0 + 2, 190, "#6e747c"); P1(px0 + 6, 190, "#6e747c"); // feet
    // a checker cab rumbles past, close to the camera — big as life
    // (scaled 1.4x around its road line: next to a 62px person a checker
    // cab is LONG — the unscaled one read as a toy)
    const cb = ((f * 14) % (HDW + 200)) - 100;
    g.save();
    g.translate(cb + 50, 224); g.scale(1.4, 1.4); g.translate(-(cb + 50), -224);
    SH(cb + 2, 219, 98, 5, .28);
    R(cb, 198, 100, 16, "#e8b93c"); R(cb, 198, 100, 2, "#f5d271"); // body
    R(cb + 2, 209, 96, 1, "#f5d271"); R(cb, 212, 100, 2, "#c9973b"); // belt line + rocker
    P1(cb, 198, "#c9973b"); P1(cb + 99, 198, "#c9973b"); // rounded corners
    R(cb + 22, 186, 48, 14, "#f2d06b"); R(cb + 22, 186, 48, 2, "#f8e09a"); // cabin
    P1(cb + 22, 186, "#e8b93c"); P1(cb + 69, 186, "#e8b93c");
    R(cb + 40, 181, 14, 5, "#efe6d0"); R(cb + 42, 182, 10, 2, "#9a8f77"); // rooflight sign
    R(cb + 26, 188, 16, 10, "#33404e"); R(cb + 48, 188, 16, 10, "#33404e"); // windows
    R(cb + 44, 188, 3, 10, "#e8b93c"); // pillar
    P1(cb + 27, 189, "#8fa3b5"); P1(cb + 49, 189, "#8fa3b5"); // glass glints
    R(cb + 56, 190, 7, 8, "#221d16"); P1(cb + 58, 189, "#3a3f4a"); // the driver, cap on
    for (let k = 0; k < 12; k++) R(cb + 2 + k * 8, 203, 4, 4, k % 2 ? "#221d16" : "#efe6d0"); // checkers
    R(cb + 12, 210, 24, 6, "#d1a52f"); R(cb + 64, 210, 24, 6, "#d1a52f"); // fender skirts
    R(cb + 14, 214, 20, 10, "#1c1c1c"); R(cb + 66, 214, 20, 10, "#1c1c1c"); // wheels
    R(cb + 20, 217, 8, 4, "#c9c9c9"); R(cb + 72, 217, 8, 4, "#c9c9c9"); // hubcaps
    P1(cb + 22, 218, "#f2f2f2"); P1(cb + 74, 218, "#f2f2f2");
    R(cb + 96, 210, 8, 4, "#c9c9c9"); R(cb - 4, 210, 8, 4, "#c9c9c9"); // chrome bumpers
    R(cb + 94, 202, 4, 6, "#9aa3ad"); // grille
    P1(cb + 98, 200, "#fff6d8"); P1(cb + 99, 201, "#ffe38a"); // headlight
    P1(cb - 8, 206, "#565961"); P1(cb - 12, 210, "#565961"); P1(cb - 7, 213, "#565961"); // dust
    g.restore();
    // the publishers' agents talk shop with the vendor at his window — at
    // STREET scale (~62px): this is an exterior, and the interior painter
    // made them tower over the newsstand
    const salesOcc = roomOccupants("sales");
    const salesStations = [
      [100, 172, 1],             // at the booth's west window
      [236, 174, -1],            // by the lamppost side
      [78, 190, 1],
      [258, 192, -1],
      [48, 188, 1],
    ];
    salesOcc.forEach((o2, k) => {
      if (!salesStations[k]) return;
      const [sx, sy, sd] = salesStations[k];
      streetWorker(sx, sy + ((f + k) % 2), o2.pid, { dir: sd, char: staffCharFor("sales", o2.slot) });
    });
    g.restore();
    // the lift exposes 26 fresh rows at the bottom — more asphalt, which the
    // tile's queue rail mostly covers anyway
    R(0, 198, HDW, 26, "#3c3f46");
    R(126, 204, 24, 4, "#565961"); R(250, 210, 24, 4, "#565961");
    dith(0, 210, HDW, 14, "#33363c");
  }
  // a placed worker at exterior street scale: same person, same house
  // wardrobe as the rail sprite and the interior render, ~62px tall
  function streetWorker(x, y, pid, o = {}) {
    const p = UI.engine.player(pid), pub = PUBLISHERS[p.color];
    const ch = o.char !== undefined ? o.char : pid % 4;
    const look = WORKER_LOOKS[ch];
    const attire = [
      { coat: pub.color, pants: pub.dark, hat: pub.dark, tie: pub.dark },
      { coat: WORKER_WHITE, dress: true, skirtC: pub.color, bun: true },
      { coat: WORKER_WHITE, pants: pub.color, susp: pub.color },
      { coat: pub.color, dress: true, skirtC: pub.color, belt: pub.dark, bob: true },
    ][ch];
    SH(x - 10, y - 2, 20, 3, .16);
    streetGuy(x, y, { dir: o.dir || 1, skin: look.skin, hair: look.hair, ...attire, ...o });
  }

  const HD_PAINTERS = {
    ideas: drawIdeasHD, hire: drawHireHD, develop: drawDevelopHD,
    print: drawPrintHD, royalties: drawRoyaltiesHD, sales: drawSalesHD,
  };

  // ------------------------------------------------------- animation ticker
  const live = new Map(); // canvas -> painter fn
  let frame = 0, timer = null;

  function draw(cv, painter) {
    g = cv.getContext("2d");
    g.clearRect(0, 0, cv.width, cv.height);
    painter(frame);
    // soft vignette frame on the big room scenes (thickness follows the scale)
    const vs = cv.width === W ? 1 : cv.width === HDW ? 2 : 0;
    if (vs) {
      const b = 2 * vs;
      g.fillStyle = "rgba(0,0,0,.22)";
      g.fillRect(0, 0, cv.width, b); g.fillRect(0, 0, b, cv.height);
      g.fillRect(cv.width - b, 0, b, cv.height); g.fillRect(0, cv.height - b, cv.width, b);
    }
  }
  function start(cv, painter) {
    draw(cv, painter);
    // reduced motion: one calm frame per room, no ticker
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    live.set(cv, painter);
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
    if (HD_PAINTERS[action]) { cv.width = HDW; cv.height = HDH; start(cv, HD_PAINTERS[action]); }
    else { cv.width = W; cv.height = H; start(cv, PAINTERS[action]); }
  }
  // the original 1x painter, kept addressable for side-by-side art comparisons
  function attachClassic(cv, action) {
    cv.width = W; cv.height = H;
    start(cv, PAINTERS[action]);
  }
  function attachSpecial(cv, key) {
    cv.width = 84; cv.height = 56;
    if (SPECIAL_P[key]) start(cv, SPECIAL_P[key]);
  }

  return { attach, attachClassic, attachSpecial, staffCharFor };
})();
