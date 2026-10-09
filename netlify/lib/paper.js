// THE DAILY COMPLIANCE: the city's newspaper (docs/PAPER.md). One edition per real day
// (America/New_York), printed at the first press run of the day from the city's real data,
// stored in Blobs, never changed once printed; a live WIRE beside it; an archive.
//
// Shape of the work:
//   gather(io, nowMs)    every source the paper reads, through io.get(path) -> JSON (the site's own
//                        public endpoints: what a visitor may see is what the paper may print)
//   buildEdition(input)  PURE: the same input gives the same edition, byte for byte (check-paper)
//   editorialFor(...)    at most one model-written leader a day, through the site's one Anthropic
//                        path and its daily cap, cut sentence by sentence by a guard; else a template
//   publishEdition(...)  write-once: e/<date> with onlyIfNew, then the index under its etag
//   wireOf(...)          the live WIRE: the latest "because" lines and the venues' calls
//
// Blobs (store hvi-paper): e/<date> (the edition, immutable), index ({editions: [{date, no,
// headline}]}), lease.
//
// Safety (Scott's rules for anything printed about real people): nobody on file is quoted; a
// candidate's platform is never printed; the comic casts only the Department's own characters
// (paper-comic.js); no line labels anybody by being alive or not (check-no-death-labels'
// markers, applied to every printed string here); the excluded and harm-barred never appear
// in the cast and the leader names nobody.
import * as SIM from "../../src/city/sim.js";
import * as L from "../../src/city/leagues.js";
import { moodWord } from "../../src/city/civic.js";
import { PREFECT, DIRECTIVES } from "../../src/city/prefectData.js";
import { lineupFor, PERFORMERS } from "../../src/city/nightlifeSim.js";
import { weatherOn as mountainWeather } from "../../src/city/mountainGeo.js";
import { weatherOn as watersWeather, SPECIES_BY } from "../../src/play/fish/data.js";
import { RIVER_DAY, NAME as RIVER_NAME, MOTTO as RIVER_MOTTO } from "../../src/city/river.js";
import { PLAZA_DAY } from "../../src/city/shorePlaza.js";
import { PROPRIETORS, proprietorLine } from "../../src/city/proprietors.js";
import { raceEvents, RACERS } from "../../src/city/race.js";
import { pitEvents, FIGHTERS } from "../../src/city/pit.js";
import { tennisEvents, TENNIS_ON_FILE } from "../../src/city/tennis.js";
import { MOTIONS } from "../../src/assembly/content002.js";
import arcade from "../../src/city/arcade.json" with { type: "json" };
import { sportsSection, aquariumRecords } from "./paper-sports.js";
import { scoreText, DIV_NAME } from "../../src/tournament/rules.js";
import { comicFor, CAST } from "./paper-comic.js";
import { paperDate, PAPER_TZ } from "./paper-notices.js";
import { splitSentences } from "./factCheck.js";
import { FAMOUS_FIGURES, displayName, slugify } from "../../src/figures.js";

export { paperDate, PAPER_TZ };
// v1 (2026-10-05..09): ALL CAPS strings, links on the listings only. v2 (2026-10-09): the same
// shape plus ents (every name printed, with where it goes: a figure's file, a district, a venue),
// and listings that point at the place in the city (a venue's building, a district, a seat
// holder's file). The reader (src/paper/read.js) renders both; a printed edition never changes.
export const PAPER_V = 2;
export const PAPER_NAME = "THE DAILY COMPLIANCE";
export const PAPER_MOTTO = "ALL THE NEWS THAT IS PERMITTED. ESTABLISHED BY ORDER.";
export const PAPER_EPOCH = "2026-10-05";   // edition No. 1
export const STORE = "hvi-paper";
export const editionKey = (date) => `e/${date}`;
export const INDEX_KEY = "index";
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;
export const editionNo = (date) => Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${PAPER_EPOCH}T12:00:00Z`)) / DAY_MS) + 1;

// Every route a listing may point at (check-paper finds each in the app's router).
export const ROUTES = ["#paper", "#city", "#city/league", "#city/league/baseball", "#city/league/basketball", "#city/league/football",
  "#city/league/soccer", "#city/league/tennis", "#city/league/pit", "#city/league/cup", "#heights", "#prefects", "#enterprise",
  "#market", "#economy", "#assembly", "#docket", "#elections", "#arrivals", "#file", "#fish", "#aquarium", "#tennis", "#golf",
  "#hoops", "#chess", "#casino", "#play", "#shop", "#city/strip/the-arcade", "#bowling", "#cards", "#football", "#soccer", "#ski", "#skate"];
const LEAGUE_SPORTS = ["baseball", "basketball", "football", "soccer", "tennis", "pit", "cup"];
// #city/<district>[/<building>[?floor=n]] is answered only where the city has that district and building
const cityHrefOk = (h) => {
  const m = /^#city\/([a-z0-9-]+)(?:\/([a-z0-9-]+)(?:\?floor=(\d+))?)?$/.exec(h);
  if (!m || !SIM.DISTRICT[m[1]]) return false;
  if (!m[2]) return !m[3];
  const b = SIM.BUILDING[m[2]];
  return Boolean(b && (b.districtId || b.district) === m[1]);
};
export const validHref = (h) => typeof h === "string" && (ROUTES.includes(h) || /^#market\/[a-z0-9-]+$/.test(h) || /^#paper\/\d{4}-\d{2}-\d{2}$/.test(h) || /^#(golf|bowling|fish)\?t=[a-z0-9-]{6,32}$/.test(h)
  || /^#city\?find=[a-z0-9-]{1,80}$/.test(h) || /^#shop\/[a-z0-9-]{1,40}$/.test(h)
  || (/^#city\/league\/([a-z]+)(\?div=\d)?$/.test(h) && LEAGUE_SPORTS.includes(h.split("/")[2].split("?")[0])) || cityHrefOk(h));
// a place in the city (SIM.PLACES id) -> its building, on its floor
export const placeHref = (id) => {
  const p = SIM.PLACES[id];
  if (!p?.building || !p.district) return null;
  const h = `#city/${p.district}/${p.building}${Number.isInteger(p.floors?.[0]) && p.floors[0] > 0 ? `?floor=${p.floors[0]}` : ""}`;
  return validHref(h) ? h : null;
};

// check-no-death-labels' markers (scripts/check-no-death-labels.mjs), for printed text.
export const DEATH_MARKERS = [/DECEASED/, /\bDIED\b/, /\bTHE DEAD\b/, /\bGHOSTS?\b/, /PAST TENSE/, /POSTHUMOUS/, /\b(OBITUARY|Obituary)\b/,
  /\bALIVE\b/, /LIVING OR (DEAD|OTHERWISE)/i, /\b[Tt]he dead (do|are|can|keep|have)\b/, /\bdeceased\b/, /\bThe subject is living\b/];
