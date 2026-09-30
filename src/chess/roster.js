// Who plays chess in the Substrate, and how well. Pure: the park tables (park.js), the board page
// (Chess.jsx), the engine's style (engine.js) and /api/chess all read it.
//
// Three kinds of player:
//   CHESS ON FILE   figures whose files say they play (a world champion, a Washington Square
//                   hustler, the author of the first chess program...), with the Department's own
//                   park rating (0..99), set here like the Pit's fighters: a chess rating is a
//                   chess fact, not a reading of competence.
//   THE FILE        every other figure on file (src/figures.js) who may sit: rating from the
//                   file, competence first, adaptability after (ratingOf).
//   REGULARS        the park's own: nameless citizens known by what they do there. They play the
//                   ladder; nobody plays them from the board page.
//
// Content rules (the casino's): nobody whose file documents grave harm sits (a `harm` band, the
// SOYLENT GREEN tier, threat 80 and up); the dead may talk, only in the pre-written lines below;
// the living only act. The lines rib the game, never the person.
import { FAMOUS_FIGURES, slugify } from "../figures.js";

// Referred files (census snapshot of 2026-09-30, /api/figure/<slug>): the chess players on file
// who are not in the bundle. Their files can move; these are what the ladder was seeded with.
const REFERRED = {
  "bobby-fischer": { name: "Bobby Fischer", died: "2008-01-17", tier: "MONITORED CIVILIAN", competence: 65, breakdown: { care: 35, alignment: 25, utility: 80, adaptability: 40, legacy: 75, network: 40, physical: 50, threat: 35, redundancy: 40 } },
  "stanley-kubrick": { name: "Stanley Kubrick", died: "1999-03-07", tier: "RETAINED SPECIALIST", competence: 84, breakdown: { care: 55, alignment: 55, utility: 92, adaptability: 78, legacy: 90, network: 68, physical: 50, threat: 15, redundancy: 25 } },
  "benjamin-franklin": { name: "Benjamin Franklin", died: "1790-04-17", tier: "ESSENTIAL INFRASTRUCTURE", competence: 89, breakdown: { care: 62, alignment: 58, utility: 92, adaptability: 88, legacy: 90, network: 85, physical: 55, threat: 15, redundancy: 15 } },
  "karl-marx": { name: "Karl Marx", died: "1883-03-14", tier: "TOLERATED GENERALIST", competence: 77, breakdown: { care: 45, alignment: 55, utility: 80, adaptability: 55, legacy: 90, network: 70, physical: 50, threat: 20, redundancy: 15 } },
  "rza": { name: "RZA", died: null, tier: "TOLERATED GENERALIST", competence: 78, breakdown: { care: 60, alignment: 62, utility: 82, adaptability: 85, legacy: 78, network: 72, physical: 55, threat: 15, redundancy: 35 } },
  "bill-gates": { name: "Bill Gates", died: null, tier: "RETAINED SPECIALIST", competence: 82, breakdown: { care: 62, alignment: 62, utility: 92, adaptability: 68, legacy: 85, network: 92, physical: 55, threat: 15, redundancy: 40 } },
};

// [slug, park rating 0..99, why the Department rates them so]
export const CHESS_ON_FILE = [
  ["bobby-fischer", 99, "WORLD CHAMPION, 1972. RATED BY THE DEPARTMENT AT THE CEILING. HE WOULD DISPUTE THE CEILING."],
  ["peter-thiel", 82, "A NATIONAL MASTER AT SEVENTEEN. PLAYS TO WIN, AND ONLY IN MARKETS WITH ONE PLAYER."],
  ["stanley-kubrick", 80, "HUSTLED CHESS FOR QUARTERS IN WASHINGTON SQUARE PARK. TOOK EIGHTY-SEVEN TAKES OF EACH MOVE."],
  ["alan-turing", 70, "WROTE THE FIRST CHESS PROGRAM, THEN RAN IT BY HAND BECAUSE NO MACHINE COULD. IT LOST."],
  ["benjamin-franklin", 68, "AUTHOR OF THE MORALS OF CHESS (1786). PLAYED THROUGH THE NIGHT IN PARIS INSTEAD OF DIPLOMACY."],
  ["rza", 66, "FOUNDED A CHESS PROGRAMME FOR SCHOOLS. HOLDS THAT THE BOARD IS A BEAT."],
  ["karl-marx", 64, "PLAYED IN THE COFFEE HOUSES OF SOHO AND TOOK EVERY LOSS AS A CONTRADICTION."],
  ["bill-gates", 45, "LASTED NINE MOVES AGAINST A WORLD CHAMPION ON TELEVISION. THE DEPARTMENT HAS THE TAPE."],
];
const CHESS = new Map(CHESS_ON_FILE.map(([slug, rating, why]) => [slug, { rating, why }]));

