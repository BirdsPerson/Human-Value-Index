// The plan builder's worker: a Background Function (15 minutes), called by plan-build.js
// with the internal secret; anyone else gets nothing done. Builds each missing machine day
// from the whole census and the published social snapshots, publishing each day as it
// finishes (blob, then manifest), and stops starting days after 12 minutes.
import { censusSubjects } from "../lib/census.js";
import { getPublic, tickAuthorized } from "../lib/social-store.js";
import { buildPlans, planIo, STORE } from "../lib/plans.js";
import { getStore } from "@netlify/blobs";
import { civicOf, refreshSubstrate, STORE as ASSEMBLY_STORE } from "../lib/assembly.js";
import { substrateSource } from "../lib/substrate-source.js";
import { seatRecord, STORE as ELECTIONS_STORE } from "../lib/elections.js";

export const BUDGET_MS = 12 * 60 * 1000;
const defaultIo = () => planIo(() => getStore({ name: STORE, consistency: "strong" }), {
  census: () => censusSubjects({ strict: true }),
  snapshots: async () => (await getPublic())?.snapshots || {},
  civic: () => civicOf(getStore({ name: ASSEMBLY_STORE, consistency: "strong" })),
  elections: () => seatRecord(getStore({ name: ELECTIONS_STORE, consistency: "strong" })),
});

export default async (req, _context, io = defaultIo()) => {
  if (!tickAuthorized(req)) { console.warn("plan build worker: unauthorized call ignored"); return; }
  try {
    const r = await buildPlans(Date.now(), io, { budgetMs: BUDGET_MS });
    console.log("plan build", JSON.stringify(r));
    // THE SUBSTRATE's advisory count (netlify/lib/assembly.js), at most every 10 minutes while the
    // polls are open, so the close always reads a recent one even when nobody opens the page
    if (!io.test) {
      const sub = await refreshSubstrate(getStore({ name: ASSEMBLY_STORE, consistency: "strong" }), substrateSource()).catch(err => { console.error("substrate recount failed", err?.message); return null; });
      if (sub) console.log("substrate", JSON.stringify({ votes: sub.votes, abstained: sub.abstained, n: sub.n, at: sub.at }));
    }
  } catch (err) {
    console.error("plan build failed", err);
  }
};
