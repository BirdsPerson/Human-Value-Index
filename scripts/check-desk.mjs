// The landing desk (src/front/): every widget in the WIDGETS list has a renderer, the defaults
// are today's five, and SURVEILLANCE / THE SET only ever show who they may: public figures on
// file, no harm finding, facts only (no verdict, no quote); SNN's anchors are figures who have died.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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
// ---- the grid (Scott, 2026-10-06): sizes, per-size layouts, persistence, keyboard --------------------
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const L = await import("../src/front/layout.js");
const jsx = readdirSync(new URL("../src/front/", import.meta.url)).filter(f => f.endsWith(".jsx")).map(f => src(`src/front/${f}`)).join("\n");
for (const id of ids) {
  const sizes = L.SIZES_OF[id];
  assert.ok(Array.isArray(sizes) && sizes.length >= 2, `${id}: at least two sizes`);
  assert.ok(sizes.every(k => L.SIZE[k]) && new Set(sizes).size === sizes.length, `${id}: sizes are S, M, T, L or W, once each`);
  const table = jsx.match(new RegExp(`const VIEWS_${id} = \\{([\\s\\S]*?)\\n?\\};`));
  assert.ok(table, `${id}: no VIEWS_${id} table (one prepared layout per size)`);
  for (const k of sizes) assert.ok(new RegExp(`\\b${k}:`).test(table[1]), `${id}: no renderer for size ${k}`);
}
assert.deepEqual(Object.keys(L.SIZES_OF).sort(), ids.slice().sort(), "SIZES_OF lists exactly the widgets");
assert.deepEqual(L.DEFAULT_LAYOUT.map(x => `${x.id}:${x.size}`), ["market:M", "wire:W", "watch:L", "set:M", "notice:S"], "the default grid");
assert.ok(L.DEFAULT_LAYOUT.every(x => L.SIZES_OF[x.id].includes(x.size)), "default sizes are ones the widget has");
// columns: 4 wide, 3 mid, 2 phone; W is the whole row on 3 and a M on a phone
assert.deepEqual([320, 358, 480, 640, 700, 1008].map(L.colsFor), [2, 2, 3, 3, 4, 4]);
assert.equal(L.effSize("W", 2), "M"); assert.equal(L.effSize("W", 4), "W"); assert.equal(L.effSize("L", 2), "L");
assert.deepEqual(L.spans("W", 4), [4, 1]); assert.deepEqual(L.spans("W", 3), [3, 1]); assert.deepEqual(L.spans("L", 2), [2, 2]);
// persistence: nothing saved is the default; a save round-trips; a bad size or id is repaired
assert.deepEqual(L.loadLayout(), L.DEFAULT_LAYOUT, "nothing saved: the default desk");
const mine = L.normalize([{ id: "cam", size: "L" }, { id: "paper", size: "S" }, { id: "market", size: "T" }]);
L.saveLayout(mine);
assert.deepEqual(L.loadLayout(), mine, "layout round-trips through storage");
assert.deepEqual(mine.map(x => x.order), [0, 1, 2]);
store.set("hvi-layout", JSON.stringify([{ id: "market", size: "Z", order: 1 }, { id: "ghost", size: "M", order: 0 }, { id: "market", size: "M", order: 2 }, { id: "notice", size: "L", order: 3 }]));
assert.deepEqual(L.loadLayout(), [{ id: "market", size: "M", order: 0 }, { id: "notice", size: "S", order: 1 }], "unknown ids, repeats and sizes a widget lacks are repaired");
store.set("hvi-layout", "{not json"); assert.deepEqual(L.loadLayout(), L.DEFAULT_LAYOUT, "garbled storage: defaults");
// migration: the old saved id list (hvi-widgets) becomes the grid, order kept
store.clear(); store.set("hvi-widgets", JSON.stringify(["cam", "bogus", "market", "cam", "league"]));
assert.deepEqual(L.loadLayout(), [{ id: "cam", size: "M", order: 0 }, { id: "market", size: "M", order: 1 }, { id: "league", size: "M", order: 2 }], "the saved order migrates into the grid");
store.clear(); store.set("hvi-widgets", "[]"); assert.deepEqual(L.loadLayout(), [], "a deliberately empty desk stays empty");
// the edits and the keyboard (a pure function: FrontDesk only draws what it returns)
const g = L.DEFAULT_LAYOUT;
assert.deepEqual(L.moveTo(g, "market", 3).map(x => x.id), ["wire", "watch", "set", "market", "notice"]);
assert.deepEqual(L.moveTo(g, "notice", 0).map(x => x.order), [0, 1, 2, 3, 4], "moves renumber");
assert.deepEqual(L.fromIds(g, ["notice", "cam", "market"]).map(x => `${x.id}:${x.size}`), ["notice:S", "cam:M", "market:M"], "the WIDGETS dialog keeps sizes and adds new ones at their default");
let r = L.keyAction(g, "wire", "ArrowRight");
assert.deepEqual(r.layout.map(x => x.id), ["market", "watch", "wire", "set", "notice"]); assert.match(r.say, /WIRE\.TKR MOVED TO 3 OF 5/);
assert.equal(L.keyAction(g, "market", "ArrowLeft").layout, g, "already first: unchanged"); assert.match(L.keyAction(g, "market", "ArrowUp").say, /ALREADY FIRST/);
assert.match(L.keyAction(g, "notice", "ArrowDown").say, /ALREADY LAST/);
r = L.keyAction(g, "market", "+"); assert.equal(r.layout[0].size, "T"); assert.match(r.say, /TALL, 1 BY 2/);
r = L.keyAction(r.layout, "market", "+"); assert.equal(r.layout[0].size, "L");
r = L.keyAction(L.keyAction(g, "market", "-").layout, "market", "-"); assert.equal(r.layout[0].size, "S"); assert.match(L.keyAction(r.layout, "market", "-").say, /SMALLEST/);
assert.match(L.keyAction(L.keyAction(g, "notice", "+").layout, "notice", "+").say, /LARGEST/, "NOTICE has two sizes; + stops at M");
r = L.keyAction(g, "set", "Delete"); assert.deepEqual(r.layout.map(x => x.id), ["market", "wire", "watch", "notice"]); assert.match(r.say, /REMOVED/);
assert.equal(L.keyAction(g, "set", "q"), null); assert.equal(L.keyAction(g, "nope", "+"), null);
assert.ok(L.keyAction(g, "set", "Backspace").layout.length === 4 && L.addId(L.removeId(g, "set"), "set").length === 5, "remove, then add back");
// the drawing: dense packing, ARRANGE with pointer events and keys, announcements, no jiggle under reduced motion
const css = src("src/front/front.css");
assert.match(css, /grid-template-columns: repeat\(var\(--cols, 4\), minmax\(0, 1fr\)\)/); assert.match(css, /grid-auto-flow: row dense/);
assert.ok(css.split("\n").filter(l => /fr-jig/.test(l)).every(l => /prefers-reduced-motion: no-preference/.test(l)), "the ARRANGE wobble only plays when motion is welcome");
assert.match(css, /\.fr-ed \{[^}]*dashed/, "edit mode: dashed outline");
assert.ok(/onPointerDown/.test(desk) && /pointermove/.test(desk) && /pointercancel/.test(desk) && /380\)/.test(desk), "pointer events, with a long press for touch");
assert.ok(/onKeyDown: onKey\(id\)/.test(desk) && /role="status"/.test(desk) && /ADD WIDGET/.test(desk) && /DONE/.test(desk), "keys, announcements, ADD WIDGET and DONE");
assert.ok(/onArrange/.test(src("src/front/DeskPrefs.jsx")), "the WIDGETS dialog opens ARRANGE");
console.log(`check-desk ok: ${ids.length} widgets, ${w.subjects.length} watched, all public and clean, ${ids.length} widgets x sizes, grid + layout + keys`);