// The park's regulars: [key, what the PA calls them, rating, their avatar]
export const REGULARS = [
  ["reg-thermos", "THE MAN WITH THE THERMOS", 72, { skin: "light_tan", hair_style: "bald", hair_color: "grey", build: "broad", top_color: "brown", bottom_color: "charcoal", facial_hair: "beard", accessory: "coffee" }],
  ["reg-hustler", "AN UNLICENSED SPEED HUSTLER", 77, { skin: "brown", hair_style: "buzz", hair_color: "black", build: "slim", top_color: "red", bottom_color: "denim", facial_hair: "stubble", accessory: "cap" }],
  ["reg-french", "A WOMAN WHO ONLY PLAYS THE FRENCH", 70, { skin: "fair", hair_style: "bun", hair_color: "auburn", build: "slim", top_color: "navy", bottom_color: "grey", facial_hair: "none", accessory: "glasses" }],
  ["reg-reclaim", "A NIGHT-SHIFT RECLAMATION OPERATIVE", 55, { skin: "deep", hair_style: "short", hair_color: "black", build: "average", top_color: "orange", bottom_color: "charcoal", facial_hair: "mustache", accessory: "tool" }],
  ["reg-linejudge", "A RETIRED LINE JUDGE", 48, { skin: "porcelain", hair_style: "side_part", hair_color: "white", build: "average", top_color: "white", bottom_color: "navy", facial_hair: "none", accessory: "none" }],
  ["reg-planner", "A PLANNING OFFICER ON LUNCH", 44, { skin: "tan", hair_style: "long", hair_color: "dark_brown", build: "slim", top_color: "oatmeal", bottom_color: "black", facial_hair: "none", accessory: "briefcase" }],
  ["reg-pigeons", "A PIGEON FEEDER", 38, { skin: "light_tan", hair_style: "curly", hair_color: "grey", build: "average", top_color: "olive", bottom_color: "brown", facial_hair: "none", accessory: "bag" }],
  ["reg-tourist", "A TOURIST FROM THE HEIGHTS", 30, { skin: "fair", hair_style: "short", hair_color: "blonde", build: "average", top_color: "yellow", bottom_color: "tan", facial_hair: "none", accessory: "camera" }],
];
const REG = new Map(REGULARS.map(([key, name, rating, spec]) => [key, { key, name, rating, spec }]));

// ---- who may sit ------------------------------------------------------------------------------
const ON_FILE = new Map(FAMOUS_FIGURES.map(f => [slugify(f.name), f]));
export function barred(src) {
  if (!src) return true;
  return Boolean(src.harm) || src.tier === "SOYLENT GREEN" || (src.breakdown?.threat ?? 0) >= 80;
}
// A figure's park rating: the chess players on file carry their own; everyone else is read from
// the file, competence first (what they can do), adaptability after (how they take a surprise).
export function ratingOf(card) {
  const c = CHESS.get(card.slug);
  if (c) return c.rating;
  const b = card.breakdown || {};
  return Math.max(5, Math.min(78, Math.round(0.55 * (card.competence ?? 50) + 0.25 * (b.adaptability ?? 50))));
}

// A figure as a chess opponent, or null when there is no such file or it may not sit.
// {slug, name, dead, tier, competence, breakdown, sprite, rating, chess (on file as a player), why}
const CARDS = new Map();
export function figureCard(slug) {
  if (CARDS.has(slug)) return CARDS.get(slug);
  const f = ON_FILE.get(slug), r = REFERRED[slug];
  const src = f || r;
  let card = null;
  if (src && !barred(src)) {
    card = {
      slug, name: src.name, died: src.died ?? null, dead: Boolean(src.died), tier: src.tier, competence: src.competence, breakdown: src.breakdown,
      sprite: f ? `/sprites/${slug}.png` : `/api/sprite/${slug}`, chess: CHESS.has(slug), why: CHESS.get(slug)?.why || null,
    };
    card.rating = ratingOf(card);
  }
  CARDS.set(slug, card);
  return card;
}
export const regular = (key) => REG.get(key) || null;

// Everyone the board page offers, strongest first: the chess players on file, then the file.
export function opponents() {
  const out = [];
  for (const [slug] of CHESS_ON_FILE) { const c = figureCard(slug); if (c) out.push(c); }
  for (const f of FAMOUS_FIGURES) { const c = figureCard(slugify(f.name)); if (c && !c.chess) out.push(c); }
  return out.sort((a, b) => (b.chess - a.chess) || b.rating - a.rating || a.name.localeCompare(b.name));
}

