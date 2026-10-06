// THE COURTS, playable: the hands. Keys, a controller and the touch pad, folded into the sim's one
// bitmask a frame (sim.js BTN: a virtual pad laid out like 2K's), plus START (pause) and CAMERA on
// their own, which never reach the sim or the record.
//   pad    left stick / d-pad move; the face buttons by position (west X: shoot / steal; south A:
//          pass / switch; north Y: lob / block; east B: bounce pass / take a charge); RT sprint;
//          LT post up / intense D; LB call a pick; the right stick: dribble moves; View / Select:
//          camera; Start: pause. By position on every pad (a Switch pad's west button is its Y).
//   keys   arrows / WASD move; Z, J or Space: X; X or K: A; C or I: Y; F or U: B; Shift: RT;
//          E or O: LT; R or P: LB; Q + a direction: a dribble move that way, Q alone: spin;
//          V: camera; Enter or Esc: START
//   touch  the pad's held bits (setTouch) and swipes on the court (swipe: a move, or a spin)
import { familyOf, deadzone, DEADZONE } from "../../city/gamepad.js";
import { BTN } from "./sim.js";

const KEYMAP = {
  ArrowUp: BTN.UP, KeyW: BTN.UP, ArrowDown: BTN.DOWN, KeyS: BTN.DOWN, ArrowLeft: BTN.LEFT, KeyA: BTN.LEFT, ArrowRight: BTN.RIGHT, KeyD: BTN.RIGHT,
  KeyZ: BTN.X, KeyJ: BTN.X, Space: BTN.X, KeyX: BTN.A, KeyK: BTN.A, KeyC: BTN.Y, KeyI: BTN.Y, KeyF: BTN.B, KeyU: BTN.B,
  ShiftLeft: BTN.RT, ShiftRight: BTN.RT, KeyE: BTN.LT, KeyO: BTN.LT, KeyR: BTN.LB, KeyP: BTN.LB,
};
const DIRS = BTN.UP | BTN.DOWN | BTN.LEFT | BTN.RIGHT;
// a direction's bits -> the same direction on the right stick
const toRS = (m) => (m & BTN.UP ? BTN.RSU : 0) | (m & BTN.DOWN ? BTN.RSD : 0) | (m & BTN.LEFT ? BTN.RSL : 0) | (m & BTN.RIGHT ? BTN.RSR : 0);
const down = (pad, i) => { const b = pad.buttons?.[i]; return Boolean(b && (typeof b === "object" ? b.pressed || b.value > 0.5 : b > 0.5)); };

// -> {connected, family, mask, start, select}
export function readPad2k(nav = globalThis.navigator) {
  let pads = [];
  try { pads = nav?.getGamepads ? Array.from(nav.getGamepads() || []) : []; } catch { pads = []; }
  const pad = pads.find(p => p && p.connected !== false);
  if (!pad) return { connected: false };
  let m = 0;
  const L = deadzone(pad.axes?.[0] || 0, pad.axes?.[1] || 0), t = Math.max(0.35, DEADZONE);
  if (L.x > t) m |= BTN.RIGHT; else if (L.x < -t) m |= BTN.LEFT;
  if (L.y > t) m |= BTN.DOWN; else if (L.y < -t) m |= BTN.UP;
  if (down(pad, 12)) m |= BTN.UP; if (down(pad, 13)) m |= BTN.DOWN; if (down(pad, 14)) m |= BTN.LEFT; if (down(pad, 15)) m |= BTN.RIGHT;
  const Rs = deadzone(pad.axes?.[2] || 0, pad.axes?.[3] || 0, 0.3);
  if (Rs.mag > 0.45) { if (Rs.x > 0.4) m |= BTN.RSR; else if (Rs.x < -0.4) m |= BTN.RSL; if (Rs.y > 0.4) m |= BTN.RSD; else if (Rs.y < -0.4) m |= BTN.RSU; }
  if (down(pad, 0)) m |= BTN.A; if (down(pad, 1)) m |= BTN.B; if (down(pad, 2)) m |= BTN.X; if (down(pad, 3)) m |= BTN.Y;
  if (down(pad, 4)) m |= BTN.LB; if (down(pad, 6)) m |= BTN.LT; if (down(pad, 7)) m |= BTN.RT;
  return { connected: true, family: familyOf(pad.id), mask: m, start: down(pad, 9), select: down(pad, 8) };
}

export function createInput() {
  let keys = 0, touch = 0, startQ = 0, camQ = 0, padStart = false, padSel = false, family = null, tapped = 0;
  let qHeld = false, qDir = false, swipeBits = 0, swipeN = 0, spinQ = 0;
  const typing = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); };
  const keydown = (e) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === "Enter" || e.code === "Escape") { if (!e.repeat) startQ++; e.preventDefault(); return; }
    if (e.code === "KeyV") { if (!e.repeat) camQ++; e.preventDefault(); return; }
    if (e.code === "KeyQ") { if (!e.repeat) { qHeld = true; qDir = Boolean(keys & DIRS); } e.preventDefault(); return; }
    const b = KEYMAP[e.code];
    if (b) { keys |= b; tapped |= b; if (qHeld && b & DIRS) qDir = true; e.preventDefault(); }
  };
  const keyup = (e) => {
    if (e.code === "KeyQ") { if (qHeld && !qDir) spinQ++; qHeld = false; return; }
    const b = KEYMAP[e.code]; if (b) keys &= ~b;
  };
  const blur = () => { keys = 0; touch = 0; qHeld = false; };
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", blur);
  return {
    // -> {mask, start, camera, pad}. A key pressed and let go between two samples still counts once.
    sample() {
      let mask = keys | touch | tapped;
      tapped = 0;
      if (qHeld) mask |= toRS(keys);
      if (spinQ) { mask |= BTN.SPIN; spinQ = 0; }
      if (swipeN > 0) { mask |= swipeBits; swipeN--; }
      const p = readPad2k();
      if (p.connected) {
        family = p.family;
        mask |= p.mask;
        if (p.start && !padStart) startQ++;
        if (p.select && !padSel) camQ++;
        padStart = p.start; padSel = p.select;
      } else family = null;
      const start = startQ > 0, camera = camQ > 0; startQ = 0; camQ = 0;
      return { mask, start, camera, pad: family };
    },
    setTouch(bits) { touch = bits; },
    // a swipe on the court: a direction's right-stick bits for a few frames, or a spin
    swipe(bits, spin = false) { if (spin) spinQ++; else { swipeBits = bits; swipeN = 3; } },
    pressStart() { startQ++; },
    stop() { window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", blur); },
  };
}
