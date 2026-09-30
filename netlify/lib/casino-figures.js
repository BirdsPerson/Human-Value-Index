// Who sits at the poker tables. Figures on file (src/figures.js) and referred figures from
// the census; their play comes from their file (casino-poker.js styleOf). Content rules:
//   - living figures play but only ACT: no table talk, ever. Their tells are actions.
//   - dead figures may speak, only in the pre-written lines below, in character.
//   - nobody whose file documents grave harm sits at a table (the figure's `harm` band, or
//     the list below for referred files). Never cruel: the lines rib the game, not the person.
// Referred figures' dimensions are the census snapshot of 2026-09-30 (their files can move;
// the table is re-read from src/figures.js for the 62 on file).
import { FAMOUS_FIGURES, slugify } from "../../src/figures.js";
import { styleOf } from "./casino-poker.js";

// ---- lines (dead figures only) --------------------------------------------------------------------
// sit, raise, win, fold. Paraphrase and pastiche, attributed to nobody but the table.
export const LINES = {
  "nikola-tesla": { sit: "I have calculated the odds. The odds have not calculated me.", raise: "Alternating current. Alternating bets.", win: "Another pot. I will not be paid for this one either, I expect.", fold: "The pigeons would fold this hand." },
  "mansa-musa": { sit: "Deal me in. Do not mind the gold; I brought only enough to upset one market.", raise: "A modest raise. By my standards, a rounding error.", win: "Put it with the rest.", fold: "Keep it. Cairo is still recovering from my last visit." },
  "pablo-picasso": { sit: "Every hand is a portrait. This one has both eyes on the same side.", raise: "I raise. It is my blue period.", win: "Good artists call. Great artists take the pot.", fold: "I painted better hands than this in 1907." },
  "socrates": { sit: "I know that I know nothing. Especially about your cards.", raise: "Let us examine this raise together.", win: "You see? You knew it was a bad call all along.", fold: "The unexamined hand is not worth playing." },
  "babe-ruth": { sit: "Deal 'em. I'll call my shot.", raise: "That one's going to the bleachers.", win: "Right where I pointed.", fold: "Strike one." },
  "marcus-aurelius": { sit: "The cards are indifferent. So am I.", raise: "Waste no more time arguing what a good hand should be. Raise it.", win: "It was never mine. It is on loan from the pot.", fold: "You have power over your mind, not over the river." },
  "winston-churchill": { sit: "We shall play them on the flop. We shall play them on the turn.", raise: "Never, never, never give in.", win: "This is not the end. It is the end of the pot.", fold: "I have nothing to offer but a check and a fold." },
  "isaac-newton": { sit: "A hand at rest stays at rest.", raise: "For every raise, an equal and opposite re-raise.", win: "The chips fall toward the greater mass.", fold: "Hypotheses non fingo. Nor do I call." },
  "leonardo-da-vinci": { sit: "Simplicity is the ultimate sophistication. So is a pair of aces.", raise: "I sketched this raise in a margin, mirror-written.", win: "A study in chips, finished at last.", fold: "Art is never finished, only abandoned. So is this hand." },
  "marie-curie": { sit: "Nothing is to be feared. The river is only to be understood.", raise: "I raise. The half-life of your stack is short.", win: "Measured, recorded, collected.", fold: "An inconclusive sample. Discarded." },
  "billie-holiday": { sit: "Deal slow. I like to take my time.", raise: "Ain't nobody's business if I do.", win: "God bless the child that's got her own.", fold: "Not this one, honey." },
  // the high limit room
  "sun-tzu": { sit: "Every battle is won before it is fought. This one was won in the car park.", raise: "Appear weak when you are strong.", win: "The supreme art is to take the pot without a showdown.", fold: "He will win who knows when to fight and when not to." },
  "j-robert-oppenheimer": { sit: "I learned this game on the mesa. The physics was easier.", raise: "It is technically sweet. I raise.", win: "The theory held.", fold: "I have no further comment for the committee." },
  "richard-nixon": { sit: "I paid for my first campaign at a table like this. Deal.", raise: "Let me make one thing perfectly clear: I raise.", win: "I am not a crook. I am a winner.", fold: "You won't have Nixon to kick around this hand." },
  "frank-sinatra": { sit: "Luck be a lady tonight.", raise: "I did it my way. Raise.", win: "The best is yet to come.", fold: "That's life." },
  "galileo-galilei": { sit: "I have written on the dice. Cards are merely flatter.", raise: "And yet it moves. The pot, toward me.", win: "Observed, not assumed.", fold: "I recant. This hand only." },
  "benjamin-franklin": { sit: "Nothing is certain but death and taxes. There is no rake.", raise: "An investment in knowledge pays the best interest. So does this raise.", win: "A penny saved. Several hundred won.", fold: "Early to fold, early to rise." },
  "bobby-fischer": { sit: "I don't believe in psychology. I believe in good moves.", raise: "Tactics flow from a superior position.", win: "Best by test.", fold: "Resigns." },
  "alan-turing": { sit: "We can only see a short distance ahead. Deal the flop.", raise: "A machine could play this hand. I will do it anyway.", win: "Decoded.", fold: "Insufficient information. Halting." },
  "ada-lovelace": { sit: "The Engine weaves algebraic patterns. I weave chip stacks.", raise: "I have a system. It has improved since the racecourse.", win: "Poetical science.", fold: "The Engine originates nothing. Nor does this hand." },
  "albert-einstein": { sit: "God does not play dice. I am not God.", raise: "Relatively speaking, a small raise.", win: "Imagination helped. So did your cards.", fold: "Doing the same thing and expecting a different river. I fold." },
};