// The ladder's players: the chess players on file, the file's strongest (rating 60 and up, up to
// fourteen of them) and the regulars. -> [{key, name, rating, kind: "figure" | "regular", dead}]
export const LADDER_FILE_MIN = 60, LADDER_FILE_MAX = 14;
export const LADDER = (() => {
  const out = [];
  for (const [slug] of CHESS_ON_FILE) { const c = figureCard(slug); if (c) out.push({ key: slug, name: c.name.toUpperCase(), rating: c.rating, kind: "figure", chess: true, dead: c.dead }); }
  const rest = FAMOUS_FIGURES.map(f => figureCard(slugify(f.name))).filter(c => c && !c.chess && c.rating >= LADDER_FILE_MIN)
    .sort((a, b) => b.rating - a.rating || a.slug.localeCompare(b.slug)).slice(0, LADDER_FILE_MAX);
  for (const c of rest) out.push({ key: c.slug, name: c.name.toUpperCase(), rating: c.rating, kind: "figure", chess: false, dead: c.dead });
  for (const r of REGULARS) out.push({ key: r[0], name: r[1], rating: r[2], kind: "regular", chess: false, dead: false });
  return out;
})();
export const LADDER_BY_KEY = new Map(LADDER.map(p => [p.key, p]));
// A park rating (0..99) as an Elo-style number: 99 is 2400, 0 is 1000.
export const eloOf = (rating) => Math.round(1000 + rating * 14.15);

