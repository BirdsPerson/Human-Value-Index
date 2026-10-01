// The browser's door to the published plans (/api/plan, built by netlify/lib/plans.js).
//
// Since scaling step 4 (docs/CITY_SPEC.md "Sectors") a browser downloads what it LOOKS AT,
// not the roster:
//   - the manifest, and each machine day's SUMMARY: the counts the far view draws (every 30
//     machine minutes), and the whole-day rows of the figures on file (quests, the Loop panel);
//   - a SECTOR WINDOW (one district, six machine hours) for each district a view shows up
//     close (wantSectors), the next window fetched before it starts. Each lists everyone with
//     a segment there, their display record and their segments for those hours, loaded into
//     the sim (sim.js addPlanRows): whereAt for them is the whole plan's, to the float;
//   - single subjects the search found, your own file, a subject being followed (pin), from
//     /api/find, one window at a time.
// `known` is everyone this browser holds; the census (City.jsx) reads only them, where the
// plan covers them, and fills the rest of the city with the summary's crowds (crowd.js).
//
// Without a split day (the builder has not caught up, the office is down) the city runs the
// way it did before: the whole census from /api/pen, the whole day's plan if there is one,
// the sim for the rest ("legacy").
import { machineClock, setPlan, dropPlan, plannedDays, planOf, addPlanRows, windowOf, WINDOW_H, WINDOWS, coveredUntil, covers, keyOf } from "./sim.js";
import { baseRoster } from "./roster.js";
import { displayName } from "../figures.js";

const MANIFEST_MS = 60 * 1000;
const PREFETCH_H = 0.75;   // machine hours before a window ends that the next is fetched
let manifest = null, manifestAt = 0, manifestP = null;
let mode = "pending";       // "sectors" | "legacy"
let offsetMs = 0;           // simApi.setClockOffset (dev only)
export function setPlanClockOffset(ms) { offsetMs = ms || 0; }
const nowMt = () => machineClock(Date.now() + offsetMs).mt;
const emit = (name) => { if (typeof window !== "undefined") window.dispatchEvent(new Event(name)); };

// Every request this module makes, for the per-visit measurements (scripts/bench-sectors.mjs).
export const traffic = { requests: 0, bytes: 0, log: [] };
async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) return null;
  const text = await r.text();
  traffic.requests++; traffic.bytes += text.length; traffic.log.push([url, text.length]);
  return JSON.parse(text);
}

async function readManifest(force = false) {
  if (!force && manifest && Date.now() - manifestAt < MANIFEST_MS) return manifest;
  if (manifestP) return manifestP;
  manifestP = getJson("/api/plan").then(m => { if (m) { manifest = m; manifestAt = Date.now(); } return manifest; })
    .catch(() => manifest).finally(() => { manifestP = null; });
  return manifestP;
}

// ---- who this browser holds -------------------------------------------------------------------
const BASE = new Map(baseRoster().map(s => [s.slug, s]));
const known = new Map();   // key -> subject
let knownV = 0, knownList = null;
let self = null;           // your own file (useRoster), merged over its record
function hold(key, rec) {
  let s = known.get(key);
  if (s) return s;
  s = rec === 0 || rec == null ? BASE.get(key) : { ...rec, slug: key };
  if (!s) return null;
  if (self && self.slug === key) s = { ...s, ...self };
  known.set(key, s); knownV++; knownList = null;
  return s;
}
export function knownSubjects() {
  if (!knownList) knownList = [...known.values()];
  return knownList;
}
export const knownVersion = () => knownV;
export const heldSubject = (key) => known.get(key) || null;

// ---- days: summaries -----------------------------------------------------------------------------
const days = new Map();   // day -> {ver, summary} | "loading" | "missing"
export const summaryOf = (day) => days.get(day)?.summary || null;
// THE MALL (enterprise.js): each subject's satisfaction for a day, beside their window rows (the
// figures on file's in the summary). day -> Map(key -> [s, fit, pay, commute, mood, friends, flags])
const SAT = new Map();
const satPut = (day, key, row) => { if (!Array.isArray(row)) return; let m = SAT.get(day); if (!m) SAT.set(day, m = new Map()); m.set(key, row); };
export const satOf = (key, day) => SAT.get(day)?.get(key) || null;
const MISSING = (at = Date.now()) => ({ missingAt: at });
const isMissing = (d) => Boolean(d?.missingAt);
function ensureDay(day) {
  const cur = days.get(day);
  if (cur === "loading" || cur?.summary || (isMissing(cur) && Date.now() - cur.missingAt < 60 * 1000)) return Promise.resolve(cur);
  days.set(day, "loading");
  return readManifest(!manifest?.sectors?.[day]).then(m => {
    const ver = m?.sectors?.[day];
    if (!ver) { days.set(day, MISSING()); return days.get(day); }
    return getJson(`/api/plan/${day}/${ver}/summary`).then(sum => {
      if (!sum || sum.day !== day) { days.set(day, MISSING()); return days.get(day); }
      addPlanRows(day, ver, sum.places || [], sum.onFile, { roster: sum.roster, social: sum.social, n: sum.n });
      for (const key of Object.keys(sum.onFile || {})) hold(key, 0);
      for (const [key, row] of Object.entries(sum.sat || {})) satPut(day, key, row);
      const v = { ver, summary: sum };
      days.set(day, v);
      emit("hvi-plans");
      return v;
    });
  }).catch(() => { days.delete(day); return null; });
}

