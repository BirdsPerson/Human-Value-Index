// #city/<district>/<tower>[?floor=N]: a SimTower cross-section of a residential, office or
// mixed-use tower (docs/CITY_SPEC.md "Tower cutaways"). Every storey stacked under the roof,
// the lift shaft down the left (an express shaft down the right on the tall ones) with its car
// moving, the lobby at the street, flats split into rooms with the residents in the room the
// clock says (tower.js). Tap a floor to focus it; tap a flat (or office, or shop) on the focused
// floor to see its rooms large with who is home. Lazy: BuildingView loads this chunk for towers.
//
// One canvas as tall as the tower; each frame only the storeys inside the viewport are drawn.
// The canvas is aria-hidden: keyboard and screen readers get the wrapper (arrows, Enter,
// Escape), the plain line at the top (a live status) and the floor list under it.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { towerPlan, placeAll, nameplate, PURPOSE_NAME, isDark } from "./tower.js";
import { keyOf } from "./sim.js";
import { roomIn, activityLine, clockAt } from "./simApi.js";
import { sheetFor } from "./spriteBank.js";
import { familyOf, FAMILY_COLOR } from "./cityKit.js";
import { FONT, Occupant } from "./cityUi.jsx";
import { SPRITE_W as FW, SPRITE_H as FH } from "../sprites.js";
import { displayName } from "../figures.js";

const ROOF_H = 40, STREET_H = 16, FOUND_H = 12;
const H0 = 52, H1 = 124;          // a storey; the focused storey
const SHAFT = 30, EXPRESS = 18;   // lift shafts, CSS px
const SLAB_T = 3, SLAB_B = 4;     // ceiling and floor slabs inside a storey's height

const CSS = `
  .hvi-tw-line { color: var(--fg-dim); font-size: var(--t-xs); padding: var(--s3) var(--s3) var(--s2); margin: 0; letter-spacing: 0.04em; }
  .hvi-tw-line b { color: var(--accent); font-weight: 700; }
  .hvi-tw-index { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 var(--s3) var(--s3); }
  .hvi-tw-index button { font: inherit; font-size: var(--t-xs); min-width: 44px; min-height: 44px; background: none; color: var(--fg-mute); border: var(--bw) solid var(--line); cursor: pointer; }
  .hvi-tw-index button[aria-current="true"] { color: var(--bg); background: var(--accent); border-color: var(--accent); }
  .hvi-tw-stage { position: relative; outline: none; }
  .hvi-tw-stage:focus-visible { box-shadow: 0 0 0 2px var(--accent) inset; }
  .hvi-tw-stage canvas { display: block; width: 100%; touch-action: pan-y; cursor: pointer; image-rendering: pixelated; }
  .hvi-tw-sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 70; max-height: 64vh; padding-bottom: calc(var(--safe-b, 0px) + var(--s3)) !important; overflow-y: auto; background: var(--bg); border-top: var(--bw) solid var(--accent); padding: var(--s3); box-shadow: 0 -8px 24px rgba(0,0,0,0.6); }
  .hvi-tw-sheet-in { max-width: 760px; margin: 0 auto; }
  .hvi-tw-sheet-h { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--s3); font-size: var(--t-xs); color: var(--fg-dim); }
  .hvi-tw-sheet-h b { color: var(--accent); }
  .hvi-tw-sheet-h button { font: inherit; font-size: var(--t-xs); min-width: 44px; min-height: 44px; background: none; color: var(--accent); border: var(--bw) solid var(--accent); cursor: pointer; flex: none; }
  .hvi-tw-sheet canvas { display: block; width: 100%; margin: var(--s2) 0; image-rendering: pixelated; }
  .hvi-tw-sub { font-size: var(--t-xs); color: var(--fg-mute); margin: var(--s2) 0 var(--s1); letter-spacing: 0.06em; }
  @media (prefers-reduced-motion: reduce) { .hvi-tw-sheet { transition: none; } }
`;

// ---- colour ------------------------------------------------------------------------------------
const h01 = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const WALLS = [
  ["#1d2b33", "#22303a", "#1b2a2e", "#262f3a"],              // the top tier: glass and slate
  ["#2c2620", "#27241d", "#2d2b22", "#24291f", "#2b2224"],   // the middle: plaster, paper, brick
  ["#1f2620", "#24261c", "#1c2421", "#22231e"],              // the bottom: whatever was cheapest
];
const OFFICE_WALL = ["#1b2328", "#1e2626", "#202a24"];
function wallOf(plan, st) {
  if (st.level < 0) return "#141a16";
  const flats = st.units.some(u => u.kind === "flat" || u.kind === "suite");
  const pal = flats ? WALLS[plan.band] : OFFICE_WALL;
  return pal[Math.floor(h01(st.id) * pal.length)];
}
const CARPET = ["#5a2f2f", "#2f4a5a", "#4a5a2f", "#5a4a2f", "#3a2f5a", "#2f5a45", "#6a5a4a"];
const PURPOSE_TINT = { kitchen: "rgba(200,220,200,0.05)", bath: "rgba(160,220,230,0.07)", bedroom: "rgba(40,30,60,0.10)", study: "rgba(120,90,40,0.06)", lobby: "rgba(200,200,160,0.06)", vault: "rgba(0,0,0,0.25)" };

