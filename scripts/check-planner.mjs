// THE MASTER PLAN (docs/planning/MASTER_PLAN.md, 2026-09-30): the layout's invariants, the ids
// that must never move, a published day of the old layout replayed on the new ground (nobody
// jumps), THE PIT (cards, grievances, the living never fight a grievance, no living non-fighter
// ever fights), THE TENNIS CLUB, the Dept of Planning's lines and the billboard sites.
// node scripts/check-planner.mjs
import { readFileSync } from "node:fs";
import * as SIM from "../src/city/sim.js";
import * as PIT from "../src/city/pit.js";
import * as TEN from "../src/city/tennis.js";
import * as V from "../src/city/venueGeo.js";
import * as S from "../src/city/social.js";
import { FOOTHILLS } from "../src/city/coastGeo.js";
import { planningLines, POSITIONS, BY_TYPE, PLAN_LINES } from "../src/city/planning.js";
import { BILLBOARD_SITES, billboardBox } from "../src/city/billboards.js";
import { isoItems, massingOf } from "../src/city/archGeo.js";
import { loopPieces } from "../src/city/loopGeo.js";
import { SPUR_STOPS } from "../src/city/coastGeo.js";
import { linePieces } from "../src/city/lineGeo.js";
import { terrainH, onTerrain } from "../src/city/coastGeo.js";
import { rotRect } from "../src/city/iso.js";
import { FAMOUS_FIGURES, slugify } from "../src/figures.js";
import { baseRoster } from "../src/city/roster.js";

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("  FAIL", msg); } };
const over = (a, b) => a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;
const OLD = JSON.parse(readFileSync(new URL("./fixtures/layout1-ids.json", import.meta.url), "utf8"));

// ---- 1. ids and the Loop: what the city's records point at never moves ------------------------------
{
  for (const k of ["districts", "places", "buildings", "jobs"]) {
    const now = new Set(k === "districts" ? SIM.DISTRICTS.map(d => d.id) : k === "places" ? Object.keys(SIM.PLACES) : k === "buildings" ? SIM.BUILDINGS.map(b => b.id) : SIM.JOBS.map(j => j.id));
    const lost = OLD[k].filter(id => !now.has(id));
    ok(!lost.length, `every ${k.slice(0, -1)} id of layout 1 still resolves (${lost.join(", ") || OLD[k].length + " kept"})`);
  }
  ok(SIM.DISTRICTS.slice(0, OLD.districts.length).map(d => d.id).join() === OLD.districts.join(), "the districts keep their order (a sector is a district, in order)");
  const capMoved = Object.entries(OLD.caps).filter(([id, c]) => SIM.PLACES[id].cap !== c).map(([id]) => id);
  ok(!capMoved.length, `no place's capacity moved (${capMoved.join(", ") || "none"})`);
  // PHASE 2 step 3: the new districts' homes are appended to their bands (a new day draws everyone again)
  ok(OLD.homes.every((band, k) => JSON.stringify(SIM.HOMES_BY_BAND[k].slice(0, band.length)) === JSON.stringify(band)), "the homes by tier band keep layout 1's, in order (the Port's and the Old Town's appended)");
  const moved = Object.entries(OLD.stations).filter(([id, [s, gx, gy]]) => { const st = SIM.STATIONS[id]; return !st || st.s !== s || st.gate.x !== gx || st.gate.y !== gy; }).map(([id]) => id);
  ok(!moved.length && SIM.LOOP_LINE.lapHours === OLD.lap, `the Loop's stations and lap are exactly layout 1's: the timetable, every published train (${moved.join(", ") || "unchanged"})`);
  ok(SIM.LAYOUT_VERSION >= 3 && SIM.COAST_DY === 12, "the layout is version 3 or later: the Coast three more rows south, for the Shore Line (PHASE 2)");
}

