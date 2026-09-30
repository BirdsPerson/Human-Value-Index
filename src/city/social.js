// Emergent relationships in the Substrate. Pure, no DOM, no LLM: runs in the
// social tick's background function (netlify/lib/social-tick.js), in scripts/ and in
// node checks.
//
// Nothing is scripted. Subjects who are in the same place in the same machine hour may
// interact; each interaction nudges the pair's affinity by their compatibility (value
// lenses) plus seeded chance. Affinity decays slowly. Friends' haunts then pull a
// subject's leisure choices (sim.js setSocialSnapshots), so friends meet more, and
// cliques and regular hangouts form on their own. Rivals steer away from each other.
//
// Determinism: the state after processing hour H depends only on the state before it,
// the roster and the seed, so advancing in one run or in many chunks gives the same
// city. Snapshot for day D is taken from the state at the end of day D - LAG, so it is
// published well before day D begins and never changes after.

import * as SIM from "./sim.js";

export const LAG = 4;                 // machine days between a state and the snapshot it produces
export const DECAY = 0.985;           // affinity kept per machine day
// Bounded per subject, not globally (scaling step 6): at each day boundary every subject
// ranks its pairs by |affinity| + RECENT_W x this week's meetings and keeps its best K; a
// pair survives only if BOTH sides keep it, so nobody holds more than K after a boundary
// (between boundaries, at most one machine day of new pairs over). The city's size no
// longer dilutes anyone's friendships: the old global cap of 6,000 pairs left 2 friendships
// at 5,000 subjects and none at 20,000.
export const K = 24;
export const RECENT_W = 2;            // a meeting this week counts as 2 points of affinity in the ranking
export const WEEK = 24 * 7;
export const MAX_EVENTS = 200;        // the merged log the one-blob (v1) copy keeps
export const BUCKET_EVENTS = 24;      // events kept per bucket (64 x 24 city-wide)
export const KEEP_SNAPSHOTS = 8;
export const T = {                    // thresholds (affinity is -100..100)
  acquaintance: 10, friends: 30, close: 60, rivals: -30, nemesis: -60,
};

// ---- small deterministic helpers ------------------------------------------------------
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function rng(str) {
  let a = fnv(str) || 1;
  return () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; };
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const dayOfHour = (h) => Math.floor(h / 24) + 1;   // sim.js days are 1-based

// ---- compatibility (the value lenses) ---------------------------------------------------
const DIMS = ["care", "alignment", "utility", "adaptability", "legacy", "network", "physical", "threat", "redundancy"];
function warmthOf(s) {
  if (typeof s?.warmth === "number") return s.warmth;
  const b = s?.breakdown;
  if (b && typeof b.care === "number") return (b.care * 0.6 + (b.alignment ?? b.care) * 0.4);
  return 55;
}
function competenceOf(s) {
  if (typeof s?.competence === "number") return s.competence;
  const b = s?.breakdown;
  if (b && typeof b.utility === "number") return (b.utility + (b.adaptability ?? b.utility) + (b.legacy ?? b.utility)) / 3;
  return 55;
}
const gated = (s) => String(s?.tier || "").startsWith("SOYLENT");

// -1..1. Similar people drift together; the cold, the threatening and the gated rub
// most people the wrong way; opposites that complete each other (warm x capable) click.
export function compat(a, b) {
  let sim = 0, n = 0;
  const ba = a?.kind === "citizen" ? null : a?.breakdown, bb = b?.kind === "citizen" ? null : b?.breakdown;
  if (ba && bb) for (const d of DIMS) {
    if (typeof ba[d] === "number" && typeof bb[d] === "number") { sim += 1 - Math.abs(ba[d] - bb[d]) / 50; n++; }
  }
  if (!n) {   // citizens and thin files: judged on the two public axes only
    sim = 1 - (Math.abs(warmthOf(a) - warmthOf(b)) + Math.abs(competenceOf(a) - competenceOf(b))) / 80; n = 1;
  }
  let c = 0.5 * clamp(sim / n, -1, 1);
  const fa = SIM.fieldsOf(a), fb = SIM.fieldsOf(b);
  if (Object.keys(fa).some(f => fb[f])) c += 0.3;
  const wa = warmthOf(a), wb = warmthOf(b), ca = competenceOf(a), cb = competenceOf(b);
  if (wa >= 60 && wb >= 60) c += 0.2;
  if (wa < 35 || wb < 35) c -= 0.3;
  const ta = ba?.threat ?? 0, tb = bb?.threat ?? 0;
  if (ta >= 70 || tb >= 70) c -= 0.35;
  if ((wa >= 65 && cb >= 70) || (wb >= 65 && ca >= 70)) c += 0.12;
  if (gated(a) !== gated(b)) c -= 0.3;
  return clamp(c, -1, 1);
}

