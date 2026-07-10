// ============================================================================
// AGE OF COMICS: THE GOLDEN YEARS — videogame data
// Static game data derived from the board game (base rules V27).
// ============================================================================
"use strict";

const GENRES = ["scifi", "crime", "romance", "horror", "superheroes", "western"];

const GENRE_INFO = {
  scifi:       { name: "Sci-Fi",      color: "#7ab648", dark: "#4c7a2a", icon: "gicon_scifi" },
  crime:       { name: "Crime",       color: "#8f8d88", dark: "#5a5955", icon: "gicon_crime" },
  romance:     { name: "Romance",     color: "#d94f43", dark: "#93312a", icon: "gicon_romance" },
  horror:      { name: "Horror",      color: "#7d4a96", dark: "#4f2b63", icon: "gicon_horror" },
  superheroes: { name: "Superheroes", color: "#3f7fbf", dark: "#27547f", icon: "gicon_superheroes" },
  western:     { name: "Western",     color: "#e07f2e", dark: "#96521a", icon: "gicon_western" },
};

// ---------------------------------------------------------------- publishers
const PUBLISHERS = {
  yellow: { name: "Star Syndicate", boss: "Goldie Marsh",   color: "#f5c86e", dark: "#b98f35", logo: "logo_yellow",
            persona: "chart",   blurb: "Chases the top of the chart at any cost." },
  salmon: { name: "Torch Press",    boss: "Rex Calloway",   color: "#e5977a", dark: "#a95f45", logo: "logo_salmon",
            persona: "ripoff",  blurb: "Never had an idea he couldn't borrow." },
  teal:   { name: "Liberty Ink",    boss: "Vivian Cole",    color: "#5ba59f", dark: "#33716c", logo: "logo_teal",
            persona: "quality", blurb: "Only prints matched creative dream-teams." },
  brown:  { name: "Quill & Sons",   boss: "Mortimer Quill", color: "#8e514e", dark: "#5d302e", logo: "logo_brown",
            persona: "money",   blurb: "Counts every dime twice, then charges interest." },
};
const PLAYER_COLORS = ["yellow", "salmon", "teal", "brown"];

// ---------------------------------------------------------------- comic cards
// bonus: fan = +1 fan when printed | ideas = 2 idea tokens (any) |
//        ticket = super-transport ticket | money = +$4
const COMICS = [
  { id: "orig_1",  title: "Kings of the Plains",  genre: "western",     bonus: "fan" },
  { id: "orig_2",  title: "Outlaws",              genre: "western",     bonus: "ticket" },
  { id: "orig_3",  title: "Hey Ranger",           genre: "western",     bonus: "ideas" },
  { id: "orig_4",  title: "Wild Annie",           genre: "western",     bonus: "money" },
  { id: "orig_8",  title: "Star-Spangled Duo!",   genre: "superheroes", bonus: "fan" },
  { id: "orig_9",  title: "Angel of Liberty",     genre: "superheroes", bonus: "ticket" },
  { id: "orig_10", title: "Miss Tiger",           genre: "superheroes", bonus: "ideas" },
  { id: "orig_11", title: "Freedom Comics",       genre: "superheroes", bonus: "money" },
  { id: "orig_15", title: "Stories of Tomorrow",  genre: "scifi",       bonus: "fan" },
  { id: "orig_16", title: "Future Wonder",        genre: "scifi",       bonus: "ticket" },
  { id: "orig_17", title: "Neptunio",             genre: "scifi",       bonus: "ideas" },
  { id: "orig_18", title: "Alien Worlds",         genre: "scifi",       bonus: "money" },
  { id: "orig_22", title: "Just a Feeling",       genre: "romance",     bonus: "fan" },
  { id: "orig_23", title: "Heartbreakers!",       genre: "romance",     bonus: "ticket" },
  { id: "orig_24", title: "Love Letter",          genre: "romance",     bonus: "ideas" },
  { id: "orig_25", title: "Teen Drama",           genre: "romance",     bonus: "money" },
  { id: "orig_29", title: "Haunting Tales",       genre: "horror",      bonus: "fan" },
  { id: "orig_30", title: "True Terror",          genre: "horror",      bonus: "ticket" },
  { id: "orig_31", title: "It Lives",             genre: "horror",      bonus: "ideas" },
  { id: "orig_32", title: "Carmilla!",            genre: "horror",      bonus: "money" },
  { id: "orig_36", title: "Killer Dames",         genre: "crime",       bonus: "fan" },
  { id: "orig_37", title: "Call the Police",      genre: "crime",       bonus: "ticket" },
  { id: "orig_38", title: "It's a Felony",        genre: "crime",       bonus: "ideas" },
  { id: "orig_39", title: "Gang Wars!",           genre: "crime",       bonus: "money" },
];
// sprite fix-ups: orig_4 was exported under its original filename
const COMIC_SPRITE = (id) => (id === "orig_4" ? "orig_4" : id);

