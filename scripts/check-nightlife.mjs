// THE NIGHTLIFE QUARTERS (docs/CITY_SPEC.md "THE NIGHTLIFE QUARTERS"): UPTOWN and DOWNTOWN, their
// venues, hours, the rope, the lineups, the patrons by tier, the ground they stand on.
// Holds: the venue types (and no adult venue, ever: the site is 16+); opening hours, kept by every
// visit; the tier skew of the patrons; the lineups (deterministic, nobody double-booked, performers
// working their sets); no overlaps at four quarter turns; capacity within limits at the peak; every
// door a walk from a Loop station; the mood factor bounded; the prefects' night pressure; the PA.
// Usage: node scripts/check-nightlife.mjs
import assert from "node:assert/strict";

const SIM = await import("../src/city/sim.js");
const N = await import("../src/city/nightlifeSim.js");
const NL = await import("../src/city/nightlife.js");
const PF = await import("../src/city/prefects.js");
const AG = await import("../src/city/archGeo.js");
const PR = await import("../src/city/props.js");
const { synthRoster } = await import("./synth-roster.mjs");

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("  FAIL", msg); } };
const section = (s) => console.log(`\n== ${s}`);

// ---- 1. the venues: what they are, and what they are never --------------------------------------------
section("venues");
const types = N.NIGHT_PLACES.map(p => p[6]);
ok(types.every(t => N.VENUE_TYPES.includes(t)), "every venue is one of the listed types");
const words = [...N.NIGHT_PLACES.flatMap(p => [p[0], p[4], ...p[5], p[6]]), ...N.NIGHT_BUILDINGS.flatMap(b => [b[0], b[1], ...b[3].map(f => f[1])]), ...N.NIGHT_JOBS.flatMap(j => [j[0], j[1], ...j[3]]), ...N.VENUE_TYPES];
ok(words.every(w => !N.FORBIDDEN_TYPES.test(w)), "no adult venue: no strip club or anything like one, by name, type, tendency, room or job (16+)");
for (const bad of ["strip club", "gentlemen's club", "exotic dancers", "burlesque", "peep show", "adult lounge"]) ok(N.FORBIDDEN_TYPES.test(bad), `the refusal catches "${bad}"`);
const count = (d, t) => N.NIGHT_PLACES.filter(p => p[1] === d && p[6] === t).length;
ok(count("uptown", "nightclub") >= 1 && ["rooftop-lounge", "steakhouse", "sushi-counter", "cocktail-bar", "jazz-supper-club"].every(t => count("uptown", t) === 1), "uptown: the nightclub (and its mezzanine), a rooftop lounge, a steakhouse, a sushi counter, a cocktail bar, a jazz supper club");
ok(count("downtown", "dance-club") === 2 && count("downtown", "liquor-store") === 2 && ["hip-hop-club", "punk-basement", "karaoke", "pool-hall", "comedy-club", "late-night-food"].every(t => count("downtown", t) === 1), "downtown: two dance clubs, hip-hop, a punk basement, karaoke, a pool hall, comedy, late-night food, two liquor stores");
ok(N.NIGHT_PLACE_IDS.every(id => SIM.PLACES[id] && SIM.PLACES[id].building && (SIM.PLACES[id].kind === "mixed" || SIM.PLACES[id].kind === "leisure")), "every venue is a place in a building, open to visitors");
ok(SIM.DISTRICT.uptown?.expansion && SIM.DISTRICT.downtown?.expansion && SIM.DISTRICTS.slice(-2).map(d => d.id).join() === "uptown,downtown", "UPTOWN and DOWNTOWN appended after every other district (a sector is a district, in order)");
ok(SIM.JOBS.filter(j => j.district === "uptown").length >= 5 && SIM.JOBS.filter(j => j.district === "downtown").length >= 8, "staff for both quarters");

