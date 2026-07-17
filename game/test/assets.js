// ============================================================================
// Asset integrity: every sprite the game data can derive exists in ATLAS,
// atlas rects stay inside their sheets, and every linked stylesheet / runtime
// art reference exists on disk.
// Run: node game/test/assets.js
// ============================================================================
"use strict";
const fs = require("fs");
const path = require("path");

const GAME = path.join(__dirname, "..");
const code = ["../assets/atlas.js", "data.js"]
  .map((f) => fs.readFileSync(path.join(GAME, "js", f), "utf8"))
  .join("\n") + "\n;global.__G={ATLAS,SHEET_SIZES,GENRES,COMICS,CREATIVES,RIPOFF_TITLES,PUBLISHERS,PLAYER_COLORS,ACTIONS,ACTION_INFO,GENRE_INFO,SPECIALS};";
eval(code);
const { ATLAS, SHEET_SIZES, GENRES, COMICS, CREATIVES, RIPOFF_TITLES, PUBLISHERS, PLAYER_COLORS, ACTIONS, ACTION_INFO, GENRE_INFO } = global.__G;

let failures = 0;
function fail(msg) { failures++; console.error("FAIL  " + msg); }

// ------------------------------------------------------- sheet dimensions
function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(12) !== 0x49484452) throw new Error("no IHDR: " + file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
// the HD sheets ship as lossy webp (VP8X container from Pillow; VP8/VP8L
// parsed too in case a future save drops the alpha)
function webpSize(file) {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP")
    throw new Error("not a webp: " + file);
  const four = b.toString("ascii", 12, 16);
  if (four === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (four === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (four === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) };
  }
  throw new Error("unknown webp variant " + four + ": " + file);
}
function sheetSize(file) { return file.endsWith(".webp") ? webpSize(file) : pngSize(file); }
const sheets = {};
for (const key of Object.keys(ATLAS)) {
  const e = ATLAS[key];
  const ext = (SHEET_SIZES[e.sheet] && SHEET_SIZES[e.sheet].ext) || "png";
  const file = path.join(GAME, "assets", e.sheet + "." + ext);
  if (!(e.sheet in sheets)) sheets[e.sheet] = fs.existsSync(file) ? sheetSize(file) : null;
  const dim = sheets[e.sheet];
  if (!dim) { fail(`sprite ${key}: sheet ${e.sheet} file missing`); continue; }
  if (!(e.w > 0 && e.h > 0)) fail(`sprite ${key}: empty rect`);
  // strict: the generator clamps sprites to their cells, so any rect
  // outside its sheet is a real bug (this once clipped boss portraits)
  if (e.x < 0 || e.y < 0 || e.x + e.w > dim.w || e.y + e.h > dim.h)
    fail(`sprite ${key}: rect ${e.x},${e.y} ${e.w}x${e.h} outside sheet ${e.sheet} (${dim.w}x${dim.h})`);
}
console.log(`  ok  ${Object.keys(ATLAS).length} atlas rects within their sheets`);

// no two sprites may overlap on a sheet (this once corrupted faces.png)
{
  const bySheet = {};
  for (const key of Object.keys(ATLAS)) (bySheet[ATLAS[key].sheet] = bySheet[ATLAS[key].sheet] || []).push(key);
  let overlaps = 0;
  for (const keys of Object.values(bySheet))
    for (let i = 0; i < keys.length; i++)
      for (let j = i + 1; j < keys.length; j++) {
        const a = ATLAS[keys[i]], b = ATLAS[keys[j]];
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
          overlaps++;
          fail(`sprites overlap: ${keys[i]} and ${keys[j]} on ${a.sheet}`);
        }
      }
  if (!overlaps) console.log(`  ok  no sprite rects overlap on any sheet`);
}

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
for (const c of CREATIVES) need.add(c.sprite).add("face_" + c.sprite).add("facebig_" + c.sprite);
for (const v of [1, 2, 3]) need.add("back_writer_" + v).add("back_artist_" + v);
for (const col of PLAYER_COLORS) {
  need.add(PUBLISHERS[col].logo).add("meeple_" + col).add("boss_" + col).add("bossbig_" + col).add("bosssm_" + col);
  for (let i = 0; i < 4; i++) need.add(`staff_${col}_${i}`); // publisher-rail editors
}
for (const a of ACTIONS) need.add(ACTION_INFO[a].scene).add(ACTION_INFO[a].scene + "_b").add("port_" + a);
for (const k of ["coin_1", "coin_2", "coin_5", "coin_10", "vp_1", "vp_2", "vp_3", "ticket", "hype",
  "bettercolor", "calendar", "title", "teletype", "icon_typewriter", "icon_brushes", "scene_newsstand", "scene_newsstand_b"])
  need.add(k);
