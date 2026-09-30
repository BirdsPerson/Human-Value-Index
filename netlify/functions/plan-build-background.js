// The plan builder's worker: a Background Function (15 minutes), called by plan-build.js
// with the internal secret; anyone else gets nothing done. Builds each missing machine day
// from the whole census and the published social snapshots, publishing each day as it
// finishes (blob, then manifest), and stops starting days after 12 minutes.
import { censusSubjects } from "../lib/census.js";
import { getPublic, tickAuthorized } from "../lib/social-store.js";
import { buildPlans, planIo, STORE } from "../lib/plans.js";
import { getStore } from "@netlify/blobs";

export const BUDGET_MS = 12 * 60 * 1000;
const defaultIo = () => planIo(() => getStore({ name: STORE, consistency: "strong" }), {
  census: () => censusSubjects({ strict: true }),
  snapshots: async () => (await getPublic())?.snapshots || {},
});

export default async (req, _context, io = defaultIo()) => {
  if (!tickAuthorized(req)) { console.warn("plan build worker: unauthorized call ignored"); return; }
  try {
    const r = await buildPlans(Date.now(), io, { budgetMs: BUDGET_MS });
    console.log("plan build", JSON.stringify(r));
  } catch (err) {
    console.error("plan build failed", err);
  }
};
