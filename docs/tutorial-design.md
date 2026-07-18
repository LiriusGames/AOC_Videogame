# The First Day — Tutorial Design

*Age of Comics: The Golden Years, Digital Edition. Release specification v2 —
implemented behind the “FIRST DAY ON THE JOB” title action.*

The tutorial is a **guided first round of a real game** (fixed seed, fully
reproducible), coached by a veteran city editor via typewriter memos. It rides
the existing UI — panels, the PROOF slip, the wire — and adds exactly two
primitives: **SPOTLIGHT** (dim everything but one element + anchored memo card)
and **GATE** (limit legal click targets for a beat). Target length: 6–9 minutes
to the end of round 1, then freedom with three contextual hints.

Entry: always available on the title screen as a labeled action. Setup is
fixed: teal Liberty Ink, 2 rivals, normal, rip-offs on, tutorial seed.

---

## 1. Teaching goals

**Must land in round 1 (ranked):**
1. The loop: each round you place your 4 editors, one per turn; every action ends
   in a PROOF slip you can undo before the world moves.
2. Printing is the engine: comic + writer + artist + their fee + **2 matching
   ideas** → the book hits the chart with fans.
3. Fans are everything and they leak: your best book sets your rank, fan count
   sets each book's royalty bracket, and charted books cool by 1 fan per round
   without dropping below 1.
4. Ideas are fuel, and genre matching matters (team specialization = bonus fans).
5. The city map exists: orders flip, collect, and **fulfill themselves** when you
   publish the right genre at the right value.

**Deliberately deferred** (one contextual hint each, rounds 2–3, §5): building
the next production pipeline (Hire + Develop), creative development
(train/learn), and specials. Mastery is taught on the first print because it is
awarded immediately. **Taught only by tooltips/existing
UI:** rip-offs, turn-order reversal, occupancy fees, hand limits, ticket
teleports, better colors.

## 2. Beat sheet — the guided first round

Scenario requirements (engineering note): the normal rules deliberately deal
the two starting creatives with different genres. Pin a legal founding genre
matching ONE creative, a fixed seed, and a legal first-round rival transcript.
The player starts first with exactly two founding ideas; the Print Floor's ×2
first slot is free at placement two; Accounting and Sales remain available; and
a face-down, unoccupied order matching the founding genre (value 4 or less)
remains within one free move of the start corner through placement four. Assert
the complete B0–B11 command path in a test so AI or balance patches cannot
silently break the tour.

Every beat: **trigger → spotlight → memo (final copy) → gate → done-when**.
Every memo also becomes a screen-reader narration line. Memo cards carry a
persistent **SKIP THE TOUR** stub (§4).

**B0 · Masthead.** Trigger: tutorial game starts. Full-screen memo, no gate.
> "Morning, boss. Word is you bought this outfit — desks, presses, debts and
> all. I'm your city editor. Stick with me for one day and you'll run this place
> like you were born in the ink."
Done: dismiss.

**B1 · Founding — the team.** Spotlight: starting team figures in the Founding
Catalog. No gate.
> "Your first two hires came with the furniture: a writer and an artist. They
> specialize in different genres. Each creative who matches a book adds a fan."
Done: dismiss.

**B2 · Founding — the genre.** Spotlight: the pinned vault card matching one
starting creative. Hard gate: the tutorial genre is the only selection.
> "Pick your first book's genre. Each teammate who matches its genre adds a fan
> at launch — [CREATIVE] already knows [GENRE] inside out."
Done: genre picked.

**B3 · Founding — ideas.** Spotlight: idea token row. Hard gate: take 2 of the
founding genre.
> "Ideas are the other half of printing — two MATCHING tokens per original book.
> Take two [GENRE] ideas. We'll want more before the presses roll."
Done: FOUND THE HOUSE confirmed. (PROOF slip appears — see B5.)

**B4 · The premises.** Three quick spotlights in sequence (rail → board →
chart), no gate, auto-advance on dismiss:
> "The left wall is YOUR office: staff, cash, ideas, trophies."
> "The middle is the city — six places your editors can work a shift."
> "The right is the market: the comic-book chart. Fans decide the ranks, ranks
> pay victory points. That column is why we're all here."

**B5 · The PROOF slip** (rides the founding confirmation). Spotlight: the slip.
Hard gate: UNDO first, repeat the highlighted founding picks, then re-confirm.
> "House rule: every action prints a proof before it's final. Hit UNDO — go on,
> nothing breaks. ... See? Now stamp it for real. The rivals only move after
> you approve your own work."
Done: confirmed.

**B6 · Placement 1 — Café Bizarre.** Spotlight: Ideas tile. Hard gate: only the
café is placeable.
> "First shift: send an editor for ideas. The café's where this business
> actually gets invented."
Panel sub-beat — hard gate for the two counter tokens; useful table tokens glow:
> "Take table and counter tokens — favor [GENRE]; your first book will drink
> them two at a time."
Done: BRAINSTORM confirmed via PROOF.

**B7 · The rivals move.** Spotlight: wire strip while AI turns play. No gate.
> "Now the other houses take their shifts — the wire keeps the gossip. You don't
> wait politely in this town; you read the ticker."
Done: play returns to the player.

