// THE DESK'S GRID (Scott, 2026-10-06; the column, 2026-10-07): the windows sit on a home-screen grid, the
// visitor drags them into spots and picks a size for each. Everything here is pure (no React, no DOM) so
// scripts/check-desk.mjs can run it; FrontDesk.jsx draws it.
//   SIZES    S 1x1, M 2x1, T 1x2, L 2x2, W 4x1 (the whole row on 3 columns; a phone gets M).
//            A widget lists the sizes it has a prepared layout for (SIZES_OF); each size is its own
//            version in the widget's VIEWS_<id> table, never one layout stretched.
//   COLUMNS  4 on a wide desk, 3 mid, 2 on a phone (colsFor); rows are automatic, packing is dense.
//   ZONES    two on a wide desk: the COLUMN beside the logon panel (saved as zone "rail", its old name) and the
//            MAIN grid under both. The column takes S, M, T and L (W is wider than it, main only); it is 2
//            tracks wide once it is 312px (colTracks), 1 under that, and a 1-track column offers S and T only.
//            It widens itself when it holds a M or a L (front.css, data-wide). A phone folds it into the one
//            column. Dragging a window's corner snaps to the nearest prepared size (snapSize); a W made in the
//            column graduates to main.
//   LAYOUT   [{ id, size, order, zone }] kept on this device (hvi-layout); every saved item carries its zone.
//            Older saves had no zone on most items (S and T sat beside the panel, the rest in main): they load
//            with exactly that placement written down (legacyZone), so nobody's desk moves. The older
//            hvi-widgets id list migrates in once too.
import { WIDGETS, DEFAULT_WIDGETS, loadWidgets, get, put } from "./prefs.js";

export const SIZE = { S: [1, 1], M: [2, 1], T: [1, 2], L: [2, 2], W: [4, 1] };
export const SIZE_NAME = { S: "SMALL", M: "MEDIUM", T: "TALL", L: "LARGE", W: "WIDE" };
export const SIZE_ORDER = ["S", "M", "T", "L", "W"];   // what + and - walk through
export const SIZES_OF = {
  market: ["S", "M", "T", "L", "W"], wire: ["S", "M", "T", "L", "W"], cam: ["S", "M", "T", "L"], notice: ["S", "M", "T"],
  file: ["S", "M", "T", "L"], flat: ["S", "M", "L"], watch: ["S", "M", "T", "L", "W"], set: ["S", "M", "T", "L"],
  paper: ["S", "M", "T", "L"], cups: ["S", "M", "T", "L"], league: ["S", "M", "T", "L"], board: ["S", "M", "T", "L", "W"],
};
export const DEFAULT_SIZE = { market: "M", wire: "W", watch: "L", set: "M", notice: "M" };
export const sizeOf = (id) => DEFAULT_SIZE[id] || "M";
const LEGACY_SIZE = { market: "M", wire: "W", watch: "L", set: "M", notice: "S" };   // the sizes before 2026-10-07
// the department's arrangement: MARKET and SURVEILLANCE in the column beside the panel, the rest under both
const DEFAULT_ZONE = { market: "rail", watch: "rail" };
export const DEFAULT_LAYOUT = ["market", "watch", "wire", "set", "notice"].filter(id => DEFAULT_WIDGETS.includes(id))
  .map((id, order) => ({ id, size: sizeOf(id), order, zone: DEFAULT_ZONE[id] || "main" }));
const KNOWN = new Set(WIDGETS.map(w => w.id));
const nameOf = (id) => WIDGETS.find(w => w.id === id)?.name || id;

// ---- the two zones ----------------------------------------------------------------------------------
export const COLUMN_SIZES = ["S", "M", "T", "L"];   // what the column beside the panel takes (2 tracks)
export const NARROW_SIZES = ["S", "T"];             // a 1-track column
export const TRACK_MIN = 150, TRACK_GAP = 12;
export const colTracks = (px) => (px >= 2 * TRACK_MIN + TRACK_GAP ? 2 : 1);
export const railCols = colTracks;                  // the old name
export const railBeside = (px) => px >= 900;        // beside the panel from here; folded into the one column below
export const sizesIn = (zone, tracks = 2) => (zone === "rail" ? (tracks >= 2 ? COLUMN_SIZES : NARROW_SIZES) : SIZE_ORDER);
// where an item with no saved zone sat before the column took M and L: S and T beside the panel, the rest in main
export const legacyZone = (size) => (size === "S" || size === "T" ? "rail" : "main");
export const zoneOf = (it) => (it.zone === "rail" && it.size !== "W" ? "rail" : it.zone === "main" ? "main" : legacyZone(it.size));
// a size that fits the column: W becomes the M (or L) the widget has; a 1-track column turns M into S and L into T
export function fitRail(id, size, tracks = 2) {
  const ok = sizesIn("rail", tracks), has = SIZES_OF[id] || [];
  if (ok.includes(size) && has.includes(size)) return size;
  const want = size === "W" ? ["M", "L", "T", "S"] : size === "L" ? ["T", "S"] : size === "M" ? ["S", "T"] : ["S", "T", "M", "L"];
  return want.find(k => ok.includes(k) && has.includes(k)) || has.find(k => ok.includes(k)) || size;
}
// the column widens itself (front.css) while it holds a window two tracks wide
export const colWide = (items) => items.some(x => x.size === "M" || x.size === "L");

