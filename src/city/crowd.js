// The crowds the far view draws (scaling step 4, docs/CITY_SPEC.md "Sectors"). A district
// this browser has not loaded is filled from the day's SUMMARY (planSplit.js): so many at
// each place, walking its streets, waiting on its platform, riding each car of the Loop,
// less whoever this browser does hold there. They are anonymous stand-ins (sim.js standIn*),
// shaped like the census's own entries, so every view draws them the way it draws anyone,
// as a dot. They never open a file and are never listed: they are the city's density, not
// its people. Up close, the district's window loads and the real people replace them.
// Pure, no DOM: node runs it (scripts/check-plans.mjs).
import { PLACES, DISTRICTS, TRAINS, CAR_CAP, standInAt, standInWalk, standInPlatform, standInRider, standInRiderOn, linesOn, LOOP } from "./sim.js";
// THE LINES (PHASE 2): every line's platforms in a district, and every line's trains
const LINE_STOPS = Object.fromEntries(DISTRICTS.map(d => [d.id, linesOn().filter(l => l !== LOOP).flatMap(l => l.stops.filter(st => st.districtId === d.id).map(st => st.id))]));
const LINE_TRAINS = linesOn().filter(l => l !== LOOP).flatMap(l => l.trains);
const STATION_D = new Set(DISTRICTS.filter(d => !d.expansion).map(d => d.id));   // a Loop station per Loop district
import { sampleAt, STEP, SAMPLES } from "./planSplit.js";

const FAMS = ["good", "charm", "harm", "dim"];
const PLACES_BY_D = Object.fromEntries(DISTRICTS.map(d => [d.id, Object.values(PLACES).filter(p => p.district === d.id).map(p => p.id)]));
const WALK_MAX = 40, PLATFORM_MAX = 30;
const h01 = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

// Stand-in subjects are kept by key, so a view sees the same object tick after tick.
const PEOPLE = new Map();
function standIn(key, fam, at) {
  let s = PEOPLE.get(key);
  if (!s || s.crowdFam !== fam) {
    s = { slug: key, name: key, crowd: true, crowdFam: fam, kind: "citizen", score: 680, tier: "TOLERATED GENERALIST", at };
    PEOPLE.set(key, s);
    if (PEOPLE.size > 20000) PEOPLE.delete(PEOPLE.keys().next().value);
  }
  s.at = at;
  return s;
}
const STATIC = new Map();   // key|activity -> w (a stand-in at a place never moves)
function placed(placeId, key, activity) {
  const id = `${key}|${activity}`;
  let w = STATIC.get(id);
  if (!w) { w = standInAt(placeId, key, activity); STATIC.set(id, w); }
  return w;
}
function famOf(key, mix) {
  const tot = FAMS.reduce((n, f) => n + (mix?.[f] || 0), 0);
  if (!tot) return "dim";
  let r = h01(key) * tot;
  for (const f of FAMS) if ((r -= mix[f] || 0) < 0) return f;
  return "dim";
}

// What the census holds already, counted the way the summary counts.
export function heldCounts(list) {
  const place = {}, work = {}, home = {}, walk = {}, stn = {}, car = {};
  for (const { s, w } of list) {
    if (!w || s?.crowd) continue;
    if (w.sub === "riding") { const k = `${w.trainId}|${w.car}`; car[k] = (car[k] || 0) + 1; continue; }
    if (w.activity === "commute") {
      if (w.sub === "walking") walk[w.atDistrictId] = (walk[w.atDistrictId] || 0) + 1;
      else if (w.stationId) stn[w.stationId] = (stn[w.stationId] || 0) + 1;
      continue;
    }
    place[w.placeId] = (place[w.placeId] || 0) + 1;
    if (w.activity === "work") work[w.placeId] = (work[w.placeId] || 0) + 1;
    else if (w.activity === "home") home[w.placeId] = (home[w.placeId] || 0) + 1;
  }
  return { place, work, home, walk, stn, car };
}

