# Invite-only staging playtest gate

Status: **staging deployed; human sessions pending**. Human sessions cannot be
completed inside CI; record dates, commit, Worker version, and anonymized
results below before promoting multiplayer.

## Cohort

- Five pairs (10 people): two novice/novice, two mixed, one experienced pair.
- At least two desktop browsers and one mobile/tablet viewport across the run.
- Use trusted participants and share room links privately. Remind everyone that
  this preview does not protect hidden state from developer tools.

## Script per pair

1. Host creates a room and sends the invite; guest joins in another profile.
2. Both complete founding and at least one normal action without coaching.
3. Guest closes the tab during their turn, waits 20 seconds, and reconnects
   with the original invite. Verify the same desk and exact game state return.
4. Guest closes again. Host opens **ROOM**, hands the disconnected desk to a
   bot, and verifies play continues. Guest returns, chooses **RESUME MY DESK**,
   and verifies control returns without a desync.
5. Open a third browser after the game starts. Verify it can watch without a
   rendering error and can take an automated desk when one is available.
6. Put one participating browser in the background while a bot takes a turn.
   Bring it back after the next human move and verify both state hashes still
   match and no desync warning appears.
7. Duplicate a participating tab. Verify the original tab reports that its
   desk moved elsewhere and only the newer tab can continue.
8. Verify a visible public roster id cannot resume another player's desk. Lock
   the table, verify a new browser is refused, then confirm a known player can
   reconnect. Remove that participant and verify the old resume pass is refused.
9. Leave a move in flight while cutting the browser network; restore it and
   verify watchdog reconnect/replay settles without a duplicate action.
10. Complete at least two rounds; one pair completes the full game.
11. Separately, every novice completes **FIRST DAY ON THE JOB** and answers the
   five comprehension questions in `tutorial-design.md`.

## Promotion criteria

- 5/5 pairs create and join without developer intervention.
- 5/5 reconnect and bot-handoff drills restore the intended desk and state.
- Zero state-hash mismatches, duplicate costs, unauthorized seat control, or
  unrecoverable rooms. Any one is an automatic stop-ship.
- At least 90% of valid commands settle within one second on staging.
- At least 4/5 novice players finish the tutorial without help and score 4/5 on
  comprehension. No tutorial blocker or keyboard trap.
- Browser, accessibility, rules, protocol, tutorial-scenario, and Worker suites
  and lockstep suites pass on the exact staged commit.

## Result log

| Date | Commit / Worker version | Pair | Browsers | Rounds | Reconnect | Issues | Outcome |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| _pending_ | | | | | | | |

## After the gate

Fix and repeat failed cases on a new staging version. Only after every stop-ship
item is clear should a clearly labelled trusted-friends production preview be
considered. Authoritative rules and per-seat privacy are the next multiplayer
phase; matchmaking, accounts, chat, and social discovery remain out of scope.
