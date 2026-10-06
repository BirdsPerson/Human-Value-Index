// Who sits at THE CARD ROOM's tables: figures on file with a file photo (public/sprites/<key>.png,
// the head cut by src/play/heads.js), each with a card rating (0..99: how well they play) and a
// temper (0..1: how bold: the moon, the nil, the queen held). Set here by the Department, like the
// chess tables' park ratings: a reading of the cards, not of the person.
//
// Content rules (the chess and tennis tables'): nobody whose file documents grave harm sits. Nobody
// at a card table speaks. `past` figures may make a silent gesture (an emote, in the Department's
// hand) at the start, a win, a moon; figures on the current register make none at all.

export const FIGURES = [
  { key: "ada-lovelace", name: "ADA LOVELACE", rating: 90, temper: 0.75, past: true },
  { key: "alan-turing", name: "ALAN TURING", rating: 92, temper: 0.35, past: true },
  { key: "grace-hopper", name: "GRACE HOPPER", rating: 86, temper: 0.55, past: true },
  { key: "marie-curie", name: "MARIE CURIE", rating: 80, temper: 0.3, past: true },
  { key: "isaac-newton", name: "ISAAC NEWTON", rating: 82, temper: 0.15, past: true },
  { key: "albert-einstein", name: "ALBERT EINSTEIN", rating: 74, temper: 0.5, past: true },
  { key: "winston-churchill", name: "WINSTON CHURCHILL", rating: 72, temper: 0.9, past: true },
  { key: "nikola-tesla", name: "NIKOLA TESLA", rating: 70, temper: 0.6, past: true },
  { key: "leonardo-da-vinci", name: "LEONARDO DA VINCI", rating: 76, temper: 0.45, past: true },
  { key: "harriet-tubman", name: "HARRIET TUBMAN", rating: 78, temper: 0.65, past: true },
  { key: "billie-holiday", name: "BILLIE HOLIDAY", rating: 58, temper: 0.7, past: true },
  { key: "babe-ruth", name: "BABE RUTH", rating: 50, temper: 0.97, past: true },
  { key: "socrates", name: "SOCRATES", rating: 64, temper: 0.4, past: true },
  { key: "marcus-aurelius", name: "MARCUS AURELIUS", rating: 68, temper: 0.1, past: true },
  { key: "mansa-musa", name: "MANSA MUSA", rating: 56, temper: 0.85, past: true },
  { key: "muhammad-ali", name: "MUHAMMAD ALI", rating: 62, temper: 0.95, past: true },
  { key: "keanu-reeves", name: "KEANU REEVES", rating: 60, temper: 0.3 },
  { key: "taylor-swift", name: "TAYLOR SWIFT", rating: 74, temper: 0.5 },
  { key: "oprah-winfrey", name: "OPRAH WINFREY", rating: 66, temper: 0.55 },
  { key: "shohei-ohtani", name: "SHOHEI OHTANI", rating: 70, temper: 0.4 },
  { key: "nikola-jokic", name: "NIKOLA JOKIC", rating: 78, temper: 0.25 },
  { key: "jason-kelce", name: "JASON KELCE", rating: 48, temper: 0.85 },
  { key: "tom-brady", name: "TOM BRADY", rating: 72, temper: 0.7 },
];
export const FIGURE_BY = new Map(FIGURES.map(f => [f.key, f]));

// The rooms the tables stand in, and who drinks there.
export const ROOMS = {
  casino: { name: "HOUSE EDGE CASINO", sub: "THE CARD ROOM, GROUND FLOOR", felt: "casino", pool: ["ada-lovelace", "alan-turing", "grace-hopper", "winston-churchill", "nikola-tesla", "taylor-swift", "nikola-jokic", "tom-brady", "mansa-musa", "isaac-newton", "oprah-winfrey"], back: "#city/strip/casino" },
  bar: { name: "THE DIVE", sub: "THE BACK TABLE, BY THE CABINETS", felt: "bar", pool: ["babe-ruth", "billie-holiday", "muhammad-ali", "jason-kelce", "winston-churchill", "socrates", "keanu-reeves", "nikola-tesla", "mansa-musa", "albert-einstein"], back: "#city" },
  union: { name: "THE UNION LOUNGE", sub: "THE CARD TABLE BY THE SOFAS (SUPERVISED FUN)", felt: "union", pool: ["marie-curie", "albert-einstein", "socrates", "marcus-aurelius", "leonardo-da-vinci", "harriet-tubman", "shohei-ohtani", "keanu-reeves", "oprah-winfrey", "grace-hopper"], back: "#city" },
  home: { name: "YOUR FLAT", sub: "THE KITCHEN TABLE", felt: "home", pool: ["keanu-reeves", "marie-curie", "billie-holiday", "socrates", "jason-kelce", "taylor-swift", "nikola-jokic", "marcus-aurelius", "harriet-tubman"], back: "#city" },
};
export const roomOf = (at) => ROOMS[at] || ROOMS.casino;