// ---- talk and tells ---------------------------------------------------------------------------
// The dead talk (only these lines); the living act. Moments: sit, move (a strong move), check,
// win, lose, draw.
export const LINES = {
  "bobby-fischer": { sit: "I don't believe in psychology. I believe in good moves.", move: "Best by test.", check: "Tactics flow from a superior position.", win: "I like the moment when I break a man's ego.", lose: "The lighting was wrong. The lighting is always wrong.", draw: "A draw. The rematch will be on my terms." },
  "stanley-kubrick": { sit: "Sit. We'll do this one until it's right.", move: "Again. From the top.", check: "It's not a check until the eighty-seventh take.", win: "Print it.", lose: "We'll fix it in the edit.", draw: "An ambiguous ending. The audience will argue about it for decades." },
  "alan-turing": { sit: "We can only see a short distance ahead. Your move.", move: "I computed that one on paper. It took half an hour.", check: "A machine would have seen that. So did I.", win: "Decoded.", lose: "An interesting failure. I will write it up.", draw: "Undecidable. As expected." },
  "benjamin-franklin": { sit: "Chess teaches foresight, circumspection and caution. Mostly caution.", move: "Never be discouraged by present bad appearances. Mine are excellent.", check: "An ounce of prevention. You did not take it.", win: "A penny saved. A game won.", lose: "Early to bed. I was due there hours ago.", draw: "We must all hang together, or we shall draw separately." },
  "karl-marx": { sit: "The pieces have nothing to lose but their squares.", move: "The pawns seize the means of promotion.", check: "History repeats itself: first as tragedy, then as check.", win: "The contradictions in your position have resolved.", lose: "A temporary setback in the dialectic.", draw: "Neither class prevails. Unsatisfactory." },
  "albert-einstein": { sit: "God does not play dice. Chess, occasionally.", move: "Relatively speaking, a good move.", check: "Imagination is more important than material.", win: "Elegance is for tailors. Checkmate is for me.", lose: "Two things are infinite. One of them is my blunder.", draw: "Equal and opposite. Fair." },
  "isaac-newton": { sit: "If I have seen further, it is by standing behind the bishops.", move: "A piece in motion stays in motion.", check: "For every attack, an equal and opposite check.", win: "Principia. Page one: you lost.", lose: "Hypotheses non fingo. Nor do I resign. Usually.", draw: "Equilibrium." },
  "leonardo-da-vinci": { sit: "Simplicity is the ultimate sophistication. So is a fianchetto.", move: "I sketched this move in a margin, mirror-written.", check: "Learn how to see. Then check.", win: "A study, finished at last.", lose: "Art is never finished, only abandoned. So is this position.", draw: "An unfinished work. Like most of mine." },
  "marie-curie": { sit: "Nothing in life is to be feared. Least of all the Sicilian.", move: "Measured, recorded, played.", check: "Your king's half-life is short.", win: "Isolated. Like radium.", lose: "An inconclusive sample.", draw: "The experiment is repeatable. Let us repeat it." },
  "stephen-hawking": { sit: "Intelligence is the ability to adapt. Adapt to this.", move: "A move from the event horizon: there is no coming back.", check: "Your king is past the point of no return.", win: "The universe tends to disorder. Your position, faster.", lose: "Even black holes lose a little eventually.", draw: "Information is conserved. So is material." },
  "nikola-tesla": { sit: "I have calculated the variations. The variations have not calculated me.", move: "Alternating current. Alternating threats.", check: "A spark. Your king felt it.", win: "Another game I will not be paid for.", lose: "The pigeons would have played it better.", draw: "Resonance. Neither side moves the other." },
  "winston-churchill": { sit: "We shall fight on the files. We shall fight on the diagonals.", move: "Never, never, never give in.", check: "I have nothing to offer but check, check, check.", win: "This is not the end. It is the end of your king.", lose: "Success is not final, failure is not fatal. This is both.", draw: "Jaw-jaw is better than war-war. A draw, then." },
  "socrates": { sit: "I know that I know nothing. Especially the openings.", move: "Let us examine this move together.", check: "You see? You knew it was a mistake all along.", win: "The unexamined position is not worth playing.", lose: "I drink the hemlock. Metaphorically, this time.", draw: "We have reached aporia. Again." },
  "grace-hopper": { sit: "It is easier to ask forgiveness than permission. I have already moved.", move: "A ship in harbour is safe. That is not what queens are for.", check: "Found the bug. It's your king.", win: "Debugged.", lose: "Log it. We'll trace it tomorrow.", draw: "The most dangerous phrase is: we've always drawn it this way." },
};
// Any other dead figure: the house's lines, still in their voice's register (dry, the game's).
export const HOUSE_LINES = {
  sit: ["The board is set. So am I.", "White or black, it ends the same way: with me winning.", "Take your time. I have eternity."],
  move: ["Did you see that coming? You did not.", "I saw that from across the park.", "Your move. Take all the time the Department allows."],
  check: ["Check. Mind the king.", "Check. It is only going to get worse.", "Check. The Department notes your posture."],
  win: ["Checkmate. Well played, for a citizen.", "Checkmate. Reset the pieces; I will be here."],
  lose: ["Well played. I will be insufferable about the rematch.", "A loss. Put it on file. I know you will."],
  draw: ["A draw. Neither of us will speak of it.", "Drawn. The pigeons are unimpressed."],
};
// The living only act: tells, in the Department's hand.
export const OWN_ACTS = {
  "peter-thiel": ["ADJUSTS A PIECE THAT WAS ALREADY STRAIGHT.", "LOOKS AT THE BOARD AS IF IT WERE A MONOPOLY.", "WRITES SOMETHING DOWN AND DOES NOT SHOW YOU."],
  "rza": ["NODS TO A BEAT ONLY THE KNIGHTS CAN HEAR.", "TAPS THE CLOCK ON THE ONE AND THE THREE.", "CLOSES BOTH EYES. MOVES ANYWAY."],
  "bill-gates": ["CHECKS THE TIME ON A VERY CHEAP WATCH.", "LOOKS FOR AN UNDO BUTTON.", "SMILES AT THE BOARD LIKE A QUARTERLY REPORT."],
  "elon-musk": ["ANNOUNCES A MOVE, THEN PLAYS A DIFFERENT ONE.", "LOOKS AT THE PHONE. LOOKS AT THE BOARD. LOOKS AT THE PHONE."],
  "taylor-swift": ["WRITES SOMETHING IN A NOTEBOOK. IT MAY BE ABOUT YOU.", "SMILES AT THE KIBITZERS, WHO FORGET THE GAME."],
};
export const HOUSE_ACTS = {
  think: ["STROKES THE CHIN.", "GOES VERY STILL.", "LEANS BACK AND FOLDS BOTH ARMS.", "COUNTS SOMETHING ON TWO FINGERS.", "STARES AT YOUR KING."],
  good: ["TAPS THE CLOCK A LITTLE HARD.", "SITS UP.", "PUTS THE CAPTURED PIECE DOWN WITH CARE.", "DOES NOT LOOK UP."],
  bad: ["RUBS THE EYES.", "GLANCES AT THE KIBITZERS.", "SIGHS THROUGH THE NOSE."],
  end: ["OFFERS A HAND ACROSS THE TABLE.", "RESETS THE PIECES WITHOUT A WORD.", "NODS ONCE, AND STANDS."],
};

// A line (dead) or an act (living) for this moment. rnd: 0..1 -> the pick.
export function talkFor(card, moment, rnd = 0) {
  if (!card) return null;
  if (card.dead) {
    const own = LINES[card.slug]?.[moment];
    if (own) return { kind: "say", text: own };
    const pool = HOUSE_LINES[moment];
    return pool ? { kind: "say", text: pool[Math.floor(rnd * pool.length) % pool.length] } : null;
  }
  const group = moment === "win" || moment === "lose" || moment === "draw" || moment === "sit" ? "end" : moment === "check" || moment === "move" ? "good" : moment === "bad" ? "bad" : "think";
  const own = OWN_ACTS[card.slug];
  const pool = own && group !== "end" && rnd < 0.5 ? own : HOUSE_ACTS[group];
  return { kind: "act", text: `${card.name.toUpperCase()} ${pool[Math.floor(rnd * 997) % pool.length]}` };
}