// Rip-off parody titles + art sprite, per original (index within genre 1..4)
const RIPOFF_TITLES = {
  orig_1:  "Dukes of the Dust",     orig_2:  "Outcasts",
  orig_3:  "Yo Ranger!",            orig_4:  "Mild Annie",
  orig_8:  "Flag-Waving Twosome",   orig_9:  "Pigeon of Freedom",
  orig_10: "Lady Leopard",          orig_11: "Liberty Comics",
  orig_15: "Tales of Next Week",    orig_16: "Tomorrow Wow!",
  orig_17: "Neptuno",               orig_18: "Weird Worlds",
  orig_22: "Just a Hunch",          orig_23: "Heartbenders!",
  orig_24: "Like, Letters",         orig_25: "Teen Dramarama",
  orig_29: "Spooking Stories",      orig_30: "Approximate Terror",
  orig_31: "It Loiters",            orig_32: "Carmella?",
  orig_36: "Killer Gals",           orig_37: "Phone the Cops",
  orig_38: "Merely a Misdemeanor",  orig_39: "Gang Skirmishes!",
};

// ---------------------------------------------------------------- creatives
// 4 per genre per type: value 1, 2, 2, 3. Value-1 creatives carry an idea token.
const WRITER_NAMES = {
  crime:       ["Michael Florio", "Colin te Booij", "Margot Fragrasse", "Chris Constance"],
  horror:      ["Ann da Silva", "Laura Saurini", "Alexis Sunset", "Max Lovegods"],
  romance:     ["Marian Silang", "Luis Gonzalez", "Peter Bafolo", "Manu McSvampy"],
  scifi:       ["Ian Zhabjaku", "Lopez", "Simon Prex", "Nestor Mangoons"],
  superheroes: ["Vic Haerinck Jr", "Alden Bruce", "Rich De Angelis", "Alex Danish"],
  western:     ["Sebastian Owl", "Jamie Yardley", "Lou d'Auteuil", "Alex Quarella"],
};
const ARTIST_NAMES = {
  crime:       ["Eleanor Herrero", "Leonard Alleys", "Dee Saster", "Lisandro Estherren"],
  horror:      ["Julian Earl", "Barb Purplemice", "Bixby McGargan", "Francesco Biagini"],
  romance:     ["Sandra Pepper", "Elisa Rossello", "Abigael Bondoc", "Elena Casagrande"],
  scifi:       ["Sandy Lanes", "Luke Zanetti", "Lena Drake", "Gianluca Pagliarani"],
  superheroes: ["Pearlie Jones", "Corentin Lamay", "Max Treejan", "Giuseppe Camuncoli"],
  western:     ["Danny Rich", "D.J. Leonard", "Joan Thomas", "Riccardo Burchielli"],
};
const CREATIVE_SUFFIX = ["1", "2", "2B", "3"];
const CREATIVE_VALUES = [1, 2, 2, 3];

