// THE ESTATE PITCH, playable: the hands. Keys, a controller and the touch pad, folded into the sim's
// one 16-bit mask a frame (sim.js BTN), plus START (pause) on its own, which never reaches the sim or
// the record. Both follow EA SPORTS FC's defaults (docs/CITY_SPEC.md, Soccer, "Controls"):
//   keys   FC 27's default WASD keyboard layout (help.ea.com, "mouse and keyboard controls on PC"):
//          WASD move; the four keys L ; K O sit like the pad's face buttons: L = A (pass; defending:
//          contain), ; = B (shoot; tackle), K = X (lob / cross; slide), O = Y (through ball; rush the
//          keeper); P = RT (sprint); / = LT (shield, jockey); I = LB (chip / lobbed modifier, trigger
//          a run; defending: change player); , = RB (finesse; teammate contain); the arrow keys are
//          the right stick (skill moves, held with Right Shift in FC; switching on defence);
//          Enter or Esc: START
//   pad    the standard mapping (city/gamepad.js names the family and reads the left stick); the face
//          buttons, bumpers, triggers and right stick are read here by POSITION, FC's default layout
//          (bottom pass, right shoot, left lob, top through). A Switch pad's labels at those
//          positions differ (PAD_GLYPHS names them), as gamepad.js does.
//   touch  the page's buttons set held bits (setTouch); a swipe on the picture is a right-stick flick
import { readPad, familyOf } from "../../city/gamepad.js";
import { BTN } from "./sim.js";

export const KEYMAP = {
  KeyW: BTN.UP, KeyS: BTN.DOWN, KeyA: BTN.LEFT, KeyD: BTN.RIGHT,
  KeyL: BTN.A, Semicolon: BTN.B, KeyK: BTN.X, KeyO: BTN.Y,
  KeyP: BTN.RT, Slash: BTN.LT, KeyI: BTN.LB, Comma: BTN.RB,
  ArrowUp: BTN.RU, ArrowDown: BTN.RD, ArrowLeft: BTN.RL, ArrowRight: BTN.RR,
};
// The keys as the legend and the guide name them, by the pad button they stand for.
export const KEY_GLYPHS = { A: "L", B: ";", X: "K", Y: "O", LB: "I", RB: ",", LT: "/", RT: "P", RS: "ARROWS", LS: "WASD", start: "ESC" };
// The pad buttons by standard-mapping index (the FC default by position).
export const PAD_INDEX = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7 };

// Pad glyphs for the buttons gamepad.js GLYPHS does not name.
export const PAD_GLYPHS = {
  xbox: { A: "A", B: "B", X: "X", Y: "Y", LB: "LB", RB: "RB", LT: "LT", RT: "RT", RS: "RIGHT STICK", LS: "LEFT STICK", start: "MENU" },
  playstation: { A: "✕", B: "○", X: "□", Y: "△", LB: "L1", RB: "R1", LT: "L2", RT: "R2", RS: "RIGHT STICK", LS: "LEFT STICK", start: "OPTIONS" },
  switch: { A: "B", B: "A", X: "Y", Y: "X", LB: "L", RB: "R", LT: "ZL", RT: "ZR", RS: "RIGHT STICK", LS: "LEFT STICK", start: "+" },
  generic: { A: "A", B: "B", X: "X", Y: "Y", LB: "LB", RB: "RB", LT: "LT", RT: "RT", RS: "RIGHT STICK", LS: "LEFT STICK", start: "START" },
};
// The FC layout is by position (pass on the bottom button): on a Switch pad the bottom button is
// labelled B, so the glyphs above name the labels at those positions.

const down = (pad, i) => { const b = pad?.buttons?.[i]; return Boolean(b && (typeof b === "object" ? b.pressed || b.value > 0.5 : b > 0.5)); };

export function createInput() {
  let keys = 0, touch = 0, startQ = 0, padStart = false, family = null, tapped = 0, swipe = 0, swipeT = 0;
  const typing = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); };
  const kd = (e) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === "Enter" || e.code === "Escape") { if (!e.repeat) startQ++; e.preventDefault(); return; }
    const b = KEYMAP[e.code];
    if (b) { keys |= b; tapped |= b; e.preventDefault(); }
  };
  const ku = (e) => { const b = KEYMAP[e.code]; if (b) keys &= ~b; };
  const blur = () => { keys = 0; touch = 0; };
  window.addEventListener("keydown", kd);
  window.addEventListener("keyup", ku);
  window.addEventListener("blur", blur);
  return {
    // -> {mask, start, pad}. A key pressed and let go between two samples still counts once.
    sample() {
      let mask = keys | touch | tapped;
      tapped = 0;
      if (swipeT > 0) { mask |= swipe; swipeT--; }
      const p = readPad();
      if (p.connected) {
        family = p.family;
        let raw = null;
        try { raw = Array.from(navigator.getGamepads?.() || []).find(x => x && x.connected !== false) || null; } catch { raw = null; }
        const t = 0.35;
        if (p.x > t) mask |= BTN.RIGHT; else if (p.x < -t) mask |= BTN.LEFT;
        if (p.y > t) mask |= BTN.DOWN; else if (p.y < -t) mask |= BTN.UP;
        // by position: bottom A, right B, left X, top Y, the bumpers and the triggers (FC's default)
        for (const [k, i] of Object.entries(PAD_INDEX)) if (down(raw, i)) mask |= BTN[k];
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
