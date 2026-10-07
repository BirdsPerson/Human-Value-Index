// Operator-only: set a case's playing hand, the default every handed game reads (golf, tennis,
// bowling, skate stance, football QB) until the player picks otherwise on that device.
//   node scripts/set-hand.mjs <caseId> --hand L|R [--dry-run]
import { store } from "./roster/prod.mjs";
import { isCaseId } from "../netlify/lib/intake.js";

const argv = process.argv.slice(2);
const caseId = String(argv.find(a => /^HVI-/i.test(a)) || "").toUpperCase();
const i = argv.indexOf("--hand"), hand = i >= 0 ? String(argv[i + 1] || "").toUpperCase() : "";
if (!isCaseId(caseId) || !["L", "R"].includes(hand)) { console.error("usage: set-hand.mjs <caseId> --hand L|R [--dry-run]"); process.exit(1); }

const cases = store("hvi-cases");
for (let attempt = 0; attempt < 5; attempt++) {
  const cur = await cases.getWithMetadata(caseId, { type: "json" });
  if (!cur?.data) { console.error(`no case ${caseId}`); process.exit(1); }
  const next = { ...cur.data, profile: { ...(cur.data.profile || {}), hand } };
  if (argv.includes("--dry-run")) { console.log(`would set ${caseId} hand ${hand}`); process.exit(0); }
  const res = await cases.setJSON(caseId, next, { onlyIfMatch: cur.etag });
  if (res.modified) { console.log(`${caseId} hand ${hand}`); process.exit(0); }
}
console.error("lost the write race five times"); process.exit(1);