// user-drawn cutouts (game/assets/custom pipeline): per-genre trade icons,
// tag ribbons + micro glyphs, genre symbols, and the panel-header vignettes
for (const g of GENRES) need.add(`wicon_${g}`).add(`aicon_${g}`).add(`genreicon_${g}`);
for (const a of ACTIONS) need.add("vig_" + a);
for (const k of ["vig_hype", "tag_writer", "tag_artist", "micro_writer", "micro_artist",
  "mystery_writer", "mystery_artist", "mysterybig_writer", "mysterybig_artist"]) need.add(k);
// print-era HD twins (cardshd/vignhd sheets, crisp): the paper surfaces —
// panels, inspectors, reveals, letterheads — draw these through sprHD()
for (const c of COMICS) need.add("hd_cover_" + c.id);
for (const g of GENRES) {
  const count = COMICS.filter((c) => c.genre === g).length;
  for (let i = 1; i <= count; i++) need.add(`hd_cover_rip_${g}_${i}`);
  need.add("hd_back_orig_" + g);
}
for (const v of [1, 2, 3]) need.add("hd_back_writer_" + v).add("hd_back_artist_" + v);
for (const a of ACTIONS) need.add("hd_vig_" + a);
need.add("hd_vig_hype");
for (const col of PLAYER_COLORS) need.add("hd_" + PUBLISHERS[col].logo).add("hd_boss_" + col);
// pass-2 HD masters: faces, tokens, icons — spr() auto-serves these
for (const c of CREATIVES) need.add("hd_face_" + c.sprite);
for (const g of GENRES)
  need.add(`hd_idea_${g}`).add(`hd_mastery_${g}`).add(`hd_gicon_${g}`)
    .add(`hd_wicon_${g}`).add(`hd_aicon_${g}`).add(`hd_genreicon_${g}`);
for (const k of ["hd_coin_1", "hd_coin_2", "hd_coin_5", "hd_coin_10", "hd_vp_1", "hd_vp_2", "hd_vp_3",
  "hd_hype", "hd_ticket", "hd_bettercolor", "hd_tag_writer", "hd_tag_artist",
  "hd_micro_writer", "hd_micro_artist", "hd_mystery_writer", "hd_mystery_artist"]) need.add(k);
for (const k of need) if (!ATLAS[k]) fail(`missing atlas sprite: ${k}`);
console.log(`  ok  ${need.size} data-derived sprites checked against ATLAS`);

// --------------------------------------------------- referenced game files
const html = fs.readFileSync(path.join(GAME, "index.html"), "utf8");
const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]);
for (const cssRef of refs.filter((r) => r.endsWith(".css"))) {
  const css = fs.readFileSync(path.join(GAME, cssRef), "utf8");
  for (const m of css.matchAll(/url\(["']?([^)"']+)["']?\)/g))
    if (!m[1].startsWith("data:")) refs.push(path.join(path.dirname(cssRef), m[1]));
}
// runtime art referenced from JavaScript needs the same missing-file guard
for (const jsFile of fs.readdirSync(path.join(GAME, "js")).filter((f) => f.endsWith(".js"))) {
  const js = fs.readFileSync(path.join(GAME, "js", jsFile), "utf8");
  for (const m of js.matchAll(/["'](assets\/[^"']+\.(?:png|jpg|jpeg|webp))["']/gi)) refs.push(m[1]);
}
const uniqueRefs = [...new Set(refs.map((r) => path.normalize(r)))];
for (const r of uniqueRefs)
  if (!fs.existsSync(path.join(GAME, r))) fail(`referenced file missing: ${r}`);
console.log(`  ok  ${uniqueRefs.length} referenced files exist (HTML + CSS + runtime art)`);

if (failures) { console.error(`\n${failures} asset failures`); process.exit(1); }
console.log("\nassets OK");
