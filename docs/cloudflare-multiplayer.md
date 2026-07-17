# Cloudflare private-room operations

The multiplayer release is a two-seat, invite-only vertical slice. Cloudflare
Workers serves the existing `game/` directory; `/api/*` runs through the Worker;
one SQLite-backed Durable Object owns each room.

## Local development

From the repository root:

```sh
npm install
npm run dev:cloudflare
```

Open the Wrangler URL, choose **TWO-PLAYER PRIVATE ROOM**, copy the guest link,
and open it in a separate browser profile. The ordinary Node/Python static
servers remain suitable for solo and tutorial testing, but their `/api` route
does not provide multiplayer.

## Deploy

```sh
npx wrangler login
npm run deploy:staging
```

Use a separate Cloudflare Worker name for staging. Promote the exact tested
commit with `npm run deploy:production`; do not reuse a development room as a
production validation environment.

The configuration uses the current declarative Durable Object `exports` model
with SQLite storage. Static assets run asset-first except `/api/*`.

## Persistence and reconnect

- Rooms pin round-1 turn order host-first at engine setup (the engine's
  `fixedTurnOrder` option), so setup's position compensation follows the seats
  and the host can found the house while the invite is still in flight.

## Persistence and reconnect

- The room stores engine config, snapshot (including RNG), monotonic revision,
  status, hashed seat tickets, and a seven-day command deduplication ledger.
- Snapshot/revision/ledger writes occur in one synchronous storage transaction.
- WebSockets use the Hibernation API. Seat identity is serialized on the socket,
  and a newer connection replaces an older tab for the same seat.
- A disconnect retries with exponential backoff. Resume and stale-revision paths
  return the latest per-seat snapshot.
- Active rooms expire after 30 days without a successful command; the alarm
  closes sockets and deletes the room storage.

## Privacy and abuse boundary

- Room and seat tickets are high-entropy bearer secrets. Only SHA-256 hashes are
  stored. The ticket travels in the invite once, is removed from browser history,
  and is sent to WebSocket auth as a subprotocol rather than a logged URL query.
- Each seat sees its own hand and pending choices. Opponent hands/hype, deck
  order, future calendar, face-down orders, and other-seat pending data are
  redacted before serialization.
- Rooms have no index, search endpoint, spectator token, chat, or public profile.
- API writes require same-origin requests and JSON; commands have a strict size,
  version, revision, turn, resource, and ownership checks.

Before public traffic, add a Cloudflare account-level rate-limit rule for
`POST /api/rooms` and alerting for Worker exceptions, Durable Object error rate,
and reconnect loops.

## Release boundary

Private rooms are stable only when the invite-only criteria pass. Matchmaking,
accounts, spectators, friends, chat, and other social features remain explicitly
out of scope until then.
