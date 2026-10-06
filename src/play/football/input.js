// THE BOWL, playable: the hands. Keys, a controller and the touch pad, folded into the sim's one
// bitmask a frame (sim.js BTN), plus START (pause) on its own, which never reaches the sim.
//   keys   arrows / WASD move, Shift sprints; Space or J: A (snap, tackle); K: B (spin, switch);
//          U: X (juke, dive, audible); I: Y (stiff arm, swat, hot route); O: RB; L: the right stick
//          up (truck, the hit stick); Q / E: a juke left / right; 1-5: the receivers A B X Y RB
//          (hold for a lob); Enter or Esc: START
//   pad    the standard mapping, read here (gamepad.js reads the stick, the face pair and Start; the
//          left and top buttons, the bumpers, the triggers and the right stick come off the raw pad)
//   touch  the page's buttons (setTouch)
import { readPad, familyOf, DEADZONE } from "../../city/gamepad.js";
import { BTN } from "./sim.js";

const KEYMAP = {
  ArrowUp: BTN.UP, KeyW: BTN.UP, ArrowDown: BTN.DOWN, KeyS: BTN.DOWN, ArrowLeft: BTN.LEFT, KeyA: BTN.LEFT, ArrowRight: BTN.RIGHT, KeyD: BTN.RIGHT,
  Space: BTN.A, KeyJ: BTN.A, KeyK: BTN.B, KeyU: BTN.X, KeyI: BTN.Y, KeyO: BTN.R, KeyL: BTN.RSU, KeyQ: BTN.RSL, KeyE: BTN.RSR,
  ShiftLeft: BTN.SPRINT, ShiftRight: BTN.SPRINT,
  Digit1: BTN.A, Digit2: BTN.B, Digit3: BTN.X, Digit4: BTN.Y, Digit5: BTN.R,
};
// What each button is called on each pad, for the legend and the receivers' discs.
export const PAD_GLYPHS = {
  xbox: { A: "A", B: "B", X: "X", Y: "Y", RB: "RB", sprint: "RT", rs: "RS", start: "MENU" },
  playstation: { A: "✕", B: "○", X: "□", Y: "△", RB: "R1", sprint: "R2", rs: "R-STICK", start: "OPTIONS" },
  switch: { A: "B", B: "A", X: "Y", Y: "X", RB: "R", sprint: "ZR", rs: "R-STICK", start: "+" },
  generic: { A: "A", B: "B", X: "X", Y: "Y", RB: "RB", sprint: "RT", rs: "RS", start: "START" },
};
export const KEY_GLYPHS = { A: "1", B: "2", X: "3", Y: "4", RB: "5" };
const pressed = (pad, i) => { const b = pad?.buttons?.[i]; return Boolean(b && (typeof b === "object" ? b.pressed || b.value > 0.5 : b > 0.5)); };

export function createInput() {
  let keys = 0, touch = 0, startQ = 0, padStart = false, family = null, tapped = 0, rsWas = false;
  const typing = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); };
  const down = (e) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === "Enter" || e.code === "Escape") { if (!e.repeat) startQ++; e.preventDefault(); return; }
    const b = KEYMAP[e.code];
    if (b) { keys |= b; tapped |= b; e.preventDefault(); }
  };
  const up = (e) => { const b = KEYMAP[e.code]; if (b) keys &= ~b; };
  const blur = () => { keys = 0; touch = 0; };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  return {
    // -> {mask, start, pad}. A key pressed and let go between two samples still counts once.
    sample() {
      let mask = keys | touch | tapped;
      tapped = 0;
      const p = readPad();
      if (p.connected) {
        family = p.family;
        const t = Math.max(0.35, DEADZONE);
        if (p.x > t) mask |= BTN.RIGHT; else if (p.x < -t) mask |= BTN.LEFT;
        if (p.y > t) mask |= BTN.DOWN; else if (p.y < -t) mask |= BTN.UP;
        if (p.held.act) mask |= BTN.A;
        if (p.held.back) mask |= BTN.B;
        let raw = null;
        try { raw = Array.from(navigator.getGamepads?.() || []).find(g => g && g.connected !== false) || null; } catch { raw = null; }
        if (raw) {
          const sw = familyOf(raw.id) === "switch";
          if (pressed(raw, sw ? 3 : 2)) mask |= BTN.X;
          if (pressed(raw, sw ? 2 : 3)) mask |= BTN.Y;
          if (pressed(raw, 5)) mask |= BTN.R;
          if (pressed(raw, 7) || pressed(raw, 6)) mask |= BTN.SPRINT;
          // the right stick: a flick is one press
          const rx = raw.axes?.[2] || 0, ry = raw.axes?.[3] || 0, m = Math.sqrt(rx * rx + ry * ry);
          if (m > 0.7 && !rsWas) mask |= Math.abs(ry) > Math.abs(rx) ? (ry < 0 ? BTN.RSU : BTN.RSD) : rx < 0 ? BTN.RSL : BTN.RSR;
          rsWas = m > 0.5;
        }
        if (p.held.start && !padStart) startQ++;
        padStart = p.held.start;
      } else family = null;
      const start = startQ > 0; startQ = 0;
      return { mask, start, pad: family };
    },
    setTouch(bits) { touch = bits; },
    pressStart() { startQ++; },
    stop() { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); },
  };
}