// ---- state ----------------------------------------------------------------------------
// {v: 2, seed, hour (next hour to process), names: {key: display} (rebuilt from the census
//  every advance; never stored), snapshots: {day: {ver, boosts}},
//  buckets: [BUCKETS x {pairs: {"a|b": [aff, meetings, lastHour, lastPlace, recent, lastEvent?]},
//                        events: [...]}]}
// A pair lives in bucket bucketOf("a|b"); so do its events. Everything that changes a pair
// reads only that pair's record, so each bucket folds on its own (scaling step 6, docs/
// CITY_SPEC.md "Relations"); only the day boundary (decay, the per-subject bound, the
// snapshot) looks across buckets. v1 (one `pairs` map and one event log) converts with fromV1.
export const BUCKETS = 64;
export const bucketOf = (pk) => fnv(`rel|${pk}`) % BUCKETS;
export function emptyState(startHour, seed = SIM.SEED) {
  return { v: 2, seed, hour: Math.floor(startHour), names: {}, snapshots: {}, buckets: Array.from({ length: BUCKETS }, () => ({ pairs: {}, events: [] })) };
}
export const pairOf = (state, pk) => state.buckets[bucketOf(pk)].pairs[pk];
// Every pair, bucket by bucket: [[pk, rec], ...]
export function allPairs(state) {
  const out = [];
  for (const b of state.buckets) for (const e of Object.entries(b.pairs)) out.push(e);
  return out;
}
export const pairCount = (state) => state.buckets.reduce((n, b) => n + Object.keys(b.pairs).length, 0);
// Events in canonical order (machine hour, place, pair): the order every bucket folds in.
const evCmp = (x, y) => x.h - y.h || cmpStr(x.placeId || "", y.placeId || "") || cmpStr(`${x.a}|${x.b}`, `${y.a}|${y.b}`);
const cmpStr = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
export function allEvents(state) {
  return state.buckets.flatMap(b => b.events).sort(evCmp);
}

// The one-blob ledger (v1: {pairs, events, ...}) as buckets: every record kept as it is
// (affinity, meetings, last hour and place, this week's meetings), each event filed with its
// pair, and the hour of the pair's latest event noted on the pair ("again" reads it).
export function fromV1(v1) {
  if (!v1 || v1.v === 2) return v1;
  const st = emptyState(v1.hour, v1.seed);
  for (const k of ["snapshots", "rosters", "plans", "tick"]) if (v1[k]) st[k] = v1[k];
  st.names = { ...(v1.names || {}) };
  const lastEv = new Map();
  for (const e of v1.events || []) { const pk = pairKey(e.a, e.b); lastEv.set(pk, Math.max(lastEv.get(pk) ?? -Infinity, e.h)); }
  for (const [pk, rec] of Object.entries(v1.pairs || {})) {
    const r = rec.slice(0, 5);
    if (lastEv.has(pk)) r[5] = lastEv.get(pk);
    st.buckets[bucketOf(pk)].pairs[pk] = r;
  }
  for (const e of v1.events || []) {
    const b = st.buckets[bucketOf(pairKey(e.a, e.b))];
    b.events.push(e);
    if (b.events.length > BUCKET_EVENTS) b.events.shift();
  }
  return st;
}
// And back, for the rollback copy (the one-blob `state` the previous tick reads).
export function toV1(st) {
  const pairs = {};
  for (const [pk, rec] of allPairs(st).sort((x, y) => cmpStr(x[0], y[0]))) pairs[pk] = rec;
  const out = { v: 1, seed: st.seed, hour: st.hour, pairs, names: st.names || {}, events: allEvents(st).slice(-MAX_EVENTS), snapshots: st.snapshots || {} };
  for (const k of ["rosters", "plans", "tick"]) if (st[k]) out[k] = st[k];
  return out;
}

const displayName = (s) => (s?.qualifier && s?.baseName ? `${s.baseName} (${s.qualifier})` : s?.name || SIM.keyOf(s));
export const ENCOUNTER_BASE = { leisure: 0.6, mixed: 0.45, work: 0.25 };

