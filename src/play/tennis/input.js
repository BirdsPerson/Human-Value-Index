// THE TENNIS CLUB, playable: the hands. Keys, a controller (src/city/gamepad.js, the city's own
// reader) and the touch pad, folded into the sim's one bitmask a frame, plus START (pause) on its
// own, which never reaches the sim or the record.
//   keys      arrows / WASD move; Z or J: A; X or K: B; Enter (or Esc): START
//   pad       stick or d-pad; A (Xbox A, PlayStation cross, Switch A): A; B, or the left face
//             button: B; Start
//   touch     the pad's held bits, set by the page's buttons (setTouch)
import { readPad, DEADZONE } from "../../city/gamepad.js";
import { BTN } from "./sim.js";

const KEYMAP = {
  ArrowUp: BTN.UP, KeyW: BTN.UP, ArrowDown: BTN.DOWN, KeyS: BTN.DOWN, ArrowLeft: BTN.LEFT, KeyA: BTN.LEFT, ArrowRight: BTN.RIGHT, KeyD: BTN.RIGHT,
  KeyZ: BTN.A, KeyJ: BTN.A, KeyX: BTN.B, KeyK: BTN.B,
};

export function createInput() {
  let keys = 0, touch = 0, startQ = 0, padStart = false, family = null;
  const typing = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); };
  const down = (e) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === "Enter" || e.code === "Escape") { if (!e.repeat) startQ++; e.preventDefault(); return; }
    const b = KEYMAP[e.code];
    if (b) { keys |= b; e.preventDefault(); }
  };
  const up = (e) => { const b = KEYMAP[e.code]; if (b) keys &= ~b; };
  const blur = () => { keys = 0; touch = 0; };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  return {
    // -> {mask, start (pressed since the last sample), pad: family | null}
    sample() {
      let mask = keys | touch;
      const p = readPad();
      if (p.connected) {
        family = p.family;
        const t = Math.max(0.35, DEADZONE);
        if (p.x > t) mask |= BTN.RIGHT; else if (p.x < -t) mask |= BTN.LEFT;
        if (p.y > t) mask |= BTN.DOWN; else if (p.y < -t) mask |= BTN.UP;
        if (p.held.act) mask |= BTN.A;
        if (p.held.back || p.held.run) mask |= BTN.B;
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
