// The plan builder (step 3 of the scaling plan, docs/CITY_SPEC.md "Plans"): each machine
// day's city built once, from the whole roster and the published social snapshots, and
// published as an immutable blob. Browsers, the quest checks and the social tick all read
// the same plan (sim.js setPlan) instead of each running the capacity allocation and every
// subject's routes themselves; without a plan they fall back to the local sim, as before.
//
// Blobs (store hvi-plans):
//   f1/day/<day>/<ver>   one day's plan (sim.js format 1). Written once, never changed.
//   f1/manifest          {format, days: {day: {ver, key, roster, social, n, bytes, at}}, at}
//                        written LAST, after the day's blob is in, with an etag condition:
//                        a day it lists is always complete, and a listed day never changes.
//   lease                one builder at a time (the social tick's pattern).
//
// Cadence: a machine day is 24 real minutes. The builder runs every 10 real minutes
// (plan-build.js) and builds EVERY missing day in [today - 1, today + LOOKAHEAD], oldest
// first, so no day is skipped however the runs fall. A day more than one ahead waits for
// its social snapshot (published LAG = 4 days ahead by the hourly tick), so the plan
// carries the friends' pull the browsers would have applied; today and tomorrow are built
// regardless (a stalled tick must not stall the city).
import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";
import * as SIM from "../../src/city/sim.js";
import { fullRoster } from "../../src/city/roster.js";
import { splitDay, SECTORS, FORMAT as FORMAT2 } from "../../src/city/planSplit.js";