function levelOf(aff) {
  if (aff >= T.close) return "close";
  if (aff >= T.friends) return "friends";
  if (aff >= T.acquaintance) return "acquaintance";
  if (aff <= T.nemesis) return "nemesis";
  if (aff <= T.rivals) return "rivals";
  return "neutral";
}
const RANK = { nemesis: -2, rivals: -1, neutral: 0, acquaintance: 0.5, friends: 1, close: 2 };

// ---- narration (templates only; actions, never words, for everyone) ----------------------
const PLACE = (id) => SIM.PLACES[id]?.name || String(id || "").toUpperCase();
const LINES = {
  friends: ["{A} AND {B} KEEP ENDING UP AT {P}. THE DEPARTMENT HAS FILED THIS AS A FRIENDSHIP.",
    "{A} AND {B} HAVE BEEN SEEN TOGETHER AT {P} ENOUGH TIMES TO MAKE IT OFFICIAL. NOTED."],
  close: ["{A} AND {B} ARE NOW INSEPARABLE. THE DEPARTMENT IS TAKING NOTES.",
    "{A} AND {B} HAVE FORMED A BOND. IT HAS BEEN LOGGED. BONDS ALWAYS ARE."],
  again: ["{A} AND {B} SHARED A TABLE AT {P}. AGAIN. THE DEPARTMENT IS TAKING NOTES.",
    "{A} AND {B}, {P}, SAME AS LAST TIME. PATTERNS ARE WHAT THE DEPARTMENT DOES BEST."],
  againWork: ["{A} AND {B} WORKED THE SAME SHIFT AT {P}. AGAIN. PRODUCTIVITY IS UNDER REVIEW.",
    "{A} AND {B} WERE ROSTERED TOGETHER AT {P} ONCE MORE. NOBODY REQUESTED THIS. THEY SEEM TO MANAGE."],
  rivals: ["{A} AND {B} CROSSED PATHS AT {P}. IT DID NOT GO WELL. A RIVALRY HAS BEEN OPENED.",
    "{A} AND {B} NOW AVOID EACH OTHER. THE DEPARTMENT HAS NOTICED WHO LEAVES FIRST."],
  nemesis: ["{A} AND {B} ARE NOW NEMESES. THE DEPARTMENT RECOMMENDS SEPARATE FLOORS.",
    "RELATIONS BETWEEN {A} AND {B} HAVE COLLAPSED ENTIRELY. BOTH FILES UPDATED."],
  fallout: ["{A} AND {B} HAVE DRIFTED APART. THE FRIENDSHIP FILE IS CLOSED. IT WAS NEVER SEALED."],
  reconcile: ["{A} AND {B} HAVE RECONCILED. THE DEPARTMENT DID NOT SEE THAT COMING. IT RARELY ADMITS THIS."],
};
function line(kind, a, b, placeId, r) {
  const opts = LINES[kind];
  return opts[Math.floor(r() * opts.length)].replace("{A}", a.toUpperCase()).replace("{B}", b.toUpperCase()).replace("{P}", PLACE(placeId));
}
export const TEMPLATE_LINES = LINES;   // checks read these

// ---- ties from the record ---------------------------------------------------------------
// People who knew each other before the Substrate start from where the record leaves them,
// then the sim takes over (Scott 2026-09-29). Hand-curated for ties Wikidata doesn't hold;
// the community pass adds Wikidata relations (spouse, sibling, bandmates) on the same path.
// [slugA, slugB, starting affinity, the record, in the Overlord's words]
export const KNOWN_TIES = [
  ["samuel-beckett", "andre-the-giant", 45, "A TRUCK, A SCHOOL RUN, A BOY TOO LARGE FOR THE BUS, AND CRICKET"],
];
// Seeds a tie once, when both files are present and the pair has no history; idempotent,
// so any chunking of the tick gives the same city.
export function seedTies(state, live, ties = KNOWN_TIES) {
  for (const [a, b, aff, why] of ties) {
    if (!live.has(a) || !live.has(b)) continue;
    const pk = pairKey(a, b), bucket = state.buckets[bucketOf(pk)];
    if (bucket.pairs[pk]) continue;
    const rec = bucket.pairs[pk] = [aff, 0, state.hour, null, 0];
    const [ka, kb] = a < b ? [a, b] : [b, a];
    pushEvent(bucket, rec, { h: state.hour, kind: "record", a: ka, b: kb, placeId: null,
      text: `${(state.names[a] || a).toUpperCase()} AND ${(state.names[b] || b).toUpperCase()}: KNOWN TO EACH OTHER BEFORE INTAKE. ${why}. THE DEPARTMENT HAS RESTORED THE LINK.` });
  }
  return state;
}