// ---- 2. the plan's moves, as invariants ----------------------------------------------------------------
{
  const D = SIM.DISTRICT, B = SIM.BUILDING, P = SIM.PLACES;
  for (const d of SIM.DISTRICTS) for (const e of SIM.DISTRICTS) if (d !== e) ok(!over(d.rect, e.rect), `${d.id} and ${e.id} do not overlap`);
  for (const b of SIM.BUILDINGS) { const r = D[b.district].rect; ok(b.rect.x >= r.x - 1e-9 && b.rect.y >= r.y - 1e-9 && b.rect.x + b.rect.w <= r.x + r.w + 1e-9 && b.rect.y + b.rect.h <= r.y + r.h + 1e-9, `${b.id} inside ${b.district}`); }
  for (let i = 0; i < SIM.BUILDINGS.length; i++) for (let j = i + 1; j < SIM.BUILDINGS.length; j++) ok(!over(SIM.BUILDINGS[i].rect, SIM.BUILDINGS[j].rect), `${SIM.BUILDINGS[i].id} and ${SIM.BUILDINGS[j].id} do not overlap`);
  // the mountain pulled back: the Heights' village and slopes at least ten rows from the core, the foothills between
  const core = Math.min(...SIM.LOOP_DISTRICTS.map(d => d.rect.y));
  const alpine = SIM.BUILDINGS.filter(b => b.district === "heights" && b.id !== "the-foothills");
  const gap = core - Math.max(...alpine.map(b => b.rect.y + b.rect.h));
  ok(gap >= 13, `the Heights' village stands ${gap} rows back from Finance and the Strip (was 3.5)`);
  const F = B["the-foothills"].rect;
  ok(F.y >= Math.max(...alpine.map(b => b.rect.y + b.rect.h)) - 1e-9 && F.y + F.h <= core, "the foothills lie between the village and the core");
  ok(FOOTHILLS.trees.length > 100 && FOOTHILLS.trees.every(([x]) => Math.abs(x - FOOTHILLS.spurX) >= FOOTHILLS.clear), `the foothills' forest (${FOOTHILLS.trees.length} pines) keeps the Alpine Line's right of way clear`);
  // the Coast behind a belt: nothing of the Coast within 3 rows of the core; the belt holds civic, sport and green
  const bottom = Math.max(...SIM.LOOP_DISTRICTS.map(d => d.rect.y + d.rect.h));
  ok(D.coast.rect.y >= bottom + 2 && bottom === 74, `the bottom row runs to row ${bottom}; the Coast begins at ${D.coast.rect.y}`);
  const belt = ["planning-office", "the-pit", "estate-gardens", "tennis-club"];
  ok(belt.every(id => B[id] && B[id].rect.y >= (id === "the-pit" ? 57.5 : 65) - 1e-9), "the belt (the Works from row 57.5, the rest from row 65) holds the Dept of Planning, THE PIT, the estate gardens and the tennis club");
  // heavy industry away from homes; the school away from the foundry
  const homes = Object.values(P).filter(p => p.kind === "home").map(p => p.rect);
  const gapTo = (r, list) => Math.min(...list.map(q => Math.hypot(Math.max(0, q.x - (r.x + r.w), r.x - (q.x + q.w)), Math.max(0, q.y - (r.y + r.h), r.y - (q.y + q.h)))));
  const heavy = ["foundry", "radiant-core", "reclamation-line"].map(id => gapTo(B[id].rect, homes)), light = ["hydroponics", "slag-canteen", "data-docks"].map(id => gapTo(B[id].rect, homes));
  ok(Math.min(...heavy) > Math.max(...light) - 1e-9, `the Works: heavy industry is farther from any home (nearest ${Math.min(...heavy).toFixed(1)} cells) than the light uses (${light.map(v => v.toFixed(1)).join(", ")})`);
  const schoolHeavy = Math.min(...["foundry", "radiant-core", "reclamation-line", "holding-cells", "barracks"].map(id => gapTo(B[id].rect, [B.schoolhouse.rect])));
  ok(schoolHeavy > 15, `the schoolhouse stands ${schoolHeavy.toFixed(1)} cells from the nearest heavy works (layout 1: 5, the barracks)`);
  // every home within twenty cells (a twenty-minute walk) of green ground (layout 1: Hab A-D 27-42, the Heights 35-55)
  const greens = ["the-green", "the-allotment", "rec-ground", "estate-gardens", "the-foothills", "the-beach", "port-park", "cathedral-square", "bowling-green", "the-close", "north-park", "village-green", "south-park", "market-green", "the-orchards", "the-quad", "community-farm"].map(id => B[id].rect);
  const far = [...new Set(Object.values(P).filter(p => p.kind === "home").map(p => p.building))].filter(id => id !== "lofts" && gapTo(B[id].rect, greens) > 20);
  ok(!far.length, `every home but the Archive Lofts has green within twenty cells (${far.join(", ") || "all"})`);
  // green space: every district with homes has open green ground of its own or next door
  const green = new Set(["the-green", "the-allotment", "rec-ground", "estate-gardens", "the-foothills", "the-beach"]);
  ok(SIM.BUILDINGS.some(b => b.district === "sprawl" && green.has(b.id)), "the Sprawl (most of the city's homes) has a green of its own");
}