export const STORE = "hvi-plans";
export const FORMAT = SIM.PLAN_FORMAT;
export const LOOKAHEAD = 3;
export const KEEP_BEHIND = 2;          // days before today kept in the manifest (the tick and quests look back)
export const MANIFEST = `f${FORMAT}/manifest`;
export const dayKey = (day, ver) => `f${FORMAT}/day/${day}/${ver}`;
// Format 2 (scaling step 4, docs/CITY_SPEC.md "Sectors"): the same day, split for browsers.
//   f2/day/<day>/<ver>/w/<sector>/<w>/<p>  everyone with a segment in that district in machine
//                                       hours [6w, 6w + 6), with their display records (in
//                                       parts of at most PART_MAX)
//   f2/day/<day>/<ver>/summary          the far view's counts every 30 machine minutes, the
//                                       figures on file's whole-day rows
//   f2/day/<day>/<ver>/find             names -> the sector each is in, per window (/api/find)
//   f2/manifest                         {format: 2, days: {day: {ver, n, files, ...}}}, LAST
// <ver> is the format-1 plan's version: the two formats of a day are the same city. Every
// f2 day is split from its f1 blob, so a day built before format 2 existed splits the same.
export const FORMAT_2 = FORMAT2;
export const MANIFEST2 = `f${FORMAT2}/manifest`;
export const partKey = (day, ver, part) => `f${FORMAT2}/day/${day}/${ver}/${part}`;
export const windowPart = (sector, w, part = 0) => `w/${sector}/${w}/${part}`;
// A window's subjects are spread over parts of at most PART_MAX (by a hash of the key), so
// no response nears the 6 MB function limit however dense a district gets (the Sprawl's
// morning window is ~5 MB at 20,000 subjects). The summary says how many parts each has.
export const PART_MAX = 3000;
export const partOf = (key, parts) => fnv32(key) % parts;
function fnv32(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const store = () => getStore({ name: STORE, consistency: "strong" });

export class PlanConflict extends Error {
  constructor(msg) { super(msg); this.name = "PlanConflict"; }
}

// The id of one day's plan: the day and a hash of its content.
export function versionOf(json) {
  return `${json.day}.${createHash("sha256").update(JSON.stringify(json)).digest("hex").slice(0, 12)}`;
}

// io for buildPlans: Blobs by default. census() -> census subjects (strict: a failed read
// throws rather than build a city without them); snapshots() -> the published per-day
// social snapshots ({day: {ver, boosts}}), the same ones /api/social gives every browser.
export function planIo(s = store, { census, snapshots }) {
  return {
    census, snapshots,
    async manifest() {
      const r = await s().getWithMetadata(MANIFEST, { type: "json" });
      return r ? { manifest: r.data, etag: r.etag } : { manifest: null, etag: null };
    },
    async putDay(key, json) {
      const r = await s().setJSON(key, json, { onlyIfNew: true });
      return r.modified;   // false: already there (same key = same content)
    },
    async putManifest(m, etag) {
      const r = await s().setJSON(MANIFEST, m, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
      if (!r.modified) throw new PlanConflict("manifest changed since it was read");
      return r.etag || (await s().getMetadata(MANIFEST))?.etag;
    },
    async dropDay(key) { await s().delete(key).catch(() => {}); },
    async list() { return (await s().list({ prefix: `f${FORMAT}/day/` })).blobs.map(b => b.key); },
    async getDay(key) { return s().get(key, { type: "json" }); },
    async manifest2() {
      const r = await s().getWithMetadata(MANIFEST2, { type: "json" });
      return r ? { manifest: r.data, etag: r.etag } : { manifest: null, etag: null };
    },
    async putPart(key, json) { await s().setJSON(key, json, { onlyIfNew: true }); },
    async putManifest2(m, etag) {
      const r = await s().setJSON(MANIFEST2, m, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
      if (!r.modified) throw new PlanConflict("f2 manifest changed since it was read");
      return r.etag || (await s().getMetadata(MANIFEST2))?.etag;
    },
    async list2() { return (await s().list({ prefix: `f${FORMAT2}/day/` })).blobs.map(b => b.key); },
    lease: {
      async acquire(run, ms) {
        const now = Date.now();
        const cur = await s().getWithMetadata("lease", { type: "json" });
        if (cur?.data && cur.data.until > now && cur.data.run !== run) return false;
        const r = await s().setJSON("lease", { run, until: now + ms, at: new Date(now).toISOString() }, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
        return r.modified;
      },
      async release(run) {
        const cur = await s().getWithMetadata("lease", { type: "json" });
        if (cur?.data?.run === run) await s().setJSON("lease", { run, until: 0, at: new Date().toISOString() }, { onlyIfMatch: cur.etag });
      },
    },
  };
}

// Which days a run at nowMs wants, oldest first.
export function wantedDays(nowMs, lookahead = LOOKAHEAD) {
  const c = SIM.machineClock(nowMs).day;
  const out = [];
  for (let d = c - 1; d <= c + lookahead; d++) out.push(d);
  return out;
}

// Build and publish every missing day. -> {run, today, built: [{day, ver, ms, bytes}], have,
// waiting (the first day held back for its snapshot), latest, ms}. Stops starting days
// after budgetMs; each finished day is already published, so a killed run loses one day.
export async function buildPlans(nowMs = Date.now(), io, opts = {}) {
  const clock = opts.clock || Date.now;
  const t0 = clock(), budgetMs = opts.budgetMs ?? Infinity;
  const run = opts.run || `${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  if (io.lease && !(await io.lease.acquire(run, opts.leaseMs ?? 16 * 60 * 1000))) return { skipped: "another build holds the lease", run };
  try {
    const today = SIM.machineClock(nowMs).day;
    let { manifest, etag } = await io.manifest();
    manifest ||= { format: FORMAT, days: {}, at: null };
    const want = wantedDays(nowMs, opts.lookahead ?? LOOKAHEAD);
    const missing = want.filter(d => !manifest.days[d]);
    const built = [], jsons = new Map();
    let waiting = null, roster = null;
    if (missing.length) {
      // Read everything first: a failed census or ledger read builds nothing.
      roster = fullRoster(await io.census());
      const snaps = (await io.snapshots()) || {};
      // THE ASSEMBLY's outcome (netlify/lib/assembly.js): what the vacant lot is becoming. Read
      // like the census: a failed read builds nothing (a listed day never changes).
      const civic = io.civic ? await io.civic() : null;
      SIM.clearPlans();   // the builder reads the sim, never a plan
      SIM.clearSocialSnapshots();
      SIM.setSocialSnapshots(snaps);
      SIM.setCivic(civic);
      if (opts.memoCap !== 0) SIM.setMemoCap(opts.memoCap ?? Math.max(200000, roster.length * 60));
      SIM.setRoster(roster);
      for (const day of missing) {
        if (built.length && clock() - t0 >= budgetMs) break;
        if (day > today + 1 && !snaps[day]) { waiting = day; break; }   // later days wait too: they need this one's snapshot first
        const a = clock();
        const json = SIM.buildPlan(day);
        const ver = versionOf(json), key = dayKey(day, ver);
        const bytes = JSON.stringify(json).length;
        await io.putDay(key, json);   // the day's blob first ...
        jsons.set(day, json);
        const entry = { ver, key, roster: json.roster, social: json.social, n: json.n, bytes, at: new Date(clock()).toISOString(), run };
        // ... then the manifest, only over the version we read. On a conflict, re-read: if
        // another builder published this day meanwhile, theirs stands.
        for (let tries = 0; ; tries++) {
          if (manifest.days[day]) break;
          const next = { format: FORMAT, days: { ...manifest.days, [day]: entry }, at: entry.at };
          for (const d of Object.keys(next.days)) if (Number(d) < today - KEEP_BEHIND) delete next.days[d];
          try { etag = await io.putManifest(next, etag); manifest = next; built.push({ day, ver, ms: Math.round(clock() - a), bytes }); break; }
          catch (err) {
            if (!(err instanceof PlanConflict) || tries >= 4) throw err;
            ({ manifest, etag } = await io.manifest());
            manifest ||= { format: FORMAT, days: {}, at: null };
          }
        }
      }
    }
    // Format 2: every listed day not yet split, oldest first, each published as it is done.
    const split = [];
    if (io.manifest2) {
      let { manifest: m2, etag: e2 } = await io.manifest2();
      m2 ||= { format: FORMAT_2, days: {}, at: null };
      const todo = want.filter(d => manifest.days[d] && !m2.days[d]);
      for (const day of todo) {
        if ((built.length || split.length) && clock() - t0 >= budgetMs) break;
        const a = clock(), e = manifest.days[day];
        const json = jsons.get(day) || await io.getDay(e.key);
        if (!json) continue;
        roster ||= fullRoster(await io.census());
        const entry = await publishSplit(io, json, e.ver, roster, run, clock);
        for (let tries = 0; ; tries++) {
          if (m2.days[day]) break;
          const next = { format: FORMAT_2, days: { ...m2.days, [day]: entry }, at: entry.at };
          for (const d of Object.keys(next.days)) if (Number(d) < today - KEEP_BEHIND) delete next.days[d];
          try { e2 = await io.putManifest2(next, e2); m2 = next; split.push({ day, ver: e.ver, ms: Math.round(clock() - a), bytes: entry.bytes }); break; }
          catch (err) {
            if (!(err instanceof PlanConflict) || tries >= 4) throw err;
            ({ manifest: m2, etag: e2 } = await io.manifest2());
            m2 ||= { format: FORMAT_2, days: {}, at: null };
          }
        }
      }
      const stale2 = Object.keys(m2.days).filter(d => Number(d) < today - KEEP_BEHIND);
      if (stale2.length) {
        const next = { ...m2, days: { ...m2.days } };
        for (const d of stale2) delete next.days[d];
        try { e2 = await io.putManifest2(next, e2); m2 = next; } catch (err) { if (!(err instanceof PlanConflict)) throw err; }
      }
      if (io.list2) {
        const keep = new Set(Object.entries(m2.days).map(([d, x]) => `${d}/${x.ver}/`));
        for (const key of await io.list2()) {
          const [, , d, v] = String(key).split("/");
          if (!keep.has(`${d}/${v}/`) && Number(d) < today - KEEP_BEHIND) await io.dropDay(key);
        }
      }
    }
    // Days before today - KEEP_BEHIND leave the manifest (also on a run that built nothing),
    // then their blobs go. A conflict here is left to the next run.
    const stale = Object.keys(manifest.days).filter(d => Number(d) < today - KEEP_BEHIND);
    if (stale.length) {
      const next = { ...manifest, days: { ...manifest.days } };
      for (const d of stale) delete next.days[d];
      try { etag = await io.putManifest(next, etag); manifest = next; } catch (err) { if (!(err instanceof PlanConflict)) throw err; }
    }
    if (io.list) {
      const keep = new Set(Object.values(manifest.days).map(e => e.key));
      for (const key of await io.list()) if (!keep.has(key) && dayOfKey(key) < today - KEEP_BEHIND) await io.dropDay(key);
    }
    const days = Object.keys(manifest.days).map(Number);
    return { run, today, built, split, have: days.length, waiting, latest: days.length ? Math.max(...days) : null, ms: Math.round(clock() - t0) };
  } finally {
    if (io.lease) await io.lease.release(run).catch(() => {});
  }
}
const dayOfKey = (key) => Number(String(key).split("/")[2]);

// One day's format-2 files from its format-1 plan: windows and the find index first, the
// summary, then (by the caller) the manifest. -> the manifest entry.
export async function publishSplit(io, json, ver, roster, run, clock = Date.now, partMax = PART_MAX) {
  SIM.setPlan(json, ver);   // the split reads whereAt from the plan itself
  const people = new Map(roster.map(s => [SIM.keyOf(s), s]));
  let parts;
  try { parts = splitDay(json, ver, people); } finally { SIM.dropPlan(json.day); }   // the builder reads the sim, never a plan
  const { windows, summary, find } = parts;
  const files = {}, jobs = [];
  let bytes = 0;
  summary.parts = {};
  for (const sector of SECTORS) {
    summary.parts[sector] = [];
    files[sector] = windows[sector].map((w, i) => {
      const keys = Object.keys(w.subjects), n = keys.length, P = Math.max(1, Math.ceil(n / partMax));
      const subs = Array.from({ length: P }, () => ({}));
      for (const k of keys) subs[partOf(k, P)][k] = w.subjects[k];
      let b = 0;
      subs.forEach((sub, p) => {
        const f = { ...w, part: p, parts: P, subjects: sub };
        b += JSON.stringify(f).length;
        jobs.push(() => io.putPart(partKey(json.day, ver, windowPart(sector, i, p)), f));
      });
      bytes += b;
      summary.parts[sector].push(P);
      return [n, b, P];
    });
  }
  jobs.push(() => io.putPart(partKey(json.day, ver, "find"), find));
  for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8).map(f => f()));
  const sb = JSON.stringify(summary).length;
  await io.putPart(partKey(json.day, ver, "summary"), summary);
  return { ver, n: json.n, roster: json.roster, social: json.social, sectors: SECTORS, files, summary: sb, find: JSON.stringify(find).length, bytes: bytes + sb, at: new Date(clock()).toISOString(), run };
}

// ---- readers (quest checks, the social tick) ----------------------------------------------
let man = { at: 0, m: null };
export async function manifestCached(maxAgeMs = 30 * 1000, s = store) {
  if (!man.m || Date.now() - man.at > maxAgeMs) {
    const r = await s().get(MANIFEST, { type: "json" });
    man = { at: Date.now(), m: r || null };
  }
  return man.m;
}
export function forgetManifest() { man = { at: 0, m: null }; man2 = { at: 0, m: null }; }
let man2 = { at: 0, m: null };
export async function manifest2Cached(maxAgeMs = 30 * 1000, s = store) {
  if (!man2.m || Date.now() - man2.at > maxAgeMs) {
    const r = await s().get(MANIFEST2, { type: "json" });
    man2 = { at: Date.now(), m: r || null };
  }
  return man2.m;
}

// Load the published plans for these days into the sim, pinned by the manifest's version.
// Days with no plan are left to the local sim. -> {day: ver} of what is loaded.
export async function loadPlans(days, s = store) {
  const m = await manifestCached(30 * 1000, s);
  const out = {};
  for (const day of new Set(days)) {
    const e = m?.days?.[day];
    if (!e) { SIM.dropPlan(day); continue; }
    if (SIM.planOf(day)?.ver !== e.ver) {
      const json = await s().get(e.key, { type: "json" });
      if (!json || !SIM.setPlan(json, e.ver)) { SIM.dropPlan(day); continue; }
    }
    out[day] = e.ver;
  }
  // an instance keeps the days it was asked for, nothing older
  const lo = Math.min(...days);
  for (const d of SIM.plannedDays()) if (d < lo - 1) SIM.dropPlan(d);
  return out;
}

// The machine days a quest report at realMs can touch: contactAt looks back slackS real
// seconds (1 real second = 1 machine minute), which crosses midnight for the first
// 1.5 machine hours of a day. Both days must be read from the same plans the browser has.
export function questDays(realMs, slackS = 90) {
  return [...new Set([SIM.machineClock(realMs - slackS * 1000).day, SIM.machineClock(realMs).day])];
}

// ---- format-2 readers (scaling step 6: the social tick and quests off the one-file plan) -----
// One window of one day, every sector's parts: {day, w, ver, places, files: [{sector, subjects}]}
// for social.js sectorPresence, or null when the day is not split (the caller falls back to
// the one-file plan). Throws if a listed file is unreadable: a window with a sector missing
// would silently lose that district's meetings.
export async function loadWindows(day, w, s = store) {
  const m = await manifest2Cached(30 * 1000, s);
  const e = m?.days?.[day];
  if (!e?.files) return null;
  const jobs = [];
  for (const sector of e.sectors || SECTORS) {
    const parts = e.files[sector]?.[w]?.[2] ?? 1;
    for (let p = 0; p < parts; p++) jobs.push([sector, partKey(day, e.ver, windowPart(sector, w, p))]);
  }
  const files = [];
  for (let i = 0; i < jobs.length; i += 8) {
    const got = await Promise.all(jobs.slice(i, i + 8).map(([, k]) => s().get(k, { type: "json" })));
    got.forEach((f, k) => {
      if (!f?.subjects) throw new Error(`window file ${jobs[i + k][1]} unreadable`);
      files.push({ sector: jobs[i + k][0], subjects: f.subjects, places: f.places });
    });
  }
  return { day, w, ver: e.ver, places: files[0]?.places || [], files };
}

// The figures on file's whole-day rows for these days, from each split day's summary (what
// the quest checks locate: every quest figure is on file). A day not split loads its
// one-file plan instead (loadPlans). -> {day: ver} of what is loaded.
export async function loadOnFile(days, s = store) {
  const m2 = await manifest2Cached(30 * 1000, s);
  const out = {}, rest = [];
  for (const day of new Set(days)) {
    const e = m2?.days?.[day];
    if (!e) { rest.push(day); continue; }
    const have = SIM.planOf(day);
    if (have?.ver !== e.ver || !(have.full || have.onFile)) {
      const sum = await s().get(partKey(day, e.ver, "summary"), { type: "json" });
      if (!sum?.onFile) { rest.push(day); continue; }
      SIM.dropPlan(day);
      SIM.addPlanRows(day, e.ver, sum.places || [], sum.onFile, { roster: sum.roster, social: sum.social, n: sum.n, onFile: true });
    }
    out[day] = e.ver;
  }
  if (rest.length) Object.assign(out, await loadPlans(rest, s));
  const lo = Math.min(...days);
  for (const d of SIM.plannedDays()) if (d < lo - 1) SIM.dropPlan(d);
  return out;
}
