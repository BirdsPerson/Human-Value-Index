// THE OPEN TOURNAMENTS' rules (docs/TOURNAMENTS.md), pure, shared by the game pages, the paper and the
// server: the divisions, the locked setup a game is played on, the order of a leaderboard, the line
// on a winner's file and the trophy. The calendar is calendar.js; the replay checks are the server's
// (netlify/lib/tournament-verify.js), so no sim is imported here.
import { seedOf, eventById } from "./calendar.js";

export const RULES_V = 1;
// Two boards per event, never mixed. OPEN: no assists at all. ASSISTED: the games' own assists
// (golf's EASY SWING, bowling's EASY lanes and bumpers), with its own board and its own trophy.
export const DIVISIONS = ["open", "assisted"];
export const DIV_NAME = { open: "OPEN", assisted: "ASSISTED" };
export const DIV_LINE = {
  open: "NO ASSISTS. THE CARD STANDS AS STRUCK.",
  assisted: "EASY SWING, EASY LANES, BUMPERS. A SEPARATE BOARD AND A SEPARATE TROPHY. NOBODY IS JUDGED. EVERYBODY IS RECORDED.",
};
export const isDiv = (d) => DIVISIONS.includes(d);
export const holderName = (caseId) => `SUBJECT ${String(caseId).replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase()}`;

// ---- the locked setup -------------------------------------------------------------------------------
// golf: the round's cfg (src/play/golf/sim.js newRound) for leg 0. The player's name and colours draw
// the golfer only; the sim's result does not read them. opts.hand "L": a left-hander (the meter's early
// press hooks the other way, so the hand is part of the setup the server re-plays; sent as the
// submission's opts, like a bowler's ball).
export function golfCfg(ev, div, player = null, opts = {}) {
  const c = ev.cond;
  return { seed: seedOf(ev.id, 0), course: c.course, mode: "stroke", start: c.start, count: c.count, ...(div === "assisted" ? { easy: true, assist: 2 } : {}), ...(opts?.hand === "L" ? { hand: "L" } : {}), player: player || { name: "SUBJECT" }, cpu: null };
}
// bowling: one game's cfg (src/play/bowling/sim.js newGame): the event's seed for the leg (the oil and
// the rack), the foul line on, one bowler. The ball's weight and the hand are the bowler's own;
// bumpers only in ASSISTED.
export const BALLS = [8, 10, 12, 14, 16];
export function bowlerOf(o = {}, div = "open", name = "SUBJECT") {
  return { kind: "human", name: String(name).slice(0, 24), weight: BALLS.includes(Number(o.weight)) ? Number(o.weight) : 14, hand: o.hand === -1 ? -1 : 1, bumpers: div === "assisted" && Boolean(o.bumpers) };
}
export function bowlCfg(ev, leg, div, bowler, v = 1) {
  return { v, seed: seedOf(ev.id, leg), fouls: true, easy: div === "assisted", players: [bowlerOf(bowler, div, bowler?.name || "SUBJECT")] };
}
// fishing: the derby's trip (src/play/fish/sim.js newTrip): one seed, one spot, one clock for all.
export const fishCfg = (ev, player = null) => ({ seed: seedOf(ev.id, 0), spot: ev.cond.spot, at: ev.opens, ...(player ? { player } : {}) });

// ---- the board's order ----------------------------------------------------------------------------------
// A row: {k, holder, div, total, tb: [numbers, already "lower is better"], legs, of, done, doneAt}.
// Finished cards first; then the score; then the tie-break vector (golf: the card's countback over the
// last nine, six, three and one holes; bowling: the best single game, then strikes; a derby: the
// length); then who finished first; then the holder's key. Deterministic, never a shared place.
export function compareRows(a, b, lower) {
  if (a.done !== b.done) return a.done ? -1 : 1;
  if (a.total !== b.total) return lower ? a.total - b.total : b.total - a.total;
  if (!a.done && a.legs !== b.legs) return b.legs - a.legs;
  const n = Math.max(a.tb?.length || 0, b.tb?.length || 0);
  for (let i = 0; i < n; i++) { const x = a.tb?.[i] ?? 0, y = b.tb?.[i] ?? 0; if (x !== y) return x - y; }
  if ((a.doneAt || 0) !== (b.doneAt || 0)) return (a.doneAt || Infinity) - (b.doneAt || Infinity);
  return a.k < b.k ? -1 : a.k > b.k ? 1 : 0;
}
export const rankRows = (rows, lower) => rows.slice().sort((a, b) => compareRows(a, b, lower)).map((r, i) => ({ ...r, pos: i + 1 }));

