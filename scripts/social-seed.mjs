// Seed / advance the social ledger in production from this Mac, with exactly the code the
// scheduled function runs (netlify/functions/social-tick.js). The census comes from the
// live /api/pen, the same data the function reads from Blobs.
//   node scripts/social-seed.mjs            # advance production to now (first run: 30-day fast-forward)
import { store } from "./roster/prod.mjs";
import { tick } from "../netlify/functions/social-tick.js";

const s = store("hvi-social");
const io = {
  getState: () => s.get("state", { type: "json" }),
  putState: (v) => s.setJSON("state", v),
  putPublic: (v) => s.setJSON("public", v),
  census: async () => (await (await fetch("https://humanvalueindex.com/api/pen")).json()).subjects || [],
};
const r = await tick(Date.now(), io);
console.log(JSON.stringify(r));