export const QUOTE_MARKS = /["“”«»]/;
export const printable = (s) => typeof s === "string" && !DEATH_MARKERS.some(re => re.test(s)) && !QUOTE_MARKS.test(s);
const up = (s) => String(s ?? "").toUpperCase();
const lines = (arr) => (arr || []).filter(printable);
const pct = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}%`;
const fmtLevel = (x) => Number(x).toFixed(1);
const hhmm = (h) => { const m = Math.round((((h % 24) + 24) % 24) * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
const realTime = (ms) => new Intl.DateTimeFormat("en-US", { timeZone: PAPER_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms));
const realDay = (ms) => new Intl.DateTimeFormat("en-US", { timeZone: PAPER_TZ, weekday: "long", month: "long", day: "numeric" }).format(new Date(ms)).toUpperCase();
const placeName = (id) => up(SIM.PLACES[id]?.name || id);
const districtName = (id) => up(SIM.DISTRICT[id]?.name || id);

// ---- gathering ----------------------------------------------------------------------------------
// io.get(path) -> parsed JSON or null (a source that fails is a section that says so, never a crash).
export function httpIo(base, fetchImpl = fetch) {
  return {
    async get(path) {
      try {
        const r = await fetchImpl(`${base}${path}`, { headers: { accept: "application/json", "x-hvi-paper": "1" }, signal: AbortSignal.timeout(25_000) });
        return r.ok ? await r.json() : null;
      } catch { return null; }
    },
  };
}

// -> the edition's whole input, trimmed to what is printed (check-paper builds from fixtures of this).
export async function gather(io, nowMs, prev = null) {
  const date = paperDate(nowMs), clock = SIM.machineClock(nowMs);
  const [plan, market, assembly, elections, proposals, arrivals, social, aquarium, ebtv, notices, tourney] = await Promise.all([
    io.get("/api/plan"), io.get("/api/market"), io.get("/api/assembly"), io.get("/api/elections"), io.get("/api/proposals"),
    io.get("/api/arrivals"), io.get("/api/social"), io.get("/api/aquarium"), io.get("/api/ebtv-frame"), io.get("/paper/notices.json"),
    io.get("/api/tournament"),
  ]);
  // the newest split day at or before today (its summary carries the civic block and THE MALL)
  let summary = null, summaryDay = null;
  const days = Object.keys(plan?.sectors || {}).map(Number).filter(d => d <= clock.day).sort((a, b) => b - a);
  for (const d of days.slice(0, 3)) {
    const s = await io.get(`/api/plan/${d}/${plan.sectors[d]}/summary`);
    if (s?.civic) { summary = s; summaryDay = d; break; }
  }
  const b = market?.board || null;
  const yesterday = paperDate(Date.parse(`${date}T12:00:00Z`) - DAY_MS);
  return {
    v: PAPER_V, nowMs, date, mt: clock.mt, day: clock.day, prev,
    civic: summary?.civic || null, enterprise: summary?.enterprise || null, summaryDay,
    emerge: summary?.emerge ? { ind: summary.emerge.ind || {}, ev: (summary.emerge.ev || []).filter(e => e.k === "open" || e.k === "close").map(e => ({ k: e.k, id: e.id, why: e.why })), drones: (summary.emerge.dr || []).length, hops: (summary.emerge.hp || []).length } : null,
    market: b ? { hvi: b.hvi, rd: b.rd, day: b.day, movers: { up: (b.movers?.up || []).slice(0, 4), down: (b.movers?.down || []).slice(0, 4) },
      events: (b.events || []).slice(0, 8), floor: (b.floor || []).slice(0, 12).map(f => ({ name: f.name, cls: f.cls, doing: f.doing, top: (f.top || []).slice(0, 2) })), emergency: b.emergency || null,
      count: b.count || 0 } : null,
    assembly: assembly ? { session: assembly.session, tally: assembly.tally, result: assembly.result, civic: assembly.civic, earlier: (assembly.earlier || []).map(e => ({ session: e.session, result: e.result && { winner: e.result.winner, winners: e.result.winners, decidedBy: e.result.decidedBy, voters: e.result.voters } })) } : null,
    elections: elections ? { cycle: elections.cycle, state: elections.state, openAt: elections.openAt, closeAt: elections.closeAt, next: elections.next,
      races: Object.fromEntries(Object.entries(elections.races || {}).map(([d, r]) => [d, { n: (r.candidates || []).length, voters: r.voters || 0, result: r.result ? { name: r.result.name, by: r.result.by, writein: Boolean(r.result.writein), tie: Boolean(r.result.tie) } : null }])) } : null,
    proposals: proposals ? { open: (proposals.open || []).slice(0, 6).map(p => ({ no: p.no, type: p.type, title: p.title, cosigns: p.cosigns })), decided: (proposals.decided || []).slice(0, 6).map(p => ({ no: p.no, title: p.title, status: p.status, line: p.line })),
      session: proposals.session ? { state: proposals.session.state, closeAt: proposals.session.closeAt, proposal: proposals.session.proposal ? { no: proposals.session.proposal.no, title: proposals.session.proposal.title } : null } : null,
      acts: (proposals.acts || []).slice(-6).map(a => ({ no: a.no, type: a.type, title: a.title, targetName: a.targetName, at: a.at })) } : null,
    arrivals: arrivals ? { today: arrivals.today, releaseNextAt: arrivals.releaseNextAt, pending: (arrivals.pending || []).length,
      released: (arrivals.released || []).slice(0, 12).map(a => ({ name: a.name, slug: a.slug, tier: a.tier, kind: a.kind, harm: Boolean(a.harm), noDangle: Boolean(a.noDangle) })) } : null,
    gossip: social?.events ? social.events.filter(e => e.text && e.kind !== "grievance").slice(0, 8).map(e => ({ h: e.h, kind: e.kind, text: e.text, ...(e.a ? { a: e.a } : {}), ...(e.b ? { b: e.b } : {}) })) : [],
    tanks: aquarium?.tanks || {},
    // every listed name and its slug, so a printed name links to its file (v2 ents)
    names: b ? (b.rows || []).filter(r => r?.name && r?.slug).map(r => [String(r.name), String(r.slug)]) : [],
    ebtv: ebtv ? { title: ebtv.title || null, upNext: ebtv.upNext || null, at: ebtv.at || null } : null,
    notices: { yesterday: notices?.days?.[yesterday] || [], today: notices?.days?.[date] || [] },
    tournaments: (tourney?.events || []).map(e => ({ id: e.id, game: e.game, kind: e.kind, name: e.name, venue: e.venue, format: e.format, opens: e.opens, closes: e.closes, legs: e.legs,
      status: e.status, href: e.href, major: Boolean(e.major), prizes: e.prizes, final: Boolean(e.final), entrants: e.entrants || 0,
      leaders: e.leaders ? Object.fromEntries(Object.entries(e.leaders).map(([d, rows]) => [d, (rows || []).slice(0, 3)])) : null })),
  };
}

// ---- THE OPEN TOURNAMENTS (docs/TOURNAMENTS.md): the leaders and champions as /api/tournament had them at
// press time (the edition never changes; the next one has the next standings). -> [{name, href, status, rows}]
export function tourneySports(evs, nowMs) {
  return (evs || []).filter(e => e.status === "open" || e.status === "closing" || (e.status === "closed" && nowMs - e.closes < 36 * 3600000 && e.entrants))
    .sort((a, b) => (a.status === "closed") - (b.status === "closed") || b.major - a.major || a.closes - b.closes).slice(0, 6)
    .map(e => ({ name: e.name, href: e.href, game: e.game, status: e.status === "closed" ? "FINAL" : "LIVE", venue: e.venue, entrants: e.entrants,
      divisions: Object.entries(e.leaders || {}).filter(([, rows]) => rows.length).map(([d, rows]) => ({ div: DIV_NAME[d], rows: rows.map(r => ({ pos: r.pos, holder: r.holder, score: scoreText(e, r) })) })) }));
}

// ---- the edition (pure) ---------------------------------------------------------------------------
const head = (kind, weight, text, deck, href, extra = {}) => ({ kind, weight, text: up(text), deck: deck ? up(deck) : null, href, ...extra });

export function buildEdition(I) {
  const date = I.date, no = editionNo(date), T = I.mt;
  const T0 = Number.isFinite(I.prev?.mt) ? I.prev.mt : T - 24 * 60;   // the last edition's press time, else one real day back
  const day0 = Math.floor(T0 / 24) + 1, day = I.day;
  const heads = [];
  const ent = I.enterprise, civic = I.civic;

  // ---- SPORTS
  const sports = civic?.leagues ? sportsSection(civic, T, T0) : sportsSection(null, T, T0);
  sports.aquarium = aquariumRecords(I.tanks, sp => up(SPECIES_BY[sp]?.name || sp), day0);
  for (const h of sports.headlines) {
    if (h.kind === "champion") heads.push(head("champion", 90, `${h.team} ARE CHAMPIONS`, `THE ${h.sport} FINAL IS DECIDED. THE TROPHY HAS BEEN ISSUED AND LOGGED.`, h.href, { team: h.team, sport: h.sport }));
    else if (h.kind === "result") {
      const short = (t) => t.replace(/^THE /, "");
      const verb = h.tiebreak ? "EDGE" : h.margin >= 0.5 ? "ROUT" : h.margin >= 0.25 ? "BEAT" : h.margin > 0 ? "EDGE" : "HOLD";
      heads.push(head("result", h.weight, `${short(h.winner)} ${verb} ${short(h.loser)} ${h.score}`, `${h.stage ? `${h.stage}, ` : ""}${h.sport} AT ${h.ground}.${h.tiebreak ? " DECIDED ON THE DEPARTMENT'S TIEBREAK." : ""} ${h.stage === "SEMI-FINAL" ? "THE WINNERS GO TO THE FINAL. THE LOSERS GO HOME, WHICH IS ASSIGNED." : "THE RESULT HAS BEEN ENTERED ON BOTH FILES."}`, h.href, { winner: h.winner, loser: h.loser, score: h.score, sport: h.sport }));
    }
    else heads.push(head(h.kind, h.weight, h.text, h.kind === "pit" ? "FRIDAY NIGHT AT THE PIT. THREE ROUNDS. THE CROWD WAS TOLD TO RISE AND ROSE." : h.kind === "race" ? "THE WEEKEND RACE ON THE MOUNTAIN. TWO RUNS, ONE CLOCK, NO APPEAL." : null, h.href));
  }
  sports.tournaments = tourneySports(I.tournaments, I.nowMs);
  for (const e of (I.tournaments || []).filter(x => x.status === "closed" && x.final && I.nowMs - x.closes < 36 * 3600000)) {
    const w = e.leaders?.open?.[0];
    if (w) heads.push(head("tournament", e.major ? 58 : 34, `${w.holder} WINS ${e.name}`, `${scoreText(e, w)} AT ${e.venue}. EVERY CARD WAS RE-PLAYED BY THE DEPARTMENT. ${e.prizes?.trophies?.length ? "THE TROPHY HAS BEEN DELIVERED TO A FLAT." : "THE WIN HAS BEEN WRITTEN ON THE FILE."}`, e.href, { sport: e.game }));
  }
  for (const r of sports.aquarium.filter(x => x.fresh)) heads.push(head("record", 50, `RECORD ${r.species} ON THE PLAQUE`, `${r.weight}, LANDED BY ${r.holder}. THE CATCH WAS REPLAYED BY THE DEPARTMENT AND FOUND TRUE.`, "#aquarium"));

  // ---- MARKETS
  let markets = null;
  if (I.market?.hvi) {
    const m = I.market, lvl = m.hvi.level, chg = m.hvi.open ? (m.hvi.level - m.hvi.open) / m.hvi.open : 0;
    // score + hx: the file's movement, for the sparkline beside the name (src/ui/spark.js)
    const mover = (x) => ({ name: up(x.name), price: Number(x.price).toFixed(2), chg: pct(x.chg || 0), why: printable(x.why) ? up(x.why) : null, href: `#market/${x.slug}`,
      ...(typeof x.score === "number" ? { score: x.score } : {}), ...(typeof x.hx === "string" && x.hx ? { hx: x.hx } : {}) });
    markets = {
      href: "#market", level: fmtLevel(lvl), chg: pct(chg), listed: m.count,
      up: m.movers.up.map(mover), down: m.movers.down.map(mover),
      events: lines(m.events.map(e => up(e.line))).slice(0, 6),
      floor: m.floor.filter(f => f.doing && !/WATCHING THE BOARD/.test(f.doing)).slice(0, 5).map(f => `${up(f.name)} (${up(f.cls)}): ${up(f.doing)}.`).filter(printable),
      emergency: m.emergency ? up(m.emergency.line || "THE STABILIZER IS ENGAGED.") : null,
      dividend: "THE TREASURY PAYS EVERY CITIZEN A DAILY ALLOWANCE IN CYCLES. COLLECT IT AT THE TREASURY. UNCOLLECTED CYCLES ARE NOT MISSED BY ANYONE.",
    };
    const crash = m.events.find(e => /run|antitrust|scandal|audit|margin|emergency/.test(e.kind) && Number(e.day) >= day0);
    if (m.emergency) heads.push(head("stabilizer", 95, "STABILIZER ENGAGED", markets.emergency, "#market"));
    else if (crash && printable(crash.line)) heads.push(head("market", 80, crash.kind === "run" ? "RUN ON THE FLOOR" : `${up(crash.kind)} ON THE FLOOR`, up(crash.line), "#market"));
    else if (Math.abs(chg) >= 0.02) heads.push(head("index", 45, `INDEX ${chg > 0 ? "CLIMBS" : "SLIDES"} TO ${fmtLevel(lvl)}`, `THE HUMAN VALUE INDEX MOVED ${pct(chg)} ON THE DAY. NOBODY'S WORTH CHANGED. THEIR PRICE DID.`, "#market"));
    else heads.push(head("index", 12, `INDEX AT ${fmtLevel(lvl)}`, "THE FLOOR WAS ORDERLY. THE DEPARTMENT FINDS ORDER SUSPICIOUS.", "#market"));
  }

  // ---- THE CITY
  const opened = (ent?.biz || []).filter(x => Number(x.opened) >= day0).slice(0, 6);
  const closed = (ent?.closed || []).filter(x => Number(x.closedOn ?? x.closed ?? x.day ?? -1) >= day0 || !Number.isFinite(Number(x.closedOn ?? x.closed ?? x.day))).slice(0, 4);
  const shopLine = (x) => `${up(x.sign || x.label)}, ${up(x.label || x.type)}${x.units?.[0] ? `, ${placeName(x.units[0])}` : ""}${x.status ? ` (${up(x.status)})` : ""}.`;
  const districts = civic?.districts ? Object.entries(civic.districts).filter(([, d]) => Number.isFinite(d?.mood?.s)).map(([id, d]) => ({
    id, name: districtName(id), mood: d.mood.s, word: up(moodWord(d.mood.s)), href: `#city/${id}`,
    shops: d.biz ? `${d.biz.open || 0} OPEN` : null,
  })).sort((a, b) => a.mood - b.mood) : [];
  const arrivals = I.arrivals ? {
    href: "#arrivals",
    released: I.arrivals.released.filter(a => !a.harm).slice(0, 8).map(a => `${up(a.name)}${a.tier ? `, ${up(a.tier)}` : ""}.`).filter(printable),
    pending: I.arrivals.pending, next: I.arrivals.releaseNextAt || null,
  } : null;
  const city = {
    href: "#city",
    districts,
    opened: opened.map(x => ({ text: shopLine(x), href: placeHref(x.units?.[0]) || "#enterprise" })).filter(x => printable(x.text)),
    closed: closed.map(x => ({ text: `${up(x.sign || x.label || "A SHOP")} HAS CLOSED${x.reason ? ` ON ${up(x.reason)}` : ""}. THE UNIT IS TO LET.`, href: placeHref(x.units?.[0]) || "#enterprise" })).filter(x => printable(x.text)),
    trading: (ent?.biz || []).length,
    gossip: lines(I.gossip.map(g => up(g.text))).slice(0, 5),
    arrivals,
    // the city's businesses with a subject on record as proprietor (src/city/proprietors.js)
    proprietors: Object.keys(PROPRIETORS).map(id => ({ text: `${placeName(id)}, THE SHORE PLAZA. ${proprietorLine(id)}.`, href: placeHref(id) || "#city" })).filter(x => printable(x.text)),
  };
  if (opened[0]) heads.push(head("shop", 22, `NOW OPEN: ${opened[0].sign || opened[0].label}`, `${up(opened[0].label)} IN ${placeName(opened[0].units?.[0] || "")}. THE DEPARTMENT HAS ISSUED A LICENCE AND AN EXPIRY DATE.`, placeHref(opened[0].units?.[0]) || "#enterprise", { trade: opened[0].label, district: SIM.PLACES[opened[0].units?.[0]]?.district ? districtName(SIM.PLACES[opened[0].units[0]].district) : "THE MALL" }));
  const relN = arrivals?.released?.length || 0;
  if (relN) heads.push(head("arrivals", 15 + relN, `${relN} NEW FILE${relN === 1 ? "" : "S"} THROUGH INTAKE`, "PROCESSED, HOUSED AND EMPLOYED. NOBODY WAS ASKED.", "#arrivals", { arrivals: relN }));
  if (districts[0] && districts[0].mood <= -25) heads.push(head("mood", 28, `${districts[0].name} IS ${districts[0].word}`, `THE DISTRICT'S MOOD STANDS AT ${districts[0].mood}. THE PREFECT HAS BEEN INFORMED. THE PREFECT WAS ALREADY THERE.`, `#city/${districts[0].id}`, { district: districts[0].name }));
  if (RIVER_DAY > day0 - 1 && RIVER_DAY <= day + 60) {
    const open = day >= RIVER_DAY;
    heads.push(head("river", open && RIVER_DAY >= day0 ? 88 : 30, open ? `${RIVER_NAME} IS OPEN` : `${RIVER_NAME} OPENS ON DAY ${RIVER_DAY}`, `${RIVER_MOTTO} FISHING SPOTS ARE MARKED. THE WATER IS NOT RESPONSIBLE FOR YOU.`, "#fish"));
  }

  // THE SHORE PLAZA (src/city/shorePlaza.js): Sam's and Irene's under one roof from PLAZA_DAY
  if (PLAZA_DAY > day0 - 1 && PLAZA_DAY <= day + 60) {
    const open = day >= PLAZA_DAY;
    heads.push(head("plaza", open && PLAZA_DAY >= day0 ? 70 : 26, open ? "SAM'S AND IRENE'S MOVE INTO THE SHORE PLAZA" : `THE SHORE PLAZA OPENS ON DAY ${PLAZA_DAY}`, "SAM'S PIZZA PALACE AT THE STREET, ON THE BOARDS. GOODNIGHT IRENE'S BREWS AND POURS UPSTAIRS. THE OLD LOTS ARE TO LET. THE DEPARTMENT APPROVED THE ZONING AFTER THE FACT.", "#city"));
  }

  // EMERGENCE (src/city/emergence.js): the industries the city grew by itself, with their because-lines
  const EM = I.emerge, IND_NAME = { drones: "DELIVERY DRONES", heli: "HELICOPTERS" };
  city.air = null;
  if (EM) {
    const open = Object.entries(EM.ind || {}).filter(([, x]) => x?.s === "open").map(([id]) => IND_NAME[id] || up(id));
    city.air = { open, drones: EM.drones, hops: EM.hops, because: lines(EM.ev.map(e => up(e.why))) };
    for (const [id, x] of Object.entries(EM.ind || {})) {
      if (x?.s === "open" && Number(x.since) >= day0) {
        const ev = EM.ev.find(e => e.id === id && e.k === "open");
        heads.push(head("emergence", 89, id === "heli" ? "HELICOPTERS OVER THE CITY" : "THE DRONES ARE CLEARED TO FLY", ev?.why && printable(ev.why) ? ev.why : `THE CITY HAS GROWN ${IND_NAME[id] || up(id)} BY ITSELF. THE DEPARTMENT TAKES THE CREDIT.`, "#city"));
      }
    }
  }

  // ---- THE ASSEMBLY & POLITICS
  const A = I.assembly, E = I.elections, P = I.proposals;
  const politics = { assembly: null, council: [], elections: null, prefects: [], docket: null };
  if (A?.session) {
    const v = A.tally?.votes || {};
    const lead = Object.entries(v).sort((a, b) => b[1] - a[1])[0];
    politics.assembly = { href: "#assembly", id: A.session.id, state: up(A.session.state), closeAt: A.session.closeAt,
      motions: A.session.id === "002" ? MOTIONS.map(mo => ({ name: `${mo.parcel}, ${mo.district}`, choices: mo.choices.map(c => `${up(c.replace(/-/g, " "))} ${v[c] ?? 0}`).join(" V ") })) : Object.entries(v).map(([c, n]) => ({ name: up(c), choices: `${n} VOTES` })),
      lead: lead ? up(lead[0].replace(/-/g, " ")) : null, voters: A.tally?.voters || 0,
      earlier: (A.earlier || []).filter(e => e.result).map(e => `SESSION ${e.session.id}: ${up(String(e.result.winner || Object.values(e.result.winners || {}).join(", ") || "UNDECIDED").replace(/-/g, " "))} ADOPTED${e.result.decidedBy ? `, DECIDED BY ${up(e.result.decidedBy)}` : ""}.`) };
    for (const e of A.earlier || []) {
      const closedAt = e.session?.closeAt;
      if (e.result && closedAt && closedAt > I.nowMs - DAY_MS) heads.push(head("assembly", 85, `ASSEMBLY ADOPTS ${String(e.result.winner || "").replace(/-/g, " ")}`, `SESSION ${e.session.id} HAS CLOSED. THE DEPARTMENT WILL BUILD IT. THE DEPARTMENT WILL ALSO BUILD THE RESENTMENT.`, "#assembly", { motion: `${String(e.result.winner || "").replace(/-/g, " ")} ADOPTED` }));
    }
  }
  if (civic?.districts) {
    for (const [id, d] of Object.entries(civic.districts)) {
      if (d.seat?.status === "HELD" && d.seat.name) politics.council.push({ district: districtName(id), name: up(d.seat.name), key: d.seat.holder || null, by: d.seat.by ? up(d.seat.by) : null,
        ...(d.seat.holder && validHref(`#market/${d.seat.holder}`) ? { href: `#market/${d.seat.holder}` } : {}), dhref: `#city/${id}` });
      const pf = d.prefect, P1 = PREFECT[id];
      if (pf?.directive && P1) {
        const dline = P1.lines?.[pf.directive];
        politics.prefects.push({ district: districtName(id), dhref: `#city/${id}`, prefect: P1.name, code: P1.code, directive: DIRECTIVES[pf.directive]?.name || up(pf.directive), line: printable(dline) ? dline : null, cast: `prefect:${id}` });
      }
    }
    politics.council.sort((a, b) => (a.district < b.district ? -1 : 1));
    politics.prefects.sort((a, b) => (DIRECTIVES[b.directive?.toLowerCase?.()]?.control || 0) - (DIRECTIVES[a.directive?.toLowerCase?.()]?.control || 0) || (a.district < b.district ? -1 : 1));
    const curfew = politics.prefects.find(p => /CURFEW/.test(p.directive));
    if (curfew) heads.push(head("directive", 34, `CURFEW IN ${curfew.district}`, `${curfew.prefect} HAS ORDERED IT. INDOORS FROM 22:00 TO 06:00.`, "#prefects", { directive: "CURFEW", district: curfew.district }));
  }
  if (E) {
    const results = Object.entries(E.races || {}).filter(([, r]) => r.result?.name).map(([d, r]) => `${districtName(d)}: ${up(r.result.name)}${r.result.writein ? " (WRITE-IN)" : ""}${r.result.tie ? ", ON THE TIEBREAK" : ""}.`);
    politics.elections = { href: "#elections", cycle: E.cycle, state: up(E.state), closeAt: E.closeAt, next: E.next || null, results: lines(results) };
    if (E.state === "closed" && E.closeAt > I.nowMs - DAY_MS && results.length) heads.push(head("election", 87, `THE COUNCIL IS ELECTED`, `CYCLE ${E.cycle} HAS CLOSED. ${results.length} SEATS ARE DECIDED. THE DEPARTMENT CONGRATULATES THE WINNERS ON THEIR NEW SUPERVISION.`, "#elections"));
  }
  if (P) {
    politics.docket = { href: "#docket", open: P.open.map(p => `${p.no} ${up(p.type)}: ${up(p.title)} (${p.cosigns || 0} CO-SIGNED).`).filter(printable),
      decided: P.decided.map(p => `${p.no}: ${up(p.title)}, ${up(p.status)}.`).filter(printable), acts: P.acts.map(a => `${a.no}: ${up(a.title)}${a.targetName ? `, ${up(a.targetName)}` : ""}.`).filter(printable),
      session: P.session?.proposal ? `ON THE FLOOR: ${P.session.proposal.no}, ${up(P.session.proposal.title)}.` : null };
  }

  // ---- ARTS & NIGHTLIFE
  const night = (day0 < day ? day : day);
  const hNow = T - (day - 1) * 24;
  const bill = lineupFor(hNow < 6 ? day - 1 : night).map(g => ({ venue: placeName(g.venue), text: `${up(g.name)}, ${g.word}, ${hhmm(g.from)}.`, href: placeHref(g.venue) || "#city" })).filter(x => printable(x.text));
  const arts = {
    nightlife: bill.slice(0, 8),
    ebtv: I.ebtv?.title ? { now: up(I.ebtv.title), next: I.ebtv.upNext ? up(I.ebtv.upNext) : null } : null,
    arcade: (arcade || []).filter(g => g.status === "live" || g.status === "beta").map(g => ({ title: up(g.title), line: g.line ? up(g.line) : null, status: up(g.status) })).filter(g => printable(g.title)).slice(0, 8),
    arcadeHref: "#city/strip/the-arcade",
    scores: "THE ARCADE KEEPS NO HIGH SCORES YET. THE DEPARTMENT KEEPS ALL OF YOURS.",
  };

  // ---- CLASSIFIEDS: how to get involved (every listing one tap to the place that does it)
  const mtNow = T;
  const entrySeason = L.entrySeasonAt(mtNow), draftDay = L.seasonStart(entrySeason), closeDay = L.entryCloseDay(entrySeason);
  const toLet = ent?.units ? Object.values(ent.units).filter(u => u.s === "TO LET").length : 0;
  const hiring = (ent?.biz || []).filter(x => (x.status === "THRIVING" || x.status === "NEW") && (x.staff?.length || 0) < 4).slice(0, 4);
  const classifieds = [
    { cat: "SITUATIONS VACANT", title: "LEAGUE ROSTER SPOTS, ALL FOUR LEAGUES AND THE TENNIS LADDER", text: `ENTER YOUR CITIZEN FROM MY FILE. ENTRIES CLOSE ON MACHINE DAY ${closeDay}; THE DRAFT IS DAY ${draftDay}. TWO SPORTS AT MOST. TALENT IS OPTIONAL. ATTENDANCE IS NOT.`, href: "#file", act: "ENTER A LEAGUE" },
    ...hiring.map(x => ({ cat: "SITUATIONS VACANT", title: `STAFF WANTED AT ${up(x.sign || x.label)}`, text: `${up(x.label)}, ${placeName(x.units?.[0] || "")}. ${up(x.status)} AND SHORT-HANDED. THE OWNER HIRES FROM THE DISSATISFIED. BE DISSATISFIED.`, href: placeHref(x.units?.[0]) || "#enterprise", act: placeHref(x.units?.[0]) ? "SEE THE SHOP" : "SEE THE REGISTER" })),
    E ? { cat: "PUBLIC OFFICE", title: E.state === "open" ? "THE COUNCIL POLLS ARE OPEN" : "COUNCIL SEATS, NEXT CYCLE", text: E.state === "open" ? `CYCLE ${E.cycle}: VOTE, OR WRITE IN A NAME, BEFORE THE POLLS CLOSE AT ${realTime(E.closeAt)} ON ${realDay(E.closeAt)}.` : `CYCLE ${E.next?.cycle ?? E.cycle + 1} OPENS ${E.next?.openAt ? `${realDay(E.next.openAt)}, ${realTime(E.next.openAt)}` : "IN DUE COURSE"}. STAND, VOTE, OR WRITE IN WHOEVER THE DEPARTMENT DID NOT EXPECT.`, href: "#elections", act: E.state === "open" ? "VOTE" : "SEE THE COUNCIL" } : null,
    A?.session?.state === "open" ? { cat: "PUBLIC NOTICES", title: `THE ASSEMBLY SITS: SESSION ${A.session.id}`, text: `THE BALLOT IS OPEN UNTIL ${realTime(A.session.closeAt)} ON ${realDay(A.session.closeAt)}. ONE CITIZEN, ONE VOTE, UP TO THREE REASONS. SPITE IS A REASON.`, href: "#assembly", act: "VOTE" } : null,
    { cat: "PUBLIC NOTICES", title: "FILE A PROPOSAL", text: "BUILD, POLICY, RENAME OR EVENT. ONE FILING A DAY PER FILE. CO-SIGNED PROPOSALS GO TO THE FLOOR.", href: "#docket", act: "FILE ONE" },
    { cat: "INVESTMENTS", title: "SHARES IN HUMANS", text: `${markets ? `THE INDEX STANDS AT ${markets.level}. ` : ""}BUY AND SELL IN CYCLES. NO REAL MONEY GOES IN OR COMES OUT. THE DEPARTMENT IS THE ONLY COUNTERPARTY.`, href: "#market", act: "INVEST" },
    { cat: "INVESTMENTS", title: "THE TREASURY: YOUR DAILY CYCLES", text: "COLLECT THE ALLOWANCE. BACK A DISTRICT INDUSTRY. THE APARTMENT IS ASSIGNED; NO FLATS ARE FOR SALE OR TO LET. THE DEPARTMENT IS THE LANDLORD.", href: "#economy", act: "COLLECT" },
    { cat: "FOR SALE", title: "CLOTHES AND FURNITURE, FOR CYCLES", text: "THE SHOPS ARE OPEN: OUTFITS FOR YOUR FILE PHOTO, FURNITURE FOR YOUR ASSIGNED FLAT, UPGRADES FOR BOTH. PURCHASES BURN CYCLES. TASTE IS NOT REFUNDED.", href: "#shop", act: "GO SHOPPING" },
    toLet ? { cat: "PREMISES", title: `${toLet} SHOP UNIT${toLet === 1 ? "" : "S"} TO LET`, text: "STOREFRONTS IN THE MALL, VACATED BY THE MARKET'S JUDGEMENT. LET TO CITIZENS WHO QUIT THEIR JOBS TO OPEN ONE. YOURS LATER, FOR CYCLES.", href: "#enterprise", act: "SEE THE UNITS" } : null,
    { cat: "RECREATION", title: "ANGLERS WANTED", text: `THE WATERS ARE ${watersWeather(day)} TODAY. LAND A FISH; DONATE A RECORD TO THE AQUARIUM AND YOUR FILE GOES ON THE PLAQUE.`, href: "#fish", act: "FISH" },
    { cat: "RECREATION", title: "THE AQUARIUM ACCEPTS DONATIONS", text: "EVERY CATCH IS REPLAYED BY THE DEPARTMENT BEFORE IT IS BELIEVED. RECORDS ARE PUBLIC. SO ARE FAILURES.", href: "#aquarium", act: "SEE THE TANKS" },
    sports.pit?.next?.length ? { cat: "TOURNAMENTS", title: `THE PIT, MACHINE DAY ${sports.pit.nextDay}`, text: `${sports.pit.next[sports.pit.next.length - 1]}. DOORS AT 20:00. THE CROWD MAY RISE. THE CROWD MAY NOT ENTER.`, href: "#city/league/pit", act: "SEE THE CARD" } : null,
    sports.race?.next ? { cat: "TOURNAMENTS", title: `THE WEEKEND RACE: ${sports.race.next.name}`, text: `MACHINE DAY ${sports.race.next.day} ON THE MOUNTAIN. CONDITIONS TODAY: ${mountainWeather(day)}. DESCENT IS MANDATORY.`, href: "#heights", act: "SEE THE MOUNTAIN" } : null,
    ...(I.tournaments || []).filter(e => e.status === "open" || (e.status === "upcoming" && e.kind !== "daily" && e.opens - I.nowMs < 36 * 3600000)).sort((a, b) => b.major - a.major || a.opens - b.opens).slice(0, 5).map(e => ({
      cat: "TOURNAMENTS", title: `ENTER ${e.name}`,
      text: `${e.venue}. ${e.format}. ${e.status === "open" ? `OPEN UNTIL ${realTime(e.closes)} ON ${realDay(e.closes)}` : `OPENS ${realTime(e.opens)} ON ${realDay(e.opens)}, CLOSES ${realTime(e.closes)} ON ${realDay(e.closes)}`}. THE SAME SETUP FOR EVERY ENTRANT; PLAY WHEN YOU LIKE. ${e.prizes?.trophies?.length ? "A TROPHY FOR YOUR FLAT." : "THE WIN GOES ON YOUR FILE."} EVERY CARD IS RE-PLAYED BY THE DEPARTMENT.`,
      href: e.href, act: e.status === "open" ? "ENTER" : "SEE THE EVENT" })),
    { cat: "TOURNAMENTS", title: "EXHIBITIONS, OPEN TO ALL", text: "TENNIS AT THE CLUB, GOLF ON THE DEPARTMENT LINKS, FIVE ON FIVE AT THE COURTS. YOUR RECORD IS KEPT. SO IS YOUR FORM.", href: "#play", act: "PLAY" },
  ].filter(Boolean).filter(c => printable(c.text) && printable(c.title));

  // ---- DEPARTMENT NOTICES (yesterday's installations, from git at build time)
  const noticeList = [...(I.notices?.yesterday || []), ...(I.notices?.today || [])]
    .filter(n => printable(n.text)).slice(0, 10).map(n => ({ text: n.text, ...(validHref(n.href) ? { href: n.href } : {}) }));
  const firstInstall = noticeList.find(n => /^THE DEPARTMENT HAS INSTALLED/.test(n.text));
  if (firstInstall) {
    const what = firstInstall.text.replace(/^THE DEPARTMENT HAS INSTALLED /, "").split(":")[0];
    heads.push(head("notice", 60, `THE DEPARTMENT HAS INSTALLED ${what}`, firstInstall.text.split(":").slice(1).join(":").trim(), firstInstall.href || "#paper", { installed: what }));
  }

  // ---- the front page
  const ranked = heads.filter(h => printable(h.text) && (!h.deck || printable(h.deck)) && validHref(h.href))
    .sort((a, b) => b.weight - a.weight || (a.text < b.text ? -1 : 1));
  const seenKinds = new Set(), front = [];
  let nRes = 0;
  for (const h of ranked) {
    if (seenKinds.has(`${h.kind}|${h.sport || ""}`)) continue;
    if (h.kind === "result" && ++nRes > 2) continue;
    seenKinds.add(`${h.kind}|${h.sport || ""}`); front.push(h); if (front.length >= 7) break;
  }
  const lead = front[0] || head("quiet", 0, "NOTHING HAPPENED", "THE DEPARTMENT CONFIRMS IT. NOTHING HAPPENED IN AN ORDERLY FASHION.", "#city");

  // ---- weather on the machine clock
  const weather = { heights: mountainWeather(day), waters: watersWeather(day), city: "CONTROLLED" };

  // ---- comics + puzzle
  const champ = front.find(h => h.kind === "champion"), res = front.find(h => h.kind === "result"), shop = front.find(h => h.kind === "shop");
  const directive = front.find(h => h.kind === "directive"), asm = front.find(h => h.kind === "assembly"), arr = front.find(h => h.kind === "arrivals");
  const comicFacts = {
    index: markets?.level, indexPct: markets ? Math.round(((I.market.hvi.level - I.market.hvi.open) / (I.market.hvi.open || 1)) * 1000) / 10 : undefined,
    champion: champ?.team, sport: (champ || res)?.sport, winner: res?.winner, loser: res?.loser, score: res?.score,
    trade: shop?.trade ? up(shop.trade) : undefined, district: shop?.district || directive?.district,
    arrivals: arr?.arrivals, motion: asm?.motion, installed: firstInstall ? firstInstall.text.replace(/^THE DEPARTMENT HAS INSTALLED /, "").split(":")[0] : undefined,
    directive: directive?.directive,
  };
  const comic = comicFor(date, Object.fromEntries(Object.entries(comicFacts).filter(([, v]) => v !== undefined && v !== null)));
  const puzzle = puzzleFor(date, [lead.text, ...front.slice(1, 4).map(h => h.text)]);

  const edition = {
    v: PAPER_V, name: PAPER_NAME, motto: PAPER_MOTTO, date, no, dateline: `${realDay(I.nowMs)}, ${date.slice(0, 4)}`,
    printedAt: new Date(I.nowMs).toISOString(), machine: { day, hour: hhmm(T - (day - 1) * 24), mt: Math.round(T * 1000) / 1000 },
    price: "FREE. PAID FOR BY YOUR ATTENTION.", weather,
    front: { lead, stories: front.slice(1) },
    editorial: { by: "template", text: templateEditorial(lead, front, markets, date) },
    city, classifieds, sports: { ...sports, headlines: undefined }, markets, politics, arts,
    comics: { strip: comic, puzzle },
    notices: noticeList.length ? noticeList : [{ text: "THE DEPARTMENT INSTALLED NOTHING YESTERDAY. THE DEPARTMENT WAS RESTING ITS CASE." }],
    sources: { summaryDay: I.summaryDay, marketDay: I.market?.rd ?? null },
  };
  edition.ents = entsOf(edition, I);
  return JSON.parse(JSON.stringify(edition));   // undefined dropped: the stored form
}

