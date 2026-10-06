// Put a subject on record as the PROPRIETOR of one of the city's businesses (or clear it): the operator's
// tool, never a public API (src/city/proprietors.js; docs/design/ECONOMY_PROPERTY.md "Proprietors").
//
//   node scripts/set-proprietor.mjs <caseId> --business goodnight-irenes [--dry-run]
//   node scripts/set-proprietor.mjs --business goodnight-irenes --clear
//
// Writes two files (commit and deploy them; nothing changes in production until then):
//   src/city/proprietors.json      {business: {owner (public census key), name (as the site shows the
//                                  subject), since (machine day), by, at}}: what the city draws
//   netlify/lib/proprietors.json   {business: {case, owner, since, by, at}}: the case id, server only
// The subject is looked up in the public census (/api/pen) to take the name the site shows. No
// economic effect: no income, no CYCLES (the business ladder, when it lands, carries the record over).
import { readFileSync, writeFileSync } from "node:fs";
import { isCaseId } from "../netlify/lib/intake.js";
import { OWNABLE } from "../src/city/proprietors.js";
import { machineClock } from "../src/city/sim.js";

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const usage = "usage: set-proprietor.mjs <caseId> --business <id> [--dry-run] | --business <id> --clear";
const business = String(opt("business") || "");
const CLEAR = argv.includes("--clear"), DRY = argv.includes("--dry-run");
const caseId = String(argv.find(a => /^HVI-/i.test(a)) || "").toUpperCase();
if (!OWNABLE.includes(business)) { console.error(`not a business that can be owned: ${business || "-"} (${OWNABLE.join(", ")})\n${usage}`); process.exit(1); }
if (!CLEAR && !isCaseId(caseId)) { console.error(usage); process.exit(1); }

const root = new URL("../", import.meta.url).pathname;
const PUB = root + "src/city/proprietors.json", PRIV = root + "netlify/lib/proprietors.json";
const read = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return {}; } };
const pub = read(PUB), priv = read(PRIV);
console.log(`now:  ${JSON.stringify(pub[business] || null)}`);

if (CLEAR) { delete pub[business]; delete priv[business]; }
else {
  // the census key and the name the site shows (the public census, as the pen reads it)
  const owner = `citizen-${caseId.slice(-4).toLowerCase()}`;
  const r = await fetch(`https://humanvalueindex.com/api/pen?cursor=${encodeURIComponent(owner.slice(0, -1))}&limit=1&fields=list`, { cache: "no-store" });
  const row = r.ok ? (await r.json()).subjects?.[0] : null;
  if (!row || row.slug !== owner) { console.error(`${owner} is not in the public census (/api/pen ${r.status}): nothing written`); process.exit(1); }
  const name = String(row.name || `SUBJECT ${caseId.slice(-4)}`).toUpperCase();
  const at = new Date().toISOString(), since = machineClock(Date.now()).day;
  pub[business] = { owner, name, since, by: "operator", at };
  priv[business] = { case: caseId, owner, since, by: "operator", at };
}
console.log(`new:  ${JSON.stringify(pub[business] || null)}`);
if (DRY) { console.log("dry run: nothing written"); process.exit(0); }
writeFileSync(PUB, JSON.stringify(pub, null, 2) + "\n");
writeFileSync(PRIV, JSON.stringify(priv, null, 2) + "\n");
console.log(`written: ${PUB.replace(root, "")}, ${PRIV.replace(root, "")}. Commit and deploy them.`);