// ---- 3. the day boundary: a day published on layout 1, read on layout 2, nobody jumps -----------------
{
  const plan = JSON.parse(readFileSync(new URL("./fixtures/layout1-plan-day300.json", import.meta.url), "utf8"));
  const roster = baseRoster();
  SIM.setRoster(roster);
  const fresh = SIM.buildPlan(plan.day);
  ok(fresh.layout === SIM.LAYOUT_VERSION && plan.layout == null, "a plan names the layout it was built on (layout 1's did not)");
  const worst = (json) => {
    SIM.clearPlans(); SIM.setPlan(json, `v-${json.layout || 1}`);
    let w = 0, eg = "", n = 0, mw = 0;
    for (const s of roster) {
      let prev = null;
      for (let m = 0; m < 24 * 60; m++) {   // the day itself: at 00:00 the next day's plan takes over (the boundary)
        const T = (plan.day - 1) * 24 + m / 60, p = SIM.whereAt(s, T);
        // (a trip to or from a place that has since moved district, PHASE 2 step 3's foundry and
        // reclamation line, is walked at whatever pace fits its published times: held apart, below)
        const moved = [p, prev].some(q => q && (SIM.MOVED_FROM[q.placeId] || SIM.MOVED_FROM[q.fromPlaceId]));
        if (prev && p.sub !== "riding" && prev.sub !== "riding") {
          const d = Math.hypot(p.x - prev.x, p.y - prev.y);
          n++;
          if (moved) { if (d > mw) mw = d; }
          else if (d > w) { w = d; eg = `${SIM.keyOf(s)} at ${(m / 60).toFixed(2)}: ${prev.placeId}${prev.sub ? "/" + prev.sub : ""} -> ${p.placeId}${p.sub ? "/" + p.sub : ""}`; }
        }
        prev = p;
      }
    }
    return { w, eg, n, mw };
  };
  const now = worst(fresh), old = worst(plan);
  // a pod moves 6 cells a machine minute; entering or leaving a room crosses at most its lot
  ok(now.w < 16, `layout 2's own day: the biggest move in a machine minute is ${now.w.toFixed(1)} cells (${now.eg})`);
  console.log(`  day boundary: layout 2's day worst ${now.w.toFixed(2)} cells a machine minute over ${now.n} samples; layout 1's published day on layout 2's ground worst ${old.w.toFixed(2)}`);
  ok(old.w <= Math.max(now.w, 12) + 1e-9, `layout 1's published day on today's ground: the biggest move in a machine minute is ${old.w.toFixed(1)} cells (${old.eg}); nobody jumps across the city`);
  ok(old.mw <= 40, `a published trip to the foundry or the reclamation line (moved to the Port) is walked fast to fit its times, never a jump (${old.mw.toFixed(1)} cells a machine minute at most)`);
  SIM.clearPlans();
}

