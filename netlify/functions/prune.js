// The retention sweep (scheduled, daily). Rules and periods: netlify/lib/prune.js, stated to
// the public in docs/legal/privacy.md. Set HVI_PRUNE_DRY_RUN=1 in Netlify to log what it
// would delete without deleting anything. Scheduled functions run on the published
// production deploy only, never on drafts or previews.
import { prune } from "../lib/prune.js";

export default async () => {
  try {
    const report = await prune({ dryRun: process.env.HVI_PRUNE_DRY_RUN === "1" });
    console.log("prune", JSON.stringify(report));
  } catch (err) {
    console.error("prune failed", err?.name, err?.message);
  }
};

export const config = { schedule: "@daily" };