// ---- sector windows ------------------------------------------------------------------------------
const files = new Map();   // `${day}/${sector}/${w}` -> "loading" | "ok" | "missing"
const owners = new Map();  // who wants which sectors (a view, the cutaway, the district page)
export function wantSectors(owner, ids) {
  const next = new Set((ids || []).filter(Boolean));
  const cur = owners.get(owner);
  if (cur && cur.size === next.size && [...next].every(x => cur.has(x))) return;
  if (next.size) owners.set(owner, next); else owners.delete(owner);
  pump();
}
function loadWindow(day, sector, w) {
  const id = `${day}/${sector}/${w}`;
  if (files.has(id)) return;
  const d = days.get(day);
  if (!d?.summary) { if (d !== "loading" && !isMissing(d)) ensureDay(day).then(() => { if (days.get(day)?.summary) loadWindow(day, sector, w); }); return; }
  files.set(id, "loading");
  // a dense window comes in parts (plans.js PART_MAX); it is complete when all are in
  const P = d.summary.parts?.[sector]?.[w] || 1;
  Promise.all(Array.from({ length: P }, (_, p) => getJson(`/api/plan/${day}/${d.ver}/${sector}/${w}/${p}`).then(f => {
    if (!f || f.day !== day || f.sector !== sector || f.window !== w) throw new Error("wrong window");
    const rows = {};
    for (const [key, [rec, row, sat]] of Object.entries(f.subjects || {})) { if (hold(key, rec)) rows[key] = row; if (sat) satPut(day, key, sat); }
    addPlanRows(day, d.ver, f.places, rows);
    emit("hvi-sectors");
  }))).then(() => { files.set(id, "ok"); emit("hvi-sectors"); }).catch(() => files.set(id, "missing"));
}
// The districts whose window at machine time T is in: there, the census holds everyone.
export function completeAt(T) {
  const d0 = Math.floor(T / 24), day = d0 + 1, w = windowOf(T - d0 * 24), out = new Set();
  for (const id of files.keys()) { const [a, b, c] = id.split("/"); if (+a === day && +c === w && files.get(id) === "ok") out.add(b); }
  return out;
}
export const sectorsWanted = () => new Set([...owners.values()].flatMap(s => [...s]));

// ---- pinned subjects: yours, the one being followed -----------------------------------------------
const pins = new Map();   // key -> {s, asked: Set(`${day}/${w}`)}
export function pinSubject(s) {
  if (!s) return;
  const key = keyOf(s);
  if (!pins.has(key)) pins.set(key, { s, asked: new Set() });
  else pins.get(key).s = s;
  pump();
}
export function unpinSubject(s) { if (s) pins.delete(keyOf(s)); }
export function setSelf(s) {
  self = s ? { ...s } : null;
  if (!s) return;
  const key = keyOf(s), have = known.get(key);
  if (have) { known.set(key, { ...have, ...self }); knownV++; knownList = null; }
  else if (mode === "sectors") { known.set(key, { ...self }); knownV++; knownList = null; }
  pinSubject(known.get(key) || self);
}
function askFind(params) {
  return getJson(`/api/find?${new URLSearchParams(params)}`).then(r => {
    if (!r || !Array.isArray(r.hits)) return null;
    const out = [];
    for (const h of r.hits) {
      const s = hold(h.key, h.rec);
      if (!s) continue;
      if (h.row) addPlanRows(r.day, r.ver, days.get(r.day)?.summary?.places || [], { [h.key]: h.row });
      out.push({ key: h.key, name: h.name, s });
    }
    if (out.length) emit("hvi-sectors");
    return out;
  }).catch(() => null);
}
function pumpPins(T) {
  const d0 = Math.floor(T / 24), day = d0 + 1, h = T - d0 * 24;
  for (const [key, p] of pins) {
    const until = coveredUntil(p.s, day, h);
    let want = null;
    if (until == null) want = [day, windowOf(h)];
    else if (until < 24 && until - h < PREFETCH_H) want = [day, windowOf(until)];
    else if (until >= 24 && 24 - h < PREFETCH_H) want = [day + 1, 0];
    if (!want) continue;
    const id = want.join("/");
    if (p.asked.has(id)) continue;
    p.asked.add(id);
    ensureDay(want[0]).then(() => askFind({ slug: key, day: want[0], w: want[1] }));
  }
}

