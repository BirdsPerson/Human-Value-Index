// Emergent relationships in the Substrate. Pure, no DOM, no LLM: runs in the
// scheduled Netlify function (netlify/functions/social-tick.js), in scripts/ and in
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
export const MAX_PAIRS = 6000;        // bounded state
export const MAX_EVENTS = 200;
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

// ---- state ---------------------------------------------------------------------------
// {v, seed, hour (next hour to process), pairs: {"a|b": [aff, meetings, lastHour, lastPlace, recent]},
//  names: {key: display}, events: [...], snapshots: {day: {ver, boosts}}}
export function emptyState(startHour, seed = SIM.SEED) {
  return { v: 1, seed, hour: Math.floor(startHour), pairs: {}, names: {}, events: [], snapshots: {} };
}

const displayName = (s) => (s?.qualifier && s?.baseName ? `${s.baseName} (${s.qualifier})` : s?.name || SIM.keyOf(s));
const ENCOUNTER_BASE = { leisure: 0.6, mixed: 0.45, work: 0.25 };

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

// ---- the tick --------------------------------------------------------------------------
// Advance `state` to `toHour` (exclusive) with `subjects` (the census). Mutates and
// returns state. Applies published snapshots to the sim as it goes.
export function advance(state, subjects, toHour, opts = {}) {
  const seed = state.seed || SIM.SEED;
  const people = dedupe(subjects);
  SIM.setRoster(people);   // capacity-aware placement, same roster the browsers register
  for (const s of people) state.names[SIM.keyOf(s)] = displayName(s);
  // Make every snapshot the state already knows about visible to the sim.
  SIM.setSocialSnapshots(state.snapshots);
  const maxHours = opts.maxHours ?? Infinity;
  let done = 0;
  while (state.hour < toHour && done < maxHours) {
    const h = state.hour;
    stepHour(state, people, h, seed);
    state.hour = h + 1; done++;
    if (state.hour % 24 === 0) {   // end of machine day dayOfHour(h)
      const day = dayOfHour(h);
      decayDay(state);
      const snapDay = day + LAG;
      state.snapshots[snapDay] = snapshotFor(state, people, snapDay, seed);
      pruneSnapshots(state, snapDay, opts.keepSnapshots ?? KEEP_SNAPSHOTS);
      SIM.setSocialSnapshots({ [snapDay]: state.snapshots[snapDay] });
    }
  }
  prunePairs(state);
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

function stepHour(state, people, h, seed) {
  const byPlace = new Map();
  for (const s of people) {
    const w = SIM.whereAt(s, h + 0.5, seed);
    if (!w || w.activity === "commute" || w.activity === "home") continue;
    const kind = SIM.PLACES[w.placeId]?.kind;
    if (!ENCOUNTER_BASE[kind]) continue;
    if (!byPlace.has(w.placeId)) byPlace.set(w.placeId, []);
    byPlace.get(w.placeId).push(s);
  }
  for (const [placeId, here] of [...byPlace.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (here.length < 2) continue;
    const kind = SIM.PLACES[placeId].kind;
    const p = ENCOUNTER_BASE[kind] / (1 + (here.length - 1) / 10);
    const r = rng(`${seed}|enc|${h}|${placeId}`);
    for (let i = 0; i < here.length; i++) {
      for (let tries = 0; tries < 2; tries++) {
        if (r() >= p) continue;
        let j = Math.floor(r() * (here.length - 1));
        if (j >= i) j++;
        meet(state, here[i], here[j], placeId, h, r);
      }
    }
  }
}

function meet(state, a, b, placeId, h, r) {
  const ka = SIM.keyOf(a), kb = SIM.keyOf(b), pk = pairKey(ka, kb);
  const rec = state.pairs[pk] || [0, 0, -1, null, 0];
  const before = rec[0], lvl0 = levelOf(before);
  const c = compat(a, b);
  const noise = (r() + r() + r() - 1.5) * 1.7;   // roughly -2.5..2.5, peaked at 0
  const kindW = SIM.PLACES[placeId]?.kind === "work" ? 0.45 : 1;   // colleagues warm slowly; chosen company counts
  const delta = (1.6 * c + noise) * kindW;
  const aff = clamp(before + delta * (1 - Math.abs(before) / 110), -100, 100);
  const again = rec[3] === placeId && h - rec[2] < 24 * 7;
  rec[0] = Math.round(aff * 100) / 100;
  rec[1] += 1;
  rec[4] = h - rec[2] < 24 * 7 ? rec[4] + 1 : 1;   // meetings in the last week
  rec[2] = h; rec[3] = placeId;
  state.pairs[pk] = rec;
  const lvl1 = levelOf(aff);
  const [A, B] = ka < kb ? [state.names[ka], state.names[kb]] : [state.names[kb], state.names[ka]];
  let kind = null;
  if (RANK[lvl1] > RANK[lvl0]) {
    if (lvl1 === "friends" || lvl1 === "close") kind = lvl1;
    else if (lvl0 === "rivals" || lvl0 === "nemesis") kind = aff > 0 ? "reconcile" : null;
  } else if (RANK[lvl1] < RANK[lvl0]) {
    if (lvl1 === "rivals" || lvl1 === "nemesis") kind = lvl1;
    else if ((lvl0 === "friends" || lvl0 === "close") && aff < T.acquaintance) kind = "fallout";
  } else if (again && aff >= T.friends && r() < 0.15) kind = "again";
  if (kind) pushEvent(state, { h, kind, a: ka < kb ? ka : kb, b: ka < kb ? kb : ka, placeId, text: line(kind, A, B, placeId, r) });
}

function pushEvent(state, e) {
  state.events.push(e);
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
}

function decayDay(state) {
  for (const [k, rec] of Object.entries(state.pairs)) {
    rec[0] = Math.round(rec[0] * DECAY * 100) / 100;
    if (Math.abs(rec[0]) < 0.5 && rec[1] < 3) delete state.pairs[k];
  }
}

function prunePairs(state) {
  const keys = Object.keys(state.pairs);
  if (keys.length <= MAX_PAIRS) return;
  keys.sort((x, y) => Math.abs(state.pairs[y][0]) - Math.abs(state.pairs[x][0]) || state.pairs[y][2] - state.pairs[x][2] || (x < y ? -1 : 1));
  for (const k of keys.slice(MAX_PAIRS)) delete state.pairs[k];
}

function pruneSnapshots(state, newest, keep) {
  for (const d of Object.keys(state.snapshots)) if (Number(d) <= newest - keep) delete state.snapshots[d];
}

// Top friends/rivals per subject, from the pairs.
export function relationsOf(state, key, limit = 8) {
  const out = [];
  for (const [pk, rec] of Object.entries(state.pairs)) {
    const [x, y] = pk.split("|");
    if (x !== key && y !== key) continue;
    const other = x === key ? y : x;
    const level = levelOf(rec[0]);
    if (level === "neutral") continue;
    out.push({ key: other, name: state.names[other] || other, affinity: rec[0], level, meetings: rec[1], lastPlace: rec[3] ? PLACE(rec[3]) : null });
  }
  return out.sort((a, b) => Math.abs(b.affinity) - Math.abs(a.affinity)).slice(0, limit);
}

// Where each subject's friends are likely to be (their unbiased favourite spots),
// weighted by affinity; where their rivals hang out is discounted.
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
  for (const [pk, rec] of Object.entries(state.pairs)) {
    const aff = rec[0];
    if (aff > -T.friends && aff < T.friends) continue;
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
  const pairs = Object.entries(state.pairs).map(([pk, rec]) => {
    const [a, b] = pk.split("|");
    return { a, b, an: state.names[a] || a, bn: state.names[b] || b, affinity: rec[0], level: levelOf(rec[0]), meetings: rec[1], lastPlace: rec[3] ? PLACE(rec[3]) : null };
  }).filter(p => p.level !== "neutral" && p.level !== "acquaintance");
  const friends = pairs.filter(p => p.affinity > 0).sort((x, y) => y.affinity - x.affinity).slice(0, 40);
  const rivals = pairs.filter(p => p.affinity < 0).sort((x, y) => x.affinity - y.affinity).slice(0, 25);
  return {
    hour: state.hour, day: nowDay, snapshots,
    friends, rivals,
    events: state.events.slice(-60).reverse(),
    counts: { pairs: Object.keys(state.pairs).length, friends: pairs.filter(p => p.affinity > 0).length, rivals: pairs.filter(p => p.affinity < 0).length },
  };
}

// Relationships for one subject, for the card.
export function publishSubject(state, key) {
  return { key, relations: relationsOf(state, key, 10), events: state.events.filter(e => e.a === key || e.b === key).slice(-10).reverse() };
}