// ---- presence: who is where, each machine hour ----------------------------------------------
// Two subjects can meet in machine hour h if both are at the same work or leisure place at
// h + 0.5 (whereAt's answer at the half hour). A presence source fills out: Map "h|place" ->
// [keys] for hours [h0, h1) of machine day `day`. Sources differ only in where the segments
// come from; the fold never knows which one ran.
const ENC_KINDS = ENCOUNTER_BASE;
function addSegs(out, key, segs, d0, h0, h1, district) {
  for (const g of segs) {
    if (g.activity !== "work" && g.activity !== "leisure") continue;
    const pl = SIM.PLACES[g.placeId];
    if (!pl || !ENC_KINDS[pl.kind] || (district && pl.district !== district)) continue;
    // the hours h with g.from <= h - d0 + 0.5 < g.to
    const a = Math.max(h0, d0 + Math.ceil(g.from - 0.5)), b = Math.min(h1, d0 + Math.ceil(g.to - 0.5));
    for (let h = a; h < b; h++) {
      const k = `${h}|${g.placeId}`, l = out.get(k);
      if (l) l.push(key); else out.set(k, [key]);
    }
  }
}
// The sim's own schedule (a loaded plan when there is one): the default, and the fallback.
export function simPresence(day, h0, h1, people, out = new Map(), seed = SIM.SEED) {
  const d0 = (day - 1) * 24;
  for (const s of people) addSegs(out, SIM.keyOf(s), SIM.schedule(s, day, seed), d0, h0, h1, null);
  return out;
}
// Per SECTOR, from one day's window files (netlify/lib/plans.js format 2): each file lists
// everyone with a segment in its district during the window, with their window row; a file
// emits only the hours they spend at a place in its own district, so every (hour, place) is
// emitted by exactly one file. Census subjects no file lists (indexed after the plan was
// built) are placed as the plan would place them (sim.js schedule: raw, no allocation).
// win: {day, w, ver, places, files: [{sector, subjects: {key: [rec, windowRow]}}]}
export function sectorPresence(win) {
  return (day, h0, h1, people, out = new Map(), seed = SIM.SEED) => {
    const d0 = (day - 1) * 24, a = d0 + win.w * SIM.WINDOW_H, b = a + SIM.WINDOW_H;
    if (day !== win.day || h0 < a || h1 > b) return simPresence(day, h0, h1, people, out, seed);
    const want = new Set(people.map(SIM.keyOf)), seen = new Set();
    for (const f of win.files) {
      for (const [key, v] of Object.entries(f.subjects)) {
        seen.add(key);
        if (want.has(key)) addSegs(out, key, SIM.rowSegs(win.places, v[1], true), d0, h0, h1, f.sector);
      }
    }
    const rest = people.filter(s => !seen.has(SIM.keyOf(s)));
    if (rest.length) {
      const had = SIM.planOf(day);
      SIM.addPlanRows(day, win.ver, win.places, {});   // the day is planned: the sim places the rest raw
      try { simPresence(day, h0, h1, rest, out, seed); } finally { if (!had) SIM.dropPlan(day); }
    }
    return out;
  };
}

