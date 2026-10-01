// DRIVE YOURSELF in the CITY view (CityIso.jsx): the controlled self's per-frame step, its
// camera, and its drawing. The rules are control.js (pure); the widgets ControlLayer.jsx.
// CityIso hands over its drawing kit once (makeIsoControl) and calls, each marked
// "DRIVE YOURSELF" there:
//   step(mt, trains)          every frame, before the camera eases
//   movers(out, r)            inside movers(): reads who is near, adds the avatar
//   drawMover(m, lod)         for the avatar's mover (kind "ctl")
//   room(...)                 inside drawRoomCut: the avatar in its room, the lift, the exit
//   overlay()                 after the labels: the YOU marker
//   owns(e) / hands()         the canvas's own keys stand down; a drag stops following
//   start(self) / release()   TAKE CONTROL / RELEASE

import { BUILDING, DISTRICTS, STATIONS, STOPS, TRAIN, nextArrivalAt, stationName } from "./sim.js";
import { SPRITE_W, SPRITE_H, statureOf } from "../sprites.js";
import { sheetFor, miniFor } from "./spriteBank.js";
import { drawPose, fitStature } from "./poses.js";
import { findTarget } from "./find.js";
import { displayName } from "../figures.js";
import { rot, STOREY, DECK, LOD_NEAR } from "./iso.js";
import { readPad, pressedSince } from "./gamepad.js";
import { tableNear, tableGo } from "../chess/park.js";   // PARK CHESS: E at a stone table
import {
  CTL, publishUi, keysVector, screenToMapDir, stepStreet, stepInside, stateFromTarget, loadControl, saveControl,
  doorOf, doorNear, groundAt, isClassified, benchNear, stationNear, stairFoot, platformPoint, platformStep, stationGeoOf,
  trainIn, nearestCar, entryFloor, roomAt, isExitFloor, nearestSeat, exitPoint, freeSpot, floorsWithRooms,
  PERSON_REACH, BUMP_ENTER, DOOR_REACH, LIFT_X, EXIT_X, PLAT_LA, WALK_SPEED, RUN_SPEED,
} from "./control.js";

const CAR_TOP = DECK + 0.05 + 0.62;
const MOVE_KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"]);
const OWN_KEYS = new Set([...MOVE_KEYS, "e", "q", "r", "b", "escape", "enter", " ", "backspace"]);
export const TAKE_LINE = "SCHEDULE SUSPENDED. THE DEPARTMENT IS WATCHING YOU WALK.";
export const RELEASE_LINE = "SCHEDULE RESUMED. YOU WERE NEVER ANYWHERE ELSE.";
const nameOf = (s) => { const n = displayName(s).toUpperCase(); return n.length > 22 ? n.slice(0, 21) + "…" : n; };
const districtAt = (x, y) => DISTRICTS.find(d => x >= d.rect.x && x <= d.rect.x + d.rect.w && y >= d.rect.y && y <= d.rect.y + d.rect.h) || null;
const typing = (t) => t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
const cardOpen = () => typeof document !== "undefined" && Boolean(document.querySelector("[role='dialog'], .hvi-pen-card"));

