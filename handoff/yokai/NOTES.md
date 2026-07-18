# Yokai multiplayer handoff — architecture distillation

Source: `index.html` (NET + MULTIPLAYER PROTOCOL sections), `worker.mjs`, `nettest.mjs`
attached by Giacomo on 2026-07-18. worker.mjs saved verbatim beside this file
(admin dashboard HTML trimmed); nettest.mjs saved verbatim. This note captures the
contracts AOC's port must honor.

## The relay contract (worker.mjs — keep it DUMB)
- One Durable Object per room (`/room/CODE/ws`), hibernation API, per-socket pid attachment.
- Client connects with `?name=&pid=&since=`. Unknown/invalid pid → server mints one
  (8 hex chars) and sends `{t:"you", pid, host}`. Client persists {room,pid,name} in
  localStorage and reclaims the same pid on reconnect.
- Room state: `hello` (host's one-time session setup), `cfg` (mutable lobby seat plan,
  host-only until hello), `seq` + `log` (every game message stamped `{t:"m", n:++seq, m}`
  and rebroadcast TO EVERYONE INCLUDING SENDER), `order` (pids by first join), `names`.
- Host = first pid in join order that is still connected (re-elected implicitly on close).
- On connect the DO replays: you → cfg → hello → log entries with n > since → roster.
- Roster broadcast on join/close/error: `{t:"roster", host, players:[{pid,name,on}]}`.
- Room expiry: storage alarm bumped to now+24h on every activity; alarm closes sockets
  and deleteAll().
- `/build` returns a deploy stamp for stale-tab detection. `/log` + `/note` POST to a
  SQLite Ledger DO (playtest telemetry + player feedback); `/admin?key=` guarded by env.

## The lockstep client contract
- Pure sim: `mpNewSession({seed,nPlayers,names,seats,pids})` builds the identical
  deterministic game on every client (seeded rng consumed only at setup).
- LOCAL INPUT NEVER MUTATES THE SIM. It sends `{t:"m", m}` and the mutation happens when
  the relay echoes it back in global order (`mpApply`). Visual feedback for your own
  moves is stashed at send time (pend/evPend) and played in the hooks when the echo lands.
- Bots live INSIDE the sim — their moves never travel; any client computes them
  deterministically. The whole game is a pure function of seed + ordered message log,
  which is also the reconnect story: replay the log into a fresh session.
- Message hygiene: stale/duplicate messages DROP silently and identically on every
  client; structurally invalid messages THROW → treated as desync, surfaced loudly.
- Desync sentinel: each pick carries the sender's hash of the previous resolution
  (`ph`); a mismatch on any client → desync banner "reload to replay the room log".
  Hash = FNV-1a over a whitelisted canonical serialization (rules state only, no UI
  transients, no rng).
- One in-flight instant move at a time per client (evLock) + a pick interlock
  (netSent): your indices stay valid until the echo. Per-sender FIFO from the relay is
  what keeps index-based payloads (hand index, bench index) honest.
- Seat conversion on disconnect is the HOST's CALL, not a timer: banner offers
  "Replace with bot" → `{k:"seat",seat,ctl:"bot"}`. The player can return and reclaim:
  `{k:"claim",seat,pid,name}` (only claimable if seat is currently a bot); claim also
  serves LATE JOIN (open a link to a started table → pick any bot seat).
- Stale-tab: client fetches `/build` every 10 min; mismatch shows a refresh banner.

## Lobby (host-managed, broadcast as cfg)
- Host picks table size; arriving friends auto-fill open seats in join order; host can
  cycle any seat human→bot→open. The game starts only when every seat holds a player
  or a bot — never silent auto-fill. Non-host sees "the host is seating the innkeepers".
- Start: host sends `hello` = {seed:random, nPlayers, names, seats, pids}; the DO stores
  it once and replays it to every future joiner. Everyone (host included) builds the
  session only when hello arrives.
- Watching list: connected pids without a seat are spectators; they follow the sim and
  can claim a bot seat live.
- Share link `?room=CODE` boots straight into that room's lobby: ask the player's name
  via overlay FIRST, connect only after OK (the name rides the socket query).

## AOC mapping decisions (2026-07-18)
- AOC's engine is already deterministic + event-sourced with command envelopes
  (protocol.js) — the "pick" cadence of Yokai (simultaneous draft) simplifies to
  sequential turns: every ordered `{k:"cmd", seat, kind, payload}` applies via
  protocol.applyEngineCommand on every client; turn legality is engine-enforced.
- Bots: Tutor-style scripted bots don't exist in multiplayer; AI.takeTurn is
  deterministic given (engine state, rng) → every client advances bot turns locally
  when currentPlayerId() is a bot seat. No bot messages on the wire.
- Undo: none in multiplayer (published moves are final on every screen).
- View hashes already exist in protocol.js → the desync sentinel rides on them.
- The old authoritative DO (revision control, redaction, hashed tickets) is RETIRED —
  private tables among friends don't need server-side hidden information.
