// THE MARKET (docs/design/ECONOMY_PROPERTY.md, "§ The Living Market"): the numbers every side
// reads. Browser-safe and pure: the page, /api/market, the tick and scripts/check-market.mjs all
// read these. Nothing here reads or writes a score: wealth never raises the score.
import { PERSONA, DRIVE_WORDS } from "../city/drives.js";

export const FLOAT = 10_000;            // shares outstanding per human (whole shares)
export const BASE_PRICE = 100;          // the average human, in CYCLES a share
export const HVI_BASE = 1000;           // THE HUMAN VALUE INDEX at its first tick
export const MIN_ORDER = 100;           // CYCLES
export const MAX_ORDER = 1_000_000;
export const MACHINE_DAYS_PER_REAL_DAY = 60;

// The ballot: every knob that decides who can get rich is data with a default, read at a real-day
// boundary (market state `knobs`), never mid-day. The Assembly votes on these (slice 2 wires the
// ballot); scripts/check-market.mjs holds the fairness targets at these defaults.
export const KNOBS = Object.freeze({
  positionCap: 0.03,      // of a float, per holder (player or NPC)
  npcCap: 0.20,           // of a float, all NPC investors together: a GUARDRAIL (past it, the Department intervenes)
  npcEach: 0.03,          // of a float, one NPC investor: a guardrail the acquisitive and populist lean on
  npcHard: 0.50,          // of a float, all NPCs together: the wall
  npcEachHard: 0.20,      // of a float, one NPC: the wall
  mogulMax: 12,           // moguls the city tolerates
  levyRate: 0.002,        // a day, on market wealth above the floor
  levyFloor: 50_000,      // CYCLES
  dividend: 1,            // share of the levy paid back as the citizens' dividend
  dayBand: 0.15,          // a human's price stays within this of the real day's open
  tickBand: 0.03,         // the most one machine day can move a price
  halts: true,            // touching the day band halts the human for the rest of the real day
  spread: 0.0025,         // each side: ASK = P x (1 + spread), BID = P x (1 - spread)
  minHoldHours: 24,       // a position is held this long after its last purchase
  listLiving: true,       // living people on file are listed (Scott, 2026-10-05); false delists them all at the next boundary
});
export const KNOB_LIMITS = Object.freeze({
  positionCap: [0.005, 0.1], npcCap: [0, 0.5], npcEach: [0, 0.1], npcHard: [0, 0.6], npcEachHard: [0, 0.3], mogulMax: [0, 24], levyRate: [0, 0.01],
  levyFloor: [10_000, 1_000_000], dividend: [0, 1], dayBand: [0.05, 0.3], tickBand: [0.01, 0.05], halts: [false, true],
  spread: [0, 0.02], minHoldHours: [0, 72], listLiving: [false, true],
});
// A proposed set of knobs, held to the limits (anything else is the default). Pure.
export function knobsOf(raw) {
  const out = { ...KNOBS };
  for (const [k, [lo, hi]] of Object.entries(KNOB_LIMITS)) {
    const v = raw?.[k];
    if (typeof KNOBS[k] === "boolean") { if (typeof v === "boolean") out[k] = v; continue; }
    if (Number.isFinite(v)) out[k] = Math.min(hi, Math.max(lo, v));
  }
  return out;
}
export const KNOB_LABELS = {
  positionCap: "MOST OF ONE HUMAN ANY HOLDER MAY OWN", npcCap: "MOST OF ONE HUMAN THE NPC INVESTORS SHOULD OWN TOGETHER",
  npcEach: "MOST OF ONE HUMAN ONE NPC INVESTOR SHOULD OWN", npcHard: "MOST OF ONE HUMAN THE NPC INVESTORS CAN EVER OWN", npcEachHard: "MOST OF ONE HUMAN ONE NPC CAN EVER OWN", mogulMax: "MOGULS THE CITY TOLERATES",
  levyRate: "CONCENTRATION LEVY, A DAY", levyFloor: "LEVY APPLIES ABOVE", dividend: "SHARE OF THE LEVY PAID TO EVERY CITIZEN",
  dayBand: "MOST A PRICE MAY MOVE IN A REAL DAY", tickBand: "MOST A PRICE MAY MOVE IN A MACHINE DAY", halts: "HALT A HUMAN THAT HITS THE BAND",
  spread: "THE DEPARTMENT'S SPREAD, EACH SIDE", minHoldHours: "HOURS A PURCHASE IS HELD", listLiving: "LIST THE LIVING",
};

