// THE MOUNTAIN, skiable: the challenges. Pure data and arithmetic (the sim and the server read it).
// Each challenge starts from one fixed state (its start: where, which way, standing still), so a
// challenge run is {v, ch, board, inputLog} and re-plays anywhere to the same result.
//
// kind   gates   through the gates to the finish; a missed gate is +PENALTY s
//        race    the gates, against the field (city/race.js RACERS): their times from their ratings
//        trial   a trail top to bottom through its checkpoints (miss one: disqualified)
//        descent from a lift's top to the base line, any way down
//        score   the park, top to the finish line: trick points
//        pipe    LIMIT seconds in the pipe: trick points
//        jump    one jump off THE BIG AIR: the distance, lip to landing (a crash scores nothing)
//        follow  the instructor down a green: the share of the run within FOLLOW_R m of them
//        skim    across THE RETENTION POOL: the distance on the water before it takes you
//        collect LOST PROPERTY: the files found, over the whole mountain (no run; free ride)
// medals [bronze, silver, gold]: times are maxima (lower is better), the rest minima.
import { RUNS, RUN, polyAt, baseH, q, RACE_START, COURSE, GS_GATES, SL_GATES, PIPE, BIG_AIR, BIG_AIR_AT, POOL, POI, FILES, BASE_LINE } from "./world.js";
import { RACERS } from "../../city/race.js";

export const PENALTY = 3, FOLLOW_R = 26, PIPE_LIMIT = 45 * 60, MAX_RUN = 6 * 60 * 60, LEAVE_R = 420;
const trailStart = (id, s = 22) => { const R = RUN[id], [x, y, dx, dy] = polyAt(R, s); return { x: q(x), y: q(y), hx: q(dx), hy: q(dy) }; };
const lipBack = trailStart(BIG_AIR_AT.run, BIG_AIR_AT.s - 260);
const skimFrom = (() => { const sx = q(11.2 * 60), sy = q(-76.8 * 60), dx = POOL.x - sx, dy = POOL.y - sy, n = Math.sqrt(dx * dx + dy * dy); return { x: sx, y: sy, hx: q(dx / n), hy: q(dy / n) }; })();
const poiStart = (id) => ({ x: POI[id].x, y: POI[id].y, hx: 0, hy: 1 });
const course0 = { x: RACE_START[0], y: RACE_START[1], hx: RACE_START[2], hy: RACE_START[3] };