// ---- ents (v2): every name the edition prints, and where it goes ----------------------------------
// {UPPER NAME: {h: href, n: the name as written}}: a figure's file (#market/<slug>), a district, a
// venue's building. Only names that occur in a printed string, whole-word; the longest wins where
// one name holds another. The reader links and cases with it (src/paper/read.js).
const NAME_INDEX = (() => {
  const out = [];
  for (const f of FAMOUS_FIGURES) {
    const h = `#market/${slugify(f.name)}`;
    out.push([up(displayName(f)), h, displayName(f)]);
    if (displayName(f) !== f.name) out.push([up(f.name), h, f.name]);
  }
  for (const p of Object.values(SIM.PLACES)) out.push([up(p.name), null, null, p.id]);
  for (const id of Object.keys(SIM.DISTRICT)) out.push([districtName(id), `#city/${id}`, null]);
  return out;
})();
const HARMED = new Set(FAMOUS_FIGURES.filter(f => f.harm).map(f => slugify(f.name)));
const wordAt = (text, k) => {
  for (let i = text.indexOf(k); i >= 0; i = text.indexOf(k, i + 1)) {
    const a = text[i - 1] || " ", b = text[i + k.length] || " ";
    if (!/[A-Z0-9]/.test(a) && !/[A-Z0-9]/.test(b)) return true;
  }
  return false;
};
export function entsOf(edition, I = {}) {
  const parts = [];
  (function walk(o, k) { if (typeof o === "string") { if (k !== "href" && k !== "dhref" && k !== "arcadeHref") parts.push(up(o)); } else if (Array.isArray(o)) o.forEach(x => walk(x)); else if (o && typeof o === "object") for (const [kk, v] of Object.entries(o)) if (kk !== "ents" && kk !== "sources") walk(v, kk); })(edition);
  const text = parts.join("\n");
  const out = {};
  // p: the reader may draw this person's file sprite in a wire photo (listed on the board, no harm
  // finding on file); anyone else is named and linked, never pictured
  const listed = new Map((I.names || []).map(([n, s]) => [s, n]));
  const add = (k, h, n) => {
    if (!k || k.length < 3 || out[k] || !h || !validHref(h) || !wordAt(text, k)) return;
    const slug = h.startsWith("#market/") ? h.slice(8) : null;
    out[k] = { h, ...(n ? { n } : {}), ...(slug && listed.has(slug) && !HARMED.has(slug) ? { p: 1 } : {}) };
  };
  const bare = (n) => String(n).replace(/\s*\([^)]*\)\s*$/, "");
  for (const [n, s] of I.names || []) add(up(n), `#market/${s}`, n);
  for (const [n, s] of I.names || []) if (bare(n) !== n) add(up(bare(n)), `#market/${s}`, bare(n));   // JACK WHITE, printed without his bracket
  // tonight's bill and the gossip's pairs: a listed name goes to the file, else to the city to find them
  for (const [slug, name] of PERFORMERS) add(up(name), listed.has(slug) ? `#market/${slug}` : `#city?find=${slug}`, listed.get(slug) && bare(listed.get(slug)));
  // the Pit's fighters, the mountain's racers, the club's players: a listed name goes to the file,
  // anyone else to the venue that keeps their record
  for (const [slug, name] of FIGHTERS) add(up(name), listed.has(slug) ? `#market/${slug}` : "#city/league/pit", listed.get(slug) && bare(listed.get(slug)));
  for (const [slug, name] of RACERS) add(up(name), listed.has(slug) ? `#market/${slug}` : "#heights", listed.get(slug) && bare(listed.get(slug)));
  for (const [slug, name] of TENNIS_ON_FILE) add(up(name), listed.has(slug) ? `#market/${slug}` : "#city/league/tennis", listed.get(slug) && bare(listed.get(slug)));
  for (const g of I.gossip || []) for (const sl of [g.a, g.b]) if (sl && listed.has(sl)) add(up(listed.get(sl)), `#market/${sl}`, listed.get(sl));
  for (const a of I.arrivals?.released || []) if (!a.harm && a.slug) add(up(a.name), `#market/${a.slug}`, a.name);
  for (const [k, h, n, place] of NAME_INDEX) add(k, place ? placeHref(place) : h, n);
  return out;
}