// ---- furniture: rects in room units (a room 45 units tall), [dx, up from the floor, w, h, colour]
const LIT = "#f5d27a";
const F = {
  bed: [[-11, 0, 2, 11, "#5a4632"], [-10, 0, 20, 5, "#5a4632"], [-10, 5, 20, 3, "#cfcab8"], [-4, 5, 14, 4, "#3d6b8f"], [-9, 8, 5, 2, "#e8e4d4"]],
  wardrobe: [[-5, 0, 10, 24, "#4a3a2a"], [-0.3, 2, 0.6, 20, "#2a2018"], [-2, 11, 1, 2, "#b8a070"], [1, 11, 1, 2, "#b8a070"]],
  lamp: [[-0.5, 0, 1, 16, "#6a6a5a"], [-3, 16, 6, 4, "#8a7a50"]],
  fridge: [[-4, 0, 8, 22, "#c9d2cd"], [-4, 13, 8, 0.7, "#7d8984"], [2, 15, 1, 4, "#7d8984"]],
  stove: [[-4, 0, 8, 10, "#3a3a3a"], [-4, 10, 8, 1, "#1e1e1e"], [-2, 11, 4, 3, "#8a8a8a"], [-3, 3, 6, 4, "#151515"]],
  counter: [[-7, 0, 14, 10, "#6b5a44"], [-7, 10, 14, 1.2, "#bfb8a2"], [-7, 22, 14, 6, "#5a4a38"]],
  table: [[-6, 8, 12, 1.5, "#7a5a3a"], [-5, 0, 1, 8, "#5a4028"], [4, 0, 1, 8, "#5a4028"]],
  tv: [[-3, 0, 6, 5, "#2e2e2e"], [-5, 7, 10, 7, "#1a2a33"], [-0.5, 5, 1, 2, "#2e2e2e"]],
  rug: [[-10, 0, 20, 0.8, "#6a2f3a"]],
  sofa: [[-8, 0, 16, 5, "#7a3b3b"], [-8, 5, 16, 4, "#6a3030"], [-9, 0, 2, 7, "#5e2a2a"], [7, 0, 2, 7, "#5e2a2a"]],
  plant: [[-2, 0, 4, 4, "#7a4a2a"], [-3, 4, 6, 6, "#3f7a3a"], [-1.5, 10, 3, 3, "#4f9a4a"]],
  tub: [[-8, 0, 16, 6, "#dfe6e3"], [-8, 6, 16, 1, "#f4f7f5"], [6, 7, 1, 4, "#9a9a9a"]],
  sink: [[-1, 0, 2, 8, "#d5d5d0"], [-3, 8, 6, 2, "#ececea"], [-3, 15, 6, 7, "#6f9797"]],
  shelf: [[-5, 0, 10, 26, "#5a4632"], [-4, 3, 8, 4, "#7a3b3b"], [-4, 10, 8, 4, "#3d6b8f"], [-4, 17, 8, 4, "#a08a3a"]],
  desk: [[-7, 9, 14, 1.5, "#6b5038"], [-6, 0, 1, 9, "#4b3828"], [5, 0, 1, 9, "#4b3828"], [-3, 10.5, 6, 5, "#1f3a2f"], [-2, 0, 4, 6, "#333"]],
  mailboxes: [[-6, 8, 12, 12, "#7d8270"], [-5, 10, 4, 3, "#4a4f40"], [1, 10, 4, 3, "#4a4f40"], [-5, 15, 4, 3, "#4a4f40"], [1, 15, 4, 3, "#4a4f40"]],
  reception: [[-7, 0, 14, 10, "#4b5a52"], [-7, 10, 14, 1.5, "#9fb3a8"]],
  cooler: [[-2, 0, 4, 12, "#cfe3dd"], [-1.5, 12, 3, 4, "#6fb3ff"]],
  rack: [[-5, 0, 10, 18, "#4a4a4a"], [-4, 2, 8, 3, "#a33"], [-4, 7, 8, 3, "#3a7"], [-4, 12, 8, 3, "#c93"]],
  till: [[-6, 0, 12, 9, "#4a5a4a"], [-2, 9, 4, 3, "#1e1e1e"]],
  bar: [[-9, 0, 18, 10, "#5a3020"], [-9, 10, 18, 1.5, "#b07a4a"], [-8, 18, 16, 1, "#3a2a1a"], [-7, 19, 2, 4, "#5a8a5a"], [-3, 19, 2, 5, "#8a5a3a"], [2, 19, 2, 4, "#5a5a8a"]],
  stool: [[-0.5, 0, 1, 6, "#555"], [-2, 6, 4, 1.2, "#a33"]],
  safe: [[-5, 0, 10, 12, "#5a5f66"], [-1, 5, 2, 2, "#cfcfcf"]],
};
// where people go for each act (the piece they use) and how they hold
const ACT_AT = { sleep: "bed", cook: "stove", eat: "table", watch: "sofa", read: ["desk", "sofa", "shelf"], wash: ["tub", "sink"], work: "desk", visit: ["bar", "rack", "table", "reception", "desk"], walk: ["reception", "mailboxes"] };
function anchorX(room, act, i, w) {
  const want = [].concat(ACT_AT[act] || []);
  let f = null;
  for (const k of want) { f = room.furniture.filter(p => p.item === k); if (f.length) break; }
  const base = f && f.length ? f[i % f.length].x : 0.5;
  const spread = (Math.floor(i / Math.max(1, f?.length || 1)) * (i % 2 ? 1 : -1)) * 0.12;
  return Math.max(0.08, Math.min(0.92, base + spread)) * w;
}