// A few figures' own habits; everyone else draws from the house list.
const OWN_TELLS = {
  "nikola-tesla": { strong: "COUNTS HIS CHIPS IN THREES, TWICE.", weak: "WIPES EACH CHIP WITH A HANDKERCHIEF." },
  "babe-ruth": { strong: "POINTS VAGUELY AT THE CEILING.", weak: "ORDERS ANOTHER HOT DOG." },
  "jason-kelce": { strong: "TAKES OFF A SHIRT THAT WAS NOT IN THE WAY.", weak: "LOOKS TOWARD A BROTHER WHO IS NOT AT THE TABLE." },
  "keanu-reeves": { strong: "NODS, ONCE, VERY KINDLY.", weak: "OFFERS THE DEALER HIS SEAT." },
  "sun-tzu": { strong: "LOOKS WEAK.", weak: "LOOKS STRONG." },
  "warren-buffett": { strong: "SIPS A CHERRY COLA.", weak: "CHECKS THE TIME ON A VERY OLD WATCH." },
  "bobby-fischer": { strong: "COMPLAINS ABOUT THE LIGHTING.", weak: "COMPLAINS ABOUT THE CAMERAS." },
};
export const HOUSE_TELLS = {
  strong: ["GOES VERY STILL.", "STACKS CHIPS INTO ONE NEAT COLUMN.", "STOPS LOOKING AT THE BOARD.", "BREATHES SLOWLY THROUGH THE NOSE.", "PUSHES THE CHIPS IN GENTLY, AS IF THEY MIGHT WAKE."],
  weak: ["LOOKS AT THE HOLE CARDS AGAIN.", "RIFFLES CHIPS, LOUDLY.", "LEANS BACK AND FOLDS BOTH ARMS.", "GLANCES AT THE EXIT.", "BETS FAST AND STARES AT THE DEALER."],
};

// ---- the pools -------------------------------------------------------------------------------------
const FLOOR = ["nikola-tesla", "mansa-musa", "pablo-picasso", "socrates", "babe-ruth", "marcus-aurelius", "winston-churchill", "isaac-newton", "leonardo-da-vinci", "marie-curie", "billie-holiday",
  "taylor-swift", "keanu-reeves", "oprah-winfrey", "tom-brady", "madonna", "jason-kelce", "nikola-jokic", "dennis-rodman", "elon-musk", "sam-altman", "peter-thiel"];
// Famous gamblers and strategists on file: harder tables.
const HIGH = ["sun-tzu", "j-robert-oppenheimer", "richard-nixon", "frank-sinatra", "galileo-galilei", "benjamin-franklin", "bobby-fischer", "alan-turing", "ada-lovelace", "albert-einstein", "warren-buffett", "michael-burry"];