// Who meets whom at one place in one machine hour. Each person present tries twice to strike
// something up, at a rate that thins as the room fills, with someone in their own CIRCLE.
// A roster of R subjects is G = floor(R / CIRCLE_ROSTER) circles: everyone belongs to one
// circle per place (a consistent hash, so when the city grows by a circle only 1/G of them
// move), and at any place, any hour, meets only their own circle there. A city of 20,000 is
// socially 50 overlapping towns of 400: each regular keeps meeting the same few hundred
// faces, as in the city of 430 the ledger was tuned on. Without circles a room drawn from
// the whole roster never repeats a pair, and friendships (which need repeat meetings) fall
// with the roster: 0.12 friends per subject at 430, 0.04 at 1,000, none at 5,000 (step 6).
// Under 2 x CIRCLE_ROSTER the city is one circle, drawn as before. Depends only on (seed,
// hour, place, G) and who is there, never on the ledger, so the meetings can be listed
// before any fold.
export const CIRCLE_ROSTER = 400;
export const circlesFor = (rosterSize) => Math.max(1, Math.floor(rosterSize / CIRCLE_ROSTER));
export function circleOf(seed, placeId, key, G) {
  if (G <= 1) return 0;
  const r = rng(`${seed}|circle|${placeId}|${key}`);   // jump consistent hash over this key's own draws
  for (let b = 0, j = 0; ;) { b = j; j = Math.floor((b + 1) / (1 - r())); if (j >= G) return b; }
}
export function pairsMet(seed, h, placeId, keys, G = 1) {
  if (keys.length < 2) return [];
  const base = ENCOUNTER_BASE[SIM.PLACES[placeId].kind];
  if (G <= 1) return pairsIn(keys, base, rng(`${seed}|enc|${h}|${placeId}`));
  const circles = new Map();
  for (const k of keys) { const c = circleOf(seed, placeId, k, G), l = circles.get(c); if (l) l.push(k); else circles.set(c, [k]); }
  return [...circles.keys()].sort((x, y) => x - y).flatMap(c => pairsIn(circles.get(c), base, rng(`${seed}|enc|${h}|${placeId}|${c}`)));
}
function pairsIn(keys, base, r) {
  if (keys.length < 2) return [];
  const p = base / (1 + (keys.length - 1) / 10);
  const met = new Set(), out = [];   // a pair meets once an hour at most, whoever starts it
  for (let i = 0; i < keys.length; i++) {
    for (let tries = 0; tries < 2; tries++) {
      if (r() >= p) continue;
      let j = Math.floor(r() * (keys.length - 1));
      if (j >= i) j++;
      const pk = pairKey(keys[i], keys[j]);
      if (met.has(pk)) continue;
      met.add(pk);
      out.push(pk);
    }
  }
  return out;
}

// Presence -> the meetings, in canonical order (hour, place, pair).
export function meetingsOf(presence, seed, G = 1) {
  const groups = [...presence.entries()].map(([k, keys]) => { const i = k.indexOf("|"); return [Number(k.slice(0, i)), k.slice(i + 1), keys]; });
  groups.sort((x, y) => x[0] - y[0] || cmpStr(x[1], y[1]));
  const out = [];
  for (const [h, placeId, keys] of groups) {
    keys.sort(cmpStr);
    for (const pk of pairsMet(seed, h, placeId, keys, G).sort(cmpStr)) out.push([h, placeId, pk]);
  }
  return out;
}

// ---- the tick --------------------------------------------------------------------------
// Advance `state` to `toHour` (exclusive) with `subjects` (the census). Mutates and
// returns state. Applies published snapshots to the sim as it goes. opts.presence: a
// presence source (sectorPresence) for the hours it covers; the sim's schedule otherwise.
export function advance(state, subjects, toHour, opts = {}) {
  const seed = state.seed || SIM.SEED;
  const people = dedupe(subjects);
  const byKey = new Map(people.map(s => [SIM.keyOf(s), s]));
  forget(state, new Set(byKey.keys()));   // withdrawn/removed files leave the ledger
  SIM.setRoster(people);   // capacity-aware placement, same roster the browsers register
  for (const s of people) state.names[SIM.keyOf(s)] = displayName(s);
  seedTies(state, new Set(byKey.keys()));
  // Make every snapshot the state already knows about visible to the sim.
  SIM.setSocialSnapshots(state.snapshots);
  const presence = opts.presence || simPresence;
  while (state.hour < toHour) {
    const h0 = state.hour, day = dayOfHour(h0);
    const h1 = Math.min(toHour, day * 24);
    const met = meetingsOf(presence(day, h0, h1, people, new Map(), seed), seed, opts.circles ?? circlesFor(people.length));
    foldBuckets(state, met, byKey, seed);
    state.hour = h1;
    if (h1 === day * 24) {   // end of machine day `day`
      decayDay(state);
      // The per-subject bound is enforced at the day boundary, never at the end of a call: a
      // call ends wherever the tick's wall-clock budget runs out, and pruning there would
      // make the city depend on how the work was chunked.
      prunePerSubject(state, h1, opts.k ?? K);
      const snapDay = day + LAG;
      state.snapshots[snapDay] = snapshotFor(state, people, snapDay, seed);
      pruneSnapshots(state, snapDay, opts.keepSnapshots ?? KEEP_SNAPSHOTS);
      SIM.setSocialSnapshots({ [snapDay]: state.snapshots[snapDay] });
    }
  }
  return state;
}