// ---- the pump: what the views want, now and next -----------------------------------------------
let pumping = false;
function pump() {
  if (mode !== "sectors" || pumping) return;
  pumping = true;
  try {
    const T = nowMt(), d0 = Math.floor(T / 24), day = d0 + 1, h = T - d0 * 24, w = windowOf(h);
    ensureDay(day);
    const late = (w + 1) * WINDOW_H - h < PREFETCH_H;
    if (late && w === WINDOWS - 1) ensureDay(day + 1);
    for (const sector of sectorsWanted()) {
      loadWindow(day, sector, w);
      if (late) (w + 1 < WINDOWS ? loadWindow(day, sector, w + 1) : loadWindow(day + 1, sector, 0));
    }
    pumpPins(T);
    // Yesterday goes once today is well under way; a quest report looks back 90 real seconds.
    if (h > 2) for (const d of plannedDays()) if (d < day) { dropPlan(d); days.delete(d); SAT.delete(d); for (const id of [...files.keys()]) if (+id.split("/")[0] === d) files.delete(id); }
  } finally { pumping = false; }
}

// Search the census (the server's find index, one round trip). -> [{key, name, s}] | null
// (null: no split day, search the local census instead).
export function searchCensus(q, n = 8) {
  if (mode !== "sectors") return Promise.resolve(null);
  return askFind({ q, n });
}
export function findBySlug(slug) {
  if (mode !== "sectors") return Promise.resolve(null);
  const T = nowMt(), d0 = Math.floor(T / 24);
  const have = known.get(slug);
  if (have && covers(have, T)) return Promise.resolve({ key: slug, name: displayName(have), s: have });
  return askFind({ slug, day: d0 + 1, w: windowOf(T - d0 * 24) }).then(r => r?.[0] || null);
}

// ---- starting up ----------------------------------------------------------------------------------
// Resolves to the mode once today is known: "sectors" when today is split (its summary is
// loaded), else "legacy" (the whole census, as before step 4). Decided once per page.
let modeP = null;
export function planMode() { return mode; }
export function startSectors() {
  if (modeP) return modeP;
  if (typeof fetch !== "function") { mode = "legacy"; return (modeP = Promise.resolve(mode)); }
  const day = Math.floor(nowMt() / 24) + 1;
  modeP = ensureDay(day).then(v => {
    mode = v?.summary ? "sectors" : "legacy";
    if (mode === "sectors") pump();
    return mode;
  }).catch(() => (mode = "legacy"));
  return modeP;
}
// A new machine day with no split plan (the builder stalled): the city falls back to the
// whole census for the rest of the visit.
export function checkDay(T) {
  if (mode !== "sectors") return mode;
  const day = Math.floor(T / 24) + 1, d = days.get(day);
  if (isMissing(d)) { mode = "legacy"; emit("hvi-plan-mode"); }
  else if (!d) ensureDay(day);
  return mode;
}

// ---- legacy: the whole day's plan (format 1), when the day is not split ------------------------
const loading = new Map();
function wanted(realMs) {
  const c = machineClock(realMs);
  const ds = [c.day];
  if (c.hour >= 21) ds.push(c.day + 1);
  if (c.hour < 2) ds.push(c.day - 1);
  return { today: c.day, days: ds };
}
function loadDay(day, ver) {
  const key = `${day}/${ver}`;
  if (loading.has(key)) return loading.get(key);
  const p = getJson(`/api/plan/${day}/${ver}`).then(json => {
    const changed = json ? setPlan(json, ver) : false;
    if (changed) emit("hvi-plans");
    return changed;
  }).catch(() => false).finally(() => loading.delete(key));
  loading.set(key, p);
  return p;
}
let inflight = null;
export function ensurePlans(realMs = Date.now() + offsetMs) {
  if (typeof fetch !== "function") return Promise.resolve(false);
  if (mode === "pending") return startSectors().then(() => ensurePlans(realMs));
  if (mode === "sectors") { pump(); return Promise.resolve(Boolean(summaryOf(machineClock(realMs).day))); }
  if (inflight) return inflight;
  const { today, days: ds } = wanted(realMs);
  const need = ds.filter(d => !planOf(d)?.full);
  for (const d of plannedDays()) if (d < today - 1) dropPlan(d);
  if (!need.length) return Promise.resolve(true);
  inflight = readManifest(need.includes(today) && manifest && !manifest.days?.[today])
    .then(m => (m?.format === 1 ? Promise.all(need.filter(d => m.days?.[d]).map(d => loadDay(d, m.days[d]))) : null))
    .then(() => Boolean(planOf(today)))
    .catch(() => false)
    .finally(() => { inflight = null; });
  return inflight;
}

// Keep the plans current while the page is open.
let timer = 0;
export function startPlans() {
  if (timer || typeof window === "undefined") return;
  ensurePlans();
  timer = setInterval(() => { if (!document.hidden) ensurePlans(); }, 5 * 1000);
}