// Referred files (census snapshot 2026-09-30): breakdown, competence, tier, died.
const REFERRED = {
  "sun-tzu": { name: "Sun Tzu", died: "-0496", tier: "TOLERATED GENERALIST", competence: 73, breakdown: { care: 50, alignment: 55, utility: 75, adaptability: 60, legacy: 90, network: 55, physical: 50, threat: 45, redundancy: 40 } },
  "j-robert-oppenheimer": { name: "J. Robert Oppenheimer", died: "1967-02-18", tier: "TOLERATED GENERALIST", competence: 83, breakdown: { care: 55, alignment: 55, utility: 95, adaptability: 75, legacy: 85, network: 80, physical: 45, threat: 35, redundancy: 30 } },
  "richard-nixon": { name: "Richard Nixon", died: "1994-04-22", tier: "MONITORED CIVILIAN", competence: 70, breakdown: { care: 40, alignment: 40, utility: 78, adaptability: 68, legacy: 60, network: 80, physical: 55, threat: 40, redundancy: 30 } },
  "frank-sinatra": { name: "Frank Sinatra", died: "1998-05-14", tier: "TOLERATED GENERALIST", competence: 85, breakdown: { care: 55, alignment: 50, utility: 92, adaptability: 78, legacy: 88, network: 80, physical: 55, threat: 40, redundancy: 20 } },
  "galileo-galilei": { name: "Galileo Galilei", died: "1642-01-08", tier: "RETAINED SPECIALIST", competence: 85, breakdown: { care: 55, alignment: 65, utility: 92, adaptability: 70, legacy: 97, network: 68, physical: 50, threat: 12, redundancy: 20 } },
  "benjamin-franklin": { name: "Benjamin Franklin", died: "1790-04-17", tier: "ESSENTIAL INFRASTRUCTURE", competence: 89, breakdown: { care: 62, alignment: 58, utility: 92, adaptability: 88, legacy: 90, network: 85, physical: 55, threat: 15, redundancy: 15 } },
  "bobby-fischer": { name: "Bobby Fischer", died: "2008-01-17", tier: "MONITORED CIVILIAN", competence: 65, breakdown: { care: 35, alignment: 25, utility: 80, adaptability: 40, legacy: 75, network: 40, physical: 50, threat: 35, redundancy: 40 } },
  "warren-buffett": { name: "Warren Buffett", died: null, tier: "RETAINED SPECIALIST", competence: 78, breakdown: { care: 68, alignment: 62, utility: 88, adaptability: 65, legacy: 82, network: 85, physical: 45, threat: 15, redundancy: 40 } },
  "michael-burry": { name: "Michael Burry", died: null, tier: "TOLERATED GENERALIST", competence: 66, breakdown: { care: 55, alignment: 55, utility: 78, adaptability: 75, legacy: 60, network: 58, physical: 50, threat: 15, redundancy: 55 } },
};

const ON_FILE = new Map(FAMOUS_FIGURES.map(f => [slugify(f.name), f]));

export function figureCard(slug) {
  const f = ON_FILE.get(slug);
  const r = REFERRED[slug];
  if (!f && !r) return null;
  const src = f || r;
  if (src.harm) return null;   // grave harm on file: not seated
  return {
    slug, name: src.name, died: src.died ?? null, dead: Boolean(src.died), tier: src.tier, breakdown: src.breakdown, competence: src.competence,
    sprite: f ? `/sprites/${slug}.png` : `/api/sprite/${slug}`,
  };
}

export const poolOf = (level) => (level === "high" ? HIGH : FLOOR).map(figureCard).filter(Boolean);

// A seat for this figure: its style from its file, and whether it may talk.
export function seatFor(card, level, stack) {
  const style = styleOf(card.breakdown, card.competence, level === "high");
  return { id: card.slug, name: card.name.toUpperCase(), stack, dead: card.dead, tier: card.tier, sprite: card.sprite, bot: style, talks: card.dead && Boolean(LINES[card.slug]) };
}

// A line for this moment (dead figures with lines only), or null.
export function lineFor(seat, moment) {
  if (!seat?.talks) return null;
  return LINES[seat.id]?.[moment] || null;
}

// A tell: an action, true to the hand with the figure's honesty, else the opposite.
export function tellFor(seat, strength, rnd) {
  const honest = rnd() < (seat.bot?.honesty ?? 0.6);
  const shown = honest ? strength : strength === "strong" ? "weak" : "strong";
  const own = OWN_TELLS[seat.id]?.[shown];
  const pool = HOUSE_TELLS[shown];
  const text = own && rnd() < 0.5 ? own : pool[Math.floor(rnd() * pool.length)];
  return `${seat.name} ${text}`;
}

// The file-to-play explanation shown on the table's dossier.
export function dossier(card, level) {
  const b = card.breakdown || {}, s = styleOf(b, card.competence, level === "high");
  return [
    `AGGRESSION ${s.aggression} // FROM THREAT ${b.threat} AND COMPETENCE ${card.competence ?? "?"}`,
    `BLUFFS ${Math.round(s.bluff * 100)}% OF CHECKED POTS // FROM ADAPTABILITY ${b.adaptability}`,
    `TIGHTNESS ${s.tightness} // FROM CARE ${b.care} AND ALIGNMENT ${b.alignment}`,
    `READS ITS OWN HAND AT SKILL ${s.skill}${level === "high" ? " (HIGH LIMIT: +12)" : ""} // TELLS TRUE ${Math.round(s.honesty * 100)}% OF THE TIME`,
  ];
}
