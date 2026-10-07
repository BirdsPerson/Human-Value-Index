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
assert.match(L.keyAction(g, "notice", "ArrowUp").say, /ALREADY FIRST/, "first in the rail: stays");
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
// ---- zones: the rail beside the panel, the main grid under it --------------------------------------------------
assert.deepEqual(g.map(L.zoneOf), ["main", "main", "main", "main", "rail"], "S and T sit in the rail until put somewhere; the rest in main");
assert.deepEqual([L.zoneOf({ size: "S", zone: "main" }), L.zoneOf({ size: "M", zone: "rail" })], ["main", "rail"], "a saved zone wins");
assert.deepEqual(["S", "T", "M", "L", "W"].map(k => L.fitRail("market", k)), ["S", "T", "S", "T", "S"], "too-big windows snap to a size that fits the rail");
assert.equal(L.fitRail("notice", "M"), "S"); assert.equal(L.fitRail("file", "L"), "S", "a widget with no T takes its S");
assert.deepEqual([300, 329, 330, 600].map(L.railCols), [1, 1, 2, 2]); assert.deepEqual([899, 900].map(L.railBeside), [false, true], "the rail needs 900px; a phone merges it");
let z = L.toZone(g, "market", "rail");
assert.deepEqual([z.find(x => x.id === "market").size, z.find(x => x.id === "market").zone], ["S", "rail"], "market M dragged into the rail becomes a S there");
assert.equal(L.toZone(g, "notice", "rail", "market")[0].id, "notice", "dropped before a window of that zone"); // renumbered
z = L.toZone(g, "wire", "main", "set"); assert.deepEqual(z.map(x => x.id), ["market", "watch", "wire", "set", "notice"]);
z = L.toZone(g, "notice", "main"); assert.equal(z.find(x => x.id === "notice").zone, "main"); assert.equal(L.zoneOf(z.find(x => x.id === "notice")), "main", "S put in main stays in main");
// zone survives storage; a rail window bigger than the rail is repaired; unsaved zones stay out of the saved list
L.saveLayout(z); assert.equal(L.loadLayout().find(x => x.id === "notice").zone, "main");
assert.ok(!("zone" in L.normalize(g)[0]), "no zone is written until one is chosen");
assert.equal(L.normalize([{ id: "market", size: "L", zone: "rail" }])[0].zone, undefined, "a rail holds only S and T");
// growing a rail window past the rail graduates it
r = L.keyAction(L.toZone(g, "market", "rail"), "market", "+"); assert.equal(r.layout.find(x => x.id === "market").size, "M"); assert.equal(L.zoneOf(r.layout.find(x => x.id === "market")), "main", "S to M leaves the rail");
assert.equal(L.zoneOf(L.resize(L.toZone(g, "market", "rail"), "market", "T").find(x => x.id === "market")), "rail", "a T stays");
// the keys cross the edge: down past the rail's end goes into main, up past main's start into the rail (fitted)
r = L.keyAction(L.toZone(g, "market", "rail", "notice"), "market", "ArrowDown");
assert.equal(L.zoneOf(r.layout.find(x => x.id === "market")), "rail", "stepping down in the rail passes the next window");
r = L.keyAction(r.layout, "market", "ArrowDown"); assert.equal(L.zoneOf(r.layout.find(x => x.id === "market")), "main", "past the rail's end it crosses into main"); assert.match(r.say, /MAIN GRID/);
r = L.keyAction(g, "market", "ArrowUp"); assert.equal(L.zoneOf(r.layout.find(x => x.id === "market")), "rail", "up from the start of main crosses into the rail"); assert.equal(r.layout.find(x => x.id === "market").size, "S"); assert.match(r.say, /RAIL/);
// ---- drag-to-resize: the pointer's travel is cells; the cells snap to the nearest prepared size ------------------
const M = { col: 190, row: 196, gap: 12 };
assert.deepEqual(L.cellsAt(100, 100, M, 4), { w: 1, h: 1 }); assert.deepEqual(L.cellsAt(400, 200, M, 4), { w: 2, h: 1 }); assert.deepEqual(L.cellsAt(400, 420, M, 4), { w: 2, h: 2 });
assert.deepEqual(L.cellsAt(9999, 9999, M, 3), { w: 3, h: 4 }, "clamped to the grid"); assert.deepEqual(L.cellsAt(-50, -50, M, 4), { w: 1, h: 1 });
const sn = (id, w, h, c = 4, zone) => L.snapSize(id, w, h, c, zone);
assert.deepEqual([sn("market", 1, 1), sn("market", 2, 1), sn("market", 1, 2), sn("market", 2, 2), sn("market", 4, 1)], ["S", "M", "T", "L", "W"], "each cell shape lands on its own size");
assert.equal(sn("market", 3, 1), "M", "3x1 is nearer 2x1 than 4x1: ties go to the smaller"); assert.equal(sn("market", 2, 3), "L", "a tall drag: the largest that is near");
assert.equal(sn("market", 4, 1, 2), "M", "a phone has no W"); assert.equal(sn("market", 4, 1, 3), "W");
assert.equal(sn("notice", 4, 4), "M", "a widget with S and M only: the nearest it has"); assert.equal(sn("file", 1, 2), "S", "no T: S (the nearest of S M L)");
assert.deepEqual([sn("market", 2, 2, 2, "rail"), sn("market", 1, 1, 2, "rail"), sn("market", 1, 3, 2, "rail")], ["T", "S", "T"], "in the rail only S and T are offered");
for (const id of ids) for (const k of L.SIZES_OF[id]) { const [w, h] = L.SIZE[k]; assert.equal(sn(id, Math.min(w, 4), h, 4), k, `${id}: its own ${k} cells snap back to ${k}`); }
assert.match(desk, /className="fr-rz"/, "the grip is in the cell's edit overlay"); assert.match(desk, /fr-rz-prev/, "an outline previews the size");
assert.match(css, /\.fr-rz \{[^}]*nwse-resize/, "Win98 corner grip"); assert.match(desk, /aria-pressed=\{size === k\}/, "the S M T L W buttons stay for the keyboard");
assert.ok(/data-zone="rail"/.test(desk) && /railBeside/.test(desk), "the rail beside the panel, merged on a phone");
assert.match(src("src/coreScreens.css"), /\.hvi-desk-side \{ display: contents; \}/, "the rail and the main grid are the logon grid's own children");

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
console.log(`check-desk ok: ${ids.length} widgets, ${w.subjects.length} watched, all public and clean, ${ids.length} widgets x sizes, grid + layout + keys`);