// K: { V, ctx, P(u, v, h), Q(x, y, h), select(id), setCam(z, ox, oy), hit(h), onOpen(s), turn(dir), getSelf() }
export function makeIsoControl(K) {
  const { V, ctx } = K;
  let last = 0, resumed = false, saveAt = 0, lean = { id: null, t: 0 }, padPrev = null, padWas = false, near = null, inside = null, follow = true, flew = false;
  const input = CTL.input;
  if (import.meta.env?.DEV && typeof window !== "undefined") window.__hviCtl = CTL;   // for the browser checks

  function note(text) { CTL.note = { text, until: performance.now() + 4200 }; }
  function start(self) {
    self = self || K.getSelf();
    if (!self) return false;
    const key = self.slug || self.name;
    const mt = V.mt ?? 0;
    CTL.self = self;
    CTL.st = loadControl(key) || stateFromTarget(key, findTarget(self, mt));
    CTL.request = false;
    follow = true; flew = false; lean = { id: null, t: 0 };
    V.censusV = -1;          // re-read the census now: the scheduled self steps out of it
    note(TAKE_LINE);
    V.need = true;
    return true;
  }
  function release() {
    const st = CTL.st;
    if (!st) return;
    if (st.mode === "inside" && V.sel === st.bId) K.select(null);
    CTL.st = null;
    CTL.request = false;
    saveControl(null);
    input.keys.clear();
    V.censusV = -1;
    note(RELEASE_LINE);
    publishUi(null);
    V.need = true;
  }

  // ---- moves between modes ----------------------------------------------------------------
  function enter(b) {
    const st = CTL.st;
    if (isClassified(b)) { note("HEADQUARTERS IS NOT OPEN TO YOU. IT IS OPEN ABOUT YOU."); return; }
    const fi = entryFloor(b);
    if (fi == null) { note(`${b.name} IS SEALED. THE DEPARTMENT HAS ITS REASONS.`); return; }
    Object.assign(st, { mode: "inside", bId: b.id, floor: fi, fx: floorsWithRooms(b).length ? 0.9 : 0.5, seat: null, moving: false });
    K.select(b.id); follow = true;
  }
  function leave() {
    const st = CTL.st, b = BUILDING[st.bId];
    const [x, y] = b ? exitPoint(b) : freeSpot(st.x || 0, st.y || 0);
    if (V.sel === st.bId) K.select(null);
    Object.assign(st, { mode: "street", x, y, bId: null, floor: null, fx: null, seat: null });
    follow = true;
  }
  function climb(id) {
    Object.assign(CTL.st, { mode: "platform", stationId: id, al: 0.4, la: PLAT_LA[1], waiting: false, bench: null });
    follow = true;
  }
  function descend() {
    const st = CTL.st, f = stairFoot(st.stationId);
    const [x, y] = freeSpot(f.x, f.y);
    Object.assign(st, { mode: "street", x, y, stationId: null, waiting: false });
  }
  function board(tr, x, y) {
    Object.assign(CTL.st, { mode: "riding", trainId: tr.id, car: nearestCar(tr, x, y), boardedAt: tr.stationId, departed: false, alightNext: false, waiting: false });
    note(`ABOARD ${tr.name}. THE JOURNEY IS LOGGED.`);
  }
  function alight(tr) {
    const st = CTL.st, id = tr.stationId, car = tr.cars[st.car] || tr.cars[0];
    // step off at the car's door: its place along the platform
    const hl = (stationGeoOf(id)?.hl || 6) - 0.5, al = Math.max(-hl, Math.min(hl, alongOf(id, car.pose || car)));
    Object.assign(st, { mode: "platform", stationId: id, al, la: PLAT_LA[0] + 0.1, trainId: null, car: null, alightNext: false, waiting: false });
    note(`${stationName(id)}. MIND THE GAP. IT IS ALSO ON FILE.`);
  }
  function alongOf(id, p) { const a = platformPoint(id, 0, 0), b = platformPoint(id, 1, 0); return (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y); }

  // ---- the E button, and B ---------------------------------------------------------------------
  function act(trains) {
    const st = CTL.st, n = near;
    if (!n) return;
    if (n.kind === "person") { K.onOpen(n.s); return; }
    if (n.kind === "door" || n.kind === "ground") { enter(n.b); return; }
    if (n.kind === "station") { climb(n.id); return; }
    if (n.kind === "chess") { window.location.hash = n.go; return; }
    if (n.kind === "bench") { Object.assign(st, { mode: "bench", bench: n.bench, x: n.bench.x, y: n.bench.y }); return; }
    if (n.kind === "stand-bench") { const [x, y] = freeSpot(st.x, st.y + 0.5); Object.assign(st, { mode: "street", bench: null, x, y }); return; }
    if (n.kind === "sit") { st.seat = { placeId: n.placeId, i: n.i }; return; }
    if (n.kind === "stand") { st.seat = null; return; }
    if (n.kind === "leave") { leave(); return; }
    if (n.kind === "board") { const p = platformPoint(st.stationId, st.al, st.la); board(n.tr, p.x, p.y); return; }
    if (n.kind === "wait") { st.waiting = !st.waiting; return; }
    if (n.kind === "alight") { alight(n.tr); return; }
    if (n.kind === "next") { st.alightNext = !st.alightNext; return; }
    void trains;
  }
  function back() {
    const st = CTL.st;
    if (st.mode === "inside") leave();
    else if (st.mode === "platform") descend();
    else if (st.mode === "riding") st.alightNext = true;
    else if (st.mode === "bench") act();
  }

  // ---- every frame ------------------------------------------------------------------------------
  function step(mt, trains) {
    const now = performance.now(), dt = Math.min(0.1, last ? (now - last) / 1000 : 0);
    last = now;
    // the pad: connect/disconnect, and Start takes (or releases) control
    const pad = readPad();
    input.pad = pad.connected ? pad : null;
    if (pad.connected !== padWas) { padWas = pad.connected; if (pad.connected) { input.source = "pad"; if (CTL.st) note(`CONTROLLER DETECTED. THE DEPARTMENT ACCEPTS ALL PERIPHERALS.`); } else if (input.source === "pad") { input.source = "keys"; if (CTL.st) note("CONTROLLER LOST. THE KEYBOARD REMAINS. IT ALWAYS DOES."); } }
    const pp = pad.connected ? pressedSince(padPrev, pad.held) : {};
    padPrev = pad.connected ? pad.held : null;
    if (pad.connected && (pad.mag > 0 || Object.values(pp).some(Boolean))) input.source = "pad";
    if (CTL.request && !CTL.st && K.getSelf()) { if (Date.now() - CTL.request < 15000) start(); else CTL.request = false; }
    // a reload (or Back from a building page) resumes a drive saved this session
    if (!resumed && !CTL.st && K.getSelf()) { resumed = true; const sf = K.getSelf(); if (loadControl(sf.slug || sf.name)) start(sf); }
    if (pp.start && !cardOpen()) { if (CTL.st) { release(); return; } if (K.getSelf()) start(); }
    const st = CTL.st;
    if (!st) { input.taps.act = input.taps.back = input.taps.release = 0; return; }
    V.need = true;
    if (cardOpen()) { input.keys.clear(); input.taps.act = input.taps.back = 0; publish(mt, trains); return; }
    if (input.taps.release) { input.taps.release = 0; release(); return; }
    if (pp.turnL) K.turn(-1);
    if (pp.turnR) K.turn(1);
    // the vector: the stick in use wins over the keys
    const kv = keysVector(input.keys);
    let v = kv, run = kv.run;
    if (input.stick.mag > 0) { v = input.stick; run = input.stick.mag >= 0.92; }
    else if (pad.connected && pad.mag > 0) { v = pad; run = pad.run; }
    const moving = Math.hypot(v.x, v.y) > 0.01;
    if (moving) { follow = true; if (V.find?.follow) K.unfollowFind?.(); }
    // modes
    if (st.mode === "street") {
      const bump = stepStreet(st, v, run, V.cam.r, dt);
      // lean on a door and you are through it
      const d = bump && doorOf(BUILDING[bump.id]);
      if (d && Math.hypot(d.x - st.x, d.y - st.y) < DOOR_REACH) {
        if (lean.id === bump.id) lean.t += dt; else lean = { id: bump.id, t: dt };
        if (lean.t > BUMP_ENTER) { lean = { id: null, t: 0 }; enter(BUILDING[bump.id]); }
      } else if (!bump) lean = { id: null, t: 0 };
    } else if (st.mode === "bench") {
      st.moving = false;
      if (moving) { const [x, y] = freeSpot(st.x, st.y + 0.5); Object.assign(st, { mode: "street", bench: null, x, y }); }
    } else if (st.mode === "inside") {
      const b = BUILDING[st.bId];
      if (!b) { leave(); return; }
      if (moving) st.seat = null;
      if (!st.seat && stepInside(st, v, run, dt, b) === "exit") leave();
      if (follow && !V.find?.follow && V.sel !== st.bId && CTL.st?.mode === "inside") K.select(st.bId);
    } else if (st.mode === "platform") {
      st.moving = moving;
      if (moving) {
        const sp = (run ? RUN_SPEED : WALK_SPEED) * Math.min(1, Math.hypot(v.x, v.y)) * dt;
        const [dx, dy] = mapDir(v);
        const p = platformStep(st.stationId, st.al, st.la, dx * sp, dy * sp);
        st.al = p.al; st.la = p.la;
        if (Math.abs(v.x) > 0.05) st.face = v.x > 0 ? 1 : -1;
      }
      const tr = trainIn(trains, st.stationId);
      if (tr && st.waiting) { const p = platformPoint(st.stationId, st.al, st.la); board(tr, p.x, p.y); }
    } else if (st.mode === "riding") {
      st.moving = false;
      const tr = trains.find(t => t.id === st.trainId);
      if (!tr) { const id = Object.keys(STATIONS)[0]; Object.assign(st, { mode: "platform", stationId: id, al: 0, la: PLAT_LA[0] }); }
      else {
        if (!tr.dwell || tr.stationId !== st.boardedAt) st.departed = true;
        if (tr.dwell && st.alightNext && st.departed) alight(tr);
        const c = tr.cars[st.car] || tr.cars[0];
        if (c) { st.x = c.pose ? c.pose.x : c.x; st.y = c.pose ? c.pose.y : c.y; st.z = c.pose?.z || 0; }
      }
    }
    // E and B, from the keys, the pad or the touch buttons
    const doAct = input.taps.act > 0 || pp.act, doBack = input.taps.back > 0 || pp.back;
    input.taps.act = input.taps.back = 0;
    if (CTL.st) {
      computeNear(mt, trains);
      if (doAct) act(trains);
      if (doBack && CTL.st) back();
    }
    if (!CTL.st) return;
    camera();
    if (now - saveAt > 1000) { saveAt = now; saveControl(CTL.st); }
    publish(mt, trains);
  }
  const mapDir = (v) => screenToMapDir(v.x, v.y, V.cam.r);

  // What E would do now -> near = {kind, label, ...} | null.
  function computeNear(mt, trains) {
    const st = CTL.st;
    near = null;
    if (st.mode === "street") {
      if (V.ctlPeople) { let best = null, bd = PERSON_REACH; for (const p of V.ctlPeople) { const k = Math.hypot(p.x - st.x, p.y - st.y); if (k < bd) { bd = k; best = p.s; } } if (best) { near = { kind: "person", s: best, label: `READ THE FILE: ${nameOf(best)}` }; return; } }
      const dn = doorNear(st.x, st.y);
      if (dn) { near = { kind: "door", b: dn.b, label: isClassified(dn.b) ? "HEADQUARTERS (SEALED TO YOU)" : `ENTER ${dn.b.name}` }; return; }
      const ct = tableNear(st.x, st.y);
      if (ct) { const tg = tableGo(ct, mt); near = { kind: "chess", go: tg.go, label: tg.vs ? `PLAY CHESS: SIT ACROSS ${tg.vs.name}` : "PLAY CHESS AT THE TABLE" }; return; }
      const g = groundAt(st.x, st.y);
      if (g) { near = { kind: "ground", b: g, label: `STEP INTO ${g.name}` }; return; }
      const sid = stationNear(st.x, st.y);
      if (sid) { near = { kind: "station", id: sid, label: `CLIMB TO ${stationName(sid)}` }; return; }
      const bn = benchNear(st.x, st.y);
      if (bn) near = { kind: "bench", bench: bn, label: "SIT ON THE BENCH" };
    } else if (st.mode === "bench") near = { kind: "stand-bench", label: "STAND UP" };
    else if (st.mode === "inside") {
      const n = inside && inside.at > performance.now() - 300 ? inside.near : null;
      if (st.seat) near = { kind: "stand", label: "STAND UP" };
      else if (n?.person) near = { kind: "person", s: n.person, label: `READ THE FILE: ${nameOf(n.person)}` };
      else if (n?.seat != null) near = { kind: "sit", placeId: n.placeId, i: n.seat, label: "SIT DOWN" };
      else if (isExitFloor(BUILDING[st.bId], st.floor) && st.fx >= EXIT_X - 0.08) near = { kind: "leave", label: "LEAVE THE BUILDING" };
    } else if (st.mode === "platform") {
      const tr = trainIn(trains, st.stationId);
      near = tr ? { kind: "board", tr, label: `BOARD ${tr.name}` } : { kind: "wait", label: st.waiting ? "STOP WAITING" : "WAIT FOR THE LOOP" };
    } else if (st.mode === "riding") {
      const tr = trains.find(t => t.id === st.trainId);
      if (tr && tr.dwell && (st.departed || tr.stationId !== st.boardedAt)) near = { kind: "alight", tr, label: `ALIGHT: ${stationName(tr.stationId)}` };
      else near = { kind: "next", label: st.alightNext ? "STAY ABOARD" : "GET OFF AT THE NEXT STOP" };
    }
    void mt;
  }

  function where(mt) {
    const st = CTL.st;
    if (st.mode === "inside") {
      const b = BUILDING[st.bId], f = b.floors[st.floor], rm = roomAt(b, st.floor, st.fx);
      const lift = st.fx <= LIFT_X ? " // AT THE LIFT" : "";
      return `${b.name} // ${f.code} ${f.name === rm.placeId ? "" : f.name}${lift}`.replace(/\s+\/\/\s*$/, "");
    }
    if (st.mode === "platform") {
      const nx = nextArrivalAt(st.stationId, mt), m = Math.max(0, Math.round((nx.arrive - ((mt % 24) + 24) % 24 + 24) % 24 * 60));
      return `${stationName(st.stationId)} // NEXT: ${TRAIN[nx.trainId]?.name || "THE LOOP"} IN ${m} MIN${st.waiting ? " // WAITING" : ""}`;
    }
    if (st.mode === "riding") return `ABOARD ${TRAIN[st.trainId]?.name || "THE LOOP"} // CAR ${(st.car || 0) + 1}${st.alightNext ? " // OFF AT THE NEXT STOP" : ""}`;
    const d = districtAt(st.x, st.y);
    return `${st.mode === "bench" ? "SEATED" : "ON FOOT"} // ${d ? d.name : "BETWEEN DISTRICTS"}`;
  }
  function publish(mt, trains) {
    const st = CTL.st;
    const insideLift = st.mode === "inside" && !st.seat;
    const n = CTL.note && CTL.note.until > performance.now() ? CTL.note.text : null;
    const backLabel = st.mode === "inside" ? "LEAVE" : st.mode === "platform" ? "DESCEND" : st.mode === "riding" ? "NEXT STOP" : st.mode === "bench" ? "STAND" : null;
    publishUi({ mode: st.mode, prompt: near?.label || null, where: where(mt), source: input.source, family: input.pad?.family || null, note: n, back: backLabel, lift: insideLift });
    void trains;
  }

  // ---- the camera: the avatar at the centre (a little high), until a hand moves the map -------
  function camera() {
    const st = CTL.st;
    if (!follow || st.mode === "inside" || V.find?.follow) return;
    const p = posOf();
    if (!p) return;
    const z = flew ? V.cam.z : Math.max(V.cam.z, LOD_NEAR + 2);
    if (Math.abs(V.cam.z - z) < 0.05) flew = true;
    const [u, v] = rot(p.x, p.y, V.cam.r);
    K.setCam(z, V.cssW / 2 - (u - v) * z, V.cssH * 0.5 - ((u + v) * z * 0.5 - p.h * STOREY * z));
  }
  function posOf() {
    const st = CTL.st;
    if (!st) return null;
    if (st.mode === "platform") { const p = platformPoint(st.stationId, st.al, st.la); return { x: p.x, y: p.y, h: DECK + (STOPS[st.stationId]?.base || 0) }; }
    if (st.mode === "riding") return { x: st.x, y: st.y, h: CAR_TOP + (st.z || 0) };
    if (st.mode === "inside") { const b = BUILDING[st.bId]; return b ? { x: b.pos.x, y: b.pos.y, h: 1 } : null; }
    return { x: st.x, y: st.y, h: 0 };
  }

  // ---- drawing -----------------------------------------------------------------------------------
  // Inside movers(): note everyone outdoors (for E), then add the avatar to the painter's order.
  function movers(out, r) {
    const st = CTL.st;
    if (!st) { V.ctlPeople = null; return; }
    const ppl = [];
    for (const m of out) if (m.kind === "p" && !m.s.crowd && !m.s.you) { const [x, y] = rot(m.u, m.v, 4 - r); ppl.push({ s: m.s, x, y }); }
    V.ctlPeople = ppl;
    if (st.mode !== "street" && st.mode !== "bench" && st.mode !== "platform") return;
    const p = posOf(), [u, v] = rot(p.x, p.y, r);
    out.push({ kind: "ctl", u, v, h: p.h, box: { x0: u, y0: v, x1: u, y1: v } });
  }
  function drawMover(m, lod) {
    const st = CTL.st, s = CTL.self;
    if (!st || !s) return;
    const [x, y] = K.P(m.u, m.v, m.h);
    if (x < -40 || x > V.cssW + 40 || y < -80 || y > V.cssH + 40) return;
    const t = V.reduced ? 0 : performance.now() / 1000;
    if (lod === "far") { ctx.fillStyle = "#e5ffe9"; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 3, 4, 4); return; }
    const base = V.cam.z * STOREY * 0.95, k = statureOf(s), hpx = base * k;
    let box;
    if (st.mode === "bench") {
      box = drawPose(ctx, sheetFor(s), { kind: "seat", x: 0, y: 0, s: 1, face: st.face === 1 ? 1 : 0 }, "sit", x, y, base, t, 0, k);
    } else if (lod === "mid" || hpx < 18) {
      const mini = miniFor(s), sc = hpx / (SPRITE_H / 2);
      try { ctx.drawImage(mini, Math.round(x - (SPRITE_W / 4) * sc), Math.round(y - hpx), Math.round((SPRITE_W / 2) * sc), Math.round(hpx)); } catch { /* not ready */ }
      box = [x - hpx * 0.3, y - hpx, x + hpx * 0.3, y];
    } else {
      const e = sheetFor(s), frames = e.frames || 1;
      const fi = st.moving && frames > 1 && t > 0 ? Math.floor(t * 7) % 2 : 0;
      const bob = st.moving && fi ? -Math.max(1, hpx / SPRITE_H) : 0;
      const sc = hpx / SPRITE_H, w = SPRITE_W * sc;
      try {
        if (st.face === 1) { ctx.save(); ctx.translate(Math.round(x + w / 2), 0); ctx.scale(-1, 1); ctx.drawImage(e.img, fi * SPRITE_W, 0, SPRITE_W, SPRITE_H, 0, Math.round(y - hpx + bob), Math.round(w), Math.round(hpx)); ctx.restore(); }
        else ctx.drawImage(e.img, fi * SPRITE_W, 0, SPRITE_W, SPRITE_H, Math.round(x - w / 2), Math.round(y - hpx + bob), Math.round(w), Math.round(hpx));
      } catch { /* not ready */ }
      box = [x - hpx * 0.3, y - hpx, x + hpx * 0.3, y];
    }
    if (box) K.hit({ kind: "p", s, box });
  }

  // Inside the cutaway: the lift shaft (every floor's west wall), the exit (the ground floor's
  // east end), and the avatar in its room, standing, walking or seated.
  const FRONT = new WeakMap();
  function room(b, f, pid, rx, ry, rw, rh, sh, plan, byAnchor, now) {
    const st = CTL.st, s = CTL.self;
    if (!st || !s || st.mode !== "inside" || st.bId !== b.id) return;
    const n = f.places.length, k = f.places.indexOf(pid);
    ctx.save();
    if (k === 0) {
      const w = Math.max(6, Math.round(LIFT_X * n * rw));
      ctx.fillStyle = "rgba(34,211,238,0.12)"; ctx.fillRect(rx + 1, ry + 15, w, rh - 16);
      ctx.strokeStyle = "rgba(34,211,238,0.55)"; ctx.lineWidth = 1; ctx.strokeRect(rx + 1.5, ry + 15.5, w - 1, rh - 17);
      if (rh >= 40 && w >= 10) { ctx.font = "9px 'Fira Mono', ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = "#67e8f9"; ctx.fillText("▲▼", rx + 1 + w / 2, ry + 18); }
    }
    if (k === n - 1 && isExitFloor(b, f.index)) {
      const w = Math.max(8, Math.round((1 - EXIT_X + 0.02) * n * rw));
      ctx.fillStyle = "rgba(251,191,36,0.14)"; ctx.fillRect(rx + rw - w - 1, ry + 15, w, rh - 16);
      if (rh >= 40) { ctx.font = "9px 'Fira Mono', ui-monospace, monospace"; ctx.textAlign = "right"; ctx.textBaseline = "top"; ctx.fillStyle = "#fbbf24"; ctx.fillText("EXIT", rx + rw - 3, ry + 18); }
    }
    ctx.restore();
    if (st.floor !== f.index) return;
    const rm = roomAt(b, st.floor, st.fx);
    if (rm.placeId !== pid) return;
    const px = rx + rm.lx * rw;
    let fy = FRONT.get(plan);
    if (fy == null) { fy = plan.anchors.length ? Math.max(...plan.anchors.map(a => a.y)) : rh - 4; FRONT.set(plan, fy); }
    fy = Math.min(rh - 2, fy);
    const t = V.reduced ? 0 : now;
    let box;
    const seatA = st.seat && st.seat.placeId === pid ? plan.anchors[st.seat.i] : null;
    if (st.seat && !seatA) st.seat = null;
    if (seatA) {
      box = drawPose(ctx, sheetFor(s), seatA, "sit", rx + seatA.x, ry + seatA.y, sh * seatA.s, t, 0, fitStature(s, seatA.y, sh * seatA.s));
    } else {
      const e = sheetFor(s), frames = e.frames || 1, hh = sh * fitStature(s, fy, sh);
      const fi = st.moving && frames > 1 && t > 0 ? Math.floor(t * 7) % 2 : 0, w = SPRITE_W * hh / SPRITE_H, y = ry + fy;
      try {
        if (st.face === 1) { ctx.save(); ctx.translate(Math.round(px + w / 2), 0); ctx.scale(-1, 1); ctx.drawImage(e.img, fi * SPRITE_W, 0, SPRITE_W, SPRITE_H, 0, Math.round(y - hh), Math.round(w), Math.round(hh)); ctx.restore(); }
        else ctx.drawImage(e.img, fi * SPRITE_W, 0, SPRITE_W, SPRITE_H, Math.round(px - w / 2), Math.round(y - hh), Math.round(w), Math.round(hh));
      } catch { /* not ready */ }
      box = [px - w / 2, y - hh, px + w / 2, y];
    }
    K.hit({ kind: "p", panel: true, s, box });
    youTag((box[0] + box[2]) / 2, box[1] - 3, box[3]);
    // who and what is within reach
    const reach = Math.max(sh * 0.75, 18);
    let person = null, pd = reach;
    const taken = new Set();
    for (const a of plan.anchors) { const p = byAnchor[a.i]; if (!p) continue; taken.add(a.i); const d = Math.abs(rx + a.x - px); if (d < pd) { pd = d; person = p.s; } }
    const seat = st.seat ? null : nearestSeat(plan.anchors, taken, px - rx, Math.max(sh * 0.6, 14));
    const seatD = seat == null ? Infinity : Math.abs(rx + plan.anchors[seat].x - px);
    // whichever is nearer: the stool you are standing at, or the person beside it
    inside = { at: performance.now(), near: { person: person && pd <= seatD ? person : null, seat: seat != null && seatD < pd ? seat : null, placeId: pid } };
  }
  // YOU: a small inverse tag over the head and a ring at the feet.
  function youTag(cx, top, feet, r = 9) {
    const ph = V.reduced ? 0.3 : (performance.now() / 1300) % 1;
    ctx.save();
    ctx.globalAlpha = 1 - ph; ctx.strokeStyle = "#e5ffe9"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, feet, r + ph * 12, (r + ph * 12) * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = "bold 10px 'Fira Mono', ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    const w = ctx.measureText("YOU").width + 8;
    ctx.fillStyle = "#e5ffe9"; ctx.fillRect(Math.round(cx - w / 2), Math.round(top - 13), Math.round(w), 13);
    ctx.fillStyle = "#06210f"; ctx.fillText("YOU", Math.round(cx), Math.round(top - 1));
    ctx.restore();
  }
  // After the labels: YOU over the avatar on the street, the platform, or the car roof.
  function overlay() {
    const st = CTL.st;
    if (!st || st.mode === "inside") return;
    if (V.sel && V.lift > 0.5 && V.cssW < 640) return;   // a phone's cutaway covers the street
    const p = posOf();
    const [x, y] = K.Q(p.x, p.y, p.h);
    if (x < 0 || x > V.cssW || y < 0 || y > V.cssH) return;
    const hpx = st.mode === "riding" ? 0 : V.cam.z * STOREY * 0.95 * statureOf(CTL.self || {});
    // behind a building you still show through it, faintly (the painter's order hid you)
    if (st.mode !== "riding" && V.cam.z >= 4) {
      const [u, v] = rot(p.x, p.y, V.cam.r), keep = V.hits.length;
      ctx.globalAlpha = 0.7; drawMover({ u, v, h: p.h }, V.cam.z < 9 ? "mid" : "near"); ctx.globalAlpha = 1;
      V.hits.length = keep;
    }
    youTag(x, y - Math.max(hpx, 8) - 4, y, Math.max(7, V.cam.z * 0.6));
  }

  // ---- keys: on the window while in control (the canvas need not have focus) ------------------
  function onKeyDown(e) {
    if (!CTL.st || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || cardOpen()) return;
    const k = e.key.toLowerCase();
    input.source = "keys";
    if (MOVE_KEYS.has(k)) { input.keys.add(k); if (k !== "shift") e.preventDefault(); return; }
    if ((k === "enter" || k === " ") && e.target?.closest?.("button, a")) return;
    if (k === "e" || k === "enter" || k === " ") { if (e.repeat) { e.preventDefault(); return; } input.taps.act++; e.preventDefault(); return; }
    if (k === "b" || k === "backspace") { input.taps.back++; e.preventDefault(); return; }
    if (k === "escape") { input.taps.release++; e.preventDefault(); return; }
    if (k === "q") { K.turn(-1); e.preventDefault(); return; }
    if (k === "r") { K.turn(1); e.preventDefault(); }
  }
  function onKeyUp(e) { input.keys.delete(e.key.toLowerCase()); if (e.key === "Shift") input.keys.delete("shift"); }
  function onBlur() { input.keys.clear(); }
  function attach() {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    const onPad = () => { V.need = true; };
    window.addEventListener("gamepadconnected", onPad);
    window.addEventListener("gamepaddisconnected", onPad);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("gamepadconnected", onPad);
      window.removeEventListener("gamepaddisconnected", onPad);
      if (CTL.st) saveControl(CTL.st);
    };
  }
  const owns = (e) => Boolean(CTL.st && OWN_KEYS.has(e.key.toLowerCase()));
  const hands = () => { if (CTL.st) follow = false; };
  const skipSelf = (s) => Boolean(CTL.st && s && s.you);

  return { start, release, step, movers, drawMover, room, overlay, attach, owns, hands, skipSelf, active: () => Boolean(CTL.st) };
}
