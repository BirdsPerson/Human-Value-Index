// DEEP ZOOM, the pure half (docs/CITY_SPEC.md "Tower cutaways"): the tower as one world and a
// camera over it. BUILDING > FLOOR > FLAT > ROOM are not four screens but four stops on one
// continuous zoom; the level is read off the camera, the focus (which floor, flat, room) off the
// middle of the view. No DOM, so scripts/check-cutaway.mjs can resolve every level, every deep
// link and every hit in node. The painter is DeepZoom.jsx.
//
// World units are the cutaway's CSS px at its 360 px width: a storey is 52 tall (the penthouse
// 68), a room 45 tall inside the slabs, so furniture.js's "a room is 45 units tall" holds and
// drawRoom's scale s = min(h/45, w/22) is simply the camera zoom (times 1 at the building).
import { pieceOf } from "./furniture.js";
import { PLAY_AT_HOME } from "../economy/shops.js";
import { PURPOSE_NAME } from "./tower.js";

export const GEO = { W: 360, SHAFT: 30, EXPRESS: 18, ROOF_H: 40, STREET_H: 16, FOUND_H: 12, H: 52, PH_H: 68, SLAB_T: 3, SLAB_B: 4, GAP: 3 };
export const LEVELS = ["building", "floor", "flat", "room"];
export const LEVEL_NAME = { building: "BUILDING", floor: "FLOOR", flat: "FLAT", room: "ROOM" };

// ---- the world ---------------------------------------------------------------------------------
const WORLDS = new WeakMap();
export function worldOf(plan) {
  let w = WORLDS.get(plan);
  if (w) return w;
  const x0 = GEO.SHAFT + 3, x1 = GEO.W - (plan.shafts === 2 ? GEO.EXPRESS + 3 : 4);
  const rows = [], at = {};
  let y = 0;
  rows.push({ kind: "roof", y, h: GEO.ROOF_H }); y += GEO.ROOF_H;
  for (const st of plan.storeys.slice().reverse()) {
    const i = plan.storeys.indexOf(st), h = st.code === "PH" ? GEO.PH_H : GEO.H, iy = y + GEO.SLAB_T, ih = h - GEO.SLAB_T - GEO.SLAB_B;
    const wt = st.units.map(u => (u.kind === "lobby" ? 1.4 : u.rooms.length));
    const sum = wt.reduce((a, b) => a + b, 0), avail = x1 - x0 - GEO.GAP * (st.units.length - 1);
    let x = x0;
    const units = st.units.map((u, k) => {
      const uw = (avail * wt[k]) / sum, rw = uw / u.rooms.length;
      const r = { u, k, x, w: uw, y: iy, h: ih, rooms: u.rooms.map((rm, j) => ({ rm, j, x: x + j * rw, w: rw, y: iy, h: ih })) };
      x += uw + GEO.GAP;
      return r;
    });
    const row = { kind: "storey", y, h, st, i, iy, ih, units };
    rows.push(row); at[i] = row; y += h;
    if (st.level === 0) { rows.push({ kind: "street", y, h: GEO.STREET_H }); y += GEO.STREET_H; }
  }
  rows.push({ kind: "found", y, h: GEO.FOUND_H }); y += GEO.FOUND_H;
  w = { plan, rows, at, total: y, W: GEO.W, x0, x1, N: plan.storeys.length };
  WORLDS.set(plan, w);
  return w;
}

// ---- scale: the same rule drawRoom uses, optionally snapped to half steps (crisp pixels) ---------
export function roomScale(w, h, snap) {
  const s = Math.min(h / 45, w / 22);
  return snap ? Math.max(0.5, Math.floor(s * 2) / 2) : s;
}

