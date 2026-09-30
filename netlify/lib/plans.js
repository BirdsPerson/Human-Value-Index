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

export const STORE = "hvi-plans";
export const FORMAT = SIM.PLAN_FORMAT;
export const LOOKAHEAD = 3;
export const KEEP_BEHIND = 2;          // days before today kept in the manifest (the tick and quests look back)
export const MANIFEST = `f${FORMAT}/manifest`;
export const dayKey = (day, ver) => `f${FORMAT}/day/${day}/${ver}`;
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
    const built = [];
    let waiting = null;
    if (missing.length) {
      // Read everything first: a failed census or ledger read builds nothing.
      const roster = fullRoster(await io.census());
      const snaps = (await io.snapshots()) || {};
      SIM.clearPlans();   // the builder reads the sim, never a plan
      SIM.clearSocialSnapshots();
      SIM.setSocialSnapshots(snaps);
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
    return { run, today, built, have: days.length, waiting, latest: days.length ? Math.max(...days) : null, ms: Math.round(clock() - t0) };
  } finally {
    if (io.lease) await io.lease.release(run).catch(() => {});
  }
}
const dayOfKey = (key) => Number(String(key).split("/")[2]);

// ---- readers (quest checks, the social tick) ----------------------------------------------
let man = { at: 0, m: null };
export async function manifestCached(maxAgeMs = 30 * 1000, s = store) {
  if (!man.m || Date.now() - man.at > maxAgeMs) {
    const r = await s().get(MANIFEST, { type: "json" });
    man = { at: Date.now(), m: r || null };
  }
  return man.m;
}
export function forgetManifest() { man = { at: 0, m: null }; }

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
