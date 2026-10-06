// THE PARK, skateable: the hands. Keys, a controller and the touch pad folded into the sim's one input
// word a tick (sim.js pack), plus the game's own buttons (pause, restart), which never reach the sim.
// The layout is the classic skate game's, by button POSITION (the bottom, right, left and top face buttons are
// the cross, circle, square and triangle on a PlayStation pad, A B X Y on an Xbox pad's positions, B A Y X on a
// Switch pad's):
//   bottom (cross)    OLLIE: hold to crouch, let go to pop       left (square)   FLIP, with a direction
//   right (circle)    GRAB, with a direction; hold to keep it     top (triangle)  GRIND / slide / lip trick
//   R2 / L2           REVERT (as you land on a ramp)              L1 / R1         SPIN left / right in the air
//   d-pad or left stick  push (up), turn, brake; in the air, spin; Up then Down quickly: a manual
//   keys   arrows / WASD d-pad; Z, SPACE or J ollie; X or K flip; C or L grab; V or I grind; SHIFT or U revert;
//          Q / E spin; ENTER / ESC / P pause; R restart
//   touch  a d-pad on the left; cross, square, circle, triangle on the right, a revert button and two spin buttons
import { familyOf, deadzone } from "../../city/gamepad.js";
import { pack } from "./sim.js";

const KEYS = {
  ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  Space: "a", KeyJ: "a", KeyZ: "a", KeyK: "x", KeyX: "x", KeyL: "b", KeyC: "b", KeyI: "y", KeyV: "y", ShiftLeft: "r", ShiftRight: "r", KeyU: "r", KeyQ: "sl", KeyE: "sr",
};
const META = { Enter: "pause", Escape: "pause", KeyP: "pause", KeyR: "restart" };
const btn = (pad, i) => { const b = pad.buttons?.[i]; return Boolean(b && (typeof b === "object" ? b.pressed || b.value > 0.4 : b > 0.4)); };
const BLANK = { up: false, down: false, left: false, right: false, a: false, b: false, x: false, y: false, r: false, sl: false, sr: false };

export function createInput(initial = "keys") {
  const held = new Set(), tapped = new Set();
  let meta = [], touch = { ...BLANK }, padPrev = {}, family = null, last = initial;
  const typing = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); };
  const down = (e) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (META[e.code]) { if (!e.repeat) meta.push(META[e.code]); e.preventDefault(); return; }
    const k = KEYS[e.code];
    if (k) { held.add(k); tapped.add(k); e.preventDefault(); last = "keys"; }
  };
  const up = (e) => { const k = KEYS[e.code]; if (k) held.delete(k); };
  const blur = () => { held.clear(); };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  return {
    // -> {word, meta: [...], mode: "keys" | "pad" | "touch", family}
    sample() {
      const o = {};
      // a tap shorter than a frame still counts once (then lets go: the release is the ollie)
      for (const k of Object.keys(BLANK)) o[k] = held.has(k) || tapped.has(k) || touch[k];
      if (Object.values(touch).some(Boolean)) last = "touch";
      tapped.clear();
      let pads = [];
      try { pads = navigator.getGamepads ? Array.from(navigator.getGamepads() || []) : []; } catch { pads = []; }
      const pad = pads.find(p => p && p.connected !== false);
      if (pad) {
        family = familyOf(pad.id);
                const Ls = deadzone(pad.axes?.[0] || 0, pad.axes?.[1] || 0);
        const P = {
          up: btn(pad, 12) || Ls.y < -0.45, down: btn(pad, 13) || Ls.y > 0.45, left: btn(pad, 14) || Ls.x < -0.45, right: btn(pad, 15) || Ls.x > 0.45,
          a: btn(pad, 0), b: btn(pad, 1), x: btn(pad, 2), y: btn(pad, 3),   // by position, whatever is printed on them
          sl: btn(pad, 4), sr: btn(pad, 5), r: btn(pad, 6) || btn(pad, 7),
        };
        const start = btn(pad, 9), sel = btn(pad, 8);
        if (Object.values(P).some(Boolean) || start || sel) last = "pad";
        for (const k of Object.keys(P)) o[k] = o[k] || P[k];
        if (start && !padPrev.start) meta.push("pause");
        if (sel && !padPrev.sel) meta.push("restart");
        padPrev = { start, sel };
      } else family = null;
      const m = meta; meta = [];
      return { word: pack(o), meta: m, mode: last, family };
    },
    setTouch(t) { touch = { ...touch, ...t }; last = "touch"; },
    clearTouch() { touch = { ...BLANK }; },
    push(m) { meta.push(m); },
    stop() { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); },
  };
}
