// Nobody is sorted by whether they are alive (Scott, 2026-09-28: "everybody's just part of
// the system"). The rules stay internal (the living never speak or vouch; past tense for the
// dead; Wikidata dates for fact-checks), but nothing a user sees may label or split people
// that way. Scans the built bundle (dist/assets/*.js), so run after `npm run build`.
//   npm run build && node scripts/check-no-death-labels.mjs
import { existsSync, readdirSync, readFileSync } from "node:fs";

const dir = new URL("../dist/assets/", import.meta.url).pathname;
if (!existsSync(dir)) { console.log("check-no-death-labels: no dist/assets. Run `npm run build` first. SKIPPED, not passed."); process.exit(0); }
// Upper case is the UI voice; verdict prose on file ("died in poverty") is biography and stays.
const MARKERS = [/DECEASED/, /\bDIED\b/, /\bTHE DEAD\b/, /\bGHOSTS?\b/, /PAST TENSE/, /POSTHUMOUS/, /\b(OBITUARY|Obituary)\b/,
  /\bALIVE\b/, /LIVING OR (DEAD|OTHERWISE)/i, /\b[Tt]he dead (do|are|can|keep|have)\b/, /\bdeceased\b/,
  /\bThe subject is living\b/, /[–-]\$\{[a-z]+\.died/];
let bad = 0;
for (const f of readdirSync(dir).filter(f => f.endsWith(".js"))) {
  const src = readFileSync(dir + f, "utf8");
  for (const re of MARKERS) {
    const m = src.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) || [];
    for (const hit of new Set(m)) {
      const i = src.indexOf(hit);
      console.log(`  FAIL ${f}: ${JSON.stringify(src.slice(Math.max(0, i - 60), i + 60))}`);
      bad++;
    }
  }
}
if (bad) { console.error(`check-no-death-labels: ${bad} marker(s) in the bundle`); process.exit(1); }
console.log("check-no-death-labels: ok (no death markers in the bundle)");
