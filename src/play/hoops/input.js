// THE COURTS, playable: the hands. Keys, a controller and the touch pad, folded into the sim's one
// bitmask a frame (engine BTN: a virtual pad laid out like 2K's), plus START (pause) and CAMERA on
// their own, which never reach the sim or the record.
//   pad    left stick / d-pad move; the face buttons by position (west X: shoot / steal; south A:
//          pass / switch; north Y: lob / block; east B: bounce pass / take a charge); RT sprint;
//          LT post up / intense D; LB call a pick; RB held: icon passing (a face button passes to
//          the teammate wearing it); the right stick: dribble moves; View / Select: camera; Start:
//          pause. By position on every pad (a Switch pad's west button is its Y).
//   keys   arrows / WASD move; Z, J or Space: X; X or K: A; C or I: Y; F or U: B; Shift: RT;
//          E or O: LT; R or P: LB; Q + a direction: a dribble move that way, Q alone: spin;
//          G held: icon passing, then 1-4 pass to the teammate wearing that number (the sim's
//          A, B, X, Y); V: camera; Enter or Esc: START
//   touch  the pad's held bits (setTouch) and swipes on the court (swipe: a move, or a spin)
//
// CAMERA-RELATIVE HANDS (docs/design/BASKETBALL.md 4.8, stage S0). Every stick, key, d-pad, touch pad
// and swipe is read as a direction ON THE SCREEN (right, up) and turned into a direction ON THE COURT
// here, in the adapter, with the floor-to-screen map at the controlled player: J, the 2x2 that says
// how far a metre of court +x and +y moves on the screen from where he stands, this frame, in this
// camera. court = J^-1 . stick, then the sim's eight court-axis bits as before. So in BASELINE and
// DRIVE (the end-on cameras) up on the stick is up the screen, and in the side-on cameras (2K,
// BROADCAST, HIGH) a straight push runs straight on the screen despite the perspective slant. The sim
// and the record stay court-space and never learn the camera; the record carries it as metadata.
// J is held while a stick is held (re-sampled when it returns to centre), so a running man does not
// drift as he crosses the frame. A camera cut (its heading turning more than 45 degrees within 12
// frames: DRIVE and BASELINE swing 180 degrees when the attack changes ends) keeps the old J until the
// stick returns to centre, 30 frames pass, or the stick itself turns more than 45 degrees; then the
// two maps blend over 6 frames. controls "court" is the old behaviour (stick up = the far sideline).
import { familyOf, deadzone, DEADZONE } from "../../city/gamepad.js";
import { BTN } from "./engine/index.js";

const KEYMAP = {
  ArrowUp: BTN.UP, KeyW: BTN.UP, ArrowDown: BTN.DOWN, KeyS: BTN.DOWN, ArrowLeft: BTN.LEFT, KeyA: BTN.LEFT, ArrowRight: BTN.RIGHT, KeyD: BTN.RIGHT,
  KeyZ: BTN.X, KeyJ: BTN.X, Space: BTN.X, KeyX: BTN.A, KeyK: BTN.A, KeyC: BTN.Y, KeyI: BTN.Y, KeyF: BTN.B, KeyU: BTN.B,
  ShiftLeft: BTN.RT, ShiftRight: BTN.RT, KeyE: BTN.LT, KeyO: BTN.LT, KeyR: BTN.LB, KeyP: BTN.LB,
};
const DIRS = BTN.UP | BTN.DOWN | BTN.LEFT | BTN.RIGHT;
// icon passing on keys: hold G, then 1-4 = the icons A, B, X, Y in order
const ICON_KEYS = { Digit1: BTN.A, Digit2: BTN.B, Digit3: BTN.X, Digit4: BTN.Y, Numpad1: BTN.A, Numpad2: BTN.B, Numpad3: BTN.X, Numpad4: BTN.Y };
const down = (pad, i) => { const b = pad.buttons?.[i]; return Boolean(b && (typeof b === "object" ? b.pressed || b.value > 0.5 : b > 0.5)); };

