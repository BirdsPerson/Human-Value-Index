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

// The tick's io (netlify/lib/social-tick.js) over a Blobs store: conditional state writes
// and a lease, so two workers (a retry, a hung run, the Mac's social-seed) can never both
// advance the ledger or roll it back. `store` is a function returning the hvi-social store.
// plans (optional): days -> load the published plans for them into the sim (plans.js loadPlans).
export function tickIo(store = social, census, { plans } = {}) {
  return {
    census,
    ...(plans ? { plans } : {}),
    putPublic: (pub) => store().setJSON("public", pub),
    async load() {
      const r = await store().getWithMetadata("state", { type: "json" });
      return r ? { state: r.data, etag: r.etag } : { state: null, etag: null };
    },
    async save(state, etag) {
      const s = store();
      const r = await s.setJSON("state", state, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
      if (!r.modified) throw new TickConflict(`state changed since it was read (etag ${etag || "none"}): this run stops, the ledger stands`);
      return r.etag || (await s.getMetadata("state"))?.etag;
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
