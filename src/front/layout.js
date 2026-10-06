// THE DESK'S GRID (Scott, 2026-10-06): the windows sit on a home-screen grid, the visitor drags them
// into spots and picks a size for each. Everything here is pure (no React, no DOM) so
// scripts/check-desk.mjs can run it; FrontDesk.jsx draws it.
//   SIZES    S 1x1 a glance, M 2x1, T 1x2, L 2x2, W 4x1 (the whole row on 3
//            columns; a phone gets M).
//            A widget lists the sizes it has a prepared layout for (SIZES_OF); each size is its own
//            version in the widget's VIEWS_<id> table, never one layout stretched.
//   COLUMNS  4 on a wide desk, 3 mid, 2 on a phone (colsFor); rows are automatic, packing is dense.
//   LAYOUT   [{ id, size, order }] kept on this device (hvi-layout). The old hvi-widgets id list
//            migrates into it once.
import { WIDGETS, DEFAULT_WIDGETS, loadWidgets, get, put } from "./prefs.js";

export const SIZE = { S: [1, 1], M: [2, 1], T: [1, 2], L: [2, 2], W: [4, 1] };
export const SIZE_NAME = { S: "SMALL", M: "MEDIUM", T: "TALL", L: "LARGE", W: "WIDE" };
export const SIZE_ORDER = ["S", "M", "T", "L", "W"];   // what + and - walk through
export const SIZES_OF = {
  market: ["S", "M", "T", "L", "W"], wire: ["S", "M", "L", "W"], cam: ["S", "M", "T", "L"], notice: ["S", "M"],
  file: ["S", "M", "L"], flat: ["S", "M", "L"], watch: ["S", "M", "L", "W"], set: ["S", "M", "L"],
  paper: ["S", "M", "L"], cups: ["S", "M", "L"], league: ["S", "M", "L"],
};
export const DEFAULT_SIZE = { market: "M", wire: "W", watch: "L", set: "M", notice: "S" };
export const sizeOf = (id) => DEFAULT_SIZE[id] || "M";
export const DEFAULT_LAYOUT = DEFAULT_WIDGETS.map((id, order) => ({ id, size: sizeOf(id), order }));
const KNOWN = new Set(WIDGETS.map(w => w.id));
const nameOf = (id) => WIDGETS.find(w => w.id === id)?.name || id;

export const colsFor = (px) => (px >= 700 ? 4 : px >= 480 ? 3 : 2);
// W is the whole row on a wide desk; a phone's two columns get a M
export const effSize = (size, cols) => (size === "W" && cols < 3 ? "M" : size);
export const spans = (size, cols) => { const [w, h] = SIZE[size]; return [Math.min(w, cols), h]; };   // W is 4 wide, or the whole row at 3

// any list of {id, size}: known ids once each, a size the widget has (else its default), order 0..n-1
export function normalize(list) {
  const seen = new Set(), out = [];
  for (const x of (Array.isArray(list) ? list : []).slice().sort((a, b) => (a?.order ?? 1e9) - (b?.order ?? 1e9))) {
    if (!x || !KNOWN.has(x.id) || seen.has(x.id)) continue;
    seen.add(x.id);
    const ok = SIZES_OF[x.id]?.includes(x.size);
    out.push({ id: x.id, size: ok ? x.size : sizeOf(x.id) });
  }
  return out.map((x, order) => ({ ...x, order }));
}
// the saved grid, else the old saved id list migrated, else the default desk
export function loadLayout() {
  try {
    const v = JSON.parse(get("hvi-layout") || "null");
    if (Array.isArray(v)) return normalize(v);
  } catch { /* migrate or default */ }
  if (get("hvi-widgets") != null) return normalize(loadWidgets().map((id, order) => ({ id, size: sizeOf(id), order })));
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
export const resize = (l, id, size) => normalize(l.map(x => (x.id === id && SIZES_OF[id]?.includes(size) ? { ...x, size } : x)));
export function step(l, id, dir) {
  const it = l.find(x => x.id === id);
  if (!it) return l;
  const ladder = SIZE_ORDER.filter(s => SIZES_OF[id].includes(s));
  return resize(l, id, ladder[Math.max(0, Math.min(ladder.length - 1, ladder.indexOf(it.size) + dir))]);
}
export const removeId = (l, id) => normalize(l.filter(x => x.id !== id));
export const addId = (l, id) => (l.some(x => x.id === id) ? l : normalize([...l, { id, size: sizeOf(id), order: l.length }]));
// the WIDGETS dialog hands back the ticked ids in its order: keep each one's size, add new ones small-default
export const fromIds = (l, ids) => normalize(ids.map((id, order) => ({ ...(l.find(x => x.id === id) || { id, size: sizeOf(id) }), order })));

// keyboard on a focused window: arrows move it, + and - resize it, Delete removes it.
// -> { layout, say } (say is for the screen reader), or null for a key that means nothing here
export function keyAction(l, id, key) {
  const i = l.findIndex(x => x.id === id), name = nameOf(id);
  if (i < 0) return null;
  const move = (k) => {
    const j = i + k;
    if (j < 0 || j >= l.length) return { layout: l, say: `${name} IS ALREADY ${k < 0 ? "FIRST" : "LAST"}.` };
    return { layout: moveTo(l, id, j), say: `${name} MOVED TO ${j + 1} OF ${l.length}.` };
  };
  const grow = (k) => {
    const n = step(l, id, k), s = n.find(x => x.id === id).size;
    if (n === l || s === l[i].size) return { layout: l, say: `${name} IS ALREADY THE ${k > 0 ? "LARGEST" : "SMALLEST"} IT COMES.` };
    return { layout: n, say: `${name} NOW ${SIZE_NAME[s]}, ${SIZE[s][0]} BY ${SIZE[s][1]}.` };
  };
  if (key === "ArrowLeft" || key === "ArrowUp") return move(-1);
  if (key === "ArrowRight" || key === "ArrowDown") return move(1);
  if (key === "+" || key === "=") return grow(1);
  if (key === "-" || key === "_") return grow(-1);
  if (key === "Delete" || key === "Backspace") return { layout: removeId(l, id), say: `${name} REMOVED FROM THE DESK.` };
  return null;
}