// ---- screen directions -> court directions ---------------------------------------------------------
// A screen direction is [right, up]. Bits <-> vectors, for keys, the d-pad and the touch pad, which are
// laid out on the screen.
export const vecOfBits = (m, U = BTN.UP, D = BTN.DOWN, L = BTN.LEFT, R = BTN.RIGHT) => [(m & R ? 1 : 0) - (m & L ? 1 : 0), (m & U ? 1 : 0) - (m & D ? 1 : 0)];
const NEAR = 0.4;
// J at the floor point (x, y) for the camera k (render.js camOf) and its projection (render.js proj):
// [[right per metre of +x, right per metre of +y], [up per metre of +x, up per metre of +y]]. When the
// point is at or behind the near plane (a camera standing on the court), the camera's own basis: its
// right vector, and its forward and up vectors laid on the floor.
export function floorJ(proj, k, x, y, h = 0.5) {
  const a = proj(x, y, 0, k), bx = proj(x + h, y, 0, k), by = proj(x, y + h, 0, k);
  if (a[3] >= NEAR && bx[3] >= NEAR && by[3] >= NEAR) {
    const J = [[(bx[0] - a[0]) / h, (by[0] - a[0]) / h], [(a[1] - bx[1]) / h, (a[1] - by[1]) / h]];
    if (Math.abs(J[0][0] * J[1][1] - J[0][1] * J[1][0]) > 1e-6) return J;
  }
  return basisJ(k);
}
function basisJ(k) {
  const r = k.r || [1, 0, 0], f = k.f || [0, 1, 0], u = k.u || [0, 0, 1];
  let fx = f[0] + u[0], fy = f[1] + u[1];
  const fl = Math.hypot(fx, fy);
  if (fl < 1e-6) { fx = 0; fy = 1; } else { fx /= fl; fy /= fl; }
  return [[r[0], r[1]], [fx, fy]];
}
// The camera's heading on the floor (radians): where screen-up points on the court.
export function headingOf(k) { const J = basisJ(k); return Math.atan2(J[1][1], J[1][0]); }
// court = J^-1 . [sx, sy] (the direction only; length is the stick's own)
export function toCourt(J, sx, sy) {
  const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  if (!J || Math.abs(det) < 1e-12) return [sx, sy];
  return [(J[1][1] * sx - J[0][1] * sy) / det, (-J[1][0] * sx + J[0][0] * sy) / det];
}
// The sim's eight court directions, and the one whose picture on the screen (J . v) lies nearest the
// stick. Picking on the screen, not rounding J^-1 . stick on the court: the floor is foreshortened
// on the screen, so 45-degree sectors on the court are not 45 degrees on the glass (a screen diagonal
// would round to straight up the court and run 40 degrees off). -> the bits (U/D/L/R or the RS four).
const DIR8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
export const IDENTITY = [[1, 0], [0, 1]];
export function dir8(J, sx, sy, U = BTN.UP, D = BTN.DOWN, L = BTN.LEFT, R = BTN.RIGHT) {
  const sl = Math.hypot(sx, sy);
  if (sl < 1e-9) return 0;
  let best = null, bs = -2;
  for (const v of DIR8) {
    const wx = J[0][0] * v[0] + J[0][1] * v[1], wy = J[1][0] * v[0] + J[1][1] * v[1], wl = Math.hypot(wx, wy) || 1;
    const c = (wx * sx + wy * sy) / (wl * sl);
    if (c > bs + 1e-9) { bs = c; best = v; }
  }
  return (best[0] > 0 ? R : best[0] < 0 ? L : 0) | (best[1] > 0 ? U : best[1] < 0 ? D : 0);
}
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
const Q45 = Math.PI / 4;
const lerpJ = (A, B, k) => [[A[0][0] + (B[0][0] - A[0][0]) * k, A[0][1] + (B[0][1] - A[0][1]) * k], [A[1][0] + (B[1][0] - A[1][0]) * k, A[1][1] + (B[1][1] - A[1][1]) * k]];
// One stick's map: hold J while the stick is held; across a camera cut, keep the old J until the stick
// is let go, 30 frames pass, or the stick turns more than 45 degrees, then blend over 6 frames.
// map(stick [sx, sy] | null, Jnow, heading) -> the J to read the stick with, or null (centred). Call
// once a frame.
export function createCamMap() {
  let held = null, hist = [], cut = null, blend = null;
  return {
    map(stick, Jnow, heading) {
      hist.push(heading); if (hist.length > 13) hist.shift();
      const swung = !cut && !blend && hist.some(h => angDiff(heading, h) > Q45);
      if (!stick || Math.abs(stick[0]) + Math.abs(stick[1]) < 1e-9) { held = null; cut = null; blend = null; return null; }
      const ang = Math.atan2(stick[1], stick[0]);
      if (!held) { held = Jnow; return held; }
      if (swung) cut = { n: 0, ang };
      if (cut && (++cut.n > 30 || angDiff(ang, cut.ang) > Q45)) { cut = null; blend = { from: held, n: 0 }; }
      if (blend) {
        const k = Math.min(1, ++blend.n / 6);
        held = k >= 1 ? Jnow : held;
        const J = k >= 1 ? Jnow : lerpJ(blend.from, Jnow, k);
        if (k >= 1) { blend = null; hist = [heading]; }
        return J;
      }
      return held;
    },
    get holding() { return Boolean(held); },
    get cutting() { return Boolean(cut || blend); },
  };
}

