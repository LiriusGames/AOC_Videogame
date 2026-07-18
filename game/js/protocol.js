// ============================================================================
// AGE OF COMICS — transport-neutral commands and privacy projections
// Shared by the browser LocalSession and the Cloudflare GameRoom.
// ============================================================================
(function initProtocolModule(root, factory) {
  const data = root.AOC_DATA || (typeof require !== "undefined" ? require("./data.js") : null);
  if (!data) throw new Error("Age of Comics data module must load before protocol");
  const api = factory(data);
  root.AOC_PROTOCOL = api;
  Object.assign(root, api);
  if (typeof module !== "undefined") module.exports = api;
})(globalThis, function buildProtocolModule(data) {
"use strict";

const { GENRES, CARD_BY_ID, SPECIALS, MAP } = data;
const COMMAND_VERSION = 1;
const MAX_COMMAND_BYTES = 16 * 1024;
const SPECIAL_COMMANDS = new Set([
  "special_reassign", "special_hype", "special_ideas", "special_better_color",
  "special_marketing", "special_extra_editor",
]);

function isObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function isInt(v) { return Number.isSafeInteger(v); }
function isGenre(v) { return GENRES.includes(v); }
function isString(v, max = 128) { return typeof v === "string" && v.length > 0 && v.length <= max; }
function unique(arr) { return Array.isArray(arr) && new Set(arr).size === arr.length; }
function fail(code, message) { return { ok: false, code, message }; }

function validateEnvelope(msg) {
  if (!isObject(msg)) return fail("BAD_MESSAGE", "Message must be an object");
  let bytes = Infinity;
  try { bytes = new TextEncoder().encode(JSON.stringify(msg)).byteLength; } catch (_e) {}
  if (bytes > MAX_COMMAND_BYTES) return fail("MESSAGE_TOO_LARGE", "Command exceeds 16 KiB");
  if (msg.v !== COMMAND_VERSION) return fail("BAD_VERSION", "Unsupported command version");
  if (!isString(msg.commandId, 96)) return fail("BAD_COMMAND_ID", "A command ID is required");
  if (!isInt(msg.expectedRevision) || msg.expectedRevision < 0)
    return fail("BAD_REVISION", "Expected revision must be a non-negative integer");
  if (!isString(msg.kind, 64)) return fail("BAD_KIND", "Command kind is required");
  if (msg.payload !== undefined && !isObject(msg.payload)) return fail("BAD_PAYLOAD", "Payload must be an object");
  return { ok: true };
}

function requireTurn(engine, actorId) {
  if (!engine.player(actorId)) return fail("BAD_ACTOR", "Seat is not part of this game");
  if (engine.currentPlayerId() !== actorId) return fail("OUT_OF_TURN", "It is not this seat's turn");
  return { ok: true };
}

function validateBook(engine, actorId, book) {
  if (!isObject(book) || !["original", "ripoff"].includes(book.type)) return false;
  if (!isString(book.writer) || !isString(book.artist)) return false;
  if (book.type === "original" && !isString(book.comic)) return false;
  if (book.type === "ripoff" && !isInt(book.target)) return false;
  return engine.canPrintBook(actorId, book);
}

// Apply one authenticated command. The actor is supplied by the session/socket,
// never trusted from the payload. Failed commands restore state + RNG exactly.
function applyEngineCommand(engine, actorId, kind, payload = {}) {
  if (!engine || !isInt(actorId) || !isString(kind, 64) || !isObject(payload))
    return fail("BAD_COMMAND", "Malformed engine command");
  const before = engine.snapshot();
  const eventsAt = engine.events.length;
  const turn = requireTurn(engine, actorId);
  let result;
  try {
    switch (kind) {
      case "starting_picks": { // increase phase, round 1
        const p = engine.player(actorId), picks = p && p.startingPicks;
        if (!turn.ok) return turn;
        if (!picks || (!isString(payload.comic) && !isGenre(payload.genre)) || !Array.isArray(payload.ideas) ||
            payload.ideas.length !== picks.ideas || !payload.ideas.every(isGenre) ||
            (payload.comic && (!CARD_BY_ID[payload.comic] || !CARD_BY_ID[payload.comic].genre)))
          return fail("ILLEGAL_STARTING_PICKS", "Starting picks do not match the offer");
        let comic = payload.comic;
        if (!comic) {
          const candidates = engine.state.decks.comics.filter((id) => CARD_BY_ID[id].genre === payload.genre);
          if (!candidates.length) return fail("ILLEGAL_STARTING_PICKS", "No project in that genre is available");
          comic = candidates[(engine.rng() * candidates.length) | 0];
        }
        const available = engine.state.display.comics.includes(comic) || engine.state.decks.comics.includes(comic);
        if (!available) return fail("ILLEGAL_STARTING_PICKS", "Comic is not available");
        engine.resolveStartingPicks(actorId, comic, payload.ideas);
        engine.advanceIncrease();
        result = true;
        break;
      }
      case "increase_apply": {
        if (!turn.ok || !isInt(payload.chartIdx) || !["writer", "artist"].includes(payload.kind))
          return fail("ILLEGAL_INCREASE", "Creative increase is not legal");
        const opt = engine.increaseOptions(actorId).find((o) => o.chartIdx === payload.chartIdx && o.kind === payload.kind);
        if (!opt) return fail("ILLEGAL_INCREASE", "Creative increase is not available");
        engine.applyIncrease(actorId, opt); result = true; break;
      }
      case "increase_finish":
        if (!turn.ok || engine.state.phase !== "increase") return fail("ILLEGAL_INCREASE", "Cannot finish this increase phase");
        engine.finishIncrease(actorId); result = true; break;
      case "action_pass": result = turn.ok && engine.actPass(actorId); break;
      case "action_hire": {
        if (!turn.ok || !["writer", "artist"].every((k) => isString(payload[k])))
          return fail("ILLEGAL_HIRE", "Choose one writer and one artist");
        for (const kindName of ["writer", "artist"]) {
          const id = payload[kindName], display = engine.state.display[kindName + "s"];
          if (id !== "deck" && (!display.includes(id) || CARD_BY_ID[id].kind !== kindName))
            return fail("ILLEGAL_HIRE", `${kindName} is not available`);
        }
        result = engine.actHire(actorId, { writer: payload.writer, artist: payload.artist }); break;
      }
      case "action_develop": {
        if (!turn.ok) return turn;
        if (payload.searchGenre !== undefined) {
          if (!isGenre(payload.searchGenre)) return fail("ILLEGAL_DEVELOP", "Unknown commissioned genre");
          result = engine.actDevelop(actorId, { searchGenre: payload.searchGenre });
        } else {
          if (!isString(payload.comic)) return fail("ILLEGAL_DEVELOP", "Choose a project or the deck");
          if (payload.comic !== "deck" && !engine.state.display.comics.includes(payload.comic))
            return fail("ILLEGAL_DEVELOP", "Project is not available");
          result = engine.actDevelop(actorId, { comic: payload.comic });
        }
        break;
      }
      case "action_ideas": {
        if (!turn.ok || !Array.isArray(payload.board) || !Array.isArray(payload.supply) ||
            !payload.board.every(isGenre) || !payload.supply.every(isGenre) ||
            payload.supply.length !== 2 || !unique(payload.board))
          return fail("ILLEGAL_IDEAS", "Idea selection is malformed");
        const slot = engine.nextSlot("ideas"), allowed = data.IDEAS_SLOTS[slot];
        if (payload.board.length > allowed || payload.board.some((g) => engine.state.boardIdeas[g] <= 0))
          return fail("ILLEGAL_IDEAS", "Cafe ideas are no longer available");
        result = engine.actIdeas(actorId, { board: payload.board, supply: payload.supply }); break;
      }
      case "action_royalties": result = turn.ok && engine.actRoyalties(actorId); break;
      case "action_print": {
        if (!turn.ok || !Array.isArray(payload.books) || payload.books.length < 1 || payload.books.length > 2 ||
            !payload.books.every((b) => validateBook(engine, actorId, b)))
          return fail("ILLEGAL_PRINT", "Print package is not legal");
        result = engine.actPrint(actorId, { books: payload.books }); break;
      }
      case "sales_start": result = turn.ok && engine.actSalesStart(actorId); break;
      case "sales_move": {
        if (!isInt(payload.node) || !MAP.nodes.some((n) => n.id === payload.node) ||
            (payload.ticket !== undefined && typeof payload.ticket !== "boolean"))
          return fail("ILLEGAL_SALES_MOVE", "Unknown destination");
        result = engine.salesMove(actorId, payload.node, !!payload.ticket); break;
      }
      case "sales_flip": result = isInt(payload.slotId) && engine.salesFlip(actorId, payload.slotId); break;
      case "sales_collect": result = isInt(payload.slotId) && engine.salesCollect(actorId, payload.slotId); break;
      case "sales_end": result = engine.salesEnd(actorId); break;
      case "pending_resolve": {
        const pd = engine.state.pending;
        if (!pd || pd.playerId !== actorId) return fail("NOT_PENDING_OWNER", "This decision belongs to another seat");
        const choice = isObject(payload.choice) ? payload.choice : {};
        if (pd.type === "placeCube" && !pd.data.options.includes(choice.special)) return fail("ILLEGAL_PENDING", "Special is not offered");
        if (pd.type === "relocateCube" && Object.keys(choice).length &&
            (!SPECIALS[choice.from] || !SPECIALS[choice.to] || choice.from === choice.to))
          return fail("ILLEGAL_PENDING", "Cube relocation is malformed");
        if (pd.type === "chooseIdeas" && (!Array.isArray(choice.genres) || choice.genres.length !== pd.data.count || !choice.genres.every(isGenre)))
          return fail("ILLEGAL_PENDING", "Choose the required ideas");
        if (pd.type === "chooseOrderComic" && !pd.data.choices.includes(choice.chartIdx)) return fail("ILLEGAL_PENDING", "Book is not eligible");
        if (pd.type === "discard") {
          if (!Array.isArray(choice.cards) || choice.cards.length !== pd.data.count || !unique(choice.cards) ||
              choice.cards.some((c) => !engine.player(actorId).hand.includes(c)))
            return fail("ILLEGAL_PENDING", "Discard selection is not legal");
        }
        result = engine.resolvePending(actorId, choice); break;
      }
      case "special_skip":
        if (!engine.state.awaitingSpecial || engine.state.awaitingSpecial.player !== actorId)
          return fail("ILLEGAL_SPECIAL", "No special action is waiting for this seat");
        engine.skipSpecial(actorId); result = true; break;
      case "special_reassign":
        if (!Array.isArray(payload.swaps) || payload.swaps.length > 2) return fail("ILLEGAL_SPECIAL", "Bad reassignment");
        result = engine.specialReassign(actorId, payload.swaps); break;
      case "special_hype":
        if (payload.cardId !== null && !isString(payload.cardId)) return fail("ILLEGAL_SPECIAL", "Bad hype card");
        result = engine.specialHype(actorId, payload.cardId); break;
      case "special_ideas":
        if (!Array.isArray(payload.conversions) || payload.conversions.length > 3 ||
            payload.conversions.some((x) => !isObject(x) || !isGenre(x.genre) || !isInt(x.chartIdx)))
          return fail("ILLEGAL_SPECIAL", "Bad word-of-mouth choices");
        result = engine.specialIdeasConv(actorId, payload.conversions); break;
      case "special_better_color":
        if (typeof payload.accept !== "boolean") return fail("ILLEGAL_SPECIAL", "Bad Better Colors choice");
        result = engine.specialBetterColor(actorId, payload.accept); break;
      case "special_marketing":
        if (!isInt(payload.spend) || !Array.isArray(payload.distribution)) return fail("ILLEGAL_SPECIAL", "Bad marketing plan");
        result = engine.specialMarketing(actorId, payload.spend, payload.distribution); break;
      case "special_extra_editor":
        if (typeof payload.accept !== "boolean") return fail("ILLEGAL_SPECIAL", "Bad extra editor choice");
        result = engine.specialExtraEditor(actorId, payload.accept); break;
      default: return fail("UNKNOWN_COMMAND", `Unknown command: ${kind}`);
    }
  } catch (err) {
    engine.restore(before);
    return fail("COMMAND_ERROR", err && err.message ? err.message : "Command failed");
  }
  if (!result) {
    engine.restore(before);
    return fail("ILLEGAL_COMMAND", "The command is not legal in the current state");
  }
  return { ok: true, events: engine.events.slice(eventsAt), value: result };
}

function projectEvent(event, seatId) {
  const ev = structuredClone(event);
  if (ev.player === seatId || ev.playerId === seatId) return ev;
  if (["startingPicks", "develop", "hypeStart"].includes(ev.type)) delete ev.cardId;
  if (ev.type === "hire") { delete ev.cards; delete ev.blind; }
  if (ev.type === "pending") delete ev.data;
  return ev;
}

function projectState(engine, seatId) {
  const state = structuredClone(engine.state);
  for (const key of Object.keys(state.decks || {})) state.decks[key] = Array(state.decks[key].length).fill(null);
  state.calendar = state.calendar.map((genres, i) => i < state.round ? genres : null);
  state.mapSlots.forEach((slot) => {
    if (!slot.faceUp && slot.takenBy === null) { slot.genre = null; slot.minVal = null; slot.fans = null; }
  });
  state.players.forEach((p) => {
    if (p.id !== seatId) {
      p.hand = Array(p.hand.length).fill(null);
      p.hyped = p.hyped.map(() => ({ hidden: true }));
      delete p.startingPicks;
    }
  });
  if (state.pending && state.pending.playerId !== seatId) state.pending = { playerId: state.pending.playerId, type: state.pending.type, data: null };
  if (state.pendingQueue) state.pendingQueue = state.pendingQueue.map((p) => p.playerId === seatId ? p : { playerId: p.playerId, type: p.type, data: null });
  return state;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

function stateHash(value) {
  const str = stableStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// Deterministic lockstep includes the PRNG cursor as well as visible state.
// Two clients with equal boards but different future random rolls are already
// divergent and must be stopped before accepting another command.
function engineHash(engine) {
  return stateHash({ state: engine.state, rngA: engine.rng && engine.rng.a });
}

return {
  COMMAND_VERSION, MAX_COMMAND_BYTES, SPECIAL_COMMANDS,
  validateEnvelope, applyEngineCommand, projectEvent, projectState,
  stableStringify, stateHash, engineHash,
};
});