// ---- focus: which floor, flat and room the world point is in (nearest, clamped) ------------------
const clampI = (n, a, b) => Math.max(a, Math.min(b, n));
export function focusAt(world, wx, wy) {
  const rows = world.rows.filter(r => r.kind === "storey");
  let row = rows.find(r => wy >= r.y && wy < r.y + r.h);
  if (!row) row = wy < rows[0].y ? rows[0] : rows[rows.length - 1];
  let un = row.units.find(q => wx >= q.x - GEO.GAP / 2 && wx < q.x + q.w + GEO.GAP / 2);
  if (!un) un = wx < row.units[0].x ? row.units[0] : row.units[row.units.length - 1];
  let rm = un.rooms.find(q => wx >= q.x && wx < q.x + q.w);
  if (!rm) rm = wx < un.rooms[0].x ? un.rooms[0] : un.rooms[un.rooms.length - 1];
  return { i: row.i, k: un.k, j: rm.j };
}
// Exact hit (null parts where the point is on the roof, the shaft, a party wall)
export function hitWorld(world, wx, wy) {
  const row = world.rows.find(r => r.kind === "storey" && wy >= r.y && wy < r.y + r.h);
  if (!row) return null;
  const un = row.units.find(q => wx >= q.x - GEO.GAP / 2 && wx < q.x + q.w + GEO.GAP / 2);
  if (!un) return { i: row.i, k: -1, j: -1 };
  const rm = un.rooms.find(q => wx >= q.x && wx < q.x + q.w) || un.rooms[un.rooms.length - 1];
  return { i: row.i, k: un.k, j: rm.j };
}
export const screenToWorld = (cam, vw, vh, sx, sy) => ({ x: cam.cx + (sx - vw / 2) / cam.z, y: cam.cy + (sy - vh / 2) / cam.z });
export const worldToScreen = (cam, vw, vh, wx, wy) => ({ x: (wx - cam.cx) * cam.z + vw / 2, y: (wy - cam.cy) * cam.z + vh / 2 });
export const unitAt = (world, f) => world.at[f.i].units[clampI(f.k, 0, world.at[f.i].units.length - 1)];
export const roomAt = (world, f) => { const u = unitAt(world, f); return u.rooms[clampI(f.j, 0, u.rooms.length - 1)]; };

// ---- the camera at each level, for a focus ------------------------------------------------------
// -> {cx, cy, z}. FLOOR: one storey fills the width. FLAT: the flat fills the width (or the height,
// whichever binds). ROOM: the room does. BUILDING: the whole tower in view.
export function fitCam(world, vw, vh, level, f) {
  const f0 = f || { i: 0, k: 0, j: 0 };
  if (level === "building" || !world.at[f0.i]) {
    const z = Math.min(vw / world.W, vh / world.total);
    return { cx: world.W / 2, cy: world.total / 2, z };
  }
  const row = world.at[f0.i];
  if (level === "floor") {
    const z = Math.min(vw / (world.x1 - world.x0 + 8), (vh * 0.9) / row.h);
    return { cx: (world.x0 + world.x1) / 2, cy: row.y + row.h / 2, z };
  }
  // a one-flat storey (an office floor) has a FLAT no closer than its FLOOR: the levels never run backwards
  const zFloor = fitCam(world, vw, vh, "floor", f0).z, u = unitAt(world, f0);
  if (level === "flat") {
    const z = Math.max(zFloor, Math.min((vw * 0.96) / u.w, (vh * 0.84) / row.ih));
    return { cx: u.x + u.w / 2, cy: row.iy + row.ih / 2, z };
  }
  const r = roomAt(world, f0), zFlat = fitCam(world, vw, vh, "flat", f0).z;
  const z = Math.max(zFlat, Math.min((vw * 0.98) / r.w, (vh * 0.86) / row.ih));
  return { cx: r.x + r.w / 2, cy: row.iy + row.ih / 2, z };
}
export function zoomRange(world, vw, vh) {
  const lo = fitCam(world, vw, vh, "building").z * 0.85;
  let hi = 0;
  for (const r of world.rows) if (r.kind === "storey") for (const u of r.units) for (const q of u.rooms) hi = Math.max(hi, fitCam(world, vw, vh, "room", { i: r.i, k: u.k, j: q.j }).z);
  return { min: lo, max: hi * 1.25 };
}
export function clampCam(world, cam, vw, vh) {
  const { min, max } = zoomRange(world, vw, vh);
  const z = clampI(cam.z, min, max);
  return { cx: clampI(cam.cx, 0, world.W), cy: clampI(cam.cy, 0, world.total), z };
}
// The level the camera reads as: the stop whose zoom it is nearest to (geometric midpoints)
export function levelAt(world, cam, vw, vh) {
  const f = focusAt(world, cam.cx, cam.cy);
  const zs = LEVELS.map(l => fitCam(world, vw, vh, l, f).z);
  let L = 0;
  for (let n = 1; n < zs.length; n++) if (cam.z >= Math.sqrt(zs[n - 1] * zs[n])) L = n;
  return LEVELS[L];
}
// The next stop in or out that actually changes the view (a one-room flat has no ROOM beyond its FLAT)
export function nextLevel(world, vw, vh, level, f, dir) {
  const z0 = fitCam(world, vw, vh, level, f).z;
  let L = LEVELS.indexOf(level);
  for (;;) {
    const n = L + dir;
    if (n < 0 || n >= LEVELS.length) return LEVELS[L];
    L = n;
    const z = fitCam(world, vw, vh, LEVELS[L], f).z;
    if (dir > 0 ? z > z0 * 1.08 : z < z0 / 1.08) return LEVELS[L];
  }
}
export const deeper = (level) => LEVELS[Math.min(LEVELS.length - 1, LEVELS.indexOf(level) + 1)];
export const shallower = (level) => LEVELS[Math.max(0, LEVELS.indexOf(level) - 1)];

