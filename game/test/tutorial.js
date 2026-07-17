"use strict";
const assert = require("assert");
const { trySeed } = require("../tools/find_tutorial_seed.js");

const scenario = trySeed(5);
assert(scenario, "tutorial seed 5 must retain its full legal first-round path");
assert.deepEqual(
  { seed: scenario.seed, genre: scenario.genre, comic: scenario.comic, writer: scenario.writer,
    artist: scenario.artist, orderId: scenario.orderId, node: scenario.node },
  { seed: 5, genre: "crime", comic: "orig_38", writer: "writer_crime_2B",
    artist: "artist_romance_2", orderId: 17, node: 10 },
);
console.log("  ok  tutorial seed 5 retains the complete Ideas → Print → Accounting → Sales path");
