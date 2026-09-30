// A published day plan (sim.js format 1) split the way browsers read it (scaling step 4,
// docs/CITY_SPEC.md "Sectors"): one file per SECTOR (district) and 6-machine-hour WINDOW
// listing everyone with a segment there, each with the display record the views draw them
// from; a day SUMMARY the far view draws without a per-subject loop; and the FIND index the
// search function reads. Pure given the sim: the builder (netlify/lib/plans.js) and the
// checks (scripts/check-plans.mjs) run it; browsers only read what it writes.
import * as SIM from "./sim.js";
import { roomIn, atDistrict } from "./simApi.js";
import { familyOf } from "./cityKit.js";
import { displayName } from "../figures.js";
import { REALITY_INDEX } from "../cube.js";

export const FORMAT = 2;
export const SECTORS = SIM.DISTRICTS.map(d => d.id);   // a sector is a district, in DISTRICTS order
export const STEP = 0.5, SAMPLES = 24 / STEP;             // summary samples: every 30 machine minutes

// What a browser draws a subject from: the census record less the sim's own inputs (the
// breakdown, stratum and place tendencies: a file that opens fetches its detail, see
// src/fileDetail.js), plus the job the builder assigned (cj). The figures on file ship in
// the bundle: their record is 0.
const SIM_ONLY = new Set(["breakdown", "stratum", "places"]);
export function recOf(s, onFile) {
  if (onFile) return 0;
  const out = {};
  for (const [k, v] of Object.entries(s || {})) if (!SIM_ONLY.has(k) && v != null && v !== false) out[k] = v;
  // defaults the readers restore themselves (tierOf, cubeOf, displayName)
  if (out.tier != null) out.tier = SIM.tierOf(s);
  if (out.baseName === out.name) delete out.baseName;
  if (out.judge === "UNRATIFIED") delete out.judge;
  if (out.realityIndex === REALITY_INDEX) delete out.realityIndex;
  const j = SIM.assignJob(s);
  out.cj = [j.jobId, j.rank];
  return out;
}
export const isOnFile = (s) => s && s.kind !== "citizen" && !s.referred && !s.engine;

// plan: format-1 json (already loaded into the sim with setPlan, so whereAt reads it).
// people: key -> census subject (missing keys get a bare record). -> {windows: {sector:
// [4 jsons]}, summary, find}
export function splitDay(plan, ver, people) {
  const { day } = plan, places = plan.places;
  const base = { format: FORMAT, day, ver, seed: plan.seed };
  const windows = Object.fromEntries(SECTORS.map(id => [id, Array.from({ length: SIM.WINDOWS }, (_, w) => ({ ...base, kind: "window", sector: id, window: w, places, subjects: {} }))]));
  const counts = Object.fromEntries(SECTORS.map(id => [id, new Array(SIM.WINDOWS).fill(0)]));
  const find = { ...base, kind: "find", sectors: SECTORS, subjects: [] };
  const onFileRows = {};
  const fam = { good: 0, charm: 0, harm: 0, dim: 0 };
  const recs = new Map();
  for (const [key, row] of Object.entries(plan.subjects)) {
    const s = people.get(key) || { slug: key, name: key };
    const onFile = isOnFile(s) && people.has(key);
    const rec = recOf(s, onFile);
    recs.set(key, rec);
    fam[familyOf(s).family] = (fam[familyOf(s).family] || 0) + 1;
    if (onFile) onFileRows[key] = row;
    const at = new Array(SIM.WINDOWS).fill(-1);
    for (const { w, row: wr, districts } of SIM.splitRow(places, row)) {
      for (const d of districts) {
        windows[d][w].subjects[key] = [rec, wr];
        counts[d][w]++;
        if (at[w] < 0) at[w] = SECTORS.indexOf(d);
      }
    }
    const name = rec ? displayName(rec) : displayName(s);
    find.subjects.push([key, name, s.baseName && s.baseName !== name ? s.baseName : 0, at.map(i => (i < 0 ? "-" : i.toString(36))).join(""), s.kind === "citizen" ? 1 : 0]);
  }
  const summary = { ...base, kind: "summary", places, n: plan.n, roster: plan.roster, social: plan.social, step: STEP, samples: SAMPLES, fam, sectors: counts, onFile: onFileRows, ...occupancySamples(day, Object.keys(plan.subjects)) };
  return { windows, summary, find };
}

// The census the city takes, every 30 machine minutes of the day, counted the way City.jsx
// and the views count it (atDistrict, simApi.roomIn): per district, building, place (and at
// work / at home there), walkers per district, people on each platform (and of them, those
// waiting: the header's ON PLATFORMS), riders per car and on the whole Loop.
export function occupancySamples(day, keys) {
  const people = keys.map(k => ({ slug: k }));
  const d = {}, b = {}, p = {}, pw = {}, ph = {}, wk = {}, st = {}, wt = {}, car = {}, loop = new Array(SAMPLES).fill(0);
  const inc = (m, id, k) => { (m[id] || (m[id] = new Array(SAMPLES).fill(0)))[k]++; };
  for (let k = 0; k < SAMPLES; k++) {
    const T = (day - 1) * 24 + k * STEP;
    for (const s of people) {
      const w = SIM.whereAt(s, T);
      if (w.sub === "riding") {
        loop[k]++;
        const c = car[w.trainId] || (car[w.trainId] = Array.from({ length: SAMPLES }, () => new Array(SIM.TRAIN[w.trainId].cars).fill(0)));
        c[k][w.car]++;
        continue;
      }
      inc(d, atDistrict(w), k);
      const r = roomIn(w, s);
      if (r) inc(b, r.buildingId, k);
      if (w.activity === "commute") {
        if (w.sub === "walking") inc(wk, w.atDistrictId, k);
        else { inc(st, w.stationId, k); if (w.sub === "waiting") inc(wt, w.stationId, k); }
        continue;
      }
      inc(p, w.placeId, k);
      if (w.activity === "work") inc(pw, w.placeId, k);
      else if (w.activity === "home") inc(ph, w.placeId, k);
    }
  }
  return { d, b, p, pw, ph, wk, st, wt, car, loop };
}

// The summary's count at machine time T (hours into the day, 0..24), between samples.
// next: the following day's summary (for the last half hour), or null to hold.
export function sampleAt(arr, h, nextArr = null) {
  if (!arr) return 0;
  const x = Math.max(0, h) / STEP, k = Math.min(SAMPLES - 1, Math.floor(x)), f = x - k;
  const a = arr[k], b = k + 1 < SAMPLES ? arr[k + 1] : nextArr ? nextArr[0] : a;
  return a + (b - a) * f;
}