function drawPiece(c, item, cx, fy, s, on) {
  const rs = F[item];
  if (!rs) return;
  for (const [dx, up, w, h, col] of rs) {
    let colr = col;
    if (on && ((item === "lamp" && col === "#8a7a50") || (item === "tv" && col === "#1a2a33"))) colr = item === "lamp" ? LIT : "#7fe0b0";
    if (on && item === "desk" && col === "#1f3a2f") colr = "#4ade80";
    c.fillStyle = colr;
    c.fillRect(Math.round(cx + dx * s), Math.round(fy - (up + h) * s), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
  }
}

// One room: the back wall, its window, the furniture, then the people. d: {night, dark, sprite,
// t, reduced, people: [{s, act}]}
function drawRoom(c, room, x, y, w, h, d) {
  const s = Math.min(h / 45, w / 22), fy = y + h;   // furniture fits the room's width as well as its height
  if (PURPOSE_TINT[room.purpose]) { c.fillStyle = PURPOSE_TINT[room.purpose]; c.fillRect(x, y, w, h); }
  const awake = d.people.some(p => p.act !== "sleep");
  const lit = d.dark && awake;
  // the window, high on the back wall
  if (room.purpose !== "vault" && w > 10) {
    const ww = Math.min(w * 0.36, 16 * s), wh = 11 * s, wx = x + w * 0.5 - ww / 2, wy = y + 5 * s;
    c.fillStyle = d.night ? (lit ? "#d9a441" : "#0b1411") : "#2f5a52";
    c.fillRect(Math.round(wx), Math.round(wy), Math.round(ww), Math.round(wh));
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.fillRect(Math.round(wx + ww / 2), Math.round(wy), 1, Math.round(wh));
  }
  for (const p of room.furniture) {
    const on = lit && (p.item === "lamp" || (p.item === "tv" && d.people.some(q => q.act === "watch"))) || (p.item === "desk" && d.people.some(q => q.act === "work" || q.act === "read"));
    drawPiece(c, p.item, x + p.x * w, fy, s, on);
  }
  // people
  d.people.forEach((p, i) => {
    const px = x + anchorX(room, p.act, i, w);
    if (!d.sprite) {
      const fam = familyOf(p.s).family, col = FAMILY_COLOR[fam] || "#6b9a7c", r = Math.max(2, 2.2 * s);
      c.fillStyle = col;
      if (p.act === "sleep") c.fillRect(Math.round(px - r * 1.6), Math.round(fy - 9 * s - r), Math.round(r * 3.2), Math.round(r * 1.4));
      else { c.beginPath(); c.arc(px, fy - 8 * s - (d.reduced ? 0 : Math.abs(Math.sin(d.t * 2 + i)) * 0.6), r, 0, Math.PI * 2); c.fill(); c.fillRect(Math.round(px - r * 0.5), Math.round(fy - 8 * s), Math.round(r), Math.round(7 * s)); }
      return;
    }
    const sh = sheetFor(p.s);
    const ph = Math.min(h * 0.62, Math.max(18, w * 1.15));
    const pw = ph * FW / FH;
    try {
      if (p.act === "sleep") {
        // on the bed, head on the pillow, the blanket over the legs
        const bed = room.furniture.find(f => f.item === "bed");
        const bx = x + (bed ? bed.x : 0.4) * w;
        c.save();
        c.translate(Math.round(bx - 9 * s), Math.round(fy - 8 * s));
        c.rotate(-Math.PI / 2);
        const L = 18 * s;
        c.drawImage(sh.img, 0, 0, FW, FH, -pw * (L / ph) / 2 + 0, 0, pw * (L / ph), L);
        c.restore();
        c.fillStyle = "#3d6b8f";
        c.fillRect(Math.round(bx - 2 * s), Math.round(fy - 10 * s), Math.round(11 * s), Math.round(3 * s));
        if (!d.reduced && Math.floor(d.t * 1.2 + i) % 3 !== 0) { c.fillStyle = "#9fd8b8"; c.font = `${Math.max(8, Math.round(6 * s))}px ${FONT}`; c.fillText("z", Math.round(bx - 10 * s), Math.round(fy - 14 * s - (d.t * 4 % 4))); }
      } else {
        const bob = d.reduced ? 0 : Math.round(Math.abs(Math.sin(d.t * 1.6 + i * 1.7)) * 1);
        const fi = d.reduced || !(sh.frames > 1) ? 0 : (Math.floor(d.t * 1.5 + i) % 6 === 0 ? 1 : 0);
        c.drawImage(sh.img, fi * FW, 0, FW, FH, Math.round(px - pw / 2), Math.round(fy - ph - bob), Math.round(pw), Math.round(ph));
      }
    } catch { /* not decoded yet */ }
  });
  if (d.night && !lit) { c.fillStyle = "rgba(0,0,0,0.3)"; c.fillRect(x, y, w, h); }
  else if (lit) { c.fillStyle = "rgba(245,210,122,0.06)"; c.fillRect(x, y, w, h); }
}

// ---- geometry ----------------------------------------------------------------------------------
// rows top-down: {kind: roof | storey | street | found, y, h, st?, i?}
// The focused storey is as tall as its narrowest room's furniture needs, plus the plaque and nameplates.
function focusH(plan, st, W) {
  const [x0, x1] = interior(plan, W);
  const rw = Math.min(...unitRects(st, x0, x1).map(r => r.w / r.u.rooms.length));
  return Math.round(Math.max(H0 + 24, Math.min(H1, 36 + SLAB_T + SLAB_B + 45 * Math.min(2, rw / 22))));
}
function layoutOf(plan, sel, W) {
  const rows = [];
  let y = 0;
  rows.push({ kind: "roof", y, h: ROOF_H }); y += ROOF_H;
  const td = plan.storeys.slice().reverse();
  for (const st of td) {
    const i = plan.storeys.indexOf(st), h = i === sel ? focusH(plan, st, W) : H0;
    rows.push({ kind: "storey", y, h, st, i }); y += h;
    if (st.level === 0) { rows.push({ kind: "street", y, h: STREET_H }); y += STREET_H; }
  }
  rows.push({ kind: "found", y, h: FOUND_H }); y += FOUND_H;
  const at = {};
  for (const r of rows) if (r.kind === "storey") at[r.i] = r;
  return { rows, at, total: y };
}
function unitRects(st, x0, x1) {
  const wt = st.units.map(u => (u.kind === "lobby" ? 1.4 : u.rooms.length));
  const sum = wt.reduce((a, b) => a + b, 0), gap = 3;
  const avail = x1 - x0 - gap * (st.units.length - 1);
  let x = x0;
  return st.units.map((u, k) => { const w = (avail * wt[k]) / sum; const r = { u, x, w }; x += w + gap; return r; });
}
const interior = (plan, W) => [SHAFT + 3, W - (plan.shafts === 2 ? EXPRESS + 3 : 4)];

// The lift car: deterministic legs between hashed stops, 6 s each (4 travelling, 2 doors open).
function carPos(planId, n, t, express) {
  const stops = (k) => {
    if (!express) return Math.floor(h01(`${planId}|lift|${k}`) * n);
    const ex = [0, n - 1, Math.floor((n - 1) / 2)];
    return ex[Math.floor(h01(`${planId}|express|${k}`) * ex.length)];
  };
  const L = 6, k = Math.floor(t / L), ph = t - k * L;
  const a = stops(k), b = stops(k + 1);
  if (ph >= 4) return { pos: b, open: Math.min(1, (ph - 4) * 3) * Math.min(1, (L - ph) * 3) };
  const e = ph / 4, ease = e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2;
  return { pos: a + (b - a) * ease, open: 0 };
}

// ---- the component -----------------------------------------------------------------------------
export default memo(Cutaway);
function Cutaway({ b, floor, censusRef, onOpen, onFloor }) {
  const plan = useMemo(() => towerPlan(b), [b]);
  const N = plan.storeys.length;
  // the storey the route names (&storey=<level>, City.jsx), else the sim floor's lowest storey
  const firstOf = useCallback((sf) => {
    const lv = new URLSearchParams((window.location.hash.split("?")[1] || "")).get("storey");
    const named = lv != null ? plan.storeys.findIndex(st => st.simFloor === sf && st.level === +lv) : -1;
    return named >= 0 ? named : plan.storeys.findIndex(st => st.simFloor === sf);
  }, [plan]);
  const [sel, setSel] = useState(() => (floor != null ? (firstOf(floor) >= 0 ? firstOf(floor) : null) : null));
  const [cur, setCur] = useState(0);            // the unit under the keyboard on the focused floor
  const [open, setOpen] = useState(null);       // unit id in the sheet
  const [snap, setSnap] = useState(null);       // the placement, when it changes
  const wrapRef = useRef(null), canRef = useRef(null);
  const V = useRef({ W: 360, lw: 0, dpr: 1, lay: null, place: null, seenV: -1, sig: "", reduced: false, sel, cur }).current;
  V.sel = sel; V.cur = cur;

  // the route's floor (sim floor index) <-> the focused storey
  useEffect(() => {
    if (floor == null) { setSel(null); return; }
    setSel(s => (s != null && plan.storeys[s]?.simFloor === floor ? s : (firstOf(floor) >= 0 ? firstOf(floor) : null)));
  }, [floor, plan, firstOf]);
  const choose = useCallback((i, scroll) => {
    setSel(i); setCur(0);
    onFloor(i == null ? null : plan.storeys[i].simFloor, i == null ? null : plan.storeys[i].level);
    if (scroll && i != null) V.scrollTo = i;
  }, [onFloor, plan, V]);

  const [W, setW] = useState(360);
  const lay = useMemo(() => layoutOf(plan, sel, W), [plan, sel, W]);
  V.lay = lay;

  useEffect(() => {
    const cv = canRef.current, wrap = wrapRef.current;
    if (!cv || !wrap) return undefined;
    const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    V.reduced = !!mq?.matches;
    const onMq = () => { V.reduced = !!mq?.matches; };
    mq?.addEventListener?.("change", onMq);
    let raf = 0, alive = true;
    const size = () => {
      V.W = Math.max(280, wrap.clientWidth);
      if (Math.abs(V.W - V.lw) > 0.5) { V.lw = V.W; setW(V.W); }
      V.dpr = Math.min(2, window.devicePixelRatio || 1);
      const H = V.lay.total;
      if (cv.width !== Math.round(V.W * V.dpr) || cv.height !== Math.round(H * V.dpr)) {
        cv.width = Math.round(V.W * V.dpr); cv.height = Math.round(H * V.dpr);
        cv.style.height = `${H}px`;
      }
    };
    const ro = window.ResizeObserver ? new ResizeObserver(size) : null;
    ro?.observe(wrap);
    function census() {
      const C = censusRef.current;
      if (C.v === V.seenV && V.place) return;
      V.seenV = C.v;
      const mt = C.mt ?? clockAt(Date.now()).mt;
      const entries = [];
      for (const e of C.list) { if (!e.s || e.s.crowd) continue; entries.push({ s: e.s, w: e.w, r: roomIn(e.w, e.s) }); }
      const P = placeAll(plan, entries, mt);
      V.place = P; V.mt = mt;
      let sig = "";
      for (const [k, r] of P.at) sig += `${k}>${r};`;
      for (const [u, l] of P.residents) sig += `${u}=${l.length};`;
      if (sig !== V.sig) { V.sig = sig; setSnap({ ...P, mt }); }
    }
    function frame(now) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      census();
      size();
      const L = V.lay, W = V.W, dpr = V.dpr;
      if (V.scrollTo != null) {
        const r = L.at[V.scrollTo];
        V.scrollTo = null;
        if (r) {
          const top = cv.getBoundingClientRect().top + window.scrollY + r.y;
          const want = top - Math.max(60, (window.innerHeight - r.h) / 2);
          try { window.scrollTo({ top: Math.max(0, want), behavior: V.reduced ? "auto" : "smooth" }); } catch { window.scrollTo(0, Math.max(0, want)); }
        }
      }
      // what is on screen, in canvas px
      const rect = cv.getBoundingClientRect();
      const v0 = Math.max(0, -rect.top), v1 = Math.min(L.total, window.innerHeight - rect.top);
      if (v1 <= v0) return;   // scrolled away: draw nothing
      const c = cv.getContext("2d");
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.imageSmoothingEnabled = false;
      c.clearRect(0, v0, W, v1 - v0);
      const t = V.reduced ? 0 : now / 1000;
      const mt = censusRef.current.mt ?? clockAt(Date.now()).mt;
      const hour = ((mt % 24) + 24) % 24, night = isDark(hour);
      const [x0, x1] = interior(plan, W);
      for (const row of L.rows) {
        if (row.y + row.h < v0 || row.y > v1) continue;   // only the storeys on screen
        drawRow(c, row, { W, x0, x1, night, t, hour });
      }
      drawShafts(c, L, { W, t, v0, v1 });
    }
    function drawRow(c, row, o) {
      const { W, x0, x1, night } = o;
      if (row.kind === "roof") {
        c.fillStyle = night ? "#050a08" : "#0f2620";
        c.fillRect(0, row.y, W, row.h);
        if (night) { c.fillStyle = "#3d5a48"; for (let k = 0; k < 14; k++) c.fillRect(Math.floor(h01(`${plan.id}|star|${k}`) * W), row.y + Math.floor(h01(`${plan.id}|sy|${k}`) * (row.h - 14)), 1, 1); }
        c.fillStyle = "#2a3a30";
        c.fillRect(SHAFT - 4, row.y + row.h - 5, W - SHAFT + 2, 5);
        c.fillStyle = "#1f2a24";
        c.fillRect(4, row.y + row.h - 14, SHAFT - 6, 14);   // the lift's motor room
        drawRoofProps(c, row, W);
        return;
      }
      if (row.kind === "street") {
        c.fillStyle = "#121a15"; c.fillRect(0, row.y, W, row.h);
        c.fillStyle = "#24332a"; c.fillRect(0, row.y, W, 3);
        c.fillStyle = "#1a241e"; for (let x = 6; x < W; x += 22) c.fillRect(x, row.y + row.h / 2, 10, 1);
        return;
      }
      if (row.kind === "found") { c.fillStyle = "#0d120f"; c.fillRect(0, row.y, W, row.h); c.fillStyle = "#1a221d"; c.fillRect(SHAFT - 4, row.y, W - SHAFT + 2, 4); return; }
      const st = row.st, focused = row.i === V.sel, y = row.y, h = row.h;
      c.fillStyle = st.level < 0 ? "#0e130f" : "#0c120e";
      c.fillRect(SHAFT, y, W - SHAFT, h);
      c.fillStyle = wallOf(plan, st);
      c.fillRect(x0, y, x1 - x0, h);
      const iy = y + SLAB_T, ih = h - SLAB_T - SLAB_B;
      const P = V.place;
      const rects = unitRects(st, x0, x1);
      rects.forEach(({ u, x, w }, k) => {
        const rw = w / u.rooms.length;
        // each unit its own paper and its own carpet, so no two flats read the same
        const hu = h01(u.id);
        c.fillStyle = hu < 0.5 ? `rgba(255,240,200,${0.02 + hu * 0.08})` : `rgba(120,200,220,${0.02 + (hu - 0.5) * 0.08})`;
        c.fillRect(Math.round(x), iy, Math.round(w), ih);
        c.fillStyle = CARPET[Math.floor(h01(u.id + "|c") * CARPET.length)];
        c.fillRect(Math.round(x), iy + ih - 2, Math.round(w), 2);
        u.rooms.forEach((rm, j) => {
          const people = (P?.rooms.get(rm.id) || []);
          drawRoom(c, rm, x + j * rw, iy, rw, ih, { night, dark: night, sprite: focused, t: o.t, reduced: V.reduced, people });
          if (j > 0) { c.fillStyle = "rgba(0,0,0,0.5)"; c.fillRect(Math.round(x + j * rw), iy + (focused ? 16 : 0), 1, ih - (focused ? 16 : 0) - 10 * (ih / 45)); }
        });
        if (k < rects.length - 1) { c.fillStyle = "#0a0f0a"; c.fillRect(Math.round(x + w), y, 3, h); }
        if (focused && k === V.cur && V.kbd) { c.strokeStyle = "#4ade80"; c.setLineDash([3, 2]); c.strokeRect(Math.round(x) + 0.5, iy + 0.5, Math.round(w) - 1, ih - 1); c.setLineDash([]); }
      });
      // the slabs
      c.fillStyle = "#33433a"; c.fillRect(SHAFT - 4, y, W - SHAFT + 4, SLAB_T);
      c.fillStyle = "#26332c"; c.fillRect(SHAFT - 4, y + h - SLAB_B, W - SHAFT + 4, SLAB_B);
      if (focused) {
        // the plaque and the nameplates: labels on the focused floor only
        c.fillStyle = "rgba(10,15,10,0.86)";
        c.fillRect(x0, iy, x1 - x0, 15);
        c.font = `700 10px ${FONT}`; c.fillStyle = "#4ade80"; c.textBaseline = "top";
        fitText(c, `${st.code} // ${st.name} // HELD BY ${st.owner.name}`, x0 + 3, iy + 3, x1 - x0 - 6);
        c.font = `9px ${FONT}`;
        rects.forEach(({ u, x, w }) => {
          const label = u.kind === "flat" ? `${u.label} ${nameplate(u, P?.residents || new Map())}` : u.kind === "suite" ? u.label : nameplate(u, P?.residents || new Map());
          c.fillStyle = "rgba(10,15,10,0.7)"; c.fillRect(Math.round(x), iy + 16, Math.round(w), 12);
          c.fillStyle = u.kind === "flat" && !(P?.residents.get(u.id) || []).length ? "#4d8a62" : "#c8f5d8";
          fitText(c, label, x + 2, iy + 18, w - 4);
        });
        c.textBaseline = "alphabetic";
        c.strokeStyle = "#4ade80"; c.lineWidth = 1; c.strokeRect(x0 + 0.5, y + 0.5, x1 - x0 - 1, h - 1);
      }
    }
    function drawRoofProps(c, row, W) {
      const y = row.y + row.h - 5, st = plan.style;
      c.fillStyle = "#33443a";
      if (st === "glass" || st === "office" || st === "condo") {
        c.fillRect(W * 0.62, y - 22, 2, 22); c.fillStyle = "#f87171"; if (!V.reduced && Math.floor(performance.now() / 700) % 2) c.fillRect(W * 0.62 - 1, y - 24, 4, 3);
        c.fillStyle = "#2a3a30"; c.fillRect(W * 0.4, y - 8, W * 0.16, 8);
      } else if (st === "projects" || st === "lofts" || st === "tenement" || st === "seawall") {
        c.fillRect(W * 0.7, y - 18, 16, 12); c.fillRect(W * 0.7 + 2, y - 6, 2, 6); c.fillRect(W * 0.7 + 12, y - 6, 2, 6);   // the water tank on its legs
        c.fillRect(W * 0.4, y - 6, 30, 6);
      } else {
        for (let k = 0; k < 3; k++) c.fillRect(W * (0.4 + k * 0.18), y - 10, 6, 10);   // chimneys
      }
    }
    function drawShafts(c, L, o) {
      const { W, t, v0, v1 } = o;
      const rowsS = L.rows.filter(r => r.kind === "storey");
      const top = rowsS[0].y, bot = rowsS[rowsS.length - 1].y + rowsS[rowsS.length - 1].h;
      const shaft = (sx, sw, express) => {
        c.fillStyle = "#070c09"; c.fillRect(sx, Math.max(top, v0), sw, Math.min(bot, v1) - Math.max(top, v0));
        c.fillStyle = "#16291c"; c.fillRect(sx + 3, Math.max(top, v0), 1, Math.min(bot, v1) - Math.max(top, v0)); c.fillRect(sx + sw - 4, Math.max(top, v0), 1, Math.min(bot, v1) - Math.max(top, v0));
        // landings: a door at each storey it serves, the code beside the local shaft's door
        for (const r of rowsS) {
          if (r.y + r.h < v0 || r.y > v1) continue;
          const serves = !express || r.st.level === 0 || r.i === N - 1 || r.i === plan.storeys.findIndex(s => s.level === 0) + Math.floor((N - 1 - plan.storeys.findIndex(s => s.level === 0)) / 2);
          c.fillStyle = "#1f4a2c"; c.fillRect(sx, r.y, sw, 1);
          if (!express) {
            c.font = `700 9px ${FONT}`; c.textBaseline = "top";
            c.fillStyle = r.i === V.sel ? "#4ade80" : "#4d8a62";
            c.fillText(r.st.code, sx + 4, r.y + 4);
            c.textBaseline = "alphabetic";
          }
          if (serves) { c.fillStyle = "#1a3a24"; c.fillRect(sx + sw - (express ? 4 : 3), r.y + r.h - 4 - Math.min(26, r.h * 0.5), 2, Math.min(26, r.h * 0.5)); }
        }
        // the car
        const n = plan.storeys.length;
        let pos, open = 0;
        if (V.reduced) pos = express ? plan.storeys.findIndex(s => s.level === 0) : (V.sel ?? plan.storeys.findIndex(s => s.level === 0));
        else ({ pos, open } = carPos(plan.id, n, t + (express ? 3 : 0), express));
        const lo = Math.floor(pos), hi = Math.min(n - 1, lo + 1), f = pos - lo;
        const ra = L.at[lo], rb = L.at[hi];
        if (!ra || !rb) return;
        const ch = Math.min(30, H0 * 0.62);
        const ya = ra.y + ra.h - SLAB_B - ch, yb = rb.y + rb.h - SLAB_B - ch;
        const cy = ya + (yb - ya) * f;
        if (cy + ch < v0 || cy > v1) return;
        c.fillStyle = "#3a5a46"; c.fillRect(sx + 2, cy, sw - 4, ch);
        c.fillStyle = "#c8f5d8"; c.fillRect(sx + 4, cy + 2, sw - 8, 2);   // the car's light
        const dw = (sw - 8) / 2 * (1 - open);
        c.fillStyle = "#24382c"; c.fillRect(sx + 4, cy + 5, dw, ch - 7); c.fillRect(sx + sw - 4 - dw, cy + 5, dw, ch - 7);
        c.fillStyle = "#16291c"; c.fillRect(sx + sw / 2 - 0.5, Math.max(top, v0), 1, Math.max(0, cy - Math.max(top, v0)));   // the cable
      };
      shaft(2, SHAFT - 4, false);
      if (plan.shafts === 2) shaft(W - EXPRESS - 1, EXPRESS, true);
    }
    raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); ro?.disconnect(); mq?.removeEventListener?.("change", onMq); };
  }, [plan, censusRef, V]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- input ----------------------------------------------------------------------------------
  const hit = (clientX, clientY) => {
    const cv = canRef.current, r = cv.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    const row = V.lay.rows.find(q => q.kind === "storey" && y >= q.y && y < q.y + q.h);
    if (!row) return null;
    const [x0, x1] = interior(plan, V.W);
    const rects = unitRects(row.st, x0, x1);
    const k = rects.findIndex(q => x >= q.x - 1.5 && x < q.x + q.w + 1.5);
    return { i: row.i, k };
  };
  const onClick = (e) => {
    const h = hit(e.clientX, e.clientY);
    if (!h) return;
    V.kbd = false;
    if (h.i !== sel) { choose(h.i, false); return; }
    if (h.k >= 0) { setCur(h.k); openUnit(plan.storeys[h.i].units[h.k]); }
  };
  const lastFocus = useRef(null);
  const openUnit = (u) => { lastFocus.current = document.activeElement; setOpen(u.id); };
  const closeSheet = useCallback(() => { setOpen(null); const el = lastFocus.current || wrapRef.current; setTimeout(() => el?.focus?.(), 0); }, []);
  const onKey = (e) => {
    const k = e.key;
    if (k === "ArrowUp" || k === "ArrowDown") {
      e.preventDefault(); V.kbd = true;
      const next = sel == null ? (k === "ArrowUp" ? 0 : N - 1) : Math.max(0, Math.min(N - 1, sel + (k === "ArrowUp" ? 1 : -1)));
      choose(next, true);
    } else if ((k === "ArrowLeft" || k === "ArrowRight") && sel != null) {
      e.preventDefault(); V.kbd = true;
      const n = plan.storeys[sel].units.length;
      setCur(c => (c + (k === "ArrowRight" ? 1 : -1) + n) % n);
    } else if (k === "Home" || k === "End") {
      e.preventDefault(); V.kbd = true; choose(k === "Home" ? N - 1 : 0, true);
    } else if (k === "Enter" || k === " ") {
      e.preventDefault(); V.kbd = true;
      if (sel == null) choose(plan.storeys.findIndex(s => s.level === 0), true);
      else openUnit(plan.storeys[sel].units[Math.min(cur, plan.storeys[sel].units.length - 1)]);
    } else if (k === "Escape" && sel != null) { e.preventDefault(); choose(null, false); }
  };

  // ---- words -------------------------------------------------------------------------------------
  const P = snap;
  const res = P?.residents || new Map();
  const whoIn = (u) => u.rooms.flatMap(rm => (P?.rooms.get(rm.id) || []).map(p => ({ ...p, room: rm })));
  const st = sel != null ? plan.storeys[sel] : null;
  const curUnit = st ? st.units[Math.min(cur, st.units.length - 1)] : null;
  const unitWord = (u) => (u.kind === "flat" ? `FLAT ${u.label}` : u.kind === "suite" ? u.label : u.kind === "lobby" ? "THE LOBBY" : nameplate(u, res));
  const line = st
    ? <><b>{st.code}</b> // {st.name}. {st.units.filter(u => u.kind === "flat").length ? "TAP A FLAT." : "TAP A ROOM."}{V.kbd && curUnit ? ` ${unitWord(curUnit)}: ${whoIn(curUnit).length} PRESENT.` : ""}</>
    : <>A CROSS-SECTION OF {b.name}. TAP A FLOOR.</>;
  const storeysTD = useMemo(() => plan.storeys.slice().reverse(), [plan]);
  const openU = open ? plan.storeys.flatMap(s => s.units).find(u => u.id === open) : null;

  return (
    <div>
      <style>{CSS}</style>
      <p className="hvi-tw-line" role="status" aria-live="polite">{line}</p>
      {N > 8 && (
        <div className="hvi-tw-index" role="toolbar" aria-label="Floor index">
          {storeysTD.map(s => { const i = plan.storeys.indexOf(s); return <button key={s.id} type="button" aria-current={i === sel ? "true" : undefined} aria-label={`Floor ${s.code}, ${s.name}`} onClick={() => { V.kbd = false; choose(i, true); }}>{s.code}</button>; })}
        </div>
      )}
      <div ref={wrapRef} className="hvi-tw-stage" tabIndex={0} onKeyDown={onKey}
        role="application" aria-roledescription="tower cross-section"
        aria-label={`${b.name}, ${N} floors in cross-section. Up and down arrows move between floors, left and right between flats, Enter opens one, Escape steps back. The floor list follows.`}>
        <canvas ref={canRef} aria-hidden="true" onClick={onClick} style={{ height: lay.total }} />
      </div>
      <ul className="sr-only" aria-label={`Floors of ${b.name}, top to bottom`}>
        {storeysTD.map(s => (
          <li key={s.id}>
            {`Floor ${s.code}, ${s.name}. `}
            {s.units.map(u => {
              const here = whoIn(u);
              const who = here.length ? here.map(p => `${displayName(p.s)}, ${PURPOSE_NAME[p.room.purpose].toLowerCase()}${p.act === "sleep" ? ", asleep" : ""}`).join("; ") : "nobody present";
              return `${unitWord(u)}${u.kind === "flat" ? ` (${nameplate(u, res)})` : ""}: ${who}. `;
            }).join("")}
          </li>
        ))}
      </ul>
      {openU && <UnitSheet u={openU} plan={plan} P={P} res={res} onClose={closeSheet} onOpen={onOpen} censusRef={censusRef} unitWord={unitWord} />}
    </div>
  );
}

