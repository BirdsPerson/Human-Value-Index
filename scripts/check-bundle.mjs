// Entry-bundle budget (docs/design-audit/AUDIT.md §3, item 7). The logon must ship only
// what it renders: fail if the entry script, gzipped, goes over 90 KB. Reads dist/, so
// run after a build; with no dist/ it says so and exits 0 rather than read as a pass.
//   npm run build && node scripts/check-bundle.mjs
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const BUDGET_KB = 90;

// The survey's questions are lazy (src/surveyQuestions.js); the logon menu states their
// count from a constant in App.jsx, so the two must agree.
const { QUESTIONS } = await import("../src/surveyQuestions.js");
const count = Number(readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8").match(/const SURVEY_COUNT = (\d+);/)?.[1]);
if (count !== QUESTIONS.length) { console.error(`FAIL SURVEY_COUNT in App.jsx is ${count}; src/surveyQuestions.js has ${QUESTIONS.length}`); process.exit(1); }
const dist = new URL("../dist/", import.meta.url).pathname;
if (!existsSync(dist + "index.html")) {
  console.log("check-bundle: no dist/index.html. Run `npm run build` first. SKIPPED, not passed.");
  process.exit(0);
}
const html = readFileSync(dist + "index.html", "utf8");
const m = html.match(/<script[^>]+type="module"[^>]+src="\/?([^"]+\.js)"/);
if (!m) { console.error("check-bundle: no module script in dist/index.html"); process.exit(1); }
const kb = gzipSync(readFileSync(dist + m[1]), { level: 9 }).length / 1024;
const line = `entry ${m[1]}: ${kb.toFixed(1)} KB gzip (budget ${BUDGET_KB} KB)`;
if (kb > BUDGET_KB) { console.error(`FAIL ${line}`); process.exit(1); }
console.log(`OK ${line}`);