// ---- 2. the ground: inside their districts, clear of everything, a walk from the Loop -------------------
section("ground");
const over = (a, b) => a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.y0 < b.y1 - 1e-9 && b.y0 < a.y1 - 1e-9;
const rr = (r) => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h });
for (const d of [SIM.DISTRICT.uptown, SIM.DISTRICT.downtown]) {
  for (const e of SIM.DISTRICTS) if (e !== d) ok(!over(rr(d.rect), rr(e.rect)), `${d.id} and ${e.id} do not overlap`);
  for (const b of SIM.BUILDINGS.filter(x => x.district === d.id)) {
    const r = d.rect;
    ok(b.rect.x >= r.x && b.rect.y >= r.y && b.rect.x + b.rect.w <= r.x + r.w + 1e-9 && b.rect.y + b.rect.h <= r.y + r.h + 1e-9, `${b.id} inside ${d.id}`);
    for (const o of SIM.BUILDINGS) if (o !== b) ok(!over(rr(b.rect), rr(o.rect)), `${b.id} clear of ${o.id}`);
  }
}
// at all four quarter turns, every body and yard prop of a venue stands clear of every other item
const mine = new Set(N.NIGHT_BUILDINGS.map(b => b[0]));
let overlaps = 0;
for (let r = 0; r < 4; r++) {
  const items = AG.isoItems(r);
  const ours = items.filter(it => mine.has(it.b.id)), rest = items.filter(it => !mine.has(it.b.id));
  for (const a of ours) for (const b of rest) if (over(a, b)) { overlaps++; if (overlaps < 6) console.log(`  overlap r${r}: ${a.id} x ${b.id}`); }
  for (let i = 0; i < ours.length; i++) for (let j = i + 1; j < ours.length; j++) if (ours[i].b.id !== ours[j].b.id && over(ours[i], ours[j])) { overlaps++; if (overlaps < 6) console.log(`  overlap r${r}: ${ours[i].id} x ${ours[j].id}`); }
}
ok(overlaps === 0, `no overlaps at the four quarter turns (${overlaps})`);
// the Loop's stations within reach on foot (sim ACCESS_R, 32 cells): every corner of every venue
const gates = Object.values(SIM.STOPS).filter(s => s.lineId === "loop").map(s => s.gate);
let far = 0;
for (const id of N.NIGHT_PLACE_IDS) {
  const r = SIM.PLACES[id].rect;
  for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) if (Math.min(...gates.map(g => Math.hypot(g.x - x, g.y - y))) > 32) far++;
}
ok(far === 0, `every venue within 32 cells of a Loop station's gate (${far} corners beyond)`);
ok(SIM.BUILDINGS.filter(b => mine.has(b.id)).every(b => AG.STYLES[b.arch] && b.arch !== "lot"), "every venue has its own architecture");
ok(new Set(SIM.BUILDINGS.filter(b => mine.has(b.id)).map(b => b.arch)).size >= 14, "distinct architecture per venue (marble and glass uptown, brick downtown)");
ok(N.NIGHT_PLACE_IDS.every(id => PR.typeOf(id) !== "office"), "every venue furnished as itself (bars, booths, dance floors, stages, pool tables, karaoke screens)");

// ---- 3. hours ----------------------------------------------------------------------------------------
section("hours");
ok(["aurum", "voltage", "strobe", "cypher"].every(id => N.openAt(id, 22.5) && N.openAt(id, 1.5) && !N.openAt(id, 12) && !N.openAt(id, 21.5)), "the clubs open at 22:00 and run past midnight; shut by day");
ok(!N.openAt("aurum", 3.5) && N.openAt("voltage", 3.5) && !N.openAt("voltage", 4.5), "uptown's rope closes at 03:00, downtown's clubs at 04:00");
ok(N.openAt("the-coop", 12) && N.openAt("the-coop", 4) && N.openAt("liquor-24", 1.5) && !N.openAt("liquor-24", 3), "the chicken never shuts; the liquor stores run to 02:00");
ok(N.openThrough("aurum", 23, 26.5) && !N.openThrough("aurum", 23, 27.5) && !N.openThrough("the-cut", 22, 24) && N.closeFor("voltage", 23) === 28 && N.closeFor("voltage", 25) === 28, "a stay is open through, and closes at, the venue's hour");

