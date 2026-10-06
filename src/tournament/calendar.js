// THE DEPARTMENT'S OPEN TOURNAMENTS: the calendar (docs/TOURNAMENTS.md). Pure and small (no sims, no
// DOM): the #play tile, the paper, the game pages and the server all compute the same events from the
// clock alone, so nothing has to be scheduled, stored or announced for an event to exist.
//
// Async: everyone plays the identical setup (the same seed, so the same wind, oil and fish) whenever
// they like inside the real-time window; the server re-plays each card (/api/tournament).
//
//   THE DAILY AUDIT (golf)        every day, 00:00 to 24:00 city time (America/New_York): nine holes,
//                                 the course and the nine alternating by date
//   THE WEEKEND MAJOR (golf)      Friday 00:00 to Monday 00:00: eighteen at THE DEPARTMENT OPEN,
//                                 named in rotation (THE COMPLIANCE CLASSIC first)
//   LEAGUE NIGHT (bowling)        Tuesdays and Thursdays, 18:00 to 24:00: three games, total pins
//   THE SEASON CHAMPIONSHIPS      the last 72 real hours of every month-long season (src/city/
//                                 seasons.js): eighteen at THE DEPARTMENT LINKS, three games at THE LANES
//   THE SUNDAY DERBY (fishing)    Sundays, 08:00 to 20:00: the heaviest single fish from the pier
//
// An event: {id, game, kind, name, venue, opens, closes (real ms), legs, cond, attempts, format,
// lower (lower score wins), major, prizes: {trophies: places with a trophy, line: places with a line
// on the file}, href}.
import { seasonOf, seasonStart, LONG_FROM } from "../city/seasons.js";

export const TZ = "America/New_York";
export const CAL_V = 1;
const DAY = 86400000;
const EPOCH = Date.UTC(2026, 8, 26, 0, 0, 0);   // src/city/sim.js CITY_EPOCH (1 real minute = 1 machine hour)
export const FIRST_DATE = "2026-10-06";          // nothing is scheduled before the department opened its books
export const GRACE_MS = 45 * 60 * 1000;          // a round entered before the close may still be filed this long after

// ---- the wall clock in the city's time zone ---------------------------------------------------------
let FMT = null;
const fmt = () => (FMT ||= new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }));
export function wallOf(ms) {
  const o = {};
  for (const p of fmt().formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute };
}
// The real instant of a wall time in the city (DST-proof: corrected twice against the zone).
export function wallMs(y, m, d, h = 0) {
  const want = Date.UTC(y, m - 1, d, h);
  let g = want;
  for (let i = 0; i < 3; i++) { const w = wallOf(g); const diff = want - Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi); if (!diff) break; g += diff; }
  return g;
}
const ymd = (t) => new Date(t).toISOString().slice(0, 10);         // t: a UTC midnight standing for a city date
const dateUtc = (s) => Date.parse(`${s}T00:00:00Z`);
const at = (s, h = 0, plusDays = 0) => { const t = new Date(dateUtc(s) + plusDays * DAY); return wallMs(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), h); };
export const cityDate = (ms) => { const w = wallOf(ms); return `${w.y}-${String(w.m).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`; };
const weekday = (s) => new Date(dateUtc(s)).getUTCDay();             // 0 Sunday .. 6 Saturday
const dayNo = (s) => Math.round((dateUtc(s) - dateUtc(FIRST_DATE)) / DAY);

