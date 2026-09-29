// Seed / advance the social ledger in production from this Mac, with exactly the code the
// background worker runs (netlify/lib/social-tick.js), under the same lease and conditional
// writes, so it can never collide with or roll back the hourly run. The census comes from the
// live /api/pen, the same data the function reads from Blobs.
//   node scripts/social-seed.mjs            # advance production to now (first run: 30-day fast-forward)
import { store } from "./roster/prod.mjs";
import { tick } from "../netlify/lib/social-tick.js";
import { tickIo } from "../netlify/lib/social-store.js";

const s = store("hvi-social");
// The tick forgets anyone missing from the census, so a failed or figure-less read
// (/api/pen tolerates a failed figure read) must not pass for an empty city.
const io = tickIo(() => s, async () => {
  const res = await fetch("https://humanvalueindex.com/api/pen");
  const subjects = res.ok ? (await res.json()).subjects : null;
  if (!subjects?.some(s => s.kind === "figure")) throw new Error(`census incomplete (HTTP ${res.status}); ledger left alone`);
  return subjects;
});
const r = await tick(Date.now(), io);
console.log(JSON.stringify(r));
