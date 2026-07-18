# Cloudflare trusted-room operations

Multiplayer is currently a **trust-based lockstep preview** for 2–4 publishers.
Cloudflare Workers serves `game/`; one SQLite-backed Durable Object per room is
a message relay and replay log. It does not run the Age of Comics rules.

## Local development

From the repository root:

```sh
npm install
npm run dev:cloudflare
```

Open the Wrangler URL, choose **TWO-PLAYER PRIVATE ROOM**, enter a name, and
share the `?room=CODE` link. Use separate browser profiles for a local
multi-player test. Ordinary static servers still support solo/tutorial, but
their `/api` route does not provide rooms.

## How the room works

- The first connected player is host. The host selects 2–4 seats and marks
  each as a connected person or bot before opening the newsroom.
- Every browser builds the same seeded Engine. A local move is validated on a
  scratch snapshot, sent to the relay, and applied only when its globally
  ordered echo returns.
- Every command includes the sender's pre-command rules-and-RNG hash. A
  mismatch or missing sequence number stops that client loudly instead of
  allowing a silent divergence.
- Bot decisions are drained synchronously while each ordered message is
  applied. UI animations never decide when a bot mutates room state.
- The relay stores the one-time setup and each ordered message as an
  append-only Durable Object entry. Reconnects keep the same player id and
  replay messages after `since`. A final ordered
  sync marker re-enables input only after replay is complete, including when a
  connection dropped around an in-flight command.
- Rooms expire 24 hours after their most recent activity.
- Browser and Worker share a build stamp. Stale tabs are refused at connect and
  active rooms check for a deployment change every 10 minutes.
- Only one socket may control a player id. Opening the same desk in another tab
  transfers control to the newer tab and stops the older connection.

## Disconnects and desk control

Open **ROOM** during a match to see connection status. A disconnected human
desk stays reserved. The current host may hand it to a bot; the returning
player can then use **RESUME MY DESK**. A late joiner may take an automated
desk. Seat-control messages are globally ordered with game commands.

## Trust and privacy boundary

This preview is only for people who trust one another:

- Every browser holds the complete deterministic state, including hidden
  hands, decks, and future information. Developer tools can reveal it.
- The relay checks frame shape and current seat ownership, but it does not
  validate Age of Comics rules. A deliberately modified client is outside the
  supported threat model.
- The room code is an invitation, not a secure account or high-entropy secret.
  Share it privately and create a new room for each play session.
- There is no matchmaking, account system, spectator privacy, chat, or public
  room directory.

Do not describe this version as authoritative, cheat-resistant, or
privacy-safe. Those properties require the planned server-authoritative phase.

## Deploy

```sh
npx wrangler whoami
npm run deploy:staging
```

Test the exact staging deployment before production promotion:

```sh
npm run deploy:production
```

Before public traffic, add an account-level rate limit for room WebSocket
upgrades and monitoring for Worker/Durable Object errors. Production remains a
trusted-friends preview until the authoritative privacy phase is complete.