// ---- 4. THE PIT -------------------------------------------------------------------------------------------
{
  const onFile = new Set([...FAMOUS_FIGURES.map(f => slugify(f.name)), "mike-tyson", "jack-johnson", "chuck-norris", "jackie-chan", "john-cena"]);
  ok(PIT.FIGHTERS.every(f => onFile.has(f[0])), "every fighter on the card is on file (the figures on file or the census)");
  ok(PIT.FIGHTERS.every(f => SIM.fieldsOf({ slug: f[0], name: f[1], qualifier: f[0] === "jack-johnson" ? "boxer" : null }).combat >= 5), "every fighter is found by field: combat on the record");
  let cards = 0, bad = "", rings = 0;
  const NONGRAPHIC = /^(BY UNANIMOUS DECISION|BY SPLIT DECISION|RETIRED FROM THE BOUT|BY SUBMISSION|A DRAW)$/;
  for (let day = 280; day < 280 + 7 * 20; day++) {
    const c = PIT.cardFor(day);
    if (SIM.weekdayOf(day) !== PIT.CARD_DAY) { if (c) bad ||= `a card on weekday ${SIM.weekdayOf(day)}`; continue; }
    cards++;
    if (!c || c.length !== PIT.CARD_BOUTS) { bad ||= `day ${day}: ${c?.length} bouts`; continue; }
    const who = c.flatMap(b => b.sides.map(s => s.key));
    if (new Set(who).size !== who.length) bad ||= `day ${day}: a fighter twice on one card`;
    for (const b of c) {
      if (!NONGRAPHIC.test(b.method)) bad ||= `method ${b.method}`;
      if (b.ring === "ring") { rings++; if (!b.sides.every(s => PIT.FIGHTER[s.key].disc === "boxing")) bad ||= "a non-boxer in the ring"; }
      if (JSON.stringify(PIT.cardFor(day)) !== JSON.stringify(c)) bad ||= "a card that changes";
    }
    if (!c[c.length - 1].main) bad ||= "no main event";
  }
  ok(cards === 20 && !bad, `twenty Friday cards of three bouts, non-graphic results, boxers in the ring (${rings}), the same on every call (${bad || "ok"})`);
  // the phases walk forward and the result is read once
  const b0 = PIT.cardFor([...Array(7)].map((_, i) => 290 + i).find(d => SIM.weekdayOf(d) === PIT.CARD_DAY))[0];
  const ph = []; for (let m = 0; m < 40; m++) ph.push(PIT.boutPhase(b0, (b0.day - 1) * 24 + b0.from + m / 60)?.phase || "-");
  ok(ph[0] === "walkout" && ph.includes("round") && ph.includes("decision") && ph.indexOf("decision") > ph.lastIndexOf("walkout"), `a bout walks out, fights its rounds, is decided (${[...new Set(ph)].join(" > ")})`);
  const txt = [...PIT.pitEvents(24 * 280, 24 * 300).map(e => e.text), ...[...Array(20)].flatMap((_, i) => (PIT.cardFor(280 + i) || []).map(PIT.resultLine))].join(" ");
  ok(!/\b(KNOCK|KO|KNOCKOUT|BLOOD|INJUR|HURT|WOUND|KILL|DEAD|DIED|BROKE|UNCONSCIOUS|CONCUSS)/i.test(txt), "nothing on the board or the PA is graphic");
  // grievances from the ledger: the dead fight their own; the living never fight a grievance
  const roster = [...baseRoster(), ...["mike-tyson", "john-cena", "jackie-chan"].map(slug => ({ slug, name: slug.replace(/-/g, " "), tier: "TOLERATED GENERALIST", warmth: 50, competence: 60 })),
    { slug: "jack-johnson", name: "Jack Johnson", qualifier: "boxer", baseName: "Jack Johnson", tier: "TOLERATED GENERALIST", died: "1946-06-10" }, { slug: "chuck-norris", name: "Chuck Norris", tier: "TOLERATED GENERALIST", died: "2026-01-01" }];
  const byKey = new Map(roster.map(s => [SIM.keyOf(s), s]));
  const living = roster.filter(s => !s.died).map(SIM.keyOf), dead = roster.filter(s => s.died).map(SIM.keyOf);
  const st = S.emptyState(24 * 400);
  for (const s of roster) st.names[SIM.keyOf(s)] = s.name;
  const feud = (a, b, aff) => { const pk = S.pairKey(a, b); st.buckets[S.bucketOf(pk)].pairs[pk] = [aff, 20, 24 * 399, "dive-bar", 3]; };
  // living v living, dead v dead, living v dead, a living fighter, a dead fighter, twelve of them
  const pairs = [[living[0], living[1]], [dead[0], dead[1]], [living[2], dead[2]], ["mike-tyson", living[3]], ["muhammad-ali", living[4]], ["jack-johnson", dead[3]]];
  for (let i = 0; i < 6; i++) pairs.push([living[5 + i], dead[4 + i]]);
  pairs.forEach(([a, b], i) => feud(a, b, -62 - i * 3));
  const before = new Map(pairs.map(([a, b]) => [S.pairKey(a, b), S.pairOf(st, S.pairKey(a, b))[0]]));
  const seen = new Map();
  let pub = null;
  for (let d = 400; d < 440; d++) {
    S.pitBoundary(st, byKey, d);
    for (const b of st.pit.bouts) seen.set(b.id, JSON.parse(JSON.stringify(b)));
    if (d === 402) pub = S.publish(st, 24 * 403);
  }
  const bouts = [...seen.values()];
  let broken = "";
  for (const b of bouts) for (const sd of b.sides) {
    const s = byKey.get(sd.key), fighter = sd.champ || sd.key, fs = byKey.get(fighter);
    if (!s.died && !sd.champ) broken ||= `${sd.key} (living) fights their own grievance`;
    if (sd.champ && (!fs?.died || !PIT.FIGHTER[sd.champ])) broken ||= `${sd.champ} is not a fighter on file among the dead`;
    if (!fs.died) broken ||= `${fighter} (living) fights a grievance`;
    if (sd.champ && (sd.champ === b.sides[0].key || sd.champ === b.sides[1].key)) broken ||= "a party champions the other side";
  }
  console.log(`  grievances: ${bouts.map(b => `${b.day} ${PIT.billLine(b)} => ${PIT.resultLine(b)}`).slice(0, 4).join("\n              ")}`);
  ok(bouts.length >= 6 && !broken, `${bouts.length} grievances settled: the dead in person, the living by a champion from the dead fighters on file, no living person ever fights one (${broken || "ok"})`);
  const noLivingNonFighter = [...bouts.flatMap(b => PIT.fightersOf(b).map(f => f.key)), ...[...Array(20)].flatMap((_, i) => (PIT.cardFor(280 + i) || []).flatMap(b => b.sides.map(s => s.key)))].filter(k => !byKey.get(k)?.died && !PIT.FIGHTER[k]);
  ok(!noLivingNonFighter.length, `no living non-fighter ever fights, card or grievance (${noLivingNonFighter.join(", ") || "none"})`);
  const settled = bouts.filter(b => b.moved), warmer = settled.filter(b => b.moved[1] > b.moved[0]);
  ok(settled.length === bouts.filter(b => b.day < 440).length && warmer.length === settled.length, `every bout fought moves its rivalry toward peace (${warmer.length}/${settled.length}); ${settled.filter(b => b.reconciled).length} reconciled`);
  ok(Object.values(st.pit.record).every(r => r.every(Number.isInteger)) && Object.keys(st.pit.record).length > 0, "the Pit keeps a record of wins and losses per side");
  ok([...before.keys()].every(pk => !S.pairOf(st, pk) || S.pairOf(st, pk)[0] >= before.get(pk)), "no grievance is made worse by settling it");
  // booked GRIEVANCE_LAG nights on (published before the night), at most GRIEVANCE_MAX a night, never the same pair within 14 days
  const nights = new Map(); for (const b of bouts) nights.set(b.day, (nights.get(b.day) || 0) + 1);
  ok([...nights.values()].every(n => n <= PIT.GRIEVANCE_MAX) && bouts.every(b => b.day === b.filed + PIT.GRIEVANCE_LAG), `at most ${PIT.GRIEVANCE_MAX} a night, each booked ${PIT.GRIEVANCE_LAG} days ahead`);
  // the same ledger, advanced in one pass or in chunks, books the same nights
  const st2 = S.emptyState(24 * 400);
  for (const s of roster) st2.names[SIM.keyOf(s)] = s.name;
  pairs.forEach(([a, b], i) => { const pk = S.pairKey(a, b); st2.buckets[S.bucketOf(pk)].pairs[pk] = [-62 - i * 3, 20, 24 * 399, "dive-bar", 3]; });
  for (let d = 400; d < 420; d++) S.pitBoundary(st2, byKey, d);
  const st3 = JSON.parse(JSON.stringify(st2));
  for (let d = 420; d < 440; d++) { S.pitBoundary(st2, byKey, d); S.pitBoundary(st3, byKey, d); }
  ok(JSON.stringify(st2.pit) === JSON.stringify(st.pit) && JSON.stringify(st3.pit) === JSON.stringify(st.pit), "the bookings and results are the same however the tick is chunked");
  // publish carries them for the browser; the browser's board reads them
  ok(Array.isArray(pub.pit?.bouts) && pub.pit.bouts.every(b => !("applied" in b)) && pub.pit.bouts.length > 0, `/api/social publishes the Pit's recent and coming nights (${pub.pit.bouts.length})`);
  PIT.setGrievances(pub.pit.bouts);
  const g = pub.pit.bouts.find(b => b.day >= 403);
  ok(!g || PIT.boutsOn(g.day).some(b => b.id === g.id), "a published grievance is on its night's bill");
  PIT.setGrievances([]);
  // the venue: anchors on their own ground, apart, enough of them; the ring and the octagon on the floor
  const pl = SIM.PLACES.pit.rect, as = V.VENUE_ANCHORS.pit, Fl = V.PIT.floor;
  ok(as.length >= SIM.PLACES.pit.cap && new Set(as.map(a => a.id)).size === as.length, `the Pit: ${as.length} places for ${SIM.PLACES.pit.cap}, ids unique`);
  ok(as.every(a => a.x > pl.x + 0.1 && a.x < pl.x + pl.w - 0.1 && a.y > pl.y + 0.1 && a.y < pl.y + pl.h - 0.1 && (!a.alt || (a.alt[0] > pl.x && a.alt[0] < pl.x + pl.w && a.alt[1] > pl.y && a.alt[1] < pl.y + pl.h))), "the Pit's anchors (and the sparring partners' apron spots) on its own ground");
  let close = ""; for (let i = 0; i < as.length; i++) for (let j = i + 1; j < as.length; j++) if (Math.abs(as[i].h - as[j].h) < 0.05 && Math.hypot(as[i].x - as[j].x, as[i].y - as[j].y) < 0.44) close ||= `${as[i].id}/${as[j].id}`;
  ok(!close, `the Pit: nobody stands on anybody (${close || "ok"})`);
  const R = V.PIT.ring, O = V.PIT.oct;
  ok(R.cx - R.hs > Fl.x0 && R.cx + R.hs < O.cx - O.r && O.cx + O.r < Fl.x1 && R.cy - R.hs > Fl.y0 && R.cy + R.hs < Fl.y1 && O.cy - O.r > Fl.y0 && O.cy + O.r < Fl.y1, "the ring and the octagon stand apart on the floor");
  ok(as.some(a => a.role === "staff") && SIM.JOBS.filter(j => j.place === "pit").length >= 2, "the Pit has its referees and announcer, and posts for them");
}