const roster = synthRoster(725);
SIM.setRoster(roster);
const D0 = 302;   // machine day 302 (Monday) .. 308 (Sunday)
const band = (s) => { const t = Math.max(0, SIM.TIER_ORDER.indexOf(SIM.tierOf(s))); return t <= 1 ? 0 : t <= 3 ? 1 : 2; };
const segsOf = new Map();   // key -> [[day, segs]]
const t0 = Date.now();
const visits = [];   // {pid, b, from, to, day, key}
const load = new Map();   // `${pid}|${day}|${halfhour 0..59}` -> n
let hourBad = 0, hourN = 0, worstEarly = 0, worstLate = 0;
for (const s of roster) {
  const key = SIM.keyOf(s), b = band(s);
  for (let day = D0; day < D0 + 7; day++) {
    const sch = SIM.schedule(s, day), next = SIM.schedule(s, day + 1);
    // the day's own stays, joined to the tail they carry into the next morning
    for (const g of sch) {
      if (!N.NIGHT_SET.has(g.placeId) || g.activity === "commute") continue;
      let to = g.to;
      if (to >= 24 - 1e-9) { const tail = next.find(x => x.from < 1e-9 && x.placeId === g.placeId && x.activity === g.activity); if (tail) to = 24 + tail.to; }
      if (g.activity === "leisure") {
        visits.push({ pid: g.placeId, b, from: g.from, to, day, key });
        hourN++;
        if (!N.openThrough(g.placeId, g.from + 0.05, to - 0.05)) { hourBad++; if (hourBad < 5) console.log(`  out of hours: ${key} at ${g.placeId} ${g.from.toFixed(2)}-${to.toFixed(2)} (day ${day})`); }
        const o = N.HOURS[g.placeId];
        if (o && o[1] - o[0] < 24) {
          const x = g.from % 24, start = x >= o[0] ? x : x + 24;
          worstEarly = Math.max(worstEarly, o[0] - start);
          worstLate = Math.max(worstLate, to - (g.from - x + (x >= o[0] || x + 24 >= o[1] ? 0 : 0)) - o[1]);
        }
      }
      for (let k = Math.ceil(g.from * 2); k < to * 2 && k < 60; k++) { const id = `${g.placeId}|${day}|${k}`; load.set(id, (load.get(id) || 0) + 1); }
    }
  }
}
ok(hourBad === 0, `every visit lies within its venue's hours (${hourBad} of ${hourN} outside)`);
const lateLeaves = visits.filter(v => ["voltage", "strobe", "cypher", "basement"].includes(v.pid) && v.to >= 27 && v.to <= 28.01).length;
const fridayClubs = visits.filter(v => SIM.weekdayOf(v.day) === 5 && N.DOWNTOWN_VENUES.includes(v.pid)).length, mondayClubs = visits.filter(v => SIM.weekdayOf(v.day) === 1 && N.DOWNTOWN_VENUES.includes(v.pid)).length;
ok(lateLeaves >= 10, `closing time: the crowd spills out of downtown at 04:00 (${lateLeaves} leave in the last hour)`);
ok(fridayClubs > mondayClubs * 1.5, `Friday is busier than Monday downtown (${fridayClubs} v ${mondayClubs})`);
console.log(`  ${visits.length} visits in a week at 725 (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

// ---- 4. who goes: the tier skew -----------------------------------------------------------------------
section("tier skew");
const share = (ids) => { const v = visits.filter(x => ids.includes(x.pid)), n = v.length || 1; return { n: v.length, b: [0, 1, 2].map(k => v.filter(x => x.b === k).length / n) }; };
const census = [0, 1, 2].map(k => roster.filter(s => band(s) === k).length / roster.length);
const up = share(N.UPTOWN_VENUES), down = share(N.DOWNTOWN_VENUES);
const fmt = (a) => a.map(x => `${Math.round(x * 100)}%`).join(" / ");
console.log(`  census bands (top / middle / lowest): ${fmt(census)}`);
console.log(`  uptown patrons:   ${fmt(up.b)} of ${up.n}`);
console.log(`  downtown patrons: ${fmt(down.b)} of ${down.n}`);
ok(up.b[0] >= census[0] * 2 && up.b[0] >= 0.5 && up.b[0] >= down.b[0] * 4, "uptown skews to the top tiers (twice their share of the census, four times downtown's)");
ok(up.b[2] < census[2] * 0.25, "the lowest tiers are scarcely seen uptown");
ok(down.b[1] + down.b[2] >= 0.8 && down.b[0] < census[0] * 1.5, "downtown skews to the lower and middle tiers");
ok(down.n > up.n, `downtown is busier (${down.n} v ${up.n} visits)`);
ok(visits.filter(v => v.pid === "aurum-vip").every(v => v.b === 0), "the mezzanine: the top band only");
ok(visits.filter(v => v.pid === "aurum" && v.b === 2).length === 0 || visits.filter(v => v.pid === "aurum" && v.b === 2).every(v => v.from < 22), "AURUM's rope turns the lowest tiers away at night");
let rope = { ADMIT: 0, WAIT: 0, REFUSED: 0 };
for (const s of roster) rope[SIM.ropeOf(s, 306)]++;
console.log(`  the rope on a Friday: ${rope.ADMIT} walk in, ${rope.WAIT} wait and are let in, ${rope.REFUSED} turned away`);
ok(roster.filter(s => band(s) === 0).every(s => SIM.ropeOf(s, 306) === "ADMIT") && roster.filter(s => band(s) === 2).every(s => SIM.ropeOf(s, 306) === "REFUSED"), "the rope: the top band walks in, the lowest never does");

// ---- 5. capacity --------------------------------------------------------------------------------------
section("capacity");
let worst = { r: 0 };
for (const [id, n] of load) { const pid = id.split("|")[0], r = n / SIM.PLACES[pid].cap; if (r > worst.r) worst = { r, id, n }; }
console.log(`  busiest venue half hour: ${worst.id} ${worst.n} (${Math.round(worst.r * 100)}% of capacity)`);
ok(worst.r <= 1.25, "no venue over capacity at its peak (staff and performers included, within a quarter)");
const peak = (pid, wd) => Math.max(0, ...[...load].filter(([k]) => k.startsWith(`${pid}|`) && SIM.weekdayOf(+k.split("|")[1]) === wd).map(([, n]) => n));
console.log(`  Saturday peaks: ${N.NIGHT_PLACE_IDS.map(p => `${p} ${peak(p, 6)}/${SIM.PLACES[p].cap}`).join(", ")}`);
ok(N.NIGHT_PLACE_IDS.filter(p => peak(p, 6) > 0).length >= N.NIGHT_PLACE_IDS.length - 2, "nearly every venue busy on a Saturday");

// ---- 6. the lineups -------------------------------------------------------------------------------------
section("lineups");
const again = await import(`../src/city/nightlifeSim.js?fresh=${Date.now()}`);
let same = true, dbl = 0, served = new Set();
for (let day = 280; day < 340; day++) {
  const a = N.lineupFor(day), b = again.lineupFor(day);
  if (JSON.stringify(a) !== JSON.stringify(b)) same = false;
  const slugs = a.map(g => g.slug);
  if (new Set(slugs).size !== slugs.length) dbl++;
  for (const g of a) served.add(g.slug);
  for (const g of a) ok(N.NIGHT_SET.has(g.venue) && g.from < g.to && N.openThrough(g.venue, g.from - 0.4, g.to), `day ${day}: ${g.name} at ${g.venue} inside its hours`);
}
ok(same, "lineups are a pure function of the machine day (a fresh copy of the module books the same)");
ok(dbl === 0, "nobody plays two rooms in one night");
ok(N.PERFORMERS.every(([slug]) => served.has(slug)), `every performer on file gets a booking within 60 nights (${served.size}/${N.PERFORMERS.length})`);
console.log(`  night 306: ${N.lineupFor(306).map(g => `${g.name} ${g.word} at ${g.venue} ${g.from}`).join("; ")}`);
// a booked performer on the census works the set
const onRoster = new Set(roster.map(s => SIM.keyOf(s)));
let gigs = 0, worked = 0;
for (let day = D0; day < D0 + 7; day++) for (const g of N.lineupFor(day)) {
  if (!onRoster.has(g.slug)) continue;
  gigs++;
  const s = roster.find(x => SIM.keyOf(x) === g.slug), mid = (g.from + g.to) / 2;
  const sch = mid < 24 ? SIM.schedule(s, day) : SIM.schedule(s, day + 1), h = mid < 24 ? mid : mid - 24;
  if (sch.some(x => x.placeId === g.venue && x.activity === "work" && x.from <= h && x.to > h)) worked++;
  else console.log(`  not at the set: ${g.slug} ${g.venue} day ${day} ${g.from}-${g.to}: ${sch.map(x => `${x.placeId}:${x.activity}:${x.from.toFixed(2)}-${x.to.toFixed(2)}`).join(" ")}`);
}
ok(gigs > 0 && worked === gigs, `every booked performer on the census works the set (${worked}/${gigs})`);

// ---- 7. the civic fold and the prefects ------------------------------------------------------------------
section("civic and prefects");
for (const id of ["uptown", "downtown", "sprawl", "archive", "finance"]) for (const fake of [0, 0.3, 0.7, 1.2]) {
  const l = new Map(N.NIGHT_PLACE_IDS.map(p => [p, Array.from({ length: 48 }, () => Math.round(SIM.PLACES[p].cap * fake))]));
  const v = NL.nightlifeMood(id, l);
  ok(v >= NL.NIGHT_MOOD_MIN && v <= NL.NIGHT_MOOD_MAX && Number.isInteger(v), `nightlife factor bounded (${id} at ${fake}: ${v})`);
}
ok(NL.nightlifeMood("finance", new Map()) === 0 && NL.nightlifeMood("uptown", null) === 0, "no nightlife, no factor");
const dirs = (id, wds) => { const out = {}; for (let day = 300; day < 600; day++) if (wds.includes(SIM.weekdayOf(day))) { const d = PF.chooseDirective(id, day, 0, null).directive; out[d] = (out[d] || 0) + 1; } return out; };
const dw = dirs("downtown", [5, 6]), up2 = dirs("uptown", [1, 2, 3, 4, 5, 6, 7]);
const frac = (o, ks) => ks.reduce((n, k) => n + (o[k] || 0), 0) / Object.values(o).reduce((a, b) => a + b, 0);
console.log(`  downtown, Fridays and Saturdays: ${JSON.stringify(dw)}; uptown: ${JSON.stringify(up2)}`);
ok(frac(dw, ["curfew", "inspections"]) >= 0.8, "downtown's prefect reaches for curfews and inspections first (the big nights)");
ok(frac(up2, ["permits", "decree"]) >= 0.8, "uptown's prefect is lenient on capital");
ok(PF.PREFECT.uptown && PF.PREFECT.downtown, "both quarters have their prefect");

// ---- 8. the PA ---------------------------------------------------------------------------------------
section("the PA");
const pa = NL.nightPa((306 - 1) * 24 + 20);
ok(pa.some(l => l.startsWith("TONIGHT AT ")), `the PA announces the night's bill (${pa[0]})`);
ok(NL.nightPa((306 - 1) * 24 + 27.7, "downtown").some(l => /CLOSING TIME/.test(l)), "closing time downtown, called");
ok(NL.nightPa((306 - 1) * 24 + 12, "sprawl").length === 0, "nothing on the nightlife PA in other districts' pages, or by day");
ok(NL.nightLine("aurum", (306 - 1) * 24 + 23.5, 12)?.includes("OPEN 22:00-03:00"), "the label: hours and the bill");

console.log(`\ncheck-nightlife: ${checks - fails}/${checks} ${fails ? `${fails} FAILED` : "ALL PASS"}`);
assert.equal(fails, 0);