// ---- moving the focus (arrows, the d-pad) -------------------------------------------------------
export function moveFocus(world, f, level, dir) {
  const row = world.at[f.i], un = unitAt(world, f), cxw = roomAt(world, f).x + roomAt(world, f).w / 2;
  const nearest = (list, x) => list.reduce((a, b) => (Math.abs(b.x + b.w / 2 - x) < Math.abs(a.x + a.w / 2 - x) ? b : a));
  if (dir === "up" || dir === "down") {
    const i = clampI(f.i + (dir === "up" ? 1 : -1), 0, world.N - 1);
    if (i === f.i) return f;
    const nu = nearest(world.at[i].units, un.x + un.w / 2);
    return { i, k: nu.k, j: level === "room" ? nearest(nu.rooms, cxw).j : 0 };
  }
  if (level === "building") return f;
  const step = dir === "right" ? 1 : -1;
  if (level === "room") {
    const j = f.j + step;
    if (j >= 0 && j < un.rooms.length) return { ...f, j };
    const k = f.k + step;
    if (k < 0 || k >= row.units.length) return f;
    return { i: f.i, k, j: step > 0 ? 0 : row.units[k].rooms.length - 1 };
  }
  const k = clampI(f.k + step, 0, row.units.length - 1);
  return { i: f.i, k, j: 0 };
}

// ---- the breadcrumb: BUILDING > FLOOR 7F > FLAT 7A > LIVING ROOM ----------------------------------
export const unitWord = (u) => (u.kind === "flat" ? `FLAT ${u.label}` : u.kind === "lobby" ? "THE LOBBY" : u.label || "UNIT");
export function crumbs(world, name, f, level) {
  const out = [{ level: "building", label: String(name || world.plan.name).toUpperCase() }];
  const st = world.plan.storeys[f.i];
  if (LEVELS.indexOf(level) >= 1 && st) out.push({ level: "floor", label: `FLOOR ${st.code}` });
  if (LEVELS.indexOf(level) >= 2 && st) out.push({ level: "flat", label: unitWord(unitAt(world, f).u) });
  if (LEVELS.indexOf(level) >= 3 && st) out.push({ level: "room", label: PURPOSE_NAME[roomAt(world, f).rm.purpose] || roomAt(world, f).rm.purpose.toUpperCase() });
  return out;
}

