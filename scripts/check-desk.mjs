// The landing desk (src/front/): every widget in the WIDGETS list has a renderer, the defaults
// are today's four, and SURVEILLANCE / THE SET only ever show who they may: public figures on
// file, no harm finding, facts only (no verdict, no quote); SNN's anchors are figures who have died.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FAMOUS_FIGURES } from "../src/figures.js";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const prefs = src("src/front/prefs.js"), desk = src("src/front/FrontDesk.jsx");
const ids = [...prefs.split("export const DEFAULT_WIDGETS")[0].split("export const WIDGETS")[1].matchAll(/\{ id: "([\w-]+)"/g)].map(m => m[1]);
assert.ok(ids.length >= 10, "the widget list");
const NOW = desk.match(/const NOW = \{([^}]*)\}/)[1], LAZY = desk.match(/const LAZY = \{([\s\S]*?)\n\};/)[1];
for (const id of ids) assert.ok(new RegExp(`\\b${id}:`).test(NOW) || new RegExp(`\\b${id}:`).test(LAZY), `widget ${id} has no renderer in FrontDesk.jsx`);
assert.deepEqual(JSON.parse(prefs.match(/DEFAULT_WIDGETS = (\[[^\]]*\])/)[1]), ["market", "wire", "watch", "set", "notice"], "the default desk");

const { watchList, watchable } = await import("../netlify/functions/watch.js");
const w = watchList(Date.UTC(2026, 9, 6, 12, 0));
assert.ok(w.subjects.length > 0, "someone is watched");
const byName = new Map(FAMOUS_FIGURES.map(f => [f.name.toUpperCase(), f]));
for (const s of w.subjects) {
  const f = byName.get(s.name);
  assert.ok(f, `${s.name} is a public figure on file`);
  assert.ok(!f.harm, `${s.name} carries a harm finding and must not be shown`);
  assert.ok(!("verdict" in s) && !("quote" in s), "facts only");
  assert.ok(!/^citizen-/.test(s.slug), "never a citizen");
}
assert.ok(FAMOUS_FIGURES.filter(f => f.harm).every(f => !watchable(f)));
const { fileLines } = await import("../src/front/Surveillance.jsx").catch(() => ({ fileLines: null }));
if (fileLines) assert.ok(fileLines(w.subjects[0]).every(([k]) => !/VERDICT|QUOTE/.test(k)));

const set = src("src/front/TheSet.jsx");
assert.match(set, /export const ANCHORS = FAMOUS_FIGURES\.filter\(f => f\.died && !f\.harm\)/, "SNN's anchors: dead, no harm finding");
assert.ok(FAMOUS_FIGURES.some(f => f.died && !f.harm), "an anchor exists");
console.log(`check-desk ok: ${ids.length} widgets, ${w.subjects.length} watched, all public and clean`);