// ---- 5. THE TENNIS CLUB -----------------------------------------------------------------------------------
{
  const tr = SIM.PLACES.tennis.rect, as = V.VENUE_ANCHORS.tennis;
  ok(V.TENNIS.courts.length >= 2 && V.TENNIS.courts.length <= 4, `${V.TENNIS.courts.length} courts`);
  ok(V.TENNIS.courts.every(c => c.x0 >= tr.x && c.x1 <= tr.x + tr.w && c.y0 >= tr.y && c.y1 <= tr.y + tr.h && c.cx - c.hw > c.x0 && c.cx + c.hw < c.x1 && c.cy - c.hl > c.y0 && c.cy + c.hl < c.y1), "every court on the club's lot, its lines inside its surface");
  ok(V.TENNIS.courts.every((c, i) => i === 0 || c.x0 >= V.TENNIS.courts[i - 1].x1), "the courts side by side, never overlapping");
  ok(V.TENNIS.club.x0 >= V.TENNIS.fence.x1 && V.TENNIS.club.x1 <= tr.x + tr.w, "the clubhouse beside the courts, on the lot");
  ok(as.length >= SIM.PLACES.tennis.cap && as.every(a => a.x > tr.x && a.x < tr.x + tr.w && a.y > tr.y && a.y < tr.y + tr.h), `the club: ${as.length} places for ${SIM.PLACES.tennis.cap}, all on its ground`);
  let close = ""; for (let i = 0; i < as.length; i++) for (let j = i + 1; j < as.length; j++) if (Math.abs(as[i].h - as[j].h) < 0.05 && Math.hypot(as[i].x - as[j].x, as[i].y - as[j].y) < 0.44) close ||= `${as[i].id}/${as[j].id}`;
  ok(!close, `the club: nobody stands on anybody (${close || "ok"})`);
  const tennisSlugs = ["serena-williams", "venus-williams", "arthur-ashe", "john-mcenroe"];
  ok(TEN.TENNIS_ON_FILE.every(p => tennisSlugs.includes(p[0])) && tennisSlugs.every(k => SIM.fieldsOf({ slug: k, name: k }).tennis >= 5), "the club's finalists are the tennis players on file, read as tennis players");
  ok(tennisSlugs.every(k => SIM.baseLeisure({ slug: k, name: k, tier: "RETAINED SPECIALIST" }).list.sort((a, b) => b[1] - a[1])[0][0] === "tennis"), "a tennis player's first leisure pull is the club");
  let n = 0, bad = "";
  for (let day = 280; day < 308; day++) for (const f of TEN.TENNIS_FIXTURES) {
    if (!f.days.includes(SIM.weekdayOf(day))) continue;
    n++;
    const end = TEN.tennisAt((day - 1) * 24 + f.to - 1e-6);
    if (!end?.done) { bad ||= `day ${day}: the match is not finished at the whistle`; continue; }
    const setsWon = [0, 0];
    for (const [a, b] of end.sets) {
      if (!((Math.max(a, b) === 6 && Math.abs(a - b) >= 2) || (Math.max(a, b) === 7 && Math.abs(a - b) <= 2))) bad ||= `a set of ${a}-${b}`;
      setsWon[a > b ? 0 : 1]++;
    }
    if (Math.max(...setsWon) !== 2 || setsWon[end.winner] !== 2) bad ||= "best of three";
    let prev = -1;
    for (let h = f.from; h < f.to; h += 0.05) { const m = TEN.tennisAt((day - 1) * 24 + h); const g = m.sets.flat().reduce((x, y) => x + y, 0); if (g < prev) bad ||= "games come off the board"; prev = g; }
  }
  ok(n === 8 && !bad, `${n} club fixtures in four weeks, every set to six by two or seven, best of three, the board only counts up (${bad || "ok"})`);
  const ev = TEN.tennisEvents(24 * 280, 24 * 287);
  ok(ev.length === 4 && ev.every(e => e.text.length > 20), `the PA calls each fixture's start and its result (${ev.length} a week)`);
}