function buildCreatives() {
  const list = [];
  for (const kind of ["writer", "artist"]) {
    const names = kind === "writer" ? WRITER_NAMES : ARTIST_NAMES;
    for (const g of GENRES) {
      CREATIVE_SUFFIX.forEach((suf, i) => {
        list.push({
          id: `${kind}_${g}_${suf}`, kind, genre: g,
          value: CREATIVE_VALUES[i], name: names[g][i],
          sprite: `${kind}_${g}_${suf}`,
        });
      });
    }
  }
  return list;
}
const CREATIVES = buildCreatives();
const CARD_BY_ID = {};
COMICS.forEach((c) => (CARD_BY_ID[c.id] = c));
CREATIVES.forEach((c) => (CARD_BY_ID[c.id] = c));

// ------------------------------------------------------------------ orders
// per genre: 3x (val3 / +1 fan), 2x (val4 / +2), 1x (val5 / +3), 1x (val6 / +4)
const ORDER_SPECS = [
  { minVal: 3, fans: 1 }, { minVal: 3, fans: 1 }, { minVal: 3, fans: 1 },
  { minVal: 4, fans: 2 }, { minVal: 4, fans: 2 },
  { minVal: 5, fans: 3 }, { minVal: 6, fans: 4 },
];

// ------------------------------------------------------------------- board
const ACTIONS = ["hire", "develop", "ideas", "print", "royalties", "sales"];
const ACTION_INFO = {
  hire:      { name: "Talent Agency",   verb: "Hire!",      scene: "scene_hire",
               desc: "Sign 1 writer and 1 artist from the displays (or blind from a deck)." },
  develop:   { name: "Writers' Room",   verb: "Develop!",   scene: "scene_develop",
               desc: "Option a new comic book from the display, the deck, or pay $4 to commission a genre." },
  ideas:     { name: "Cafe Bizarre",    verb: "Ideas!",     scene: "scene_ideas",
               desc: "Brainstorm: take idea tokens from the cafe table plus 2 from the supply." },
  print:     { name: "Print Floor",     verb: "Print!",     scene: "scene_print",
               desc: "Print an original (creatives + $ + 2 ideas) or a rip-off (creatives + $)." },
  royalties: { name: "Accounting",      verb: "Royalties!", scene: "scene_royalties",
               desc: "Collect cash. Higher desks pay better." },
  sales:     { name: "Manhattan Map",   verb: "Sales!",     scene: "scene_sales",
               desc: "Send your sales agent around Manhattan to flip and collect sales orders." },
};
const IDEAS_SLOTS     = [2, 1, 1, 0, 0]; // board tokens taken (+2 from supply always)
const ROYALTIES_SLOTS = [4, 3, 3, 2, 1];
const SALES_SLOTS     = [3, 2, 2, 1, 1]; // flip up to N and collect up to N
const RANK_VP = [3, 2, 1, 0];
const FAN_MONEY = { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 3, 7: 4, 8: 4, 9: 4, 10: 6 }; // 11+ adds $6
const HAND_LIMIT = 6;
const MARKETING = [{ cost: 2, fans: 1 }, { cost: 5, fans: 2 }, { cost: 9, fans: 4 }];

// Special actions: which main action they follow + comics printed to unlock tier
const SPECIALS = {
  reassign:    { after: "hire",      tier: 2, name: "Re-assign",
                 desc: "After Hire: swap creatives between your mat, hand and new hires (pay value difference)." },
  hype:        { after: "develop",   tier: 2, name: "Hype",
                 desc: "After Develop: hype an unprinted comic. It gains 2 fans per round of delay, cashed in when printed." },
  ideasconv:   { after: "ideas",     tier: 2, name: "Word of Mouth",
                 desc: "After Ideas: convert up to 3 idea tokens into +1 fan each, max 1 per printed comic." },
  bettercolor: { after: "print",     tier: 3, name: "Better Colors",
                 desc: "After Print: the fresh comic gets a Better-Color token, worth 2 VP at the end." },
  marketing:   { after: "royalties", tier: 4, name: "Marketing",
                 desc: "After Royalties: buy fans — $2=1, $5=2, $9=4 (max $9 per action)." },
  extraeditor: { after: "sales",     tier: 4, name: "Extra Editor",
                 desc: "After Sales: gain one extra editor for the rest of this round." },
};