// ---- deep links: #city/<district>/<tower>?flat=<id>&zoom=flat[&room=<purpose>] ----------------------
// ?floor=<sim floor>&storey=<level>&zoom=floor names a storey; ?flat=<id> a flat (default zoom flat);
// ?room= a purpose or a full room id. -> {level, f} or null (no zoom asked, or nothing it names).
export function parseLink(plan, search) {
  const q = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const zoom = q.get("zoom"), flat = q.get("flat");
  if (!zoom && !flat) return null;
  let level = LEVELS.includes(zoom) ? zoom : flat ? "flat" : null;
  if (!level) return null;
  let f = null;
  if (flat) {
    for (const st of plan.storeys) { const k = st.units.findIndex(u => u.id === flat); if (k >= 0) { f = { i: plan.storeys.indexOf(st), k, j: 0 }; break; } }
    if (!f) return null;
  } else {
    const fl = q.get("floor"), lv = q.get("storey");
    if (fl != null && fl !== "") {
      let i = lv != null && lv !== "" ? plan.storeys.findIndex(st => st.simFloor === +fl && st.level === +lv) : -1;
      if (i < 0) i = plan.storeys.findIndex(st => st.simFloor === +fl);
      if (i >= 0) f = { i, k: 0, j: 0 };
    }
    if (!f) f = { i: Math.max(0, plan.storeys.findIndex(st => st.level === 0)), k: 0, j: 0 };
  }
  const room = q.get("room");
  if (room) {
    const u = plan.storeys[f.i].units[f.k], j = u.rooms.findIndex(r => r.id === room || r.purpose === room);
    if (j >= 0) { f.j = j; if (!zoom) level = "room"; }
  }
  if (level === "room" && !room) f.j = 0;
  return { level, f };
}
// The query to write for a place: the params that are not ours are the caller's to keep.
export function linkParams(plan, f, level) {
  const out = { flat: null, zoom: null, room: null };
  if (level === "building") return out;
  const st = plan.storeys[f.i];
  if (level === "floor") { out.zoom = "floor"; out.floor = String(st.simFloor); out.storey = String(st.level); return out; }
  const u = st.units[f.k];
  out.flat = u.id; out.zoom = level;
  if (level === "room") out.room = u.rooms[Math.min(f.j, u.rooms.length - 1)].purpose;
  return out;
}

// ---- the furniture in a room, as taps (the same geometry drawRoom paints with) -------------------
// room rect on screen (x, y, w, h), the dressed furniture list, the room look -> [{item, name, x0, y0, x1, y1, placed}]
export function itemBoxes(furniture, hasLook, x, y, w, h, snap) {
  const s = roomScale(w, h, snap), fy = y + h, ft = hasLook ? Math.max(1, Math.round(2.4 * s)) : 0, ffy = fy - ft;
  const out = [];
  for (const p of furniture || []) {
    const it = pieceOf(p.item);
    if (!it) continue;
    const half = (it.footprint.w * s) / 2, cx = x + p.x * w;
    out.push({ item: p.item, name: p.label || it.name, role: it.role, placed: !!p.placed, x0: cx - half, x1: cx + half, y0: it.wall ? ffy - Math.max(it.footprint.h, 24) * s : ffy - it.footprint.h * s, y1: it.wall ? ffy - 6 * s : ffy });
  }
  return out;
}
export function topBox(boxes, px, py, pad = 2) {
  for (let n = boxes.length - 1; n >= 0; n--) { const b = boxes[n]; if (px >= b.x0 - pad && px <= b.x1 + pad && py >= b.y0 - pad && py <= b.y1 + pad) return b; }
  return null;
}
// What a tap on a piece does: {label, kind: play | ebtv | closet | none, play?}. Your own flat's
// placed pieces play (shops.js PLAY_AT_HOME); the set shows the channel for anyone; the wardrobe
// in your own flat opens the closet.
export function itemAction(box, mine) {
  const pl = PLAY_AT_HOME[box.item];
  if (pl?.ebtv) return { label: pl.label, kind: "ebtv", play: pl };
  if (mine && pl && box.placed) return { label: pl.label, kind: "play", play: pl };
  if (mine && box.item === "wardrobe") return { label: "OPEN THE CLOSET", kind: "closet" };
  return { label: box.name, kind: "none" };
}

// ---- the camera tween ----------------------------------------------------------------------------
export function stepCam(cam, tgt, dt, reduced) {
  if (reduced) return { ...tgt };
  const k = 1 - Math.exp(-dt * 9);
  const z = cam.z * Math.pow(tgt.z / cam.z, k);
  const close = (a, b, e) => Math.abs(a - b) < e;
  const next = { cx: cam.cx + (tgt.cx - cam.cx) * k, cy: cam.cy + (tgt.cy - cam.cy) * k, z };
  if (close(next.z / tgt.z, 1, 0.002) && close(next.cx, tgt.cx, 0.05 / tgt.z) && close(next.cy, tgt.cy, 0.05 / tgt.z)) return { ...tgt };
  return next;
}