function fitText(c, text, x, y, w) {
  let s = text;
  if (c.measureText(s).width > w) {
    while (s.length > 1 && c.measureText(s + "…").width > w) s = s.slice(0, -1);
    s += "…";
  }
  c.fillText(s, Math.round(x), Math.round(y));
}

// ---- one unit, large: its rooms side by side (two rows when there are more than three), who is
// home in each, and who lives here but is out.
function UnitSheet({ u, plan, P, res, onClose, onOpen, censusRef, unitWord }) {
  const ref = useRef(null), closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus(); }, [u.id]);
  useEffect(() => {
    const onEsc = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);
  const n = u.rooms.length, cols = n > 3 ? Math.ceil(n / 2) : n, rowsN = Math.ceil(n / cols), RH = 118, LBL = 16;
  const Pref = useRef(P); Pref.current = P;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, alive = true;
    const draw = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(draw);
      const W = Math.max(260, cv.clientWidth), dpr = Math.min(2, window.devicePixelRatio || 1), H = rowsN * (RH + LBL);
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const c = cv.getContext("2d");
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.imageSmoothingEnabled = false;
      c.clearRect(0, 0, W, H);
      const mt = censusRef.current.mt ?? clockAt(Date.now()).mt, hour = ((mt % 24) + 24) % 24, night = isDark(hour);
      const st = plan.storeys.find(s => s.units.includes(u));
      const rw = (W - (cols - 1) * 3) / cols;
      u.rooms.forEach((rm, j) => {
        const cx = (j % cols) * (rw + 3), cy = Math.floor(j / cols) * (RH + LBL);
        c.fillStyle = wallOf(plan, st); c.fillRect(cx, cy, rw, RH);
        c.fillStyle = "#26332c"; c.fillRect(cx, cy + RH - 4, rw, 4);
        drawRoom(c, rm, cx, cy, rw, RH - 4, { night, dark: night, sprite: true, t: reduced ? 0 : now / 1000, reduced, people: Pref.current?.rooms.get(rm.id) || [] });
        c.font = `9px ${FONT}`; c.fillStyle = "#4d8a62"; c.textBaseline = "top";
        fitText(c, `${PURPOSE_NAME[rm.purpose]}`, cx + 2, cy + RH + 3, rw - 4);
        c.textBaseline = "alphabetic";
      });
    };
    raf = requestAnimationFrame(draw);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [u, plan, cols, rowsN, censusRef]);
  const here = u.rooms.flatMap(rm => (P?.rooms.get(rm.id) || []).map(p => ({ ...p, room: rm })));
  const hereKeys = new Set(here.map(p => p.key));
  const out = (res.get(u.id) || []).filter(s => !hereKeys.has(keyOf(s)));
  const mt = censusRef.current.mt ?? clockAt(Date.now()).mt;
  const title = unitWord(u);
  return (
    <div className="hvi-tw-sheet" role="dialog" aria-modal="false" aria-label={`${title}, ${plan.name}`}>
      <div className="hvi-tw-sheet-in">
        <div className="hvi-tw-sheet-h">
          <div><b>{title}</b> // {plan.name}<br />{u.kind === "flat" ? `${nameplate(u, res)} // ` : ""}HELD BY {u.owner.name}</div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close and return to the floors">[ X ]</button>
        </div>
        <canvas ref={ref} aria-hidden="true" style={{ height: rowsN * (RH + LBL) }} />
        <div className="hvi-tw-sub">{here.length ? `PRESENT // ${here.length}` : "NOBODY PRESENT. THE ROOMS ARE BEING MONITORED ANYWAY."}</div>
        {here.map(p => <Occupant key={p.key} s={p.s} onOpen={onOpen} note={`${PURPOSE_NAME[p.room.purpose]}${p.act === "sleep" ? ", ASLEEP" : ""}`} />)}
        {u.kind === "flat" && out.length > 0 && <>
          <div className="hvi-tw-sub">RESIDENT, ELSEWHERE // {out.length}</div>
          {out.map(s => <Occupant key={s.name} s={s} onOpen={onOpen} note={activityLine(s, mt).replace(/\.$/, "")} />)}
        </>}
        {u.kind === "flat" && !(res.get(u.id) || []).length && <div className="hvi-tw-sub">VACANT. ASSIGNED TO NOBODY. THE DEPARTMENT KEEPS THE KEY.</div>}
      </div>
    </div>
  );
}