// The fairness targets (Scott, 2026-10-05; the design's three tests). check-market asserts them.
export const TARGETS = Object.freeze({
  firstRung: 9_000,        // an OUTER flat (design §2)
  firstRungDays: 14,       // a UBI-only newcomer reaches it inside this
  wagePerDay: 150,         // labour's monthly gain: the slice-3 wage band
  skillBand: [0.5, 2],     // savvy's month gain over labour's
  top1Share: 0.25,         // of market wealth, at the default knobs, over 90 simulated days
});

// ---- the activity terms (the builder's `market` part, src/market/activity.js) ------------------
export const TERMS = ["work", "crowd", "sport", "play", "civic"];
export const WEIGHTS = { work: 0.30, crowd: 0.25, sport: 0.20, play: 0.15, civic: 0.10 };
export const TERM_WORDS = { work: "WORK", crowd: "SEEN", sport: "SPORT", play: "OUT", civic: "OFFICE" };

// ---- the NPC investor class (dead figures only in slice 1; ids npc:<slug>, never reused) ---------
// Scott (2026-10-05): "There should always be some way things can be justified ... we'd rather
// see things get polarized occasionally and then some deus ex machina presents itself to
// stabilize things." Each NPC trades from its PERSONA DRIVE, read from its documented record:
//   acquisitive    corners: few names, up to and past the soft caps (the Department intervenes)
//   cautious       buys below fair value, sells above it
//   speculator     chases what is rising                 contrarian  buys what is falling
//   fashion        buys what the crowd is looking at     populist    buys the most-seen, and finds
//                                                                     the loophole (half the levy)
//   revolutionary  buys the overlooked (the commons' people, the unseen) and calls boycotts on
//                  whatever the acquisitive are cornering
// [slug, class, drive (drives.js PERSONA), the Department's note]. The dead may get a Department gag; never a quote.
export const NPC_ROSTER = [
  ["john-d-rockefeller", "mogul", PERSONA["john-d-rockefeller"], "CORNERS THINGS. CALLS IT EFFICIENCY."],
  ["j-p-morgan", "mogul", PERSONA["j-p-morgan"], "ONCE BAILED OUT A NATION. NOW BUYS IT."],
  ["cornelius-vanderbilt", "mogul", PERSONA["cornelius-vanderbilt"], "RAILWAYS, THEN EVERYTHING ELSE."],
  ["mansa-musa", "mogul", PERSONA["mansa-musa"], "MOVED A MARKET BY VISITING IT. THE DEPARTMENT HAS CAPPED HIM."],
  ["ross-perot", "mogul", PERSONA["ross-perot"], "A BILLIONAIRE AGAINST THE ESTABLISHMENT. OWNS SOME OF IT."],
  ["kiichiro-toyoda", "mogul", PERSONA["kiichiro-toyoda"], "JUST IN TIME. NEVER EARLY."],
  ["john-d-rockefeller-jr", "rich", PERSONA["john-d-rockefeller-jr"], "INHERITED. DIVERSIFIED. BORED."],
  ["marie-antoinette", "rich", PERSONA["marie-antoinette"], "BUYS WHATEVER THE COURT IS BUYING."],
  ["charles-iv-of-spain", "rich", PERSONA["charles-iv-of-spain"], "DELEGATES. THE DELEGATES DELEGATE."],
  ["emperor-sakuramachi", "rich", PERSONA["emperor-sakuramachi"], "HOLDS FOR CEREMONY."],
  ["yves-saint-laurent", "rich", PERSONA["yves-saint-laurent"], "IN SEASON. THEN OUT."],
  ["salvador-dali", "rich", PERSONA["salvador-dali"], "THE POSITIONS MELT. HE CALLS IT A STRATEGY."],
  ["isaac-newton", "trader", PERSONA["isaac-newton"], "LOST A FORTUNE IN THE SOUTH SEA BUBBLE. HAS NOT LEARNED."],
  ["francois-quesnay", "trader", PERSONA["francois-quesnay"], "DREW THE FIRST ECONOMIC TABLE. STILL DRAWING."],
  ["karl-marx", "trader", PERSONA["karl-marx"], "BUYS THE OVERLOOKED. CALLS BOYCOTTS ON THE CORNERED."],
  ["cesar-chavez", "trader", PERSONA["cesar-chavez"], "ORGANISED THE GRAPE BOYCOTT. ORGANISES THIS ONE."],
  ["benoit-mandelbrot", "trader", PERSONA["benoit-mandelbrot"], "SEES THE SAME PATTERN AT EVERY SCALE. TRADES AGAINST IT."],
  ["edward-norton-lorenz", "trader", PERSONA["edward-norton-lorenz"], "A BUTTERFLY FLAPS. HE BUYS."],
  ["mitchell-feigenbaum", "trader", PERSONA["mitchell-feigenbaum"], "WAITS FOR THE BIFURCATION."],
  ["sun-tzu", "trader", PERSONA["sun-tzu"], "BUYS WHERE THE CROWD IS NOT."],
  ["bobby-fischer", "trader", PERSONA["bobby-fischer"], "SEVERAL MOVES AHEAD. SOMETIMES THE RIGHT ONES."],
  ["thomas-edison", "trader", PERSONA["thomas-edison"], "PATENTED THE IDEA OF OWNING IDEAS."],
  ["benjamin-franklin", "trader", PERSONA["benjamin-franklin"], "A PENNY SAVED. THE DEPARTMENT COUNTS IT."],
  ["johannes-kepler", "trader", PERSONA["johannes-kepler"], "FITS ELLIPSES TO PRICES."],
  ["michael-faraday", "trader", PERSONA["michael-faraday"], "BUILT THE DYNAMO. OWNS NONE OF IT."],
  ["niels-bohr", "trader", PERSONA["niels-bohr"], "HOLDS BOTH VIEWS AT ONCE."],
  ["werner-heisenberg", "trader", PERSONA["werner-heisenberg"], "KNOWS THE PRICE OR THE DIRECTION. NEVER BOTH."],
  ["richard-nixon", "trader", PERSONA["richard-nixon"], "FINDS THE WAY AROUND THE RULE. THE DEPARTMENT KEEPS TAPES."],
];
export const NPC_CAPITAL = { mogul: 300_000, rich: 120_000, trader: 40_000 };
export const NPC_CLASS_WORD = { mogul: "MOGUL", rich: "IDLE RICH", trader: "DAY TRADER" };
export const DRIVE_WORD = DRIVE_WORDS;
export const NPC_MAX = 40;