**B8 · Placement 2 — the Print Floor.** Spotlight: Print tile (×2 slot free by
seed). Hard gate: print floor only. Panel sub-beat: the founding comic + both
creatives pre-glowing, COST & RESULT spotlighted before confirm:
> "This is the moment: book, writer, artist. The fee is the team's value, plus
> two matching ideas. And here's a trade secret — the FIRST press of the round
> runs a double shift."
On the celebration/chart flight:
> "There it is — your first book on the chart, fans and all. More fans mean a
> better royalty bracket at close, and the top ranks pay victory
> points."
Done: print confirmed (second book of the ×2 optional — soft-nudged skip:
"The first press can run two complete books. Today you only have one complete
team, so one strong debut is the right call.").

On the mastery award:
> "First original in a genre claims mastery: +1 fan on every book you print in
> that genre, and 2 points at the final bell. Another house can take it by
> out-printing you."

**B9 · Placement 3 — Accounting.** Hard gate: Accounting only, preserving the
scripted Sales lesson.
> "Presses cost money. Accounting pays better the earlier you clock in — grab a
> desk while the good ones last."
Done: Accounting confirmed.

**B10 · Placement 4 — the Manhattan Map.** Hard gate: sales only. In the run
modal, guided mini-run: move once (free) to the seeded corner → flip → collect
→ watch it auto-fulfill:
> "Last shift: the street. Your agent walks the corners — first step's free.
> Flip the order... collect it... and look: you already print [GENRE], so it
> fills ITSELF and the fans ride home. Orders you can't fill by the end of the
> game come out of your hide, so collect what you can serve."
Done: END SALES RUN.

**B11 · Round close.** The round-end events play with three timed memos over
them (no gate): chart ranks paying VP → every comic earning by fans → the decay:
> "Cycle's done. Ranks pay: [live numbers]."
> "Each book's fan count sets its royalty bracket — that's your check."
> "And then yesterday's news: every charted book cools by one fan, but never
> below one. Fresh ink or fade away, boss — that's the whole racket."
Final memo, releasing control:
> "You know the floor now. Four shifts a cycle, four cycles left. Make them
> count — I'll holler if something new comes up."

## 3. Gating philosophy

Hard gates: B2, B3, B5, B6, B8, B9, B10 — the load-bearing lessons; a lost novice can't
learn from a misclick, and veterans get through in seconds anyway.
Soft gates: non-critical within-panel picks — where any legal choice still
teaches the lesson. A soft-gated off-script action is ACCEPTED with a graceful
one-line memo, never blocked. Blocked targets under a hard gate keep the house
a11y rule: reachable, aria-disabled, with the reason ("follow the tour — or skip
it"), plus a memo-card shake on attempt.

## 4. Skip & resume

- SKIP THE TOUR stub on every memo → confirm dialog → normal play from the
  current state; the three §5 hints still arm.
- The title-screen offer defaults to NO for returning profiles (localStorage).
- Reload mid-tutorial: the save stores the beat index; resume re-enters the
  current beat (memos are stateless; the deterministic engine guarantees the
  board matches).

## 5. Rounds 2–5 — the three hints (max one on screen, each once)

1. **Build the next issue** (round 2, first action): "Your first team stays on
   its printed book. Hire another writer and artist, then Develop a project so
   the presses have a new complete package."
2. **Creative development** (round 2 starts, only if a legal upgrade exists): "New cycle, new contracts —
   specialists on printed books can study up. LEARN from a better teammate for
   a dollar, or TRAIN at full price. Sharper teams, pricier books."
3. **Specials** (player's 2nd book prints): "Two books in print earns a special
   cube. Put it on a power; from now on it triggers whenever you take that
   power's linked action. You can move a cube after your fifth print."

## 6. Edge cases

- Off-script under hard gate → block + reason + shake (B3 wording above).
- UNDO during a scripted beat → the beat rewinds with the game state (memos
  re-anchor; B5 is itself the undo lesson so it hard-codes its two-step).
- MENU/HELP/settings open mid-beat → spotlight pauses (dim lifts), resumes on
  close. FILM/P shortcuts unaffected.
- Autoplay/spectator mode and `?scene` debug URLs: tutorial refuses to arm.

## 7. Accessibility

Every memo doubles as an `announce()` line (already quoted copy = the narration).
Spotlight moves keyboard focus to its target; gates use aria-disabled-with-reason
(never native disabled). The memo card is a dialog-free floating region with its
skip stub in the tab order. Reduced motion: no dim-pulse, instant spotlight.

## 8. Comprehension checks (for the playtest survey)

1. What does printing an original require? (a project, writer + artist, their
   team fee in dollars, and 2 matching ideas)
2. What happens to a charted book at the end of a round? (its fan bracket pays
   royalties, then it loses 1 fan without falling below 1)
3. Why print the right genre for your team? (specialists add fans / originals
   score by matches)
4. What happens to a collected order you never fulfill? (costs VP at game end)
5. How many editors do you place per round? (four)

## 9. Implementation record

- `game/js/tutorial.js` owns the beat state, spotlight, command gates, scripted
  rival transcript, skip behavior, narration, and tutorial-only save payload.
- `game/tools/find_tutorial_seed.js` found and verifies seed 5. The pinned path
  is Crime / `orig_38` / order 17 at node 10; `game/test/tutorial.js` fails if
  the Ideas → Print → Accounting → Sales route stops being legal.
- Memo card: paper scrap + typewriter face, anchored like `attachZoom`'s dock
  (zoom-aware!); shake = existing error-toast pattern.
- Copy length budget: memos as written fit ~52ch × 3 lines at 15px Special
  Elite in a 320px card — verified against the longest (B8).
- Release gate: rules/protocol/scenario tests plus browser and accessibility
  suites must pass; the staging script in `docs/staging-playtest.md` supplies
  the novice comprehension and completion checks automation cannot provide.
