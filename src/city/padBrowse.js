// GAMEPAD BROWSE: the controller for everything in the city that is not DRIVE YOURSELF.
// Active whenever a pad is connected and you are not driving (control.js). The left stick moves
// a cursor (a pixel reticle) with acceleration and a little aim assist; it hovers like a mouse.
// The right stick pans, the triggers zoom, the bumpers turn, the right-stick click fits. A taps
// (first A names a building and puts its chip up, A again opens the cutaway), B backs out, X
// FINDs, Y names everything, the d-pad steps through the buildings nearest-first, Start drives
// (controlIso.js, gamepad.driveToggle), Select toggles CITY / MAP. Inside an open cutaway the
// stick and d-pad move between rooms; A goes in among the people, cabinets and shop items, A
// again opens one; B comes back out, then closes.
//
// The rules (cursor, pan, zoom, which action a press means) are pure and checked in
// scripts/check-control.mjs with a mocked navigator.getGamepads(). makePadBrowse wires them to
// a view (CityIso.jsx, CityMap.jsx) through hooks; render and input only, never the sim.

import { readPad, pressedSince } from "./gamepad.js";

export const CUR = { speed: 900, ramp: 0.45, friction: 0.5, pull: 10, pullR: 26, edge: 22 };
export const PAN = 780;          // px per second, the right stick at full tilt
export const ZOOM_RATE = 1.7;    // e-folds per second, a trigger held down
export const REPEAT = [0.36, 0.15];   // the stick as a d-pad: first repeat, then every

// The cursor, one frame. c: {x, y, t (seconds pushed)}; (sx, sy) the dead-zoned stick.
// o: {w, h, over (something under it: slow down), snap ([x, y] of a small target near it),
// reduced}. A light push is fine, a full push is fast, and a held push ramps up. Released, it
// settles onto a small target (a person) within reach. At the rim it stops and pushes: ex, ey
// (-1..1) is how hard, for the camera. -> {x, y, t, ex, ey}
export function stepCursor(c, sx, sy, dt, o = {}) {
  const w = o.w || 0, h = o.h || 0, m = Math.hypot(sx, sy);
  let x = c.x, y = c.y;
  const t = m > 0 ? (c.t || 0) + dt : 0;
  if (m > 0) {
    const ramp = (1 - CUR.ramp) + CUR.ramp * Math.min(1, t / 0.5);
    const sp = CUR.speed * m * ramp * (o.over ? CUR.friction : 1);   // speed ~ m^2: fine near the centre
    x += sx * sp * dt; y += sy * sp * dt;
  } else if (o.snap) {
    const k = o.reduced ? 1 : 1 - Math.exp(-CUR.pull * dt);
    x += (o.snap[0] - x) * k; y += (o.snap[1] - y) * k;
  }
  const E = Math.min(CUR.edge, w / 2, h / 2);
  let ex = 0, ey = 0;
  if (x < E) { if (sx < 0) ex = sx; x = E; } else if (x > w - E) { if (sx > 0) ex = sx; x = w - E; }
  if (y < E) { if (sy < 0) ey = sy; y = E; } else if (y > h - E) { if (sy > 0) ey = sy; y = h - E; }
  return { x, y, t, ex, ey };
}

// The nearest small target to (x, y) within the pull radius -> [x, y] | null.
export function snapTarget(x, y, targets, r = CUR.pullR) {
  let best = null, bd = r;
  for (const q of targets) { const d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = [q.x, q.y]; } }
  return best;
}

// The right stick: a velocity that eases toward the push (none under reduced motion).
// -> {x, y} px per second; the view moves the way the stick points.
export function stepPan(v, sx, sy, dt, reduced = false) {
  const tx = sx * PAN, ty = sy * PAN;
  if (reduced) return { x: tx, y: ty };
  const k = 1 - Math.exp(-12 * dt);
  const x = v.x + (tx - v.x) * k, y = v.y + (ty - v.y) * k;
  return { x: Math.abs(x) < 1 && !tx ? 0 : x, y: Math.abs(y) < 1 && !ty ? 0 : y };
}

// The triggers: right in, left out -> a zoom factor for this frame (1: none).
export const zoomFactor = (lt, rt, dt) => Math.exp(((rt || 0) - (lt || 0)) * ZOOM_RATE * dt);