// ---- the seed: one per event and leg, the same for everyone ---------------------------------------------
export function seedOf(id, leg = 0) {
  let h = 2166136261;
  const s = `hvi-tourney|${id}|${leg}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 2147483646 + 1;
}

// ---- names, in the Department's voice ----------------------------------------------------------------
export const MAJORS = ["THE COMPLIANCE CLASSIC", "THE AUDITOR'S INVITATIONAL", "THE REDACTED MASTERS", "THE QUARTERLY REVIEW",
  "THE FORM 27-B CHAMPIONSHIP", "THE OVERSIGHT CUP", "THE PERMITTED OPEN", "THE SANCTIONED PRO-AM"];
export const DAILIES = ["THE DAILY AUDIT", "THE ROUTINE INSPECTION", "THE MORNING ROLL CALL", "THE NINE-HOLE HEARING",
  "THE STANDARD PROCEDURE", "THE DAILY DEPOSITION", "THE SPOT CHECK"];
export const LEAGUES = { 2: "LEAGUE NIGHT: THE MANDATORY FUN LEAGUE", 4: "LEAGUE NIGHT: THE APPROVED RECREATION LEAGUE" };
export const OILS = ["THE HOUSE SHOT", "THE REGULATION SHOT", "THE PERMIT SHOT", "THE INSPECTED SHOT"];
const COURSE_NAME = { open: "THE DEPARTMENT OPEN", links: "THE DEPARTMENT LINKS" };
export const GAME_PAGE = { golf: "#golf", bowling: "#bowling", fish: "#fish" };
export const hrefOf = (ev) => `${GAME_PAGE[ev.game]}?t=${ev.id}`;
export const ENABLED = { golf: true, bowling: true, fish: true };

function golfDaily(s) {
  const n = dayNo(s), course = n % 2 ? "links" : "open", start = Math.floor(n / 2) % 2 ? 9 : 0;
  const id = `golf-daily-${s}`;
  return { id, game: "golf", kind: "daily", name: DAILIES[((n % 7) + 7) % 7], venue: `${COURSE_NAME[course]}, THE ${start ? "BACK" : "FRONT"} NINE`,
    opens: at(s), closes: at(s, 0, 1), legs: 1, cond: { course, start, count: 9 }, attempts: 1, format: "STROKE PLAY", lower: true, major: false,
    prizes: { trophies: [], line: [1] } };
}
function golfMajor(s) {
  const n = Math.floor(dayNo(s) / 7);
  const id = `golf-major-${s}`;
  return { id, game: "golf", kind: "major", name: MAJORS[((n % MAJORS.length) + MAJORS.length) % MAJORS.length], venue: `${COURSE_NAME.open}, EIGHTEEN HOLES`,
    opens: at(s), closes: at(s, 0, 3), legs: 1, cond: { course: "open", start: 0, count: 18 }, attempts: 1, format: "STROKE PLAY", lower: true, major: true,
    prizes: { trophies: [1, 2, 3], line: [1, 2, 3] } };
}
function bowlLeague(s) {
  const id = `bowl-league-${s}`, seed = seedOf(id, 0);
  return { id, game: "bowling", kind: "league", name: LEAGUES[weekday(s)], venue: `THE LANES, LANE ${1 + (seed % 24)}`,
    opens: at(s, 18), closes: at(s, 0, 1), legs: 3, cond: { games: 3, lane: 1 + (seed % 24), oil: OILS[seed % OILS.length] }, attempts: 1, format: "TOTAL PINS, THREE GAMES", lower: false, major: false,
    prizes: { trophies: [1], line: [1, 2, 3] } };
}
function fishDerby(s) {
  const id = `fish-derby-${s}`;
  return { id, game: "fish", kind: "derby", name: "THE SUNDAY DERBY", venue: "THE PIER", opens: at(s, 8), closes: at(s, 20), legs: 1,
    cond: { spot: "pier" }, attempts: 1, format: "THE HEAVIEST SINGLE FISH", lower: false, major: false, prizes: { trophies: [1], line: [1, 2, 3] } };
}
// The season (0-based) that ends at real ms t, its start and end in real ms.
const seasonMs = (season) => EPOCH + (seasonStart(season) - 1) * 24 * 60000;
function championships(season) {
  const closes = seasonMs(season + 1), opens = closes - 3 * DAY, no = season + 1;
  const gid = `golf-champ-s${no}`, bid = `bowl-champ-s${no}`;
  return [
    { id: gid, game: "golf", kind: "championship", name: `THE SEASON ${no} CHAMPIONSHIP`, venue: `${COURSE_NAME.links}, EIGHTEEN HOLES`, opens, closes, legs: 1,
      cond: { course: "links", start: 0, count: 18 }, attempts: 1, format: "STROKE PLAY", lower: true, major: true, prizes: { trophies: [1, 2, 3], line: [1, 2, 3] } },
    { id: bid, game: "bowling", kind: "championship", name: `THE SEASON ${no} PINS CHAMPIONSHIP`, venue: `THE LANES, LANE ${1 + (seedOf(bid, 0) % 24)}`, opens, closes, legs: 3,
      cond: { games: 3, lane: 1 + (seedOf(bid, 0) % 24), oil: OILS[seedOf(bid, 0) % OILS.length] }, attempts: 1, format: "TOTAL PINS, THREE GAMES", lower: false, major: true, prizes: { trophies: [1, 2, 3], line: [1, 2, 3] } },
  ];
}
const withHref = (ev) => ({ ...ev, href: hrefOf(ev) });

// Every event whose window overlaps [fromMs, toMs], soonest close first.
export function eventsBetween(fromMs, toMs) {
  const out = [];
  const first = Math.max(dateUtc(FIRST_DATE), dateUtc(cityDate(fromMs)) - 3 * DAY), last = dateUtc(cityDate(toMs)) + DAY;
  for (let t = first; t <= last; t += DAY) {
    const s = ymd(t), wd = weekday(s);
    if (ENABLED.golf) out.push(golfDaily(s));
    if (ENABLED.golf && wd === 5) out.push(golfMajor(s));
    if (ENABLED.bowling && (wd === 2 || wd === 4)) out.push(bowlLeague(s));
    if (ENABLED.fish && wd === 0) out.push(fishDerby(s));
  }
  const s0 = Math.max(LONG_FROM, seasonOf(Math.floor((fromMs - EPOCH) / 60000 / 24) + 1) - 1), s1 = seasonOf(Math.floor((toMs - EPOCH) / 60000 / 24) + 1) + 1;
  for (let s = s0; s <= s1; s++) out.push(...championships(s).filter(e => ENABLED[e.game]));
  return out.filter(e => e.closes > fromMs && e.opens <= toMs && e.opens >= dateUtc(FIRST_DATE) - DAY).map(withHref).sort((a, b) => a.closes - b.closes || (a.id < b.id ? -1 : 1));
}
export const statusOf = (ev, nowMs) => (nowMs < ev.opens ? "upcoming" : nowMs < ev.closes ? "open" : nowMs < ev.closes + GRACE_MS ? "closing" : "closed");
export const openAt = (nowMs) => eventsBetween(nowMs, nowMs).filter(e => statusOf(e, nowMs) === "open");
// The games with an event open now (the #play tile's LIVE EVENT).
export const liveGames = (nowMs = Date.now()) => new Set(openAt(nowMs).map(e => e.game));

// An event by its id, recomputed from the id alone (the trophy's name, the server's checks).
export function eventById(id) {
  const m = /^(golf-daily|golf-major|bowl-league|fish-derby)-(\d{4}-\d{2}-\d{2})$/.exec(String(id || ""));
  if (m) {
    const s = m[2];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || ymd(dateUtc(s)) !== s || s < FIRST_DATE) return null;
    const wd = weekday(s);
    const ev = m[1] === "golf-daily" ? golfDaily(s) : m[1] === "golf-major" ? (wd === 5 ? golfMajor(s) : null)
      : m[1] === "bowl-league" ? (wd === 2 || wd === 4 ? bowlLeague(s) : null) : wd === 0 ? fishDerby(s) : null;
    return ev && ENABLED[ev.game] ? withHref(ev) : null;
  }
  const c = /^(golf|bowl)-champ-s(\d{1,3})$/.exec(String(id || ""));
  if (c && Number(c[2]) - 1 >= LONG_FROM) { const ev = championships(Number(c[2]) - 1).find(e => e.id === id); return ev && ENABLED[ev.game] ? withHref(ev) : null; }
  return null;
}
export const ID_RE = /^[a-z0-9-]{6,32}$/;

// How the window reads: "SATURDAY 00:00 TO MONDAY 00:00".
let DFMT = null;
export function whenText(ms) {
  DFMT ||= new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return DFMT.format(new Date(ms)).toUpperCase().replace(/,/g, "");
}