const spansFor = (k, cols) => { const [w, h] = SIZE[k]; return [Math.min(w, cols), h]; };
// a drag's size: from the cells the pointer has covered (w across, h down) to the nearest prepared size the
// widget has. cols: the grid's columns (the column's tracks); the column offers S M T L, a 1-track column S and T.
// Ties go to the smaller.
export function snapSize(id, w, h, cols, zone = "main") {
  const ok = sizesIn(zone, cols);
  let has = (SIZES_OF[id] || []).filter(k => !(k === "W" && cols < 3) && ok.includes(k));
  if (!has.length) has = SIZES_OF[id] || ["M"];
  let best = has[0], bd = Infinity;
  for (const k of has) {
    const [sw, sh] = spansFor(k, cols), d = (sw - w) ** 2 + (sh - h) ** 2 + (SIZE[k][0] * SIZE[k][1]) / 1000;
    if (d < bd - 1e-9) { bd = d; best = k; }
  }
  return best;
}
// pointer travel from the window's top-left to whole cells: m = {col, row, gap} (a cell's width and height, the gap)
export const cellsAt = (dx, dy, m, cols) => ({ w: Math.max(1, Math.min(cols, Math.round((dx + m.gap) / (m.col + m.gap)))), h: Math.max(1, Math.min(4, Math.round((dy + m.gap) / (m.row + m.gap)))) });

export const colsFor = (px) => (px >= 700 ? 4 : px >= 480 ? 3 : 2);
// W is the whole row on a wide desk; a phone's two columns get a M
export const effSize = (size, cols) => (size === "W" && cols < 3 ? "M" : size);
export const spans = (size, cols) => { const [w, h] = SIZE[size]; return [Math.min(w, cols), h]; };   // W is 4 wide, or the whole row at 3

// any list of {id, size, zone?}: known ids once each, a size the widget has (else its default), a zone written
// down (a missing one is where the item sat before: legacyZone), order 0..n-1
export function normalize(list) {
  const seen = new Set(), out = [];
  for (const x of (Array.isArray(list) ? list : []).slice().sort((a, b) => (a?.order ?? 1e9) - (b?.order ?? 1e9))) {
    if (!x || !KNOWN.has(x.id) || seen.has(x.id)) continue;
    seen.add(x.id);
    const ok = SIZES_OF[x.id]?.includes(x.size);
    const size = ok ? x.size : sizeOf(x.id);
    out.push({ id: x.id, size, zone: zoneOf({ size, zone: x.zone }) });   // the column holds S M T L; a W there is main
  }
  return out.map((x, order) => ({ ...x, order }));
}
// the saved grid, else the old saved id list migrated, else the default desk
export function loadLayout() {
  try {
    const v = JSON.parse(get("hvi-layout") || "null");
    if (Array.isArray(v)) return normalize(v);
  } catch { /* migrate or default */ }
  if (get("hvi-widgets") != null) return normalize(loadWidgets().map((id, order) => ({ id, size: LEGACY_SIZE[id] || "M", order })));   // as that list drew
  return DEFAULT_LAYOUT.map(x => ({ ...x }));
}
export const saveLayout = (l) => put("hvi-layout", l ? JSON.stringify(normalize(l)) : null);