// Fold the meetings bucket by bucket, each in canonical order. A meeting reads and writes only
// its own pair (and that bucket's event log), so the buckets are independent: folding them one
// at a time, in any order or on different workers, gives the same ledger.
export function foldBuckets(state, meetings, byKey, seed = state.seed || SIM.SEED) {
  const per = new Map();
  for (const m of meetings) { const b = bucketOf(m[2]); const l = per.get(b); if (l) l.push(m); else per.set(b, [m]); }
  for (const [b, list] of per) foldBucket(state.buckets[b], list, byKey, state.names, seed);
  return state;
}
export function foldBucket(bucket, meetings, byKey, names, seed) {
  for (const [h, placeId, pk] of meetings) {
    const i = pk.indexOf("|"), a = byKey.get(pk.slice(0, i)), b = byKey.get(pk.slice(i + 1));
    if (a && b) meet(bucket, a, b, placeId, h, names, seed);
  }
  return bucket;
}

// Drop everyone not in the census: their pairs, events, name and friend-pull boosts.
// The census must be complete (social-tick reads it strictly), or a Blobs hiccup would
// erase every referral's relationships.
export function forget(state, live) {
  for (const b of state.buckets) {
    for (const pk of Object.keys(b.pairs)) {
      const [x, y] = pk.split("|");
      if (!live.has(x) || !live.has(y)) delete b.pairs[pk];
    }
    b.events = b.events.filter(e => live.has(e.a) && live.has(e.b));
  }
  for (const k of Object.keys(state.names)) if (!live.has(k)) delete state.names[k];
  for (const snap of Object.values(state.snapshots)) {
    let changed = false;
    for (const k of Object.keys(snap.boosts || {})) if (!live.has(k)) { delete snap.boosts[k]; changed = true; }
    if (changed) snap.ver = `${String(snap.ver).split(":")[0]}:${fnv(JSON.stringify(snap.boosts)).toString(36)}`;
  }
  return state;
}

function dedupe(subjects) {
  const seen = new Set(), out = [];
  for (const s of subjects || []) {
    if (!s) continue;
    const k = SIM.keyOf(s);
    if (seen.has(k)) continue;
    seen.add(k); out.push(s);
  }
  return out.sort((a, b) => (SIM.keyOf(a) < SIM.keyOf(b) ? -1 : 1));   // input order never matters
}

// One meeting. Its chance draws come from (seed, hour, pair) alone, so the result never
// depends on what else happened that hour or in which bucket order.
function meet(bucket, a, b, placeId, h, names, seed) {
  const ka = SIM.keyOf(a), kb = SIM.keyOf(b), pk = pairKey(ka, kb);
  const r = rng(`${seed}|meet|${h}|${pk}`);
  const rec = bucket.pairs[pk] || [0, 0, -1, null, 0];
  const before = rec[0], lvl0 = levelOf(before);
  const c = compat(a, b);
  const noise = (r() + r() + r() - 1.5) * 1.7;   // roughly -2.5..2.5, peaked at 0
  const kindW = SIM.PLACES[placeId]?.kind === "work" ? 0.45 : 1;   // colleagues warm slowly; chosen company counts
  const delta = (1.6 * c + noise) * kindW;
  const aff = clamp(before + delta * (1 - Math.abs(before) / 110), -100, 100);
  const again = rec[3] === placeId && rec[2] < h && h - rec[2] < 24 * 7;
  rec[0] = Math.round(aff * 100) / 100;
  rec[1] += 1;
  rec[4] = h - rec[2] < 24 * 7 ? rec[4] + 1 : 1;   // meetings in the last week
  rec[2] = h; rec[3] = placeId;
  bucket.pairs[pk] = rec;
  const lvl1 = levelOf(aff);
  const [A, B] = ka < kb ? [names[ka], names[kb]] : [names[kb], names[ka]];
  let kind = null;
  if (RANK[lvl1] > RANK[lvl0]) {
    if (lvl1 === "friends" || lvl1 === "close") kind = lvl1;
    else if (lvl0 === "rivals" || lvl0 === "nemesis") kind = aff > 0 ? "reconcile" : null;
  } else if (RANK[lvl1] < RANK[lvl0]) {
    if (lvl1 === "rivals" || lvl1 === "nemesis") kind = lvl1;
    else if ((lvl0 === "friends" || lvl0 === "close") && aff < T.acquaintance) kind = "fallout";
  } else if (again && aff >= T.friends && r() < 0.15 && !(rec[5] != null && h - rec[5] < AGAIN_GAP)) kind = "again";
  // Work rooms are not tables: colleagues are rostered together, not seated.
  const say = kind === "again" && SIM.PLACES[placeId]?.kind === "work" ? "againWork" : kind;
  if (kind) pushEvent(bucket, rec, { h, kind, a: ka < kb ? ka : kb, b: ka < kb ? kb : ka, placeId, text: line(say, A || ka, B || kb, placeId, r) });
}

