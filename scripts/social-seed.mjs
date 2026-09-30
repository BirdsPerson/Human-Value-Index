// Seed / advance the social ledger in production from this Mac, with exactly the code the
// background worker runs (netlify/lib/social-tick.js), under the same lease and conditional
// writes, so it can never collide with or roll back the hourly run. The census comes from the
// live /api/pen, the same data the function reads from Blobs.
//   node scripts/social-seed.mjs            # advance production to now (first run: 30-day fast-forward;
//                                           # before step 6's header exists: migrates the one-blob ledger)
import { store } from "./roster/prod.mjs";
import { tick } from "../netlify/lib/social-tick.js";
import { tickIo } from "../netlify/lib/social-store.js";
import { fetchPen } from "../src/penClient.js";
import { loadPlans, loadWindows } from "../netlify/lib/plans.js";

const s = store("hvi-social");
// The same published days the worker reads (sector windows, else the one-file plan): without
// them this Mac would place people by its own sim and advance a different city.
const plansStore = () => store("hvi-plans");
// The tick forgets anyone missing from the census, so a failed or figure-less read
// (/api/pen tolerates a failed figure read) must not pass for an empty city.
const io = tickIo(() => s, async () => {
  const subjects = await fetchPen({ base: "https://humanvalueindex.com" }).catch(err => { throw new Error(`census unreadable (${err.message}); ledger left alone`); });
  if (!subjects?.some(s => s.kind === "figure")) throw new Error("census incomplete; ledger left alone");
  return subjects;
}, { plans: (days) => loadPlans(days, plansStore), windows: (day, w) => loadWindows(day, w, plansStore) });
const r = await tick(Date.now(), io);
console.log(JSON.stringify(r));
