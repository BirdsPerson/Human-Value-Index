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
assert.deepEqual(L.DEFAULT_LAYOUT.map(x => `${x.id}:${x.size}:${x.zone}`), ["market:M:rail", "watch:L:rail", "wire:W:main", "set:M:main", "notice:M:main"], "the default desk: MARKET and SURVEILLANCE in the column, the rest under it");
assert.ok(L.DEFAULT_LAYOUT.every(x => L.SIZES_OF[x.id].includes(x.size)), "default sizes are ones the widget has");
// columns: 4 wide, 3 mid, 2 on a phone; W is the whole row on 3 and a M on a phone
assert.deepEqual([320, 358, 480, 640, 700, 1008].map(L.colsFor), [2, 2, 3, 3, 4, 4]);
assert.equal(L.effSize("W", 2), "M"); assert.equal(L.effSize("W", 4), "W"); assert.equal(L.effSize("L", 2), "L");
assert.deepEqual(L.spans("W", 4), [4, 1]); assert.deepEqual(L.spans("W", 3), [3, 1]); assert.deepEqual(L.spans("L", 2), [2, 2]);
// persistence: nothing saved is the default; a save round-trips; a bad size or id is repaired; every saved item carries its zone
assert.deepEqual(L.loadLayout(), L.DEFAULT_LAYOUT, "nothing saved: the default desk");
const mine = L.normalize([{ id: "cam", size: "L" }, { id: "paper", size: "S" }, { id: "market", size: "T", zone: "main" }]);
L.saveLayout(mine);
assert.deepEqual(L.loadLayout(), mine, "layout round-trips through storage");
assert.deepEqual(mine.map(x => x.order), [0, 1, 2]);
assert.ok(JSON.parse(store.get("hvi-layout")).every(x => x.zone === "rail" || x.zone === "main"), "every saved item carries its zone");
store.set("hvi-layout", JSON.stringify([{ id: "market", size: "Z", order: 1 }, { id: "ghost", size: "M", order: 0 }, { id: "market", size: "M", order: 2 }, { id: "notice", size: "L", order: 3 }]));
assert.deepEqual(L.loadLayout(), [{ id: "market", size: "M", zone: "main", order: 0 }, { id: "notice", size: "M", zone: "main", order: 1 }], "unknown ids, repeats and sizes a widget lacks are repaired");
store.set("hvi-layout", "{not json"); assert.deepEqual(L.loadLayout(), L.DEFAULT_LAYOUT, "garbled storage: defaults");
// MIGRATION (2026-10-07): a desk saved before the column took M and L had a zone only on items that were moved;
// the rest sat by size (S and T beside the panel, the others in main). It loads exactly where it was, written down.
const before = [{ id: "market", size: "M", order: 0 }, { id: "notice", size: "S", order: 1 }, { id: "board", size: "T", order: 2 }, { id: "paper", size: "S", order: 3, zone: "main" }, { id: "watch", size: "L", order: 4, zone: "main" }, { id: "cups", size: "S", order: 5, zone: "rail" }];
store.clear(); store.set("hvi-layout", JSON.stringify(before));
const after = L.loadLayout();
assert.deepEqual(after.map(x => `${x.id}:${x.size}:${x.zone}`), ["market:M:main", "notice:S:rail", "board:T:rail", "paper:S:main", "watch:L:main", "cups:S:rail"], "an old desk keeps every window, its size, its order and its side");
assert.deepEqual(after.map(L.zoneOf), before.map(x => (x.zone || (x.size === "S" || x.size === "T" ? "rail" : "main"))), "the old placement rule, applied once and saved");
L.saveLayout(after); assert.deepEqual(L.loadLayout(), after, "and stays put");
// the older id list (hvi-widgets) becomes the grid with the sizes it drew at, order kept
store.clear(); store.set("hvi-widgets", JSON.stringify(["cam", "bogus", "notice", "cam", "league"]));
assert.deepEqual(L.loadLayout(), [{ id: "cam", size: "M", zone: "main", order: 0 }, { id: "notice", size: "S", zone: "rail", order: 1 }, { id: "league", size: "M", zone: "main", order: 2 }], "the saved order migrates into the grid");
store.clear(); store.set("hvi-widgets", "[]"); assert.deepEqual(L.loadLayout(), [], "a deliberately empty desk stays empty");
store.clear();
// the edits and the keyboard (a pure function: FrontDesk only draws what it returns), on the old default desk
const g = L.normalize([{ id: "market", size: "M" }, { id: "wire", size: "W" }, { id: "watch", size: "L" }, { id: "set", size: "M" }, { id: "notice", size: "S" }]);
assert.deepEqual(L.moveTo(g, "market", 3).map(x => x.id), ["wire", "watch", "set", "market", "notice"]);
assert.deepEqual(L.moveTo(g, "notice", 0).map(x => x.order), [0, 1, 2, 3, 4], "moves renumber");
assert.deepEqual(L.fromIds(g, ["notice", "cam", "market"]).map(x => `${x.id}:${x.size}:${x.zone}`), ["notice:S:rail", "cam:M:main", "market:M:main"], "the WIDGETS dialog keeps sizes and sides, and adds new ones at their default in main");
assert.equal(L.addId(g, "cups").find(x => x.id === "cups").zone, "main");
let r = L.keyAction(g, "wire", "ArrowRight");
assert.deepEqual(r.layout.map(x => x.id), ["market", "watch", "wire", "set", "notice"]); assert.match(r.say, /WIRE\.TKR MOVED TO 3 OF 5/);
assert.match(L.keyAction(g, "notice", "ArrowUp").say, /ALREADY FIRST/, "first in the column: stays");
assert.equal(L.keyAction(g, "notice", "ArrowUp").layout, g);
assert.match(L.keyAction(g, "set", "ArrowDown").say, /ALREADY LAST/, "last in the main grid: stays");
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
// ---- zones: THE COLUMN beside the panel (S M T L), the main grid under both ----------------------------------------
assert.deepEqual(g.map(L.zoneOf), ["main", "main", "main", "main", "rail"], "an old desk: S and T beside the panel, the rest in main");
assert.deepEqual([L.zoneOf({ size: "S", zone: "main" }), L.zoneOf({ size: "M", zone: "rail" }), L.zoneOf({ size: "L", zone: "rail" }), L.zoneOf({ size: "W", zone: "rail" })], ["main", "rail", "rail", "main"], "a saved side wins; the column holds S M T L, never W");
assert.deepEqual(L.COLUMN_SIZES, ["S", "M", "T", "L"]);
assert.deepEqual(["S", "T", "M", "L", "W"].map(k => L.fitRail("market", k)), ["S", "T", "M", "L", "M"], "two tracks: everything but W fits; W becomes a M");
assert.deepEqual(["S", "T", "M", "L", "W"].map(k => L.fitRail("market", k, 1)), ["S", "T", "S", "T", "T"], "one track: S and T only");
assert.equal(L.fitRail("notice", "M"), "M"); assert.equal(L.fitRail("flat", "L", 1), "S", "a widget with no T takes its S in one track");
assert.deepEqual([300, 311, 312, 600].map(L.colTracks), [1, 1, 2, 2], "two tracks from 312px (two 150px tracks and the gap)"); assert.deepEqual([899, 900].map(L.railBeside), [false, true], "the column needs 900px; a phone folds it in");
assert.deepEqual([L.sizesIn("rail"), L.sizesIn("rail", 1), L.sizesIn("main")], [["S", "M", "T", "L"], ["S", "T"], ["S", "M", "T", "L", "W"]]);
assert.equal(L.colWide([{ size: "S" }, { size: "T" }]), false); assert.equal(L.colWide([{ size: "S" }, { size: "L" }]), true, "a M or L widens the column");
let z = L.toZone(g, "market", "rail");
assert.deepEqual([z.find(x => x.id === "market").size, z.find(x => x.id === "market").zone], ["M", "rail"], "market M dragged into the column stays a M");
assert.deepEqual(L.toZone(g, "wire", "rail").find(x => x.id === "wire").size, "M", "a W dragged into the column becomes a M");
assert.equal(L.toZone(g, "watch", "rail", null, 1).find(x => x.id === "watch").size, "T", "a one-track column fits a L as a T");
assert.equal(L.toZone(g, "notice", "rail", "market")[0].id, "notice", "dropped before a window of that zone");
z = L.toZone(g, "wire", "main", "set"); assert.deepEqual(z.map(x => x.id), ["market", "watch", "wire", "set", "notice"]);
z = L.toZone(g, "notice", "main"); assert.equal(z.find(x => x.id === "notice").zone, "main"); assert.equal(L.zoneOf(z.find(x => x.id === "notice")), "main", "S put in main stays in main");
L.saveLayout(z); assert.equal(L.loadLayout().find(x => x.id === "notice").zone, "main");
assert.equal(L.normalize([{ id: "market", size: "L", zone: "rail" }])[0].zone, "rail", "the column keeps a L");
assert.equal(L.normalize([{ id: "market", size: "W", zone: "rail" }])[0].zone, "main", "a W is never in the column");
// growing in the column: S, M, T, L stay; W graduates to main
let col = L.resize(L.toZone(g, "market", "rail"), "market", "S");
const mk = (l) => { const x = l.find(y => y.id === "market"); return [x.size, L.zoneOf(x)]; };
r = L.keyAction(col, "market", "+"); assert.deepEqual(mk(r.layout), ["M", "rail"], "a M stays in the column");
r = L.keyAction(r.layout, "market", "+"); assert.deepEqual(mk(r.layout), ["T", "rail"]);
r = L.keyAction(r.layout, "market", "+"); assert.deepEqual(mk(r.layout), ["L", "rail"], "a L stays in the column");
r = L.keyAction(r.layout, "market", "+"); assert.deepEqual([r.layout.find(x => x.id === "market").size, L.zoneOf(r.layout.find(x => x.id === "market"))], ["W", "main"], "W leaves the column"); assert.match(r.say, /OUT OF THE COLUMN/);
// the keys cross the edge: down past the column's end goes into main, up past main's start into the column (fitted)
r = L.keyAction(L.toZone(g, "market", "rail", "notice"), "market", "ArrowDown");
assert.equal(L.zoneOf(r.layout.find(x => x.id === "market")), "rail", "stepping down in the column passes the next window");
r = L.keyAction(r.layout, "market", "ArrowDown"); assert.equal(L.zoneOf(r.layout.find(x => x.id === "market")), "main", "past the column's end it crosses into main"); assert.match(r.say, /MAIN GRID/);
r = L.keyAction(g, "market", "ArrowUp"); assert.equal(L.zoneOf(r.layout.find(x => x.id === "market")), "rail", "up from the start of main crosses into the column"); assert.equal(r.layout.find(x => x.id === "market").size, "M"); assert.match(r.say, /COLUMN/);
r = L.keyAction(L.moveTo(g, "wire", 0), "wire", "ArrowUp"); assert.equal(r.layout.find(x => x.id === "wire").size, "M", "a W crossing into the column fits as a M");
// ---- drag-to-resize: the pointer's travel is cells; the cells snap to the nearest prepared size ------------------
const M = { col: 190, row: 196, gap: 12 };
assert.deepEqual(L.cellsAt(100, 100, M, 4), { w: 1, h: 1 }); assert.deepEqual(L.cellsAt(400, 200, M, 4), { w: 2, h: 1 }); assert.deepEqual(L.cellsAt(400, 420, M, 4), { w: 2, h: 2 });
assert.deepEqual(L.cellsAt(9999, 9999, M, 3), { w: 3, h: 4 }, "clamped to the grid"); assert.deepEqual(L.cellsAt(-50, -50, M, 4), { w: 1, h: 1 });
const sn = (id, w, h, c = 4, zone) => L.snapSize(id, w, h, c, zone);
assert.deepEqual([sn("market", 1, 1), sn("market", 2, 1), sn("market", 1, 2), sn("market", 2, 2), sn("market", 4, 1)], ["S", "M", "T", "L", "W"], "each cell shape lands on its own size");
assert.equal(sn("market", 3, 1), "M", "3x1 is nearer 2x1 than 4x1: ties go to the smaller"); assert.equal(sn("market", 2, 3), "L", "a tall drag: the largest that is near");
assert.equal(sn("market", 4, 1, 2), "M", "a phone has no W"); assert.equal(sn("market", 4, 1, 3), "W");
assert.equal(sn("notice", 4, 4), "M", "a widget with S and M only: the nearest it has"); assert.equal(sn("flat", 1, 2), "S", "no T: S (the nearest of S M L)");
assert.deepEqual([sn("market", 2, 2, 2, "rail"), sn("market", 1, 1, 2, "rail"), sn("market", 1, 3, 2, "rail"), sn("market", 2, 1, 2, "rail")], ["L", "S", "T", "M"], "the column offers S M T L");
assert.deepEqual([sn("market", 2, 2, 1, "rail"), sn("market", 2, 1, 1, "rail")], ["T", "S"], "a one-track column: S and T");
for (const id of ids) for (const k of L.SIZES_OF[id]) { const [w, h] = L.SIZE[k]; assert.equal(sn(id, Math.min(w, 4), h, 4), k, `${id}: its own ${k} cells snap back to ${k}`); if (k !== "W") assert.equal(sn(id, w, h, 2, "rail"), k, `${id}: ${k} in the column`); }
assert.match(desk, /className="fr-rz"/, "the grip is in the cell's edit overlay"); assert.match(desk, /fr-rz-prev/, "an outline previews the size");
assert.match(css, /\.fr-rz \{[^}]*nwse-resize/, "Win98 corner grip"); assert.match(desk, /aria-pressed=\{size === k\}/, "the S M T L W buttons stay for the keyboard");
assert.ok(/data-zone="rail"/.test(desk) && /railBeside/.test(desk) && /data-wide=\{colWide\(railItems\)/.test(desk), "the column beside the panel, widened for a M or L, folded on a phone");
const core = src("src/coreScreens.css");
assert.match(core, /\.hvi-desk-side \{ display: contents; \}/, "the column and the main grid are the logon grid's own children");
assert.match(core, /minmax\(440px, 640px\) minmax\(var\(--col-min\), 1fr\)/, "the panel gives way to the column");
assert.match(core, /\.hvi-desk:has\(\.fr-rail\[data-wide\]\) \{ --col-min: 340px; \}/, "two 150px tracks and the gap once it holds a M or L");
assert.match(core, /\.hvi-wrap\.wide:has\(> \.hvi-desk\) \{ max-width: 1400px; \}/, "the logon page is wider than the rooms");
// ---- every S earns its space (Scott, 2026-10-07): it cycles live data, slowly, or it is a dense readout -------------
const C = src("src/front/cycle.jsx");
assert.ok(/CYCLE_MS = (\d+)/.test(C) && +C.match(/CYCLE_MS = (\d+)/)[1] >= 6000, "slow: six seconds or more an item");
assert.ok(/prefers-reduced-motion: reduce/.test(C) && /useState\(reduced\)/.test(C) && /if \(still \|\| hold/.test(C), "reduced motion: static, stepped by hand");
assert.ok(/onMouseEnter/.test(C) && /onFocus/.test(C) && /document\.hidden/.test(C), "held while hovered or focused; idle in a hidden tab");
assert.ok(/aria-label=\{`Previous \$\{what\}`\}/.test(C) && /aria-label=\{`Next \$\{what\}`\}/.test(C), "the steps are labelled buttons");
const S_VIEW = { market: ["FrontDesk.jsx", /function MarketS[\s\S]*?useCycle/], wire: ["FrontDesk.jsx", /S: \(w\) => [^\n]*<Step /], cam: ["FrontDesk.jsx", /function CamS[\s\S]*?useCycle/], notice: ["FrontDesk.jsx", /function NoticeS[\s\S]*?useCycle/],
  paper: ["Smalls.jsx", /function PaperS[\s\S]*?useCycle/], cups: ["Smalls.jsx", /function CupsS[\s\S]*?useCycle/], board: ["Leaderboard.jsx", /function BoardS[\s\S]*?useCycle/], set: ["TheSet.jsx", /S: \(t\) => <div className="fr-set-s"><Screen /],
  watch: ["Surveillance.jsx", /size === "S" && !embedded && <Step /], league: ["Smalls.jsx", /S: \(\{ cup \}\) => \(\s*<a className="fr-dense"/], file: ["YourFile.jsx", /S: \(\{ id, mine, tier, mail \}\)[\s\S]*?cubePlace[\s\S]*?Sparkline/], flat: ["YourFlat.jsx", /S: <a className="fr-glance"[^\n]*buildingName[^\n]*home/] };
assert.deepEqual(Object.keys(S_VIEW).sort(), ids.slice().sort(), "every widget's S is accounted for");
for (const [id, [f, re]] of Object.entries(S_VIEW)) assert.match(src(`src/front/${f}`), re, `${id}: its S cycles or reads densely`);
assert.match(desk, /CAM_TOUR = \[\[null, "THE WHOLE CITY"\]/); { const { DISTRICT } = await import("../src/city/sim.js"); for (const [, d] of desk.match(/CAM_TOUR = (\[[^\n]*\]);/)[1].matchAll(/\["([a-z]+)"/g)) assert.ok(DISTRICT[d], `the cam tour's ${d} is a district`); }
assert.ok(/if \(still \|\| hold \|\| n < 2\)/.test(C), "nothing cycles a list of one");

// ---- LEADERBOARD: its views per size (the VIEWS_board table is checked with the others), the pure half ------------
const B = await import("../src/front/board.js");
const T0 = Date.UTC(2026, 9, 7, 15), H = 3600e3;
const ev = (o) => ({ id: "x", game: "golf", name: "THE DAILY AUDIT", href: "#golf", status: "open", opens: T0 - H, closes: T0 + 5 * H, entrants: 3, leaders: { open: [{ pos: 1, holder: "SUBJECT 1A", total: 34, par: 36, legs: 1, of: 1, done: true }, { pos: 2, holder: "SUBJECT 2B", total: 36, par: 36 }], assisted: [] }, ...o });
assert.equal(B.pickEvent([ev({ id: "a", status: "closed", closes: T0 - 5 * H }), ev({ id: "b" })], T0).ev.id, "b", "a live event beats a finished one");
assert.equal(B.pickEvent([ev({ id: "a", entrants: 2 }), ev({ id: "m", major: true, entrants: 1 }), ev({ id: "c", entrants: 9 })], T0).ev.id, "m", "a major first, then the most entrants");
const last = B.pickEvent([ev({ id: "old", status: "closed", closes: T0 - 50 * H }), ev({ id: "new", status: "closed", closes: T0 - 5 * H }), ev({ id: "up", status: "upcoming", closes: T0 + 99 * H })], T0);
assert.deepEqual([last.ev.id, last.live], ["new", false], "none live: the last final");
assert.equal(B.pickEvent([], T0), null); assert.equal(B.pickEvent([ev({ game: "bowling" })], T0, "golf"), null, "the golf channel wants golf");
assert.deepEqual([34, 36, 40].map(t => B.scoreText(ev({}), { total: t, par: 36 })), ["−2", "E", "+4"], "golf reads to par");
assert.equal(B.scoreText(ev({ game: "bowling" }), { total: 551 }), "551"); assert.equal(B.scoreText(ev({ game: "fish" }), { total: 412 }), "4.12 LB");
const rowsNow = [{ holder: "A", pos: 1 }, { holder: "B", pos: 2 }, { holder: "C", pos: 3 }, { holder: "D", pos: 4 }];
const mv = B.moves({ A: 2, B: 1, C: 3 }, rowsNow);
assert.deepEqual(mv, { A: 1, B: -1, C: 0, D: null }, "up, down, held, new");
assert.deepEqual([1, -2, 0, null].map(d => B.arrowOf(d).ch), ["▲", "▼", "■", "◆"], "direction by shape, not colour");
assert.deepEqual(B.snapshot(rowsNow), { A: 1, B: 2, C: 3, D: 4 });
assert.equal(B.bug(17, -2), "ON THE 17TH · −2"); assert.equal(B.bug(1, 0), "ON THE 1ST · E"); assert.equal(B.bug(12, 3), "ON THE 12TH · +3");
assert.match(B.whenText(ev({}), true, T0), /CLOSES IN 5H/); assert.equal(B.whenText(ev({}), false, T0), "FINAL");
// the golf channel re-plays a stored card exactly as the server verified it, a few ticks at a time
const GS = await import("../src/play/golf/sim.js"), CAST = await import("../src/front/golfcast.js");
const gcfg = { seed: 4242, course: "links", mode: "stroke", start: 0, count: 9, player: { name: "SUBJECT 7Q2X" }, cpu: null };
const played = GS.autoplay(gcfg), cast = CAST.makeCast({ cfg: gcfg, inputLog: played.log });
let first = null, frames = 0;
while (!cast.info().done && frames < 1e5) { cast.advance(8); frames++; first ||= cast.info().text; }
assert.ok(cast.info().done, "the card finishes"); assert.match(first, /^ON THE \dTH|^ON THE 1ST/, "the bug opens on a hole");
assert.equal(cast.info().toPar, played.st.result.toPar[0], "the replayed card's score is the verified one");
assert.ok(frames < played.st.tick / 8, `dead air runs fast (${frames} frames for ${played.st.tick} ticks)`);
const srv = src("netlify/functions/tournament.js");
assert.ok(/leaderLog/.test(srv) && /putLog/.test(srv) && !/cid|caseId/.test(srv.slice(srv.indexOf("export async function leaderLog"), srv.indexOf("export default"))), "the leader's log is served by place, with no case id");
const ch = src("src/front/TheSet.jsx"); assert.match(ch, /n: 3, id: "tour", name: "THE TOURNAMENT"/, "CH 3 is THE TOURNAMENT");
assert.ok(/import\("\.\.\/play\/golf\/render\.js"\)/.test(src("src/front/TourneyChannel.jsx")) && !/from "\.\.\/play\/golf\/render/.test(src("src/front/TourneyChannel.jsx")), "the golf renderer is lazy");
console.log(`check-desk ok: ${ids.length} widgets, ${w.subjects.length} watched, all public and clean, ${ids.length} widgets x sizes, grid + column + migration + keys, every S cycles or reads densely`);
