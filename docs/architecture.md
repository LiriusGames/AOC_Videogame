# Game and multiplayer architecture

## Shared command boundary

UI code sends rules actions through `UI.session.dispatch(kind, payload)`.
`LocalSession` applies them directly for solo/tutorial. `RemoteSession`
validates against a scratch snapshot and sends them to the room relay; the real
multiplayer Engine changes only when the ordered echo returns.

Main modules:

- `engine.js`: deterministic rules state and seeded RNG.
- `ai.js`: deterministic automated-publisher choices.
- `protocol.js`: command validation/application and stable rules-plus-RNG hashes.
- `session.js`: local and remote command ownership.
- `multiplayer.js`: invite lobby and live room/desk controls.
- `worker/index.mjs`: Durable Object relay, ordering, replay, and room expiry.

## Trusted lockstep flow

1. The host sends one `hello` containing the seed, players, controls, and pids.
2. Every client constructs the identical Engine with fixed seat order.
3. A human client validates a move on a temporary rewind and sends
   `{k:"cmd", seat, kind, payload, h}`.
4. The relay verifies message shape/seat ownership, assigns a global sequence,
   stores it, and echoes it to every socket including the sender.
5. Every client checks `h`, applies the command, and synchronously drains any
   bot decisions until another human decision is required.
6. UI rendering and animations run after that deterministic state transition.

The browser and Worker also share a build stamp. A mismatched client is refused
before entering a room, and active clients poll the stamp every 10 minutes.
Sequence gaps are fatal: clients never skip an entry and continue silently.

This separation is important: timers and background-tab throttling may delay a
visual, but they cannot delay or reorder bot state mutations.

## Reconnect and seat changes

The browser stores `{room,pid,token,name}` locally. The public `pid` identifies
a roster entry; the private 128-bit token is the resume credential, travels in
the WebSocket protocol header rather than its URL, and is stored only as a
SHA-256 hash by the room. An automatic reconnect supplies
the last applied sequence and receives only missed entries. The relay finishes
with an ordered `sync` marker; until it arrives, the browser keeps input locked.
This resolves the case where a socket dies after send but before its command
echo. A full reload rebuilds from `hello` and replays the complete append-only
log. Only the newest socket for a stored player id remains active, so a
duplicated tab cannot issue concurrent commands for one desk.

The host can lock the table against new identities and remove a participant.
Known token holders may reconnect to a locked room. A room admits at most 12
identities/sockets; the account-level Cloudflare rate-limit rule remains an
operator requirement before public traffic.

The host may order a disconnected human seat to become a bot. A returning or
late player can claim a bot seat. These messages share the same ordered log as
commands, so every client changes control at the same point in history.

## Explicit trust boundary

The relay is not a game referee. All clients contain full state, and rules are
enforced locally. State hashes detect accidental divergence; they are not an
anti-cheat mechanism. The current design is suitable for invited trusted
playtests, not adversarial or privacy-sensitive public play.

The later authoritative phase should move Engine/AI ownership to the Durable
Object, authenticate seats with high-entropy credentials, validate commands on
the server, persist official snapshots/revisions, and send a redacted view to
each player.
