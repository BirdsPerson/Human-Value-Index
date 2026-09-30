// Blobs for the social sim. "state" is the full, bounded relationship state the tick
// advances; "public" is what /api/social serves and what the quest checks load so the
// server sees the same friend-biased city as every browser.
import { createHash, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { setSocialSnapshots } from "../../src/city/sim.js";
import { TickConflict } from "./social-tick.js";

const social = () => getStore({ name: "hvi-social", consistency: "strong" });

export const getState = () => social().get("state", { type: "json" });
export const putState = (state) => social().setJSON("state", state);

// The ledger in Blobs (scaling step 6, docs/CITY_SPEC.md "Relations"):
//   rel/b/<tag>/<nn>  one pair bucket {pairs, events} (nn = 00..63, social.js bucketOf).
//                     Write-once: a checkpoint writes only the buckets that changed, each
//                     under a new tag, and never touches a blob a header points at.
//   rel/head          {v: 2, seed, hour, snapshots, rosters, plans, tick, buckets: [64 keys]},
//                     written LAST with an etag condition: the header is the commit. A run
//                     killed between its buckets and its header leaves orphans the header
//                     never names (swept by the next run under the lease), never a torn ledger.
//   state             the one-blob ledger (v1). Read once, to migrate, when there is no header;
//                     rewritten at the end of every run while ROLLBACK_COPY is on, so the
//                     previous tick could take over without losing an hour.
//   pub/s/<nn>        one subject shard of the public view (social.js subjectShard):
//                     {hour, at, subjects: {slug: {relations, events}}}; /api/social/<slug>.
//   public            the city-wide view /api/social serves (and the snapshots).
//   lease             one tick at a time.
import { fromV1, toV1, BUCKETS, shardSubjects, subjectShard, SUBJECT_SHARDS } from "../../src/city/social.js";
export const HEAD = "rel/head";
export const bucketKey = (tag, i) => `rel/b/${tag}/${String(i).padStart(2, "0")}`;
export const subjectKey = (i) => `pub/s/${String(i).padStart(2, "0")}`;
export const ROLLBACK_COPY = true;

async function inBatches(items, n, f) {
  const out = new Array(items.length);
  for (let i = 0; i < items.length; i += n) await Promise.all(items.slice(i, i + n).map((x, k) => f(x, i + k).then(v => { out[i + k] = v; })));
  return out;
}

// The tick's io (netlify/lib/social-tick.js) over a Blobs store: conditional writes and a
// lease, so two workers (a retry, a hung run, the Mac's social-seed) can never both advance
// the ledger or roll it back. `store` is a function returning the hvi-social store.
// plans (optional): days -> load the one-file plans for them into the sim (plans.js loadPlans);
// windows (optional): (day, w) -> a window's sector files (plans.js loadWindows).
export function tickIo(store = social, census, { plans, windows, rollbackCopy = ROLLBACK_COPY } = {}) {
  let keys = null, sent = null;   // the header's bucket keys, and each bucket's JSON as stored
  return {
    census,
    ...(plans ? { plans } : {}),
    ...(windows ? { windows } : {}),
    putPublic: (pub) => store().setJSON("public", pub),
    async putSubjects(bySubject, meta) {
      const shards = shardSubjects(bySubject);
      await inBatches(shards, 16, (subjects, i) => store().setJSON(subjectKey(i), { ...meta, subjects }));
    },
    async load() {
      const s = store();
      const h = await s.getWithMetadata(HEAD, { type: "json" });
      if (h?.data) {
        const buckets = await inBatches(h.data.buckets, 16, (k) => s.get(k, { type: "json" }));
        const missing = buckets.findIndex(b => !b);
        if (missing >= 0) throw new Error(`ledger bucket ${h.data.buckets[missing]} unreadable: this run stops, the ledger stands`);
        keys = [...h.data.buckets]; sent = buckets.map(b => JSON.stringify(b));
        const { buckets: _k, at: _a, ...head } = h.data;
        return { state: { ...head, names: {}, buckets }, etag: h.etag };
      }
      // No header yet: the one-blob ledger, converted (nothing is lost: social.js fromV1).
      const r = await s.getWithMetadata("state", { type: "json" });
      if (!r?.data) return { state: null, etag: null };
      const state = fromV1(r.data);
      const pairs = Object.keys(r.data.pairs || {}).length;
      return { state, etag: null, migrated: { from: "state", pairs, events: (r.data.events || []).length, hour: r.data.hour } };
    },
    async save(state, etag) {
      const s = store();
      const tag = `${state.hour}.${Math.random().toString(36).slice(2, 8)}`;
      const next = keys ? [...keys] : new Array(BUCKETS).fill(null), json = state.buckets.map(b => JSON.stringify(b));
      const todo = json.map((_, i) => i).filter(i => !sent || !next[i] || json[i] !== sent[i]);   // only what changed
      await inBatches(todo, 16, async (i) => {
        const k = bucketKey(tag, i);
        const r = await s.setJSON(k, state.buckets[i], { onlyIfNew: true });
        if (!r.modified) throw new TickConflict(`bucket ${k} already written: another run shares this tag`);
        next[i] = k;
      });
      const { buckets: _b, names: _n, ...head } = state;
      const body = { ...head, v: 2, buckets: next, at: new Date().toISOString() };
      const r = await s.setJSON(HEAD, body, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
      if (!r.modified) throw new TickConflict(`ledger header changed since it was read (etag ${etag || "none"}): this run stops, the ledger stands`);
      keys = next; sent = json;
      return r.etag || (await s.getMetadata(HEAD))?.etag;
    },
    // End of a run (still under the lease): the rollback copy, and the sweep of every bucket
    // blob the current header does not name.
    async after(state) {
      const s = store();
      if (rollbackCopy) await s.setJSON("state", toV1(state));
      const h = await s.get(HEAD, { type: "json" });
      if (!h?.buckets) return;
      const live = new Set(h.buckets);
      const { blobs } = await s.list({ prefix: "rel/b/" });
      const dead = blobs.map(b => b.key).filter(k => !live.has(k));
      await inBatches(dead, 16, (k) => s.delete(k));
    },
    lease: {
      async acquire(run, ms) {
        const s = store(), now = Date.now();
        const cur = await s.getWithMetadata("lease", { type: "json" });
        if (cur?.data && cur.data.until > now && cur.data.run !== run) return false;
        const body = { run, until: now + ms, at: new Date(now).toISOString() };
        const r = await s.setJSON("lease", body, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
        return r.modified;
      },
      async release(run) {
        const s = store();
        const cur = await s.getWithMetadata("lease", { type: "json" });
        if (cur?.data?.run === run) await s.setJSON("lease", { run, until: 0, at: new Date().toISOString() }, { onlyIfMatch: cur.etag });
      },
    },
  };
}

// One subject's published relations and events (/api/social/<slug>): its shard, cached per
// instance for a minute; the one-blob public view before the first shard is written.
const shardCache = new Map();
export const forgetShards = () => shardCache.clear();
export async function subjectCached(slug, maxAgeMs = 60 * 1000) {
  const i = subjectShard(slug);
  const hit = shardCache.get(i);
  if (!hit || Date.now() - hit.at > maxAgeMs) {
    const d = await social().get(subjectKey(i), { type: "json" }).catch(() => null);
    shardCache.set(i, { at: Date.now(), d });
  }
  const d = shardCache.get(i).d;
  if (d?.subjects) return d.subjects[slug] || { relations: [], events: [] };
  const pub = await publicCached();
  return pub ? (pub.bySubject?.[slug] || { relations: [], events: [] }) : null;
}
export { SUBJECT_SHARDS };
export const getPublic = () => social().get("public", { type: "json" });
export const putPublic = (pub) => social().setJSON("public", pub);

let cached = { at: 0, pub: null };
export async function publicCached(maxAgeMs = 60 * 1000) {
  if (!cached.pub || Date.now() - cached.at > maxAgeMs) cached = { at: Date.now(), pub: await getPublic().catch(() => null) };
  return cached.pub;
}

// Apply the published per-day snapshots to the sim in this function instance.
export async function loadSocialSnapshots() {
  const pub = await publicCached(5 * 60 * 1000);
  if (pub?.snapshots) setSocialSnapshots(pub.snapshots);
  return Boolean(pub?.snapshots);
}

// Shared secret between the hourly trigger and the background worker (the worker's URL is
// public). HVI_TICK_SECRET if set; otherwise derived from a server secret the site already
// holds, so nothing new has to be configured. null if neither exists: the worker then
// refuses every call rather than run open.
export function tickSecret(env = process.env) {
  if (env.HVI_TICK_SECRET) return env.HVI_TICK_SECRET;
  if (env.ANTHROPIC_API_KEY) return createHash("sha256").update(`hvi-social-tick|${env.ANTHROPIC_API_KEY}`).digest("hex");
  return null;
}
export const TICK_HEADER = "x-hvi-tick";
export function tickAuthorized(req, env = process.env) {
  const want = tickSecret(env), got = req.headers.get(TICK_HEADER) || "";
  if (!want || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