const h32 = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
// The day's three tables in a room: three figures each, a seed each. day: "YYYY-MM-DD" (UTC).
export function tablesFor(at, day) {
  const pool = roomOf(at).pool.slice();
  const out = [];
  let x = h32(`${at}|${day}`) || 1;
  const rnd = (k) => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x % k; };
  for (let t = 0; t < 3; t++) {
    const left = pool.slice(), seats = [];
    while (seats.length < 3) seats.push(FIGURE_BY.get(left.splice(rnd(left.length), 1)[0]));
    out.push({ n: t + 1, seed: h32(`${at}|${day}|${t}`) || 1, seats: seats.map(f => ({ key: f.key, name: f.name, rating: f.rating, temper: f.temper })) });
  }
  return out;
}
export const tableLevel = (t) => Math.round(t.seats.reduce((a, s) => a + s.rating, 0) / t.seats.length);

// ---- the silent gestures (past figures only) ------------------------------------------------------
const OWN = {
  "winston-churchill": { start: "LIGHTS A CIGAR THAT IS NOT THERE.", win: "MAKES A V WITH TWO FINGERS.", moon: "RAISES A GLASS TO NOBODY IN PARTICULAR." },
  "babe-ruth": { start: "POINTS AT THE CEILING.", win: "POINTS AT THE CEILING AGAIN.", moon: "TIPS A CAP, SLOWLY." },
  "ada-lovelace": { start: "WRITES SOMETHING ON A NAPKIN.", win: "FOLDS THE NAPKIN AND POCKETS IT.", moon: "UNDERLINES SOMETHING ON THE NAPKIN, TWICE." },
  "alan-turing": { start: "SQUARES THE DECK, EXACTLY.", win: "NODS, ONCE.", moon: "LOOKS AT THE CEILING, CALCULATING." },
  "muhammad-ali": { start: "SHADOWBOXES THE DECK.", win: "STANDS AND DANCES ONE STEP.", moon: "THROWS A SLOW-MOTION JAB AT THE POT." },
  "isaac-newton": { start: "DROPS AN APPLE ON THE TABLE.", win: "PICKS THE APPLE BACK UP.", moon: "STARES AT THE APPLE." },
  "socrates": { start: "RAISES ONE FINGER, AS IF TO ASK.", win: "SHRUGS, WISELY.", moon: "RAISES ONE FINGER, AND LOWERS IT." },
};
const HOUSE = {
  start: ["SHUFFLES A PRIVATE DECK, FOR LUCK.", "STRAIGHTENS THE CHAIR.", "CRACKS THEIR KNUCKLES."],
  win: ["TAPS THE TABLE TWICE.", "SITS BACK, ARMS FOLDED.", "STACKS THE TRICKS INTO A NEAT PILE."],
  lose: ["STARES AT THE CARDS FOR A LONG TIME.", "PUSHES THE CARDS AWAY.", "NODS TO THE WINNER."],
  moon: ["STANDS UP, BRIEFLY.", "SPREADS BOTH HANDS ON THE TABLE.", "LOOKS AROUND THE TABLE, ONE BY ONE."],
  set: ["SIGHS WITHOUT A SOUND.", "TURNS THE SCORE PAD FACE DOWN."],
};
// -> {text} | null. moment: start | win | lose | moon | set. Silent: a gesture, never a line.
export function emoteFor(f, moment, pick = 0) {
  const fig = f && (FIGURE_BY.get(f.key) || f);
  if (!fig || !fig.past) return null;
  const own = OWN[fig.key]?.[moment];
  const pool = HOUSE[moment];
  const t = own || (pool ? pool[pick % pool.length] : null);
  return t ? { text: `${fig.name} ${t}` } : null;
}

// ---- the deck of cards (THE SHOPS, EASTGATE HOME) ---------------------------------------------------
// Solitaire and Spider are home games: they need a deck of cards in your inventory, or what it was
// upgraded into (the card table, the poker table).
export const DECK_ITEMS = ["deck", "deck-eb", "card-table", "poker-table"];
export const ownsDeck = (items) => Array.isArray(items) && items.some(i => i && i.kind === "furn" && DECK_ITEMS.includes(i.ref));
export const ownsEbDeck = (items) => Array.isArray(items) && items.some(i => i && i.kind === "furn" && i.ref === "deck-eb");
export const ownsTable = (items) => Array.isArray(items) && items.some(i => i && i.kind === "furn" && (i.ref === "card-table" || i.ref === "poker-table"));