// ---- 6. the Dept of Planning ------------------------------------------------------------------------------
{
  const choices = ["golf", "farm", "beach-resort", "seaside-towers", "ski-resort", "mountain-lodge"];
  ok(choices.every(c => POSITIONS[c]?.length === 2) && ["BUILD", "POLICY", "RENAME", "EVENT"].every(t => BY_TYPE[t]?.length === 2), "both advocates have a position on every motion so far and every kind of act");
  const open = planningLines({ session: { id: "002", state: "open" } }, [{ type: "BUILD", title: "A bandstand" }], 0);
  const decided = planningLines({ session: { id: "001", state: "closed" }, result: { winner: "farm" } }, [], 1);
  const all = [...open, ...decided, ...PLAN_LINES.map(l => l.join(" "))];
  ok(open.length === 11 && decided.length === 3, `the lines follow the session: four choices open (${open.length} lines), the winner once decided (${decided.length})`);
  ok(all.every(l => !/["“”]/.test(l)) && all.filter(l => /MOSES|JACOBS/.test(l)).every(l => /RECONSTRUCTION/.test(l)), "never in quotation marks, always marked as the Department's reconstruction");
  ok(SIM.BUILDING["planning-office"].district === "commons" && massingOf(SIM.BUILDING["planning-office"])?.parts.length > 0, "the office stands in the Commons, beside the Assembly, with a body of its own");
}

// ---- 7. billboard sites -------------------------------------------------------------------------------------
{
  ok(BILLBOARD_SITES.length >= 8 && new Set(BILLBOARD_SITES.map(b => b.id)).size === BILLBOARD_SITES.length, `${BILLBOARD_SITES.length} sites, ids unique`);
  const kinds = new Set(BILLBOARD_SITES.map(b => b.kind));
  ok(["rooftop", "loop", "boardwalk"].every(k => kinds.has(k)) && BILLBOARD_SITES.some(b => b.district === "strip"), "rooftops, the viaduct, the boardwalk and the Strip all have sites");
  for (const b of BILLBOARD_SITES.filter(b => b.kind === "rooftop")) {
    const m = massingOf(SIM.BUILDING[b.host]), bx = billboardBox(b);
    const under = m.parts.filter(p => p.x0 < bx.x1 && bx.x0 < p.x1 && p.y0 < bx.y1 && bx.y0 < p.y1);
    ok(under.length === 1 && under[0].k === "box" && bx.x0 >= under[0].x0 && bx.x1 <= under[0].x1 && bx.y0 >= under[0].y0 && bx.y1 <= under[0].y1 && bx.h0 >= under[0].h1, `${b.id}: on ${b.host}'s roof, clear of its tanks and stair heads, above it`);
  }
  for (let r = 0; r < 4; r++) {
    const items = [...isoItems(r), ...loopPieces(r), ...linePieces(r)];
    let clash = "";
    for (const b of BILLBOARD_SITES) {
      const bx = billboardBox(b), R = rotRect({ x: bx.x0, y: bx.y0, w: bx.x1 - bx.x0, h: bx.y1 - bx.y0 }, r);
      for (const it of items) {
        if (b.kind === "rooftop" && it.id === b.host) continue;
        if (b.kind === "boardwalk" && it.id === "the-boardwalk") continue;   // it stands on the planks
        if (R.x0 < it.x1 - 1e-9 && it.x0 < R.x1 - 1e-9 && R.y0 < it.y1 - 1e-9 && it.y0 < R.y1 - 1e-9) clash ||= `${b.id} x ${it.id || it.kind}`;
      }
      for (const o of BILLBOARD_SITES) if (o !== b) { const q = billboardBox(o); if (bx.x0 < q.x1 && q.x0 < bx.x1 && bx.y0 < q.y1 && q.y0 < bx.y1) clash ||= `${b.id} x ${o.id}`; }
    }
    ok(!clash, `r=${r}: every billboard site clear of buildings, props, the viaducts and their stations (${clash || "clear"})`);
  }
}

// ---- 8. PHASE 2: the lines reach every district, a short walk from its homes --------------------------------
{
  const stops = SIM.linesOn().flatMap(l => l.stops);
  const walkTo = (p) => {
    let best = Infinity, id = null;
    for (const st of stops) {
      const pts = SIM.footpath(p.pos, st.gate, new Set([p.building]));
      let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (L < best) { best = L; id = st.id; }
    }
    return { best, id };
  };
  // the master plan's rule for a new district: no home more than a 10-cell walk from its station
  // (from the home's door: its lot's edge); the Coast and the Heights predate it, measured and held
  const LIMIT = { coast: 17, heights: 31 };
  const out = [];
  for (const p of Object.values(SIM.PLACES).filter(p => p.kind === "home" && SIM.DISTRICT[p.district].expansion)) {
    const { best, id } = walkTo(p), edge = Math.min(p.rect.w, p.rect.h) / 2;
    out.push(`${p.id} ${best.toFixed(1)}`);
    const lim = LIMIT[p.district] ?? 10 + edge;
    ok(best <= lim, `${p.id}: ${best.toFixed(1)} cells' walk to ${id} (limit ${lim.toFixed(1)})`);
  }
  console.log(`  homes to the nearest stop (cells, from the middle of the block): ${out.join(", ")}`);
  // the Alpine Line's deck over the mountain: always above the ground, level over the Summit's platform
  const A = SIM.LINE.alpine;
  let under = 0;
  for (let u = 0; u <= A.L; u += 0.25) { const c = A.centre.at(u); if (onTerrain(c.x, c.y) && A.base(u) + 1.5 - 0.16 < terrainH(c.x, c.y) + 0.6) under++; }
  ok(under === 0, `the Alpine Line's deck clears the mountain everywhere (${under} points under it)`);
  const sm = A.stops.filter(st => st.stationId === "summit");
  ok(sm.every(st => Math.abs(A.base(st.u - 4.8) - A.base(st.u + 4.8)) < 1e-9), "the Summit's platform is level");
  // a line never retimed in place: every line version at its own index, the network names its lines
  ok(SIM.LINES.every((l, i) => l.index === i) && new Set(SIM.LINES.map(l => l.id)).size === SIM.LINES.length, "every line (version) has its own id and index");
}

console.log(fails ? `check-planner: ${fails} of ${checks} FAILED` : `check-planner: ${checks} checks passed`);
process.exit(fails ? 1 : 0);
