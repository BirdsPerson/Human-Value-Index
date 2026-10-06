// THE MOUNTAIN, skiable: the hands. Keys, a controller and the touch controls, folded into the sim's
// one input word a tick (sim.js pack), plus the game's own buttons (pause, map, retry, replay), which
// never reach the sim or the record.
//   keys   arrows / WASD: steer (by the screen: down is down the hill); in the air: spin and flip
//          SPACE: hold to crouch (tuck, charge), let go to jump; on a lift: hold to run the ride on
//          SHIFT: tuck   X or Z: brake   Q / E: grab
//          M or TAB: the map   R: retry the challenge (or start the one you stand at)
//          V: instant replay   ENTER or ESC: pause
//   pad    left stick: steer; right stick: spin and flip; A (cross; Switch B-position): crouch / jump;
//          RT: tuck; B or LT: brake; LB / RB: grab; Y: retry; X: replay; SELECT: map; START: pause
//   touch  a stick on the left half (steer; in the air, the tricks); JUMP, TUCK, BRAKE, GRAB
import { familyOf, deadzone } from "../../city/gamepad.js";
import { pack } from "./sim.js";

const KEYS = {
  ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  Space: "a", ShiftLeft: "tuck", ShiftRight: "tuck", KeyX: "brake", KeyZ: "brake", KeyQ: "gl", KeyE: "gr",
};
const META = { Enter: "pause", Escape: "pause", KeyM: "map", Tab: "map", KeyR: "retry", KeyV: "replay" };
const btn = (pad, i) => { const b = pad.buttons?.[i]; return Boolean(b && (typeof b === "object" ? b.pressed || b.value > 0.4 : b > 0.4)); };

export function createInput() {
  const held = new Set(), tapped = new Set();
  let meta = [], touch = { lx: 0, ly: 0, a: false, tuck: false, brake: false, gl: false }, padPrev = {}, family = null, last = "keys";
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
      const h = (k) => held.has(k) || tapped.has(k);
      let lx = (h("right") ? 1 : 0) - (h("left") ? 1 : 0), ly = (h("down") ? 1 : 0) - (h("up") ? 1 : 0);
      // keys steer at a carving share of full stick (hold BRAKE to throw the skis round)
      if (lx || ly) { const n = Math.hypot(lx, ly); lx = (lx / n) * 0.7; ly = (ly / n) * 0.7; }
      let rx = 0, ry = 0, a = h("a"), tuck = h("tuck"), brake = h("brake"), gl = h("gl"), gr = h("gr"), one = true;
      tapped.clear();
      if (touch.lx || touch.ly || touch.a || touch.tuck || touch.brake || touch.gl) { lx = touch.lx; ly = touch.ly; a = a || touch.a; tuck = tuck || touch.tuck; brake = brake || touch.brake; gl = gl || touch.gl; last = "touch"; }
      let pads = [];
      try { pads = navigator.getGamepads ? Array.from(navigator.getGamepads() || []) : []; } catch { pads = []; }
      const pad = pads.find(p => p && p.connected !== false);
      if (pad) {
        family = familyOf(pad.id);
        const sw = family === "switch";
        const L = deadzone(pad.axes?.[0] || 0, pad.axes?.[1] || 0), R = deadzone(pad.axes?.[2] || 0, pad.axes?.[3] || 0);
        const dx = (btn(pad, 15) ? 1 : 0) - (btn(pad, 14) ? 1 : 0), dy = (btn(pad, 13) ? 1 : 0) - (btn(pad, 12) ? 1 : 0);
        const P = { a: btn(pad, sw ? 1 : 0), b: btn(pad, sw ? 0 : 1), x: btn(pad, sw ? 3 : 2), y: btn(pad, sw ? 2 : 3), lb: btn(pad, 4), rb: btn(pad, 5), lt: btn(pad, 6), rt: btn(pad, 7), sel: btn(pad, 8), start: btn(pad, 9) };
        const any = L.mag || R.mag || dx || dy || Object.values(P).some(Boolean);
        if (any) {
          last = "pad";
          if (L.mag) { lx = L.x; ly = L.y; one = false; } else if (dx || dy) { const n = Math.hypot(dx, dy); lx = dx / n; ly = dy / n; one = true; }
          if (R.mag) { rx = R.x; ry = R.y; one = false; }
          else if (L.mag) one = false;
          a = a || P.a; tuck = tuck || P.rt; brake = brake || P.b || P.lt; gl = gl || P.lb; gr = gr || P.rb;
        }
        if (P.start && !padPrev.start) meta.push("pause");
        if (P.sel && !padPrev.sel) meta.push("map");
        if (P.y && !padPrev.y) meta.push("retry");
        if (P.x && !padPrev.x) meta.push("replay");
        padPrev = P;
      } else family = null;
      const m = meta; meta = [];
      return { word: pack({ lx, ly, rx, ry, a, tuck, brake, gl, gr, one }), meta: m, mode: last, family };
    },
    setTouch(t) { touch = { ...touch, ...t }; last = "touch"; },
    push(m) { meta.push(m); },
    stop() { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); },
  };
}