// "Again" is news once in a while, not every hour: one per pair per AGAIN_GAP machine hours
// (and never while a bigger event about them is that fresh). The pair's record keeps the
// hour of its latest event (rec[5]).
const AGAIN_GAP = 72;

function pushEvent(bucket, rec, e) {
  bucket.events.push(e);
  rec[5] = e.h;
  if (bucket.events.length > BUCKET_EVENTS) bucket.events.splice(0, bucket.events.length - BUCKET_EVENTS);
}

function decayDay(state) {
  for (const b of state.buckets) {
    for (const [k, rec] of Object.entries(b.pairs)) {
      rec[0] = Math.round(rec[0] * DECAY * 100) / 100;
      if (Math.abs(rec[0]) < 0.5 && rec[1] < 3) delete b.pairs[k];
    }
  }
}

// What a subject would give up last: strong feeling either way, then company kept this week.
export const keepScore = (rec, hour) => Math.abs(rec[0]) + (hour - rec[2] < WEEK ? RECENT_W * rec[4] : 0);
// Each subject keeps its best k pairs (score, then the most recent meeting, then the key);
// a pair survives only when both sides keep it. -> pairs dropped.
export function prunePerSubject(state, hour, k = K) {
  const by = new Map();
  const add = (key, e) => { const l = by.get(key); if (l) l.push(e); else by.set(key, [e]); };
  for (const [pk, rec] of allPairs(state)) {
    const e = [pk, keepScore(rec, hour), rec[2]], i = pk.indexOf("|");
    add(pk.slice(0, i), e); add(pk.slice(i + 1), e);
  }
  const drop = new Set();
  for (const list of by.values()) {
    if (list.length <= k) continue;
    list.sort((x, y) => y[1] - x[1] || y[2] - x[2] || cmpStr(x[0], y[0]));
    for (let i = k; i < list.length; i++) drop.add(list[i][0]);
  }
  for (const pk of drop) delete state.buckets[bucketOf(pk)].pairs[pk];
  return drop.size;
}

function pruneSnapshots(state, newest, keep) {
  for (const d of Object.keys(state.snapshots)) if (Number(d) <= newest - keep) delete state.snapshots[d];
}

// Top friends/rivals per subject, from the pairs.
export function relationsOf(state, key, limit = 8) {
  return publishAll(state, [key], { relations: limit })[key]?.relations || [];
}
const relCmp = (a, b) => Math.abs(b.affinity) - Math.abs(a.affinity) || cmpStr(a.key, b.key);

// Where each subject's friends are likely to be (their unbiased favourite spots),
// weighted by affinity; where their rivals hang out is discounted. Pairs are read in key
// order: the boosts round as they add up, so the order is part of the answer.
function snapshotFor(state, people, day, seed) {
  const byKey = new Map(people.map(s => [SIM.keyOf(s), s]));
  const favs = new Map();
  const favOf = (k) => {
    if (favs.has(k)) return favs.get(k);
    const s = byKey.get(k);
    const f = s ? SIM.baseLeisure(s, seed).list.slice().sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => id) : [];
    favs.set(k, f); return f;
  };
  const boosts = {};
  const add = (k, id, v) => { (boosts[k] ||= {}); boosts[k][id] = Math.round(clamp((boosts[k][id] || 0) + v, -0.7, 1.2) * 1000) / 1000; };
  const strong = allPairs(state).filter(([, rec]) => rec[0] <= -T.friends || rec[0] >= T.friends).sort((x, y) => cmpStr(x[0], y[0]));
  for (const [pk, rec] of strong) {
    const aff = rec[0];
    const [x, y] = pk.split("|");
    for (const [me, them] of [[x, y], [y, x]]) {
      if (!byKey.has(me)) continue;
      const f = favOf(them);
      f.forEach((id, i) => add(me, id, (aff / 100) * (i === 0 ? 1.1 : 0.55)));
    }
  }
  return { ver: `${day}:${fnv(JSON.stringify(boosts)).toString(36)}`, boosts };
}

