# Invite-only staging playtest gate

Status: **ready to schedule after the staging Worker is deployed**. Human
sessions cannot be completed inside CI; record dates, commit, Worker version,
and anonymized results below before promoting multiplayer.

## Cohort

- Five pairs (10 people): two novice/novice, two mixed, one experienced pair.
- At least two desktop browsers and one mobile/tablet viewport across the run.
- Share guest links privately. Never paste live tickets into issues or chat logs.

## Script per pair

1. Host creates a room and sends the invite; guest joins in another profile.
2. Both complete founding and at least one normal action without coaching.
3. Guest closes the tab during their turn, waits 20 seconds, and rejoins with
   the original invite. Verify the exact turn and private hand return.
4. Host opens the room in a second tab. Verify the old tab is replaced and no
   seat can submit twice.
5. Each player deliberately clicks one stale/invalid choice after the opponent
   changes state. Verify resync, no duplicate cost, and no leaked card data.
6. Complete at least two rounds; one pair completes the full game.
7. Separately, every novice completes **FIRST DAY ON THE JOB** and answers the
   five comprehension questions in `tutorial-design.md`.

## Promotion criteria

- 5/5 pairs create and join without developer intervention.
- 5/5 reconnect drills restore the same authoritative revision and private hand.
- Zero duplicate moves, cross-seat control, hidden-card leaks, or unrecoverable
  rooms. Any one is an automatic stop-ship.
- At least 90% of valid commands settle within one second on staging.
- At least 4/5 novice players finish the tutorial without help and score 4/5 on
  comprehension. No tutorial blocker or keyboard trap.
- Browser, accessibility, rules, protocol, tutorial-scenario, and Worker suites
  pass on the exact staged commit.

## Result log

| Date | Commit / Worker version | Pair | Browsers | Rounds | Reconnect | Issues | Outcome |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| _pending_ | | | | | | | |

## After the gate

Fix and repeat failed cases on a new staging version. Only after every stop-ship
item is clear should production promotion be considered. Matchmaking, accounts,
spectators, friends, chat, and social discovery begin as separate design work
after private-room stability—not during this gate.
