// The social tick's worker: a Background Function (the -background name; Netlify answers
// 202 at once and gives it 15 minutes). Called hourly by social-tick.js with the shared
// secret header; anyone else gets nothing done. Stops starting 6-machine-hour chunks after
// 12 minutes, checkpointing each, so a killed run loses at most one chunk.
import { censusSubjects } from "../lib/census.js";
import { loadPlans } from "../lib/plans.js";
import { tickIo, tickAuthorized } from "../lib/social-store.js";
import { tick } from "../lib/social-tick.js";

export const BUDGET_MS = 12 * 60 * 1000;

export default async (req, _context, io = tickIo(undefined, () => censusSubjects({ strict: true }), { plans: loadPlans })) => {
  if (!tickAuthorized(req)) { console.warn("social tick worker: unauthorized call ignored"); return; }
  try {
    const r = await tick(Date.now(), io, { budgetMs: BUDGET_MS });
    console.log("social tick", JSON.stringify(r));
  } catch (err) {
    console.error("social tick failed", err);
  }
};
