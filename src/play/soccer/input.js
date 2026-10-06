// THE ESTATE PITCH, playable: the hands. Keys, a controller and the touch pad, folded into the sim's
// one 16-bit mask a frame (sim.js BTN), plus START (pause) on its own, which never reaches the sim or
// the record.
//   keys   WASD / arrows move; J or Z: A (pass, tackle); K or X: B (shoot, slide); L or C: X (lob /
//          cross, press); I or V: Y (through ball); Shift: RT (sprint); Space: LT (close control,
//          jockey); Q: LB (switch, call a run); E or O: RB (finesse); R + a direction: the right stick
//          (skill moves; on defence, switch that way); Enter or Esc: START
//   pad    the standard mapping (city/gamepad.js names the family and reads the left stick); the face
//          buttons, bumpers, triggers and right stick are read here by position, the FC Xbox layout
//          (A pass, B shoot, X lob, Y through). A Switch pad's A/B and X/Y are swapped by label, as
//          gamepad.js does.
//   touch  the page's buttons set held bits (setTouch); a swipe on the picture is a right-stick flick
import { readPad, familyOf } from "../../city/gamepad.js";
import { BTN } from "./sim.js";

const KEYMAP = {
  ArrowUp: BTN.UP, KeyW: BTN.UP, ArrowDown: BTN.DOWN, KeyS: BTN.DOWN, ArrowLeft: BTN.LEFT, KeyA: BTN.LEFT, ArrowRight: BTN.RIGHT, KeyD: BTN.RIGHT,
  KeyJ: BTN.A, KeyZ: BTN.A, KeyK: BTN.B, KeyX: BTN.B, KeyL: BTN.X, KeyC: BTN.X, KeyI: BTN.Y, KeyV: BTN.Y,
  ShiftLeft: BTN.RT, ShiftRight: BTN.RT, Space: BTN.LT, KeyQ: BTN.LB, KeyE: BTN.RB, KeyO: BTN.RB,
};
const MOVE = BTN.UP | BTN.DOWN | BTN.LEFT | BTN.RIGHT;
// The right stick's bits from the left stick's (R held on a keyboard).
const toRS = (m) => ((m & BTN.UP) ? BTN.RU : 0) | ((m & BTN.DOWN) ? BTN.RD : 0) | ((m & BTN.LEFT) ? BTN.RL : 0) | ((m & BTN.RIGHT) ? BTN.RR : 0);

// Pad glyphs for the buttons gamepad.js GLYPHS does not name.
export const PAD_GLYPHS = {
  xbox: { A: "A", B: "B", X: "X", Y: "Y", LB: "LB", RB: "RB", LT: "LT", RT: "RT", RS: "RIGHT STICK", start: "MENU" },
  playstation: { A: "✕", B: "○", X: "□", Y: "△", LB: "L1", RB: "R1", LT: "L2", RT: "R2", RS: "RIGHT STICK", start: "OPTIONS" },
  switch: { A: "B", B: "A", X: "Y", Y: "X", LB: "L", RB: "R", LT: "ZL", RT: "ZR", RS: "RIGHT STICK", start: "+" },
  generic: { A: "A", B: "B", X: "X", Y: "Y", LB: "LB", RB: "RB", LT: "LT", RT: "RT", RS: "RIGHT STICK", start: "START" },
};
// The FC layout is by position (pass on the bottom button): on a Switch pad the bottom button is
// labelled B, so the glyphs above name the labels at those positions.

const down = (pad, i) => { const b = pad?.buttons?.[i]; return Boolean(b && (typeof b === "object" ? b.pressed || b.value > 0.5 : b > 0.5)); };

export function createInput() {
  let keys = 0, touch = 0, startQ = 0, padStart = false, family = null, tapped = 0, rHeld = false, swipe = 0, swipeT = 0;
  const typing = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); };
  const kd = (e) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === "Enter" || e.code === "Escape") { if (!e.repeat) startQ++; e.preventDefault(); return; }
    if (e.code === "KeyR") { rHeld = true; e.preventDefault(); return; }
    const b = KEYMAP[e.code];
    if (b) { keys |= b; tapped |= b; e.preventDefault(); }
  };
  const ku = (e) => { if (e.code === "KeyR") rHeld = false; const b = KEYMAP[e.code]; if (b) keys &= ~b; };
  const blur = () => { keys = 0; touch = 0; rHeld = false; };
  window.addEventListener("keydown", kd);
  window.addEventListener("keyup", ku);
  window.addEventListener("blur", blur);
  return {
    // -> {mask, start, pad}. A key pressed and let go between two samples still counts once.
    sample() {
      let mask = keys | touch | tapped;
      tapped = 0;
      if (rHeld) { const mv = mask & MOVE; mask = (mask & ~MOVE) | toRS(mv); }
      if (swipeT > 0) { mask |= swipe; swipeT--; }
      const p = readPad();
      if (p.connected) {
        family = p.family;
        let raw = null;
        try { raw = Array.from(navigator.getGamepads?.() || []).find(x => x && x.connected !== false) || null; } catch { raw = null; }
        const t = 0.35;
        if (p.x > t) mask |= BTN.RIGHT; else if (p.x < -t) mask |= BTN.LEFT;
        if (p.y > t) mask |= BTN.DOWN; else if (p.y < -t) mask |= BTN.UP;
        // by position: bottom A, right B, left X, top Y (the FC Xbox layout)
        if (down(raw, 0)) mask |= BTN.A;
        if (down(raw, 1)) mask |= BTN.B;
        if (down(raw, 2)) mask |= BTN.X;
        if (down(raw, 3)) mask |= BTN.Y;
        if (down(raw, 4)) mask |= BTN.LB;
        if (down(raw, 5)) mask |= BTN.RB;
        if (down(raw, 6)) mask |= BTN.LT;
        if (down(raw, 7)) mask |= BTN.RT;
        const rx = raw?.axes?.[2] || 0, ry = raw?.axes?.[3] || 0;
        if (rx > 0.6) mask |= BTN.RR; else if (rx < -0.6) mask |= BTN.RL;
        if (ry > 0.6) mask |= BTN.RD; else if (ry < -0.6) mask |= BTN.RU;
        if (p.held.start && !padStart) startQ++;
        padStart = p.held.start;
        void familyOf;
      } else family = null;
      // the screen's up is the far touchline: the sim's UP is +y, which the camera draws up
      const start = startQ > 0; startQ = 0;
      return { mask, start, pad: family };
    },
    setTouch(bits) { touch = bits; },
    // a swipe on the picture: a right-stick flick for a few frames
    flick(dx, dy) {
      let b = 0;
      if (Math.abs(dx) > Math.abs(dy) * 0.6) b |= dx > 0 ? BTN.RR : BTN.RL;
      if (Math.abs(dy) > Math.abs(dx) * 0.6) b |= dy < 0 ? BTN.RU : BTN.RD;
      swipe = b; swipeT = 4;
    },
    pressStart() { startQ++; },
    stop() { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("blur", blur); },
  };
}
