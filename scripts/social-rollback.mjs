// Rollback for scaling step 6 (docs/CITY_SPEC.md "Relations"): write production's bucketed
// ledger (rel/head + its 64 buckets) back as the one-blob `state` the tick before step 6
// reads, under the tick's lease, so a deploy of the old code continues from this hour with
// nothing lost (pairs as they are; events merged, the latest 200). Then deploy the old code.
// Rolling forward again after the old code has run: delete rel/head first, and the next
// tick migrates from `state` again.
//   node scripts/social-rollback.mjs          # dry run: prints what it would write
//   node scripts/social-rollback.mjs --write
import { store } from "./roster/prod.mjs";
import { tickIo } from "../netlify/lib/social-store.js";
import { toV1 } from "../src/city/social.js";

const s = store("hvi-social");
const io = tickIo(() => s, null);
const run = `rollback-${Date.now().toString(36)}`;
if (!(await io.lease.acquire(run, 5 * 60 * 1000))) { console.error("the tick holds the lease; try again in a few minutes"); process.exit(1); }
try {
  const { state } = await io.load();
  if (!state || state.v !== 2) { console.error("no bucketed ledger (rel/head) to roll back"); process.exit(1); }
  const v1 = toV1(state);
  console.log(JSON.stringify({ hour: v1.hour, pairs: Object.keys(v1.pairs).length, events: v1.events.length, bytes: JSON.stringify(v1).length }));
  if (process.argv.includes("--write")) { await s.setJSON("state", v1); console.log("state written"); }
} finally {
  await io.lease.release(run);
}