// -> [{s, w}] stand-ins at machine hour h of the summary's day, for every district not in
// `complete`. next: the following day's summary (the last half hour interpolates into it).
// riders: false when every district is complete (the census then holds every rider).
export function crowdAt(summary, h, complete, list, next = null) {
  if (!summary) return [];
  const held = heldCounts(list), out = [], mix = summary.fam, T = (summary.day - 1) * 24 + h;
  const at = (m, id) => Math.round(sampleAt(summary[m]?.[id], h, next?.[m]?.[id]));
  for (const d of DISTRICTS) {
    if (complete.has(d.id)) continue;
    for (const p of PLACES_BY_D[d.id]) {
      let n = Math.min(at("p", p) - (held.place[p] || 0), Math.ceil(PLACES[p].cap * 1.25));
      if (n <= 0) continue;
      let nw = Math.max(0, at("pw", p) - (held.work[p] || 0)), nh = Math.max(0, at("ph", p) - (held.home[p] || 0));
      for (let i = 0; i < n; i++) {
        const act = nw > 0 ? (nw--, "work") : nh > 0 ? (nh--, "home") : "leisure";
        const key = `~${p}~${i}`, w = placed(p, key, act);
        out.push({ s: standIn(key, famOf(key, mix), () => w), w });
      }
    }
    const nWalk = Math.min(WALK_MAX, at("wk", d.id) - (held.walk[d.id] || 0));
    for (let i = 0; i < nWalk; i++) {
      const key = `~walk~${d.id}~${i}`, w = standInWalk(d.id, i, T);
      if (!w) break;
      out.push({ s: standIn(key, famOf(key, mix), (mt) => standInWalk(d.id, i, mt)), w });
    }
    for (const sid of [...(STATION_D.has(d.id) ? [d.id] : []), ...LINE_STOPS[d.id]]) {
      const nSt = Math.min(PLATFORM_MAX, at("st", sid) - (held.stn[sid] || 0));
      for (let i = 0; i < nSt; i++) {
        const key = `~stn~${sid}~${i}`, w = standInPlatform(sid, i);
        out.push({ s: standIn(key, famOf(key, mix), () => w), w });
      }
    }
  }
  // Riders: a snapshot per car every 30 machine minutes (people board and alight at every
  // platform, so between samples the count is only a density).
  if (complete.size < DISTRICTS.length) {
    const k = Math.min(SAMPLES - 1, Math.round(h / STEP));
    TRAINS.forEach((t, ti) => {
      const cars = summary.car?.[t.id]?.[k];
      if (!cars) return;
      cars.forEach((n0, c) => {
        const n = Math.min(CAR_CAP * 2, n0 - (held.car[`${t.id}|${c}`] || 0));
        for (let i = 0; i < n; i++) {
          const key = `~ride~${t.id}~${c}~${i}`;
          out.push({ s: standIn(key, famOf(key, mix), (mt) => standInRider(ti, c, mt)), w: standInRider(ti, c, T) });
        }
      });
    });
    for (const t of LINE_TRAINS) {
      const cars = summary.car?.[t.id]?.[k];
      if (!cars) continue;
      cars.forEach((n0, c) => {
        const n = Math.min(CAR_CAP * 2, n0 - (held.car[`${t.id}|${c}`] || 0));
        for (let i = 0; i < n; i++) {
          const key = `~ride~${t.id}~${c}~${i}`;
          out.push({ s: standIn(key, famOf(key, mix), (mt) => standInRiderOn(t.id, c, mt)), w: standInRiderOn(t.id, c, T) });
        }
      });
    }
  }
  return out;
}

// The summary's counts at hour h, for the header and the directory (never capped).
export function summaryCounts(summary, h, next = null) {
  const get = (m) => Object.fromEntries(Object.entries(summary?.[m] || {}).map(([id, a]) => [id, Math.round(sampleAt(a, h, next?.[m]?.[id]))]));
  const k = Math.min(SAMPLES - 1, Math.round(h / STEP));
  const loop = summary ? Math.round(sampleAt(summary.loop, h, next?.loop)) : 0;
  const riders = {};
  for (const t of [...TRAINS, ...LINE_TRAINS]) { const a = summary?.car?.[t.id]?.[k]; if (a) riders[t.id] = a.reduce((x, y) => x + y, 0); }
  return { districts: get("d"), buildings: get("b"), stations: get("st"), waiting: get("wt"), loop, riders };
}
