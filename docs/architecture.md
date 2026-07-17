# Runtime architecture and trust boundary

The browser UI and the Cloudflare room now speak the same versioned command
language. Solo play applies a command to a local engine; multiplayer sends that
same command to the authoritative room. UI code does not choose an actor ID and
does not directly mutate an authoritative multiplayer state.

## Module graph

```text
data.js ─────► engine.js ─────► ai.js
   │              │
   └──────────────┴───────────► protocol.js
                                   │
                         ┌─────────┴──────────┐
                         ▼                    ▼
                    session.js       worker/index.mjs
                         │           (GameRoom + SQLite)
                         ▼
        tutorial.js / ui-core.js / ui-scenes.js / main.js
```

- `data.js`: immutable cards, map, slots, and rule tables.
- `engine.js`: deterministic state machine, seeded RNG, snapshot/restore.
- `ai.js`: local solo rivals; never runs an opponent seat in a private room.
- `protocol.js`: command schema, actor-aware validation, rollback on failure,
  event/state privacy projection, and stable view hashes.
- `session.js`: `LocalSession` and reconnecting `RemoteSession` implementations.
- `tutorial.js`: a policy layer over `LocalSession`; it permits only the next
  teaching command while the core engine continues to enforce normal rules.
- `worker/index.mjs`: room creation, ticket authentication, Durable Object
  routing, command deduplication, revision control, persistence, and broadcast.

## Shared command boundary

A command envelope is at most 16 KiB and contains:

```json
{
  "type": "command",
  "v": 1,
  "commandId": "browser-generated UUID",
  "expectedRevision": 12,
  "kind": "action_print",
  "payload": { "books": [] }
}
```

The authenticated WebSocket attachment supplies the actor. Any actor value in
client data is ignored. `applyEngineCommand` snapshots state and RNG before
validation and restores both if the engine rejects or throws. Successful room
commands atomically update the snapshot, revision, and deduplication ledger.

Founding is intentionally genre-based over the network: the client asks for a
genre and the authoritative engine selects the hidden card. Deck order is never
sent merely to make the founding UI work.

## Session behavior

`LocalSession` returns a synchronous result because its engine is in the same
page. `RemoteSession` queues a command and may predict it against its disposable
redacted view so synchronous scenes remain responsive; hidden-deck commands are
never predicted. Only the room's accepted/rejected message and next snapshot are
authoritative, and every snapshot replaces the prediction. A reconnect sends
its last revision and receives the latest snapshot; revision conflicts clear
queued predictions and force a resync.

Undo is a solo proofing feature. Published multiplayer commands are immutable.

## Deferred graph

Matchmaking, accounts, spectators, friends, chat, and social discovery are not
dependencies of `GameRoom` and must not enter this graph until invite-only
private rooms pass the stability gate in `staging-playtest.md`.