// --------------------------------------------------------------------- map
// Custom videogame Manhattan: 4x6 grid of newsstand corners + central X start.
// Nodes: id, grid col/row. Slots sit on street edges (2 nodes) or dangle (1).
function buildMap() {
  const nodes = [];
  const COLS = 4, ROWS = 6;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      nodes.push({ id: r * COLS + c, c, r });
  const edges = []; // [nodeA, nodeB]
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const id = r * COLS + c;
      if (c + 1 < COLS) edges.push([id, id + 1]);
      if (r + 1 < ROWS) edges.push([id, id + COLS]);
    }
  // slots: one per edge (38) + 4 dangling = 42
  const slots = edges.map(([a, b], i) => ({ id: i, nodes: [a, b] }));
  const dangling = [
    { id: 38, nodes: [1] },   // north of node 1 (top)
    { id: 39, nodes: [22] },  // south of node 22 (bottom)
    { id: 40, nodes: [8] },   // west of node 8 (left)
    { id: 41, nodes: [11] },  // east of node 11 (right)
  ];
  slots.push(...dangling);
  // player-count gating: 30 base, 6 three-player, 6 four-player
  const fourP = [38, 39, 40, 41, 0, 36];         // dangling + 2 far edges
  const threeP = [2, 14, 23, 30, 5, 33];
  slots.forEach((s) => {
    s.minPlayers = fourP.includes(s.id) ? 4 : threeP.includes(s.id) ? 3 : 2;
  });
  // X start: virtual node connected to the 4 central corners (rows 2-3, cols 1-2)
  const X_LINKS = [9, 10, 13, 14];
  return { nodes, edges, slots, X_LINKS, COLS, ROWS };
}
const MAP = buildMap();

// ------------------------------------------------------------------ flavor
const QUIPS = {
  print_orig: [
    "Hot off the press: {title}!",
    "{boss} slams {title} onto every newsstand in town.",
    "Extra! Extra! {pub} prints {title}!",
  ],
  print_rip: [
    "{boss} smirks: 'Ever heard of {title}? Neither have our lawyers.'",
    "{pub} rushes out {title}. It looks... oddly familiar.",
    "A suspiciously familiar cover hits the stands: {title}.",
  ],
  hire: [
    "{pub} signs {names}.",
    "{boss} shakes hands with {names}. Cigars all around.",
  ],
  develop: [
    "{boss} locks the writers' room until something brilliant comes out.",
    "{pub} is optioning a new book. The rumor mill spins.",
  ],
  ideas: [
    "{boss} stares out the window until inspiration strikes.",
    "Board meeting at {pub}! Napkins are being scribbled on.",
  ],
  royalties: [
    "{boss} counts the royalty checks. Twice.",
    "Cash registers ring at {pub}.",
  ],
  sales: [
    "{pub}'s sales agent works the newsstands.",
    "{boss} sends the agent out with a fresh pair of shoes.",
  ],
  taunt: [
    "Comics are a fad, kid. But it's MY fad.",
    "You call that a cover? My grandmother inks better.",
    "The chart has room for one name only.",
    "Fans are fickle. Contracts are forever.",
  ],
};

const TITLES = [
  [110, "Publisher"], [100, "Editor-in-Chief"], [90, "Senior Editor"],
  [80, "Associate Editor"], [70, "Editor"], [60, "Assistant Editor"], [0, "Proofreader"],
];