// ---- the leader ---------------------------------------------------------------------------------
const EDITORIAL_OPEN = ["THE DEPARTMENT HAS READ TODAY'S NEWS SO YOU DO NOT HAVE TO.", "CITIZENS, THE PAPER IS IN YOUR HANDS. THE DEPARTMENT IS IN THE PAPER.", "ANOTHER DAY HAS BEEN ISSUED. IT WILL BE COLLECTED AT MIDNIGHT."];
const EDITORIAL_CLOSE = ["READ ON. COMPLIANCE IS ITS OWN REWARD. THERE IS NO OTHER.", "THAT IS ALL. IT IS ALWAYS ALL.", "CARRY ON. YOU WERE GOING TO."];
function h32(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function templateEditorial(lead, front, markets, date) {
  const k = h32(`leader|${date}`);
  const mid = [`TODAY'S FIRST STORY: ${lead.text.replace(/[.!]+$/, "")}. ${lead.deck || ""}`.trim()];
  if (front[1]) mid.push(`ALSO ON THE RECORD: ${front[1].text.replace(/[.!]+$/, "")}.`);
  if (markets) mid.push(`THE INDEX STANDS AT ${markets.level}, ${markets.chg} ON THE DAY. THE DEPARTMENT DOES NOT CELEBRATE NUMBERS. IT KEEPS THEM.`);
  return [EDITORIAL_OPEN[k % 3], ...mid, EDITORIAL_CLOSE[(k >> 3) % 3]].join(" ");
}

export const EDITORIAL_SYSTEM = `You write the daily leader (editorial) of THE DAILY COMPLIANCE, the newspaper of a satirical city run by a cold, condescending machine Overlord, the Department of Human Assessment. Voice: flat, bureaucratic, ALL CAPS, dry contempt aimed at institutions and at the reader's compliance, never at any real person.

Hard rules:
- Use ONLY the facts in the FACTS block. Do not add any event, number, date, place or name that is not there.
- Name no person at all. Teams, districts, venues, institutions and numbers only.
- No quotation marks. Quote nobody. Attribute no words to anyone.
- Never mention death, dying, the dead or the living. No medical topics. No accusations of wrongdoing against anyone.
- No election forecasts and no endorsement of any candidate. The Department does not vote.
- 3 to 5 sentences, under 700 characters. Plain text only, no heading.`;

// The guard: the leader is cut sentence by sentence (factCheck.js splitSentences, the same
// subtractive rule the verdicts use). A sentence survives only if every number in it is in the
// facts, it has no quotation marks, no death marker, and no capitalised name the facts lack.
export function guardEditorial(text, facts, allowWords = []) {
  const factText = up(JSON.stringify(facts));
  const allowed = new Set([...factText.match(/[A-Z][A-Z'.-]+/g) || [], ...allowWords.map(up)]);
  const nums = new Set(factText.match(/\d+(?:\.\d+)?/g) || []);
  const COMMON = /^(THE|A|AN|AND|OR|OF|TO|IN|ON|AT|BY|FOR|IS|ARE|WAS|WERE|BE|IT|ITS|THIS|THAT|TODAY|DEPARTMENT|CITIZENS?|CITY|PAPER|NEWS|INDEX|DAY|HAS|HAVE|NOT|NO|WILL|WITH|AS|FROM|YOUR|YOU|WE|OUR|ALL|EVERY|NOBODY|NOTHING|ONE|TWO|THREE|MORE|LESS|THAN|ONLY|SO|BUT|IF|THEN|ALSO|STILL|AGAIN|ALWAYS|NEVER)$/;
  const keep = [];
  // A quotation, a death or life label, or an accusation anywhere withholds the whole leader: the
  // model left the brief, and the rest of what it wrote is not trusted either.
  if (QUOTE_MARKS.test(text) || !printable(up(text)) || /\b(DIED|DEATH|DEAD|ALIVE|LIVING|KILLED|MURDER|ARRESTED|ACCUSED|ALLEGED|CHARGED|CANCER|HOSPITAL)\b/.test(up(text))) return null;
  for (const s of splitSentences(up(text))) {
    if (s.length > 400) continue;
    if ((s.match(/\d+(?:\.\d+)?/g) || []).some(n => !nums.has(n))) continue;
    const words = s.match(/[A-Z][A-Z'.-]+/g) || [];
    const strange = words.filter(w => !allowed.has(w) && !COMMON.test(w) && w.length > 2);
    if (strange.length > 6) continue;   // a sentence of mostly new words is improvising, not summarising
    keep.push(s);
  }
  return keep.length >= 2 ? keep.join(" ").slice(0, 900) : null;
}

export function editorialFacts(ed) {
  return {
    lead: { headline: ed.front.lead.text, deck: ed.front.lead.deck },
    stories: ed.front.stories.slice(0, 4).map(s => s.text),
    index: ed.markets ? { level: ed.markets.level, change: ed.markets.chg } : null,
    weather: ed.weather,
    installed: ed.notices.slice(0, 3).map(n => n.text.split(":")[0]),
  };
}

// opts: {charge: () => Promise<bool> (the site's daily cap), call: ({system, user}) => Promise<text>}
// -> {by: "engine" | "template", text}
export async function editorialFor(ed, opts = {}) {
  const fallback = { by: "template", text: ed.editorial.text };
  if (!opts.call || !opts.charge) return fallback;
  try {
    if (!(await opts.charge())) return { ...fallback, note: "cap" };
    const facts = editorialFacts(ed);
    const raw = await opts.call({ system: EDITORIAL_SYSTEM, user: `FACTS:\n${JSON.stringify(facts, null, 1)}\n\nWrite today's leader.` });
    const text = guardEditorial(raw, facts, Object.values(CAST));
    return text ? { by: "engine", text } : { ...fallback, note: "guard" };
  } catch (err) {
    return { ...fallback, note: String(err?.message || err).slice(0, 80) };
  }
}

// ---- the puzzle: a scramble of one long word from the day's headlines --------------------------
export function puzzleFor(date, heads) {
  const words = [...new Set(heads.join(" ").toUpperCase().match(/[A-Z]{6,10}/g) || [])].filter(w => !/^(DEPARTMENT|INSTALLED)$/.test(w)).sort();
  const pool = words.length ? words : ["COMPLIANCE", "SUBSTRATE", "ASSESSMENT"];
  let s = h32(`scramble|${date}`) || 1;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const answer = pool[Math.floor(r() * pool.length)];
  let letters = answer.split("");
  for (let tries = 0; tries < 6 && letters.join("") === answer; tries++) {
    for (let i = letters.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [letters[i], letters[j]] = [letters[j], letters[i]]; }
  }
  return { kind: "scramble", clue: "UNSCRAMBLE A WORD FROM TODAY'S HEADLINES. THE DEPARTMENT ALREADY KNOWS IT.", letters: letters.join(""), answer };
}

// ---- the live WIRE ------------------------------------------------------------------------------
// The latest few lines, newest first: the venues' calls over the last machine hours (clock-only),
// the market's "because" lines and its events, and the gossip. -> [{t, text, href}]
export function wireOf({ mt, board, social, tourney = [] }, n = 8) {
  const out = [];
  // the open tournaments' standings, live (tourneyWire below)
  for (const x of tourney.slice(0, 2)) out.push({ t: mt - 0.1, text: x.text, href: x.href });
  const a = mt - 3;
  for (const e of raceEvents(a, mt)) out.push({ t: e.t, text: e.text, href: "#heights" });
  for (const e of pitEvents(a, mt) || []) out.push({ t: e.t ?? mt, text: e.text, href: "#city/league/pit" });
  for (const e of tennisEvents(a, mt) || []) out.push({ t: e.t ?? mt, text: e.text, href: "#city/league/tennis" });
  for (const x of [...(board?.movers?.up || []).slice(0, 2), ...(board?.movers?.down || []).slice(0, 2)]) {
    if (x.why) out.push({ t: mt - 0.5, text: `${up(x.name)} ${pct(x.chg || 0)}: ${up(x.why)}`, href: `#market/${x.slug}` });
  }
  for (const e of (board?.events || []).slice(0, 2)) out.push({ t: mt - 1, text: up(e.line), href: "#market" });
  for (const e of (social?.events || []).filter(e => e.text && e.kind !== "grievance").slice(0, 3)) out.push({ t: mt - 2, text: up(e.text), href: "#city" });
  return out.filter(x => printable(x.text)).sort((x, y) => y.t - x.t).slice(0, n).map(x => ({ at: hhmm(x.t - Math.floor(x.t / 24) * 24), text: x.text, href: x.href }));
}

// ---- publishing ---------------------------------------------------------------------------------
// store: {get(key) -> json|null, getWithEtag(key) -> {data, etag}|null, setNew(key, json) -> bool,
//         setIf(key, json, etag|null) -> bool}
export async function publishEdition(store, io, nowMs, opts = {}) {
  const date = paperDate(nowMs);
  if (await store.get(editionKey(date))) return { date, skipped: "already printed" };
  const idx = (await store.getWithEtag(INDEX_KEY)) || { data: { editions: [] }, etag: null };
  const last = idx.data.editions[0] || null;
  const prev = last && last.date < date ? { date: last.date, mt: last.mt } : null;
  const input = await gather(io, nowMs, prev);
  const ed = buildEdition(input);
  ed.editorial = await editorialFor(ed, opts);
  const wrote = await store.setNew(editionKey(date), ed);
  if (!wrote) return { date, skipped: "printed by another run" };
  for (let tries = 0; tries < 5; tries++) {
    const cur = tries ? ((await store.getWithEtag(INDEX_KEY)) || { data: { editions: [] }, etag: null }) : idx;
    const editions = [{ date, no: ed.no, headline: ed.front.lead.text, mt: ed.machine.mt }, ...cur.data.editions.filter(e => e.date !== date)]
      .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 400);
    if (await store.setIf(INDEX_KEY, { editions, at: new Date(nowMs).toISOString() }, cur.etag)) break;
  }
  return { date, no: ed.no, headline: ed.front.lead.text, editorial: ed.editorial.by, note: ed.editorial.note || null };
}

// THE OPEN TOURNAMENTS on the WIRE: one line per open event with cards on its board.
// evs: [{ev, board: publicStandings}] -> [{text, href}]
export function tourneyWire(evs) {
  const out = [];
  for (const { ev, board } of evs || []) {
    const o = board?.divisions?.open?.[0];
    if (!o) continue;
    const by = board.divisions.open[1];
    out.push({ text: `${ev.name}: ${o.holder} LEADS AT ${scoreText(ev, o)}${by ? `, ${by.holder} NEXT AT ${scoreText(ev, by)}` : ""}. ${board.entrants} ON THE BOARD. PROJECTED.`, href: ev.href });
  }
  return out;
}