// ---- the edits (each returns a new list) -------------------------------------------------------
export function moveTo(l, id, to) {
  const from = l.findIndex(x => x.id === id);
  if (from < 0) return l;
  const n = l.slice(), [it] = n.splice(from, 1);
  n.splice(Math.max(0, Math.min(n.length, to)), 0, it);
  return normalize(n.map((x, order) => ({ ...x, order })));   // normalize sorts by `order`: renumber first
}
// a window in the column made W (wider than the column) graduates to the main grid
export const resize = (l, id, size) => normalize(l.map(x => (x.id === id && SIZES_OF[id]?.includes(size) ? { ...x, size, zone: zoneOf(x) === "rail" && !COLUMN_SIZES.includes(size) ? "main" : zoneOf(x) } : x)));
// put a window in a zone (a drag, or the keys crossing the edge): into the column it snaps to a size that fits.
// `before`: the id it goes in front of, else the zone's end
export function toZone(l, id, zone, before = null, tracks = 2) {
  const it = l.find(x => x.id === id);
  if (!it) return l;
  const moved = { ...it, zone, size: zone === "rail" ? fitRail(id, it.size, tracks) : it.size };
  const rest = l.filter(x => x.id !== id);
  let at = before ? rest.findIndex(x => x.id === before) : -1;
  if (at < 0) { const last = rest.map(zoneOf).lastIndexOf(zone); at = last < 0 ? (zone === "rail" ? 0 : rest.length) : last + 1; }
  const n = rest.slice(); n.splice(at, 0, moved);
  return normalize(n.map((x, order) => ({ ...x, order })));
}
export function step(l, id, dir) {
  const it = l.find(x => x.id === id);
  if (!it) return l;
  const ladder = SIZE_ORDER.filter(s => SIZES_OF[id].includes(s));
  return resize(l, id, ladder[Math.max(0, Math.min(ladder.length - 1, ladder.indexOf(it.size) + dir))]);
}
export const removeId = (l, id) => normalize(l.filter(x => x.id !== id));
export const addId = (l, id) => (l.some(x => x.id === id) ? l : normalize([...l, { id, size: sizeOf(id), zone: "main", order: l.length }]));
// the WIDGETS dialog hands back the ticked ids in its order: keep each one's size, add new ones small-default
export const fromIds = (l, ids) => normalize(ids.map((id, order) => ({ ...(l.find(x => x.id === id) || { id, size: sizeOf(id), zone: "main" }), order })));

// keyboard on a focused window: arrows move it, + and - resize it, Delete removes it.
// -> { layout, say } (say is for the screen reader), or null for a key that means nothing here
export function keyAction(l, id, key) {
  const i = l.findIndex(x => x.id === id), name = nameOf(id);
  if (i < 0) return null;
  // arrows walk the window through its zone; past the end of the column it crosses into main, past the start
  // of main it crosses into the column (and fits it)
  const move = (k) => {
    const z = zoneOf(l[i]), mine = l.filter(x => zoneOf(x) === z), at = mine.findIndex(x => x.id === id), nb = mine[at + k];
    if (nb) { const j = l.findIndex(x => x.id === nb.id); return { layout: moveTo(l, id, j), say: `${name} MOVED TO ${j + 1} OF ${l.length}.` }; }
    if (z === "rail" && k > 0 && l.some(x => zoneOf(x) === "main")) return { layout: toZone(l, id, "main", l.find(x => zoneOf(x) === "main").id), say: `${name} MOVED DOWN INTO THE MAIN GRID.` };
    if (z === "main" && k < 0) {
      const n = toZone(l, id, "rail"), s = n.find(x => x.id === id).size;
      return { layout: n, say: `${name} MOVED INTO THE COLUMN BESIDE THE PANEL, NOW ${SIZE_NAME[s]}.` };
    }
    return { layout: l, say: `${name} IS ALREADY ${k < 0 ? "FIRST" : "LAST"}.` };
  };
  const grow = (k) => {
    const n = step(l, id, k), s = n.find(x => x.id === id).size;
    if (n === l || s === l[i].size) return { layout: l, say: `${name} IS ALREADY THE ${k > 0 ? "LARGEST" : "SMALLEST"} IT COMES.` };
    return { layout: n, say: `${name} NOW ${SIZE_NAME[s]}, ${SIZE[s][0]} BY ${SIZE[s][1]}${zoneOf(l[i]) === "rail" && zoneOf(n.find(x => x.id === id)) === "main" ? ", MOVED OUT OF THE COLUMN INTO THE MAIN GRID" : ""}.` };
  };
  if (key === "ArrowLeft" || key === "ArrowUp") return move(-1);
  if (key === "ArrowRight" || key === "ArrowDown") return move(1);
  if (key === "+" || key === "=") return grow(1);
  if (key === "-" || key === "_") return grow(-1);
  if (key === "Delete" || key === "Backspace") return { layout: removeId(l, id), say: `${name} REMOVED FROM THE DESK.` };
  return null;
}