// ---- published view -------------------------------------------------------------------
export function publish(state, nowHour) {
  const nowDay = dayOfHour(nowHour);
  const snapshots = {};
  for (const [d, snap] of Object.entries(state.snapshots)) if (Number(d) >= nowDay - 1) snapshots[d] = snap;
  let npairs = 0;
  const pairs = [];
  for (const [pk, rec] of allPairs(state)) {
    npairs++;
    const level = levelOf(rec[0]);
    if (level === "neutral" || level === "acquaintance") continue;
    const [a, b] = pk.split("|");
    pairs.push({ a, b, an: state.names[a] || a, bn: state.names[b] || b, affinity: rec[0], level, meetings: rec[1], lastPlace: rec[3] ? PLACE(rec[3]) : null });
  }
  const tie = (x, y) => cmpStr(`${x.a}|${x.b}`, `${y.a}|${y.b}`);
  const friends = pairs.filter(p => p.affinity > 0).sort((x, y) => y.affinity - x.affinity || tie(x, y)).slice(0, 40);
  const rivals = pairs.filter(p => p.affinity < 0).sort((x, y) => x.affinity - y.affinity || tie(x, y)).slice(0, 25);
  return {
    hour: state.hour, day: nowDay, snapshots,
    friends, rivals,
    events: allEvents(state).slice(-60).reverse(),
    counts: { pairs: npairs, friends: pairs.filter(p => p.affinity > 0).length, rivals: pairs.filter(p => p.affinity < 0).length },
  };
}

// Relationships for one subject, for the card: a scan of every pair (the reference
// publishAll is checked against).
export function publishSubject(state, key, { relations = 10, events = 10 } = {}) {
  const rel = [];
  for (const [pk, rec] of allPairs(state)) {
    const [x, y] = pk.split("|");
    if (x !== key && y !== key) continue;
    const level = levelOf(rec[0]);
    if (level === "neutral") continue;
    const other = x === key ? y : x;
    rel.push({ key: other, name: state.names[other] || other, affinity: rec[0], level, meetings: rec[1], lastPlace: rec[3] ? PLACE(rec[3]) : null });
  }
  return { key, relations: rel.sort(relCmp).slice(0, relations), events: allEvents(state).filter(e => e.a === key || e.b === key).slice(-events).reverse() };
}

// publishSubject for every key at once, in one pass over the pairs and one over the events.
// Subjects with nothing to show are left out.
export function publishAll(state, keys, { relations = 10, events = 10 } = {}) {
  const want = new Set(keys);
  const rel = new Map(), ev = new Map();
  const push = (m, k, v) => { const l = m.get(k); if (l) l.push(v); else m.set(k, [v]); };
  for (const [pk, rec] of allPairs(state)) {
    const level = levelOf(rec[0]);
    if (level === "neutral") continue;
    const [x, y] = pk.split("|");
    if (!want.has(x) && !want.has(y)) continue;
    const lastPlace = rec[3] ? PLACE(rec[3]) : null;
    if (want.has(x)) push(rel, x, { key: y, name: state.names[y] || y, affinity: rec[0], level, meetings: rec[1], lastPlace });
    if (want.has(y) && y !== x) push(rel, y, { key: x, name: state.names[x] || x, affinity: rec[0], level, meetings: rec[1], lastPlace });
  }
  for (const e of allEvents(state)) {
    if (want.has(e.a)) push(ev, e.a, e);
    if (want.has(e.b) && e.b !== e.a) push(ev, e.b, e);
  }
  const out = {};
  for (const k of want) {
    const r = rel.get(k), e = ev.get(k);
    if (!r && !e) continue;
    out[k] = {
      relations: r ? r.sort(relCmp).slice(0, relations) : [],
      events: e ? e.slice(-events).reverse() : [],
    };
  }
  return out;
}

// The per-subject view split the way /api/social/<slug> reads it: SUBJECT_SHARDS blobs by a
// hash of the slug, so a card fetches its own subject's shard, never the whole city.
export const SUBJECT_SHARDS = 64;
export const subjectShard = (slug) => fnv(`subj|${slug}`) % SUBJECT_SHARDS;
export function shardSubjects(bySubject) {
  const out = Array.from({ length: SUBJECT_SHARDS }, () => ({}));
  for (const [k, v] of Object.entries(bySubject)) out[subjectShard(k)][k] = v;
  return out;
}