// -> {connected, family, mask (the buttons, no stick or d-pad bits), ls, rs ([right, up] or null), start, select}
export function readPad2k(nav = globalThis.navigator) {
  let pads = [];
  try { pads = nav?.getGamepads ? Array.from(nav.getGamepads() || []) : []; } catch { pads = []; }
  const pad = pads.find(p => p && p.connected !== false);
  if (!pad) return { connected: false };
  let m = 0, ls = null, rs = null;
  const L = deadzone(pad.axes?.[0] || 0, pad.axes?.[1] || 0), t = Math.max(0.35, DEADZONE);
  if (L.mag > t) ls = [L.x, -L.y];
  const dp = vecOfBits((down(pad, 12) ? BTN.UP : 0) | (down(pad, 13) ? BTN.DOWN : 0) | (down(pad, 14) ? BTN.LEFT : 0) | (down(pad, 15) ? BTN.RIGHT : 0));
  if (dp[0] || dp[1]) ls = dp;
  const Rs = deadzone(pad.axes?.[2] || 0, pad.axes?.[3] || 0, 0.3);
  if (Rs.mag > 0.45) rs = [Rs.x, -Rs.y];
  if (down(pad, 0)) m |= BTN.A; if (down(pad, 1)) m |= BTN.B; if (down(pad, 2)) m |= BTN.X; if (down(pad, 3)) m |= BTN.Y;
  if (down(pad, 4)) m |= BTN.LB; if (down(pad, 5)) m |= BTN.RB; if (down(pad, 6)) m |= BTN.LT; if (down(pad, 7)) m |= BTN.RT;
  return { connected: true, family: familyOf(pad.id), mask: m, ls, rs, start: down(pad, 9), select: down(pad, 8) };
}

export function createInput() {
  let keys = 0, touch = 0, startQ = 0, camQ = 0, padStart = false, padSel = false, family = null, tapped = 0;
  let qHeld = false, qDir = false, swipeV = null, swipeN = 0, spinQ = 0, gHeld = false, iconTap = 0;
  const lsMap = createCamMap(), rsMap = createCamMap();
  const typing = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); };
  const keydown = (e) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === "Enter" || e.code === "Escape") { if (!e.repeat) startQ++; e.preventDefault(); return; }
    if (e.code === "KeyV") { if (!e.repeat) camQ++; e.preventDefault(); return; }
    if (e.code === "KeyQ") { if (!e.repeat) { qHeld = true; qDir = Boolean(keys & DIRS); } e.preventDefault(); return; }
    if (e.code === "KeyG") { gHeld = true; e.preventDefault(); return; }
    if (gHeld && ICON_KEYS[e.code]) { if (!e.repeat) iconTap |= ICON_KEYS[e.code]; e.preventDefault(); return; }
    const b = KEYMAP[e.code];
    if (b) { keys |= b; tapped |= b; if (qHeld && b & DIRS) qDir = true; e.preventDefault(); }
  };
  const keyup = (e) => {
    if (e.code === "KeyQ") { if (qHeld && !qDir) spinQ++; qHeld = false; return; }
    if (e.code === "KeyG") { gHeld = false; return; }
    const b = KEYMAP[e.code]; if (b) keys &= ~b;
  };
  const blur = () => { keys = 0; touch = 0; qHeld = false; gHeld = false; };
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", blur);
  return {
    // view: {J, heading} (the floor-to-screen map at the controlled player, this frame) or null for
    // court-relative hands. -> {mask, start, camera, pad}. A key pressed and let go between two
    // samples still counts once.
    sample(view = null) {
      const held = keys | touch | tapped;
      tapped = 0;
      let mask = held & ~DIRS;
      // icon passing: RB held while G is; a number taps its icon's button for one sample
      if (gHeld) mask |= BTN.RB;
      if (iconTap) { mask |= BTN.RB | iconTap; iconTap = 0; }
      if (spinQ) { mask |= BTN.SPIN; spinQ = 0; }
      // the two sticks, on the screen: keys and the touch pad, then the pad's sticks and d-pad
      let ls = null, rs = null;
      const kv = vecOfBits(held);
      if (kv[0] || kv[1]) { ls = kv; if (qHeld) rs = kv; }   // Q + a direction: a move that way (the feet go too, as before)
      if (swipeN > 0) { rs = swipeV; swipeN--; }
      const p = readPad2k();
      if (p.connected) {
        family = p.family;
        mask |= p.mask;
        if (p.ls) ls = p.ls;
        if (p.rs) rs = p.rs;
        if (p.start && !padStart) startQ++;
        if (p.select && !padSel) camQ++;
        padStart = p.start; padSel = p.select;
      } else family = null;
      const J = view?.J || null, hd = view?.heading ?? 0;
      const jl = J ? lsMap.map(ls, J, hd) : IDENTITY, jr = J ? rsMap.map(rs, J, hd) : IDENTITY;
      if (ls && jl) mask |= dir8(jl, ls[0], ls[1]);
      if (rs && jr) mask |= dir8(jr, rs[0], rs[1], BTN.RSU, BTN.RSD, BTN.RSL, BTN.RSR);
      const start = startQ > 0, camera = camQ > 0; startQ = 0; camQ = 0;
      return { mask, start, camera, pad: family };
    },
    setTouch(bits) { touch = bits; },
    // a swipe on the court: a screen direction [right, up] on the right stick for a few frames, or a spin
    swipe(v, spin = false) { if (spin) spinQ++; else if (v) { swipeV = v; swipeN = 3; } },
    pressStart() { startQ++; },
    stop() { window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", blur); },
  };
}