export const CHALLENGES = [
  { id: "gs", name: "THE GAUNTLET: GIANT SLALOM", kind: "gates", gates: "gs", run: "the-gauntlet", unit: "s", medals: [62, 54, 49], start: course0, note: "THE RACE COURSE'S OWN GATES. PASS BETWEEN EACH PAIR OF POLES. A MISSED GATE COSTS 3 SECONDS." },
  { id: "sl", name: "THE GAUNTLET: SLALOM", kind: "gates", gates: "sl", run: "the-gauntlet", unit: "s", medals: [66, 57, 51], start: course0, note: "TWICE THE GATES, HALF THE ROOM. THE DEPARTMENT TIMES EVERY TURN." },
  { id: "race", name: "THE WEEKEND RACE", kind: "race", gates: "gs", run: "the-gauntlet", unit: "place", medals: [8, 3, 1], start: course0, note: "THE GIANT SLALOM AGAINST THE CITY'S RACERS ON FILE. THEIR TIMES COME FROM THEIR RATINGS." },
  { id: "park", name: "THE SANDBOX: PARK SCORE", kind: "score", run: "sandbox", unit: "pts", medals: [1500, 4000, 8000], start: trailStart("sandbox", 12), note: "THREE KICKERS, TWO RAILS, A BOX. POINTS FOR EVERYTHING LANDED BEFORE THE FINISH LINE." },
  { id: "pipe", name: "THE PIPELINE", kind: "pipe", unit: "pts", medals: [1200, 3500, 7000], start: (() => { const s = 14; return { x: q(PIPE.ax + PIPE.dx * s), y: q(PIPE.ay + PIPE.dy * s), hx: PIPE.dx, hy: PIPE.dy }; })(), note: "45 SECONDS IN THE HALFPIPE. RIDE UP THE WALLS; THE AIR AT THE TOP IS YOURS." },
  { id: "bigair", name: "THE BIG AIR", kind: "jump", unit: "m", medals: [36, 45, 50], start: lipBack, note: "ONE KICKER ON QUARTERLY TARGETS. TUCK IN, HOLD A, LET GO AT THE LIP. DISTANCE FROM THE LIP TO WHERE YOU LAND. LAND IT." },
  { id: "instructor", name: "FOLLOW THE INSTRUCTOR", kind: "follow", run: "compliance", unit: "%", medals: [60, 78, 90], start: trailStart("compliance", 22), note: "THE INSTRUCTOR SKIS COMPLIANCE, TURN BY TURN. STAY WITHIN 26 METRES. THE INSTRUCTOR DOES NOT TALK." },
  { id: "audit", name: "THE AUDIT: TIME TRIAL", kind: "trial", run: "the-audit", unit: "s", medals: [150, 128, 116], start: trailStart("the-audit"), note: "BLACK DIAMOND, SUMMIT TO THE STARTING GATE. THREE CHECKPOINTS. MISS ONE AND THE TIME IS VOID." },
  { id: "moguls", name: "HOSTILE TAKEOVER: MOGULS", kind: "trial", run: "hostile-takeover", unit: "s", medals: [270, 235, 215], start: trailStart("hostile-takeover"), note: "BLACK DIAMOND, BUMPS ALL THE WAY. ABSORB THEM OR FLY OFF THEM." },
  { id: "glades", name: "TERMINATION GLADES", kind: "trial", run: "termination-glades", unit: "s", medals: [320, 230, 175], start: trailStart("termination-glades"), note: "DOUBLE BLACK, THROUGH THE TREES. THE TREES DO NOT MOVE." },
  { id: "summit", name: "SUMMIT TO BASE", kind: "descent", unit: "s", medals: [380, 300, 245], start: poiStart("ascent@b"), note: "FROM THE TOP OF THE ASCENT TO THE VILLAGE'S FOOT. ANY WAY DOWN. THE FALL LINE IS A SUGGESTION." },
  { id: "skim", name: "THE RETENTION POOL: POND SKIM", kind: "skim", unit: "m", medals: [60, 140, 220], start: skimFrom, note: "SKI INTO THE MOUNTAIN LAKE FAST ENOUGH AND THE WATER HOLDS YOU, FOR A WHILE. NOTHING LEAVES WITHOUT AUTHORISATION." },
  { id: "files", name: "LOST PROPERTY", kind: "collect", unit: "files", medals: [3, 6, FILES.length], note: "EIGHT FILES THE DEPARTMENT MISLAID ON THE MOUNTAIN. FREE RIDE AND LOOK. THEY GLOW A LITTLE." },
];
export const CHALLENGE = Object.fromEntries(CHALLENGES.map(c => [c.id, c]));
export const RUNNABLE = CHALLENGES.filter(c => c.start);
export const LOWER_BETTER = (c) => c.unit === "s" || c.unit === "place";
// -> 0 none, 1 bronze, 2 silver, 3 gold
export function medalOf(c, value) {
  if (value == null || !Number.isFinite(value)) return 0;
  let m = 0;
  for (let i = 0; i < 3; i++) if (LOWER_BETTER(c) ? value <= c.medals[i] : value >= c.medals[i]) m = i + 1;
  return m;
}
export const MEDAL_NAME = ["NO MEDAL", "BRONZE", "SILVER", "GOLD"];
export const gatesOf = (c) => (c.gates === "sl" ? SL_GATES : c.gates === "gs" ? GS_GATES : null);
// A trial's checkpoints and every run's finish line: segments across the trail
function across(R, s, extra) { const [x, y, dx, dy] = polyAt(R, s), hw = R.hw + extra; return { x: q(x), y: q(y), ax: q(x + dy * hw), ay: q(y - dx * hw), bx: q(x - dy * hw), by: q(y + dx * hw) }; }
// Where a run ends: the trail's foot, or (a trail that climbs back up to a lift's foot) the low point
// before the climb: nobody is timed walking uphill.
export function finishS(R) {
  let m = Infinity, sm = R.len;
  for (let s = 0; s <= R.len; s += 10) {
    const [x, y] = polyAt(R, s), h = baseH(x, y);
    if (h < m) { m = h; sm = s; } else if (h > m + 6) break;
  }
  return Math.min(sm, R.len - 4);
}
const LINES = new Map();
export function linesOf(c) {
  if (LINES.has(c.id)) return LINES.get(c.id);
  let out = { cps: [], finish: null };
  if (c.run) {
    const R = RUN[c.run], end = finishS(R);
    const cps = c.kind === "trial" ? [0.28, 0.52, 0.76].map(k => across(R, end * k, 45)) : [];
    out = { cps, finish: across(R, c.run === "the-gauntlet" ? R.len - 4 : end, 25), end };
  }
  LINES.set(c.id, out);
  return out;
}
export const SUMMIT_FINISH = BASE_LINE;
// THE WEEKEND RACE's field: [slug, name, discipline, rating] -> their time on THE GAUNTLET's giant
// slalom, from the rating (the gold time is the best racer on file's pace)
export function fieldTimes() {
  const gold = CHALLENGE.gs.medals[2];
  return RACERS.map(([slug, name, disc, rating]) => ({ slug, name, disc, rating, t: Math.round(gold * (0.955 + (100 - rating) / 180) * 100) / 100 }));
}
// The instructor at tick n of the run: along COMPLIANCE at a steady pace, swinging across it
export const INSTRUCTOR = { v: 11, swing: 22, wave: 120, s0: 22 };
export function instructorAt(n) {
  const R = RUN.compliance, s = INSTRUCTOR.s0 + (INSTRUCTOR.v * n) / 60, u = s / INSTRUCTOR.wave, p = u - Math.floor(u);
  const w = p < 0.5 ? 16 * p * (0.5 - p) : -16 * (p - 0.5) * (1 - p);
  const [x, y, dx, dy] = polyAt(R, s), o = INSTRUCTOR.swing * w;
  return { x: x - dy * o, y: y + dx * o, s, done: s >= R.len - 40, hx: dx, hy: dy };
}
export { COURSE, RUNS };
