# The First Day — Tutorial Design

*Age of Comics: The Golden Years, Digital Edition. Design doc v1 — for review
before implementation. No code herein.*

The tutorial is a **guided first round of a real game** (fixed seed, fully
reproducible), coached by a veteran city editor via typewriter memos. It rides
the existing UI — panels, the PROOF slip, the wire — and adds exactly two
primitives: **SPOTLIGHT** (dim everything but one element + anchored memo card)
and **GATE** (limit legal click targets for a beat). Target length: 6–9 minutes
to the end of round 1, then freedom with three contextual hints.

Entry: offered on the title screen the first time ever ("FIRST DAY ON THE JOB —
take the tour?") and always available from setup as a labeled option. Setup is
fixed: teal Liberty Ink, 2 rivals, normal, rip-offs on, tutorial seed.

---

## 1. Teaching goals

**Must land in round 1 (ranked):**
1. The loop: each round you place your 4 editors, one per turn; every action ends
   in a PROOF slip you can undo before the world moves.
2. Printing is the engine: comic + writer + artist + their fee + **2 matching
   ideas** → the book hits the chart with fans.
3. Fans are everything and they leak: rank pays VP, every fan pays $, every book
   loses 1 fan per round.
4. Ideas are fuel, and genre matching matters (team specialization = bonus fans).
5. The city map exists: orders flip, collect, and **fulfill themselves** when you
   publish the right genre at the right value.

**Deliberately deferred** (one contextual hint each, rounds 2–3, §5): creative
development (train/learn), specials, mastery. **Taught only by tooltips/existing
UI:** rip-offs, turn-order reversal, occupancy fees, hand limits, ticket
teleports, better colors.

## 2. Beat sheet — the guided first round

Seed requirements (engineering note): the tutorial seed must satisfy — (a) at
least one vault genre matches BOTH starting creatives; (b) the print floor's ×2
first slot is free when the player's second placement comes; (c) a sales order
fulfillable by the founding genre sits within one free move of the start corner.
Brute-force the seed offline; assert it in a test so balance patches can't
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
> "Your first two hires came with the furniture: a writer and an artist. Note
> what they're good at — genre is everything in this trade."
Done: dismiss.

**B2 · Founding — the genre.** Spotlight: vault card matching the team
(seed-guaranteed). Soft gate: all genres legal, matching one glows.
> "Pick your first book's genre. A book whose team matches its genre earns extra
> fans — and these two both breathe [GENRE]."
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
Hard gate: UNDO first, then re-confirm.
> "House rule: every action prints a proof before it's final. Hit UNDO — go on,
> nothing breaks. ... See? Now stamp it for real. The rivals only move after
> you approve your own work."
Done: confirmed.

**B6 · Placement 1 — Café Bizarre.** Spotlight: Ideas tile. Hard gate: only the
café is placeable.
> "First shift: send an editor for ideas. The café's where this business
> actually gets invented."
Panel sub-beat — soft gate, matching tokens glow:
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
> "There it is — your first book on the chart, fans and all. Every fan pays a
> dollar at close, and the top ranks pay victory points."
Done: print confirmed (second book of the ×2 optional — soft-nudged skip:
"Save the second run for a book with a team behind it.").

**B9 · Placement 3 — Accounting.** Soft gate: royalties glows, all legal.
> "Presses cost money. Accounting pays better the earlier you clock in — grab a
> desk while the good ones last."
Done: any confirmed action (if the player goes elsewhere, the memo tips its hat:
"Your call, boss — just keep an eye on the till.").

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
> "Every fan buys a copy — that's your royalty check."
> "And then yesterday's news: every book cools by one fan. Fresh ink or fade
> away, boss — that's the whole racket."
Final memo, releasing control:
> "You know the floor now. Four shifts a cycle, four cycles left. Make them
> count — I'll holler if something new comes up."

## 3. Gating philosophy

Hard gates: B3, B5, B6, B8, B10 — the load-bearing lessons; a lost novice can't
learn from a misclick, and veterans get through in seconds anyway.
Soft gates: B2, B9 and all within-panel picks — where any legal choice still
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

1. **Creative development** (round 2 starts): "New cycle, new contracts —
   specialists on printed books can study up. LEARN from a better teammate for
   a dollar, or TRAIN at full price. Sharper teams, pricier books."
2. **Specials** (player's 2nd book prints): "Two books in print buys you a
   favor — pick a special power. One use, your timing. Spend it like a
   headline."
3. **Mastery** (first token claimed by anyone): "[House] just claimed [GENRE]
   mastery — a standing +1 fan on every book of the genre they print, and two
   points at the bell. First to press owns the genre... until someone out-prints
   them."

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

1. What three things does printing an original cost? (team fee $, writer+artist,
   2 matching ideas)
2. What happens to every published book at the end of a round? (earns $ per fan,
   then loses 1 fan)
3. Why print the right genre for your team? (specialists add fans / originals
   score by matches)
4. What happens to a collected order you never fulfill? (costs VP at game end)
5. How many editors do you place per round? (four)

## 9. Implementation notes (for the engineer — me)

- New primitives: `Tutor.spotlight(el, memo, opts)` + `Tutor.gate(allowedFn)`;
  beat table drives both; state = `{beat}` in the save blob.
- Seed search: script over `node` iterating seeds against §2's three conditions;
  pin as `TUTORIAL_SEED` with a rules-test asserting the conditions.
- Memo card: paper scrap + typewriter face, anchored like `attachZoom`'s dock
  (zoom-aware!); shake = existing error-toast pattern.
- Copy length budget: memos as written fit ~52ch × 3 lines at 15px Special
  Elite in a 320px card — verified against the longest (B8).
- Suites: a11y checks gate reasons + narration; browser test drives the full
  scripted round on the pinned seed (it doubles as the seed regression test).
