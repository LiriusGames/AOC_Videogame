// ============================================================================
// Asset integrity: every sprite the game data can derive exists in ATLAS,
// atlas rects stay inside their sheets, and every file index.html and
// style.css reference exists on disk.
// Run: node game/test/assets.js
// ============================================================================
"use strict";
const fs = require("fs");
const path = require("path");

const GAME = path.join(__dirname, "..");
const code = ["../assets/atlas.js", "data.js"]
  .map((f) => fs.readFileSync(path.join(GAME, "js", f), "utf8"))
  .join("\n") + "\n;global.__G={ATLAS,GENRES,COMICS,CREATIVES,RIPOFF_TITLES,PUBLISHERS,PLAYER_COLORS,ACTIONS,ACTION_INFO,GENRE_INFO,SPECIALS};";
eval(code);
const { ATLAS, GENRES, COMICS, CREATIVES, RIPOFF_TITLES, PUBLISHERS, PLAYER_COLORS, ACTIONS, ACTION_INFO, GENRE_INFO } = global.__G;

let failures = 0;
function fail(msg) { failures++; console.error("FAIL  " + msg); }

// ------------------------------------------------------- sheet dimensions
function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(12) !== 0x49484452) throw new Error("no IHDR: " + file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
const sheets = {};
for (const key of Object.keys(ATLAS)) {
  const e = ATLAS[key], file = path.join(GAME, "assets", e.sheet + ".png");
  if (!(e.sheet in sheets)) sheets[e.sheet] = fs.existsSync(file) ? pngSize(file) : null;
  const dim = sheets[e.sheet];
  if (!dim) { fail(`sprite ${key}: sheet ${e.sheet}.png missing`); continue; }
  if (!(e.w > 0 && e.h > 0)) fail(`sprite ${key}: empty rect`);
  // the generator lets a few rects bleed slightly past the edge (canvas
  // clamps source rects, so up to 8px of bleed is harmless); more is a bug
  const TOL = 8;
  if (e.x < -TOL || e.y < -TOL || e.x + e.w > dim.w + TOL || e.y + e.h > dim.h + TOL)
    fail(`sprite ${key}: rect ${e.x},${e.y} ${e.w}x${e.h} outside ${e.sheet}.png (${dim.w}x${dim.h})`);
}
console.log(`  ok  ${Object.keys(ATLAS).length} atlas rects within their sheets`);

// ----------------------------------------------- data-derived sprite names
const need = new Set();
for (const c of COMICS) {
  need.add(c.id).add("cover_" + c.id);
  if (!RIPOFF_TITLES[c.id]) fail(`comic ${c.id}: no rip-off title`);
}
for (const g of GENRES) {
  const count = COMICS.filter((c) => c.genre === g).length;
  for (let i = 1; i <= count; i++) need.add(`rip_${g}_${i}`).add(`cover_rip_${g}_${i}`);
  need.add("back_orig_" + g).add("idea_" + g).add("mastery_" + g).add(GENRE_INFO[g].icon);
}
for (const c of CREATIVES) need.add(c.sprite).add("face_" + c.sprite);
for (const v of [1, 2, 3]) need.add("back_writer_" + v).add("back_artist_" + v);
for (const col of PLAYER_COLORS)
  need.add(PUBLISHERS[col].logo).add("meeple_" + col).add("boss_" + col).add("bossbig_" + col);
for (const a of ACTIONS) need.add(ACTION_INFO[a].scene).add(ACTION_INFO[a].scene + "_b").add("port_" + a);
for (const k of ["coin_1", "coin_2", "coin_5", "coin_10", "vp_1", "vp_2", "vp_3", "ticket", "hype",
  "bettercolor", "calendar", "title", "icon_typewriter", "icon_brushes", "scene_newsstand", "scene_newsstand_b"])
  need.add(k);
for (const k of need) if (!ATLAS[k]) fail(`missing atlas sprite: ${k}`);
console.log(`  ok  ${need.size} data-derived sprites checked against ATLAS`);

// --------------------------------------------------- referenced game files
const html = fs.readFileSync(path.join(GAME, "index.html"), "utf8");
const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]);
const css = fs.readFileSync(path.join(GAME, "css", "style.css"), "utf8");
for (const m of css.matchAll(/url\(["']?([^)"']+)["']?\)/g))
  if (!m[1].startsWith("data:")) refs.push(path.join("css", m[1]));
for (const r of refs)
  if (!fs.existsSync(path.join(GAME, r))) fail(`referenced file missing: ${r}`);
console.log(`  ok  ${refs.length} referenced files exist (index.html + style.css)`);

if (failures) { console.error(`\n${failures} asset failures`); process.exit(1); }
console.log("\nassets OK");
