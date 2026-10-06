// FOURTH AND LONG: the hands. Two players' buttons, kept apart, folded into the sim's one input word
// a frame (player 1 in the low byte, player 2 in the next), plus START (pause) on its own, which never
// reaches the sim.
//   one player   arrows or WASD move; A: Space, J, X or F; B: K, Z or G; Enter, Esc or P: pause
//   two players  P1: WASD, A = F (or Space), B = G.  P2: arrows, A = / (or L, numpad 0), B = . (or K,
//                numpad .). Two pads: the first is P1, the second P2.
//   touch        the page's pad (setTouch), player 1
// A key pressed and let go between two samples still counts once (a mashed A is never lost).
import { readPad } from "../../city/gamepad.js";
import { BTN } from "./sim.js";

const ONE = {
  ArrowUp: BTN.UP, KeyW: BTN.UP, ArrowDown: BTN.DOWN, KeyS: BTN.DOWN, ArrowLeft: BTN.LEFT, KeyA: BTN.LEFT, ArrowRight: BTN.RIGHT, KeyD: BTN.RIGHT,
  Space: BTN.A, KeyJ: BTN.A, KeyX: BTN.A, KeyF: BTN.A, KeyK: BTN.B, KeyZ: BTN.B, KeyG: BTN.B,
};
const P1 = { KeyW: BTN.UP, KeyS: BTN.DOWN, KeyA: BTN.LEFT, KeyD: BTN.RIGHT, KeyF: BTN.A, Space: BTN.A, KeyG: BTN.B };
const P2 = { ArrowUp: BTN.UP, ArrowDown: BTN.DOWN, ArrowLeft: BTN.LEFT, ArrowRight: BTN.RIGHT, Slash: BTN.A, KeyL: BTN.A, Numpad0: BTN.A, Period: BTN.B, KeyK: BTN.B, NumpadDecimal: BTN.B };
const START = new Set(["Enter", "Escape", "KeyP", "NumpadEnter"]);
// which player and bit a key is, in a mode
export function keyBits(code, two) {
  if (!two) return ONE[code] ? [0, ONE[code]] : null;
  if (P1[code]) return [0, P1[code]];
  if (P2[code]) return [1, P2[code]];
  return null;
}
// a pad's buttons -> the sim's bits
export function padBits(p) {
  if (!p?.connected) return 0;
  let m = 0;
  const t = 0.4;
  if (p.x > t) m |= BTN.RIGHT; else if (p.x < -t) m |= BTN.LEFT;
  if (p.y > t) m |= BTN.DOWN; else if (p.y < -t) m |= BTN.UP;
  if (p.held.act) m |= BTN.A;
  if (p.held.back || p.held.find) m |= BTN.B;
  return m;
}
// the n-th connected pad, read through gamepad.js (handed a navigator that shows it only that pad)
export function padAt(n, nav = globalThis.navigator) {
  let pads = [];
  try { pads = Array.from(nav?.getGamepads?.() || []).filter(p => p && p.connected !== false); } catch { pads = []; }
  return pads[n] ? readPad({ getGamepads: () => [pads[n]] }) : { connected: false };
}
export function createInput({ two = false } = {}) {
  const held = [0, 0], tapped = [0, 0];
  let touch = 0, startQ = 0, padStart = [false, false];
  const fams = [null, null];
  const typing = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); };
  const down = (e) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (START.has(e.code)) { if (!e.repeat) startQ++; e.preventDefault(); return; }
    const kb = keyBits(e.code, two);
    if (!kb) return;
    held[kb[0]] |= kb[1]; tapped[kb[0]] |= kb[1]; e.preventDefault();
  };
  const up = (e) => { const kb = keyBits(e.code, two); if (kb) held[kb[0]] &= ~kb[1]; };
  const blur = () => { held[0] = held[1] = 0; touch = 0; };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  return {
    // -> {word, start, pads: [family | null, family | null]}
    sample() {
      const m = [held[0] | tapped[0] | touch, held[1] | tapped[1]];
      tapped[0] = tapped[1] = 0;
      for (let n = 0; n < 2; n++) {
        const p = padAt(n);
        fams[n] = p.connected ? p.family : null;
        if (!p.connected) { padStart[n] = false; continue; }
        m[two ? n : 0] |= padBits(p);
        if (p.held.start && !padStart[n]) startQ++;
        padStart[n] = p.held.start;
      }
      const start = startQ > 0; startQ = 0;
      return { word: (m[0] & 255) | ((m[1] & 255) << 8), start, pads: [...fams] };
    },
    setTouch(bits) { touch = bits; },
    tap(bits) { tapped[0] |= bits; },
    pressStart() { startQ++; },
    stop() { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); },
  };
}
