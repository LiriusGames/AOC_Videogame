# AGE OF COMICS: The Golden Years — 16-bit Videogame

A single-player videogame reinterpretation of the board game *Age of Comics: The
Golden Years* (design: Sónia Gonçalves & Giacomo Cimini, artwork: Laura
Guglielmo). You run a Manhattan publishing house in 1938–54 against 1–3 AI
rival publishers, each with their own personality. All the original artwork has
been machine-reinterpreted into a 16-bit pixel-art style.

## How to run

**Easiest:** double-click `PLAY.bat` — it starts a tiny local web server
(Python) and opens the game in your browser.

**Manual:** open a terminal in this folder and run either

    python -m http.server 8477

then browse to <http://localhost:8477/>. Opening `index.html` directly from
disk usually works too (Chrome/Edge), but the local server route is guaranteed.

## What's inside

- Complete base-game rules (V27): worker placement, hiring, developing,
  ideas, printing originals and rip-offs, royalties, the Manhattan sales map,
  the chart, mastery tokens, all 6 special actions, creative
  learning/training, end-of-round rankings and full end-game scoring.
- 1–3 AI rivals playing the full rules with personalities:
  - **Goldie Marsh** (Star Syndicate) — chart chaser
  - **Rex Calloway** (Torch Press) — rip-off artist
  - **Vivian Cole** (Liberty Ink) — specialist teams
  - **Mortimer Quill** (Quill & Sons) — money man
- Three difficulties, optional rip-offs (base game "first game" variant),
  chiptune SFX and a lo-fi swing loop (toggle with the ♪ button).

## Dev notes

- `tools/build_assets.py` — regenerates the 16-bit spritesheets in `assets/`
  from the original artwork in `../Assets` (requires Python + Pillow).
- `test/sim.js` — headless playtest: `node test/sim.js` runs 180 all-AI games
  and checks rules invariants.
- Debug URLs: `index.html?autoplay` (AI plays all seats — spectator mode),
  `index.html?scene=hire|develop|ideas|print|sales|increase` (jump into a scene).
- No build step, no dependencies: plain HTML/CSS/JS + canvas.