// Golf's countback: the strokes over the last 9 / 6 / 3 / 1 holes of the card (an 18 or a 9).
export function countback(strokes) {
  const s = strokes || [], last = (n) => s.slice(-n).reduce((a, x) => a + x, 0);
  return (s.length >= 18 ? [9, 6, 3, 1] : [6, 3, 1]).map(last);
}

// ---- what a score reads like ---------------------------------------------------------------------------
export const toPar = (d) => (d === 0 ? "E" : d > 0 ? `+${d}` : String(d));
export function scoreText(ev, row) {
  if (!row) return "-";
  if (ev.game === "golf") return row.par != null ? `${toPar(row.total - row.par)} (${row.total})` : String(row.total);
  if (ev.game === "bowling") return `${row.total}${row.done ? "" : ` THRU ${row.legs}`}`;
  if (ev.game === "fish") return `${(row.total / 100).toFixed(2)} LB`;
  return String(row.total);
}
const ORD = ["", "WON", "SECOND AT", "THIRD AT"];
const UNDER = (d) => (d < 0 ? `${-d} UNDER` : d > 0 ? `${d} OVER` : "LEVEL PAR");
// The line on a winner's file (MY FILE, THE HONOURS): one sentence and the Department's reaction.
export function honourLine(ev, place, row, div = "open") {
  const what = ORD[place] || `${place}TH AT`;
  const d = div === "assisted" ? " (ASSISTED)" : "";
  if (ev.game === "golf") {
    const diff = row.total - (row.par ?? row.total);
    const tail = place === 1 ? (diff < 0 ? "THE DEPARTMENT IS INVESTIGATING." : "THE DEPARTMENT EXPECTED NOTHING LESS. IT EXPECTED NOTHING.") : "THE DEPARTMENT HAS NOTED IT. THE DEPARTMENT NOTES EVERYTHING.";
    return `${what} ${ev.name}${d}, ${UNDER(diff)}. ${tail}`;
  }
  if (ev.game === "bowling") return `${what} ${ev.name.replace(/^LEAGUE NIGHT: /, "LEAGUE NIGHT AT ")}${d}, ${row.total} PINS. ${place === 1 ? "THE PINSETTER HAS FILED A COMPLAINT." : "THE PINS HAVE BEEN COUNTED. SO HAVE YOU."}`;
  if (ev.game === "fish") return `${what} ${ev.name}${d}, ${(row.total / 100).toFixed(2)} LB. ${place === 1 ? "THE FISH HAS BEEN INFORMED." : "THE SCALES WERE CHECKED TWICE."}`;
  return `${what} ${ev.name}${d}.`;
}

// ---- the trophy: a unique piece of furniture for your flat --------------------------------------------
// SKU f:trophy.<event id>.<o|a><place>. Never sold; granted by the server once an event is final (the
// ledger's econ_award, a txn with no CYCLES in it). CYCLES are never a prize (docs/design/
// ECONOMY_PROPERTY.md section 11: "no prizes").
export const trophySku = (ev, place, div) => `f:trophy.${ev.id}.${div === "assisted" ? "a" : "o"}${place}`;
export const TROPHY_RE = /^trophy\.([a-z0-9-]{6,32})\.([oa])([1-3])$/;
export const METAL = { 1: "GOLD", 2: "SILVER", 3: "BRONZE" };
export function trophyOf(id) {
  const m = TROPHY_RE.exec(String(id || ""));
  if (!m) return null;
  const ev = eventById(m[1]);
  if (!ev) return null;
  const place = Number(m[3]), div = m[2] === "a" ? "assisted" : "open";
  return { id, ev, place, div, game: ev.game, name: `${ev.name}${div === "assisted" ? " (ASSISTED)" : ""} ${place === 1 ? "TROPHY" : `${METAL[place]} PLATE`}` };
}
// The places that win something, by division: the event's own list for OPEN, the winner only in ASSISTED.
export const prizePlaces = (ev, div, kind) => (div === "open" ? ev.prizes[kind] : ev.prizes[kind].filter(p => p === 1));
