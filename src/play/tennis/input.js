// THE TENNIS CLUB, playable: the hands. Keys, a controller (src/city/gamepad.js, the city's own
// reader), the touch pad and the pointer, folded into the sim's one mask a frame, plus START
// (pause) on its own, which never reaches the sim or the record.
//   keys      arrows / WASD move; Z or J: A; X or K: B; C: CHALLENGE; Enter (or Esc): START
//   pad       stick or d-pad; A (Xbox A, PlayStation cross, Switch A): A; B, or the left face
//             button: B; SELECT (Xbox VIEW, PlayStation CREATE, Switch minus): CHALLENGE; Start
//   touch     the pad's held bits, set by the page's buttons (setTouch); the challenge prompt (tapC)
//   pointer   press on the court: run there; hold, drag for spin and aim, release to swing
//             (sim.js ptrBits: the spot to 10 cm, the drag in three steps each way)
import { readPad, DEADZONE } from "../../city/gamepad.js";
import { BTN, ptrBits } from "./sim.js";

const KEYMAP = {
  ArrowUp: BTN.UP, KeyW: BTN.UP, ArrowDown: BTN.DOWN, KeyS: BTN.DOWN, ArrowLeft: BTN.LEFT, KeyA: BTN.LEFT, ArrowRight: BTN.RIGHT, KeyD: BTN.RIGHT,
  KeyZ: BTN.A, KeyJ: BTN.A, KeyX: BTN.B, KeyK: BTN.B, KeyC: BTN.C,
};
// What the pad's SELECT is called on each family's pad.
export const SELECT_GLYPH = { xbox: "VIEW", playstation: "CREATE", switch: "−", generic: "SELECT" };
const SELECT = 8;
// the drag, in the picture's logical pixels -> -3..3
export const dragStep = (v) => { const a = Math.abs(v), n = a < 4 ? 0 : a < 10 ? 1 : a < 18 ? 2 : 3; return v < 0 ? -n : n; };

function padSelect() {
  try {
    const pads = Array.from(navigator.getGamepads?.() || []), p = pads.find(q => q && q.connected !== false), b = p?.buttons?.[SELECT];
    return Boolean(b && (typeof b === "object" ? b.pressed || b.value > 0.5 : b > 0.5));
  } catch { return false; }
}

export function createInput() {
  let keys = 0, touch = 0, startQ = 0, padStart = false, family = null, tapC = 0, last = "keys";
  // the pointer: held, the court spot pressed, the press point and the current point (logical px);
  // fresh: samples a press is reported for at least, so a quick click still reaches the sim
  const ptr = { held: false, x: 0, y: 0, ax: 0, ay: 0, cx: 0, cy: 0, fresh: 0 };
  const typing = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); };
  const down = (e) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === "Enter" || e.code === "Escape") { if (!e.repeat) startQ++; e.preventDefault(); return; }
    const b = KEYMAP[e.code];
    if (b) { keys |= b; last = "keys"; e.preventDefault(); }
  };
  const up = (e) => { const b = KEYMAP[e.code]; if (b) keys &= ~b; };
  const blur = () => { keys = 0; touch = 0; ptr.held = false; };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  return {
    // -> {mask, start (pressed since the last sample), pad: family | null, last: "keys" | "pad" | "pointer"}
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
        if (padSelect()) mask |= BTN.C;
        if (p.held.start && !padStart) startQ++;
        padStart = p.held.start;
        if (mask & ~(keys | touch)) last = "pad";
      } else family = null;
      if (tapC > 0) { mask |= BTN.C; tapC--; }
      if (ptr.held || ptr.fresh > 0) {
        mask |= ptrBits(ptr.x, ptr.y, dragStep(ptr.cx - ptr.ax), dragStep(ptr.cy - ptr.ay));
        if (ptr.fresh > 0) ptr.fresh--;
      }
      const start = startQ > 0; startQ = 0;
      return { mask, start, pad: family, last };
    },
    setTouch(bits) { touch = bits; },
    // the challenge prompt, tapped or clicked: held for a few samples so a quick tap is seen
    tapC() { tapC = 4; },
    // the pointer on the picture: court (metres, or null off the floor) and the logical pixel
    pointerDown(court, lx, ly) {
      ptr.held = true; ptr.fresh = 3; last = "pointer";
      if (court) { ptr.x = court.x; ptr.y = court.y; }
      ptr.ax = ptr.cx = lx; ptr.ay = ptr.cy = ly;
    },
    pointerMove(lx, ly) { if (ptr.held) { ptr.cx = lx; ptr.cy = ly; } },
    pointerUp() { ptr.held = false; },
    pressStart() { startQ++; },
    stop() { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); },
  };
}