// The left stick as a d-pad, inside a cutaway: one step on the push, then repeats.
// rep: {dir, t}; -> {rep, dir: "up" | "down" | "left" | "right" | null}
export function stickStep(rep, sx, sy, dt) {
  const ax = Math.abs(sx), ay = Math.abs(sy);
  const dir = Math.max(ax, ay) < 0.5 ? null : ax > ay ? (sx > 0 ? "right" : "left") : (sy > 0 ? "down" : "up");
  if (!dir) return { rep: { dir: null, t: 0 }, dir: null };
  if (dir !== rep.dir) return { rep: { dir, t: -REPEAT[0] }, dir };
  const t = rep.t + dt;
  if (t >= REPEAT[1]) return { rep: { dir, t: t - REPEAT[1] }, dir };
  return { rep: { dir, t }, dir: null };
}

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
// From target `from`, the nearest one the way of dir (along the axis, sideways counts double)
// -> its index, or -1. targets: [{x, y}].
export function nearestInDir(from, targets, dir) {
  const [dx, dy] = DIRS[dir] || [0, 0];
  let best = -1, bd = Infinity;
  targets.forEach((q, i) => {
    if (q === from) return;
    const ox = q.x - from.x, oy = q.y - from.y, along = ox * dx + oy * dy;
    if (along <= 1) return;
    const side = Math.abs(ox * dy - oy * dx), d = along + side * 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

// What this frame's presses mean, in a mode -> [action]. Pure; the view does them.
//   mode "browse": the open city or map; "rooms": a cutaway, a room in focus; "items": inside
//   a room, a person, cabinet or shop item in focus; "find": the FIND box has focus; "card": a
//   file or an overlay is open over the city.
export function padActions(pp, mode) {
  const a = [];
  if (!pp) return a;
  if (mode === "card") { if (pp.back) a.push("closeCard"); return a; }
  if (mode === "find") {
    if (pp.up) a.push("findUp");
    if (pp.down) a.push("findDown");
    if (pp.act) a.push("findPick");
    if (pp.back || pp.find) a.push("findClose");
    return a;
  }
  if (pp.turnL) a.push("turnL");
  if (pp.turnR) a.push("turnR");
  if (pp.rs) a.push("fit");
  if (pp.select) a.push("view");
  if (pp.find) a.push("find");
  if (mode === "rooms" || mode === "items") {
    for (const d of ["up", "down", "left", "right"]) if (pp[d]) a.push(`move:${d}`);
    if (pp.act) a.push(mode === "rooms" ? "drill" : "open");
    if (pp.labels) a.push("enter");
    if (pp.back) a.push(mode === "items" ? "out" : "close");
    return a;
  }
  if (pp.labels) a.push("labels");
  if (pp.start) a.push("drive");   // where DRIVE YOURSELF is not on this view (the map); the CITY view's own is controlIso.js
  if (pp.up || pp.left) a.push("prev");
  if (pp.down || pp.right) a.push("next");
  if (pp.act) a.push("tap");
  if (pp.back) a.push("back");
  return a;
}

// ---- wiring -------------------------------------------------------------------------------
const cardOpen = () => typeof document !== "undefined" && Boolean(document.querySelector("[role='dialog'][aria-modal='true'], .hvi-pen-card"));
const findInput = () => (typeof document === "undefined" ? null : document.querySelector(".hvi-city-find input"));
const key = (target, k) => target?.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
// SELECT: the CITY / MAP chips (City3D.ViewToggle), pressed as a viewer would
export function pressView(name) {
  if (typeof document === "undefined") return false;
  const b = [...document.querySelectorAll("[aria-label='City view'] button")].find(x => x.textContent.trim() === name);
  if (b) b.click();
  return Boolean(b);
}

// H (the view's hooks): size() -> [w, h]; driving() -> bool; hasSelf() -> bool;
// targets() -> [{x, y}] small things to settle on; hover(x, y) -> a name | null (and shows it);
// tap(x, y); back() -> bool (something was dismissed); pan(dx, dy) in px (the view moves
// that way); zoom(f, x, y); turn(dir); fit(); labels(); prev() / next() -> [x, y] | null (the
// cursor goes there); other: "MAP" | "CITY" (Select); drive() (Start, where there is no
// DRIVE YOURSELF here); nofile() (Start with no file here, where drive() would be); poke(); wake() (the pad was picked up); reduced() -> bool; publish(ui | null).
// Cutaway hooks (optional): rooms() -> null | [{key, x, y, box}], items(roomKey) ->
// [{key, x, y, box, name}], open(item), roomAct(room) (A on a room with nothing in it),
// enter(), close().
export function makePadBrowse(H) {
  const P = { on: false, connected: false, prev: null, last: 0, x: 0, y: 0, t: 0, vel: { x: 0, y: 0 }, rep: { dir: null, t: 0 }, room: null, item: null, level: "rooms", family: "generic", said: null, shown: null };
  const published = { v: null };
  function publish(ui) {
    const s = ui && JSON.stringify(ui);
    if (s === published.v) return;
    published.v = s;
    H.publish(ui);
  }
  // the cutaway: which room, which item; kept by key while the people move
  function focusIn(rooms) {
    let r = rooms.find(q => q.key === P.room);
    if (!r) { r = rooms.find(q => q.entry) || rooms[0]; P.room = r?.key || null; P.level = "rooms"; P.item = null; }
    if (P.level !== "items") return { r, it: null, items: [] };
    const items = H.items(P.room) || [];
    let it = items.find(q => q.key === P.item);
    if (!it) { it = items[0]; P.item = it?.key || null; }
    if (!it) P.level = "rooms";
    return { r, it: it || null, items };
  }
  function move(list, cur, dir) {
    if (!cur) return list[0] || null;
    const i = nearestInDir(cur, list, dir);
    return i >= 0 ? list[i] : null;
  }

  // every frame (the view's rAF): read the pad and do what it says. -> true while it is in use.
  function poll(now = performance.now()) {
    const pad = readPad(H.nav || globalThis.navigator);   // H.nav: the checks' mock
    const dt = P.last ? Math.min(0.1, (now - P.last) / 1000) : 0;
    P.last = now;
    if (!pad.connected) {
      if (P.connected) { P.connected = false; P.on = false; P.prev = null; publish(null); H.poke(); }
      return false;
    }
    if (!P.connected) { P.connected = true; const [w, h] = H.size(); P.x = w / 2; P.y = h / 2; }
    P.family = pad.family;
    // the first look is the baseline: a button already down (Select, held through the switch to
    // the other view) is not a press there
    const pp = pressedSince(P.prev || pad.held, pad.held);
    P.prev = pad.held;
    if (H.driving()) { P.on = false; publish(null); return false; }
    const busy = Object.values(pp).some(Boolean) || pad.lmag > 0 || pad.rmag > 0 || pad.lt > 0 || pad.rt > 0;
    if (busy && !P.on) { P.on = true; H.wake?.(); H.poke(); }
    if (!P.on) { publish({ family: P.family, mode: "idle", self: H.hasSelf() }); return false; }   // connected, untouched: the mouse and the keys have the city (the hint names the way in: Start)
    const fi = findInput();
    const finding = fi && typeof document !== "undefined" && document.activeElement === fi;
    const rooms = !cardOpen() && H.rooms ? H.rooms() : null;
    const mode = cardOpen() ? "card" : finding ? "find" : rooms && rooms.length ? (P.level === "items" ? "items" : "rooms") : "browse";
    if (mode !== "rooms" && mode !== "items") { P.room = null; P.item = null; P.level = "rooms"; }
    let acts = padActions(pp, mode);
    let say = null;

    if (mode === "card" || mode === "find") {
      for (const a of acts) {
        if (a === "closeCard") key(window, "Escape");
        else if (a === "findUp") key(fi, "ArrowUp");
        else if (a === "findDown") key(fi, "ArrowDown");
        else if (a === "findPick") {
          if (!fi.value.trim()) { const me = document.querySelector("button.hvi-city-findme:not([disabled])"); if (me) { fi.blur(); me.click(); } }
          else key(fi, "Enter");
        } else if (a === "findClose") { key(fi, "Escape"); fi.blur(); H.focus?.(); }
      }
      publish({ family: P.family, mode, self: H.hasSelf() });
      return true;
    }

    // the camera: the right stick pans, the triggers zoom, from wherever the cursor is
    P.vel = stepPan(P.vel, pad.rx, pad.ry, dt, H.reduced());
    if (P.vel.x || P.vel.y) H.pan(-P.vel.x * dt, -P.vel.y * dt);
    const zf = zoomFactor(pad.lt, pad.rt, dt);
    if (zf !== 1) { const [w, h] = H.size(); const c = mode === "browse" ? [P.x, P.y] : [w / 2, h / 2]; H.zoom(zf, c[0], c[1]); }

    if (mode === "rooms" || mode === "items") {
      // the stick, as a d-pad, between rooms (or between the people and things in one)
      const st = stickStep(P.rep, pad.lx, pad.ly, dt);
      P.rep = st.rep;
      if (st.dir && !acts.includes(`move:${st.dir}`)) acts = [...acts, `move:${st.dir}`];
      let { r, it, items } = focusIn(rooms);
      for (const a of acts) {
        if (a.startsWith("move:")) {
          const dir = a.slice(5);
          if (P.level === "items") { const n = move(items, it, dir); if (n) { it = n; P.item = n.key; } }
          else { const n = move(rooms, r, dir); if (n) { r = n; P.room = n.key; } }
        } else if (a === "drill") {
          const list = H.items(P.room) || [];
          if (list.length) { P.level = "items"; it = list[0]; items = list; P.item = it.key; } else H.roomAct?.(r);
        } else if (a === "open") { if (it) H.open(it); }
        else if (a === "out") { P.level = "rooms"; P.item = null; it = null; }
        else if (a === "close") { H.close(); P.room = null; }
        else if (a === "enter") H.enter?.();
        else doCommon(a);
      }
      P.shown = P.level === "items" && it ? it : r;
      say = P.shown?.name || null;
      if (say !== P.said) { P.said = say; H.say?.(say); }
      if (acts.length || st.dir) H.poke();
      publish({ family: P.family, mode: P.level === "items" ? "items" : "rooms", self: H.hasSelf() });
      return true;
    }

    // the open city: the cursor
    P.shown = null;
    const [w, h] = H.size();
    const name0 = H.hover(P.x, P.y);
    const snap = pad.lmag > 0 ? null : snapTarget(P.x, P.y, H.targets());
    const c = stepCursor(P, pad.lx, pad.ly, dt, { w, h, over: Boolean(name0), snap, reduced: H.reduced() });
    const moved = Math.abs(c.x - P.x) > 0.01 || Math.abs(c.y - P.y) > 0.01;
    P.x = c.x; P.y = c.y; P.t = c.t;
    if (c.ex || c.ey) H.pan(-c.ex * PAN * dt, -c.ey * PAN * dt);   // pushed against the rim: the view follows
    for (const a of acts) {
      if (a === "tap") H.tap(P.x, P.y);
      else if (a === "back") H.back();
      else if (a === "labels") H.labels();
      else if (a === "prev" || a === "next") { const at = H[a](); if (at) { P.x = at[0]; P.y = at[1]; } }
      else doCommon(a);
    }
    const name = H.hover(P.x, P.y);
    if (name !== P.said) { P.said = name; H.say?.(name); }
    if (moved || acts.length || c.ex || c.ey) H.poke();
    publish({ family: P.family, mode: "browse", self: H.hasSelf() });
    return true;
  }
  function doCommon(a) {
    if (a === "turnL") H.turn(-1);
    else if (a === "turnR") H.turn(1);
    else if (a === "fit") H.fit();
    else if (a === "drive") { if (H.hasSelf()) H.drive?.(); else H.nofile?.(); }
    else if (a === "view") pressView(H.other);
    else if (a === "find") { const fi = findInput(); if (fi) { fi.focus(); fi.scrollIntoView?.({ block: "nearest" }); } }
  }
  // a mouse (or a finger) took over: the cursor steps aside until the pad is used again
  function off() { if (P.on) { P.on = false; P.said = null; publish(null); H.poke(); } }
  return { P, poll, off, active: () => P.on };
}

// The reticle: a pixel cross with a gap, a dark keyline under it, a dot when something is under it.
export function drawReticle(ctx, x, y, hot = false) {
  const X = Math.round(x), Y = Math.round(y), a = 4, b = 10;
  ctx.save();
  ctx.lineCap = "butt";
  for (const [col, lw] of [["rgba(4,8,4,0.85)", 4], [hot ? "#e5ffe9" : "#4ade80", 2]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(X - b, Y); ctx.lineTo(X - a, Y); ctx.moveTo(X + a, Y); ctx.lineTo(X + b, Y);
    ctx.moveTo(X, Y - b); ctx.lineTo(X, Y - a); ctx.moveTo(X, Y + a); ctx.lineTo(X, Y + b);
    ctx.stroke();
  }
  ctx.fillStyle = hot ? "#e5ffe9" : "#4ade80"; ctx.fillRect(X - 1, Y - 1, 2, 2);
  ctx.restore();
}
// The focus box in a cutaway: brackets at the corners of what A would open.
export function drawFocus(ctx, box, strong = true) {
  const [x0, y0, x1, y1] = box.map(Math.round), k = Math.max(4, Math.min(10, Math.round((x1 - x0) / 5), Math.round((y1 - y0) / 4)));
  ctx.save();
  for (const [col, lw] of [["rgba(4,8,4,0.85)", 4], [strong ? "#e5ffe9" : "#4ade80", 2]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath();
    for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      ctx.moveTo(cx + sx * k, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * k);
    }
    ctx.stroke();
  }
  ctx.restore();
}
