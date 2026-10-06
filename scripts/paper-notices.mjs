// DEPARTMENT NOTICES for THE DAILY COMPLIANCE (docs/PAPER.md): the site's own changelog,
// in-world, from git history at build time. Runs after `vite build` and writes
// dist/paper/notices.json; the edition builder (netlify/lib/paper.js) reads it from the
// site and keeps the notices of the day it prints. No git (a shallow or missing clone)
// writes an empty file, and the paper prints its standing notice instead.
//   node scripts/paper-notices.mjs [--print]
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { noticesFromLog } from "../netlify/lib/paper-notices.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let log = "";
try {
  log = execFileSync("git", ["log", "--since=21 days ago", "--no-merges", "--format=%ad%x1f%s", "--date=iso-strict"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
} catch { log = ""; }
const out = { at: new Date().toISOString(), days: noticesFromLog(log) };
if (process.argv.includes("--print")) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
const file = join(root, "dist", "paper", "notices.json");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out));
console.log(`paper-notices: ${Object.values(out.days).reduce((n, d) => n + d.length, 0)} notices over ${Object.keys(out.days).length} days -> dist/paper/notices.json`);
