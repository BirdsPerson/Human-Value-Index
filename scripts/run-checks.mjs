// Every pre-push check in one command (the nightly loop's allowlist runs `node scripts/*`):
// each scripts/check-*.mjs, then scripts/check_sprite_qa.py. Exit 1 if any fails.
// Run after `npm run build` (check-bundle reads dist/). Usage: node scripts/run-checks.mjs
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const runs = readdirSync(join(root, "scripts")).filter(f => /^check-.*\.mjs$/.test(f)).sort()
  .map(f => ["node", [join("scripts", f)]]).concat([["python3", ["scripts/check_sprite_qa.py"]]]);
let failed = 0;
for (const [cmd, args] of runs) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8" });
  const ok = r.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"} ${args[0]}`);
  if (!ok) { failed++; console.log(((r.stdout || "") + (r.stderr || "")).trim().split("\n").slice(-8).join("\n")); }
}
console.log(failed ? `${failed} FAILED` : "ALL PASS");
process.exit(failed ? 1 : 0);
