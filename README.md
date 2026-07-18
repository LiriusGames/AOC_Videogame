# Age of Comics: The Golden Years — 16-bit Videogame

![Status: Playable](https://img.shields.io/badge/Status-Solo_Playable-success)
![Platform: Web](https://img.shields.io/badge/Platform-Web_Browser-blue)
![Stack: HTML5 Canvas](https://img.shields.io/badge/Stack-HTML5_Canvas_|_JS-yellow)

This repository contains a single-player web videogame reinterpretation of the acclaimed board game **Age of Comics: The Golden Years** (design: Sónia Gonçalves & Giacomo Cimini, artwork: Laura Guglielmo). 

In this digital adaptation, you run a Manhattan publishing house during the Golden Age of comic books (1938–1954), either against 1–3 AI-driven rivals or one invited player in a private Cloudflare room. The game takes the original high-resolution board game artwork and converts it into a retro 16-bit pixel-art aesthetic.

## Current Project Status: Where We Are At

**Solo play implements the base-game rules (V27). The guided First Day tutorial is a release candidate; 2–4 player trusted rooms are a lockstep preview pending staging.**

It currently features:
* **Full Rules Implementation:** Worker placement, hiring, developing, getting ideas, printing originals and rip-offs, royalties, Manhattan sales map, the chart, mastery tokens, all 6 special actions, creative learning/training, and full end-game scoring.
* **AI Opponents:** 4 distinct AI personalities that will challenge you:
  * **Goldie Marsh** (Star Syndicate) — The Chart Chaser
  * **Rex Calloway** (Torch Press) — The Rip-off Artist
  * **Vivian Cole** (Liberty Ink) — The Specialist
  * **Mortimer Quill** (Quill & Sons) — The Money Man
* **Customization:** Three difficulty settings and optional rip-off modes.
* **Retro Vibes:** Chiptune sound effects and a lo-fi swing background track.
* **Automated Asset Generation:** A Python-based build tool (`tools/build_assets.py`) that proceduraly generates the 16-bit spritesheets from the original high-resolution board game assets.
* **Headless Testing:** A built-in headless simulator (`test/sim.js`) that runs 180 all-AI games in Node.js to constantly check rule invariants and ensure balance.
* **Trusted-Room Multiplayer Preview:** A Cloudflare Durable Object orders and replays moves while every invited browser runs the same deterministic game. This phase is for trusted friends; it is not yet authoritative or hidden-information-safe.
* **No Client Build Step:** The browser remains plain HTML, CSS, canvas, and vanilla JavaScript. Wrangler is only needed to develop or deploy multiplayer.

## Project Structure

* `/game/` — The complete source code of the web-based game. See `game/README.md` for specific instructions on running and debugging the game.
* `/Assets/` — Original high-resolution graphical assets from the physical board game, used as the source for the 16-bit generator.
* `/Rulebook/` — Digital PDF versions of the official physical board game manuals.
* `/docs/architecture.md` — Shared command/session boundary and module graph.
* `/docs/cloudflare-multiplayer.md` — Trusted-room operations, reconnect behavior, limitations, and deployment.
* `/docs/staging-playtest.md` — Invite-only release gate and playtest script.

## How to Play

If you just want to jump in and play:
1. Navigate to the `game` directory.
2. Double-click the `PLAY.bat` file to start a local server and automatically launch the game in your browser. 
*(Alternatively, run `node tools/serve.js` in the `game` folder and navigate to `http://localhost:8477`.)* Direct `file://` launch is intentionally blocked.