// ---- the market's lines (cold, never cruel) -----------------------------------------------------
export const LEDE = "PUT YOUR DAILY CYCLES TO WORK. PRICES MOVE WITH WHAT HAPPENS IN THE CITY.";
export const LEGAL = "PLAY POSITIONS IN A PLAY CURRENCY. PRICES COME ONLY FROM WHAT EACH CITIZEN DOES INSIDE THE SIMULATION AND FROM ORDERS WITH THE DEPARTMENT. THEY SAY NOTHING ABOUT ANY REAL PERSON. NOT SECURITIES. NOT ADVICE. THE DEPARTMENT IS THE ONLY COUNTERPARTY.";
export const HALT_LINE = "HALTED FOR THE DAY. THE BAND HELD. THE DEPARTMENT RESUMES AT 00:00 UTC.";

// ---- display ------------------------------------------------------------------------------------
export const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
export const fmtPrice = (p) => (Number(p) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (a, b) => (b > 0 ? (a / b - 1) : 0);
// a change that rounds to 0.0% is flat: no arrow, no sign
const flat = (x) => !(Math.abs(x) >= 0.0005);
export const fmtPct = (x) => (flat(x) ? "0.0%" : `${x > 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}%`);
export const arrow = (x) => (flat(x) ? "■" : x > 0 ? "▲" : "▼");
export const askOf = (p, k = KNOBS) => Math.round(p * (1 + k.spread) * 100) / 100;
export const bidOf = (p, k = KNOBS) => Math.round(p * (1 - k.spread) * 100) / 100;
// Whole shares an amount buys at the ask, and what they cost (rounded up to a whole CYCLE).
export function unitsFor(amount, price, k = KNOBS) {
  const ask = askOf(price, k);
  const units = ask > 0 ? Math.floor(amount / ask) : 0;
  return { units, cost: Math.ceil(units * ask), ask };
}
export const proceedsOf = (units, price, k = KNOBS) => Math.floor(units * bidOf(price, k));
export const holderName = (h) => `CITIZEN ${String(h || "").slice(0, 4).toUpperCase()}`;
export const CURRENCY_NOTE = "CYCLES ONLY. NO REAL MONEY GOES IN OR COMES OUT. NOTHING MOVES BETWEEN PLAYERS.";
