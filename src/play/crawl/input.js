// THE SUB-BASEMENTS' hands: pads, keys and touch -> one input word a frame (engine/input/word.js).
// Two pad presets (docs/design/DUNGEON.md 3.9): right-handed (X attack, B roll, Y tool, A interact,
// LB use, RB next slot, LT aim lock, RT run) and LEFT-HANDED (the left thumb still moves; the actions
// move to the bumpers and triggers: LB attack, RB roll, RT tool, LT interact, X use, B next slot,
// Y aim lock; full stick runs). The d-pad moves on both (the doc's "d-pad up/down" for the slot is
// left to RB / B, since the d-pad already moves). Keys and touch run by default; Shift / WALK walks.
import { readPad } from "../../city/gamepad.js";
import { pack } from "./engine/index.js";

const SECTOR = Math.PI / 8;
// a heading from a vector, with hysteresis so a stick on a boundary does not chatter the log
export function headingFrom(x, y, prev = -1) {
  const a = Math.atan2(y, x), k = ((Math.round(a / SECTOR) % 16) + 16) % 16;
  if (prev >= 0) { let d = a - prev * SECTOR; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; if (Math.abs(d) < SECTOR * 0.5 + 0.07) return prev; }
  return k;
}

const KEYMAP = {
  attack: ["j", "z"], roll: ["k", "x"], tool: ["l", "c"], interact: ["e", " "], use: ["q"], lock: ["f"],
};
const SLOT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];

export function makeInput({ hand = 1 } = {}) {
  const keys = new Set();
  const touch = { x: 0, y: 0, mag: 0, attack: false, roll: false, tool: false, interact: false, use: false, lock: false, walk: false };
  const s = { hand, head: -1, slot: 0, padPrev: null, lastFamily: null, mode: "keys" };
  const down = (k) => keys.has(k);
  const any = (list) => list.some(down);
  return {
    state: s, touch,
    setHand(h) { s.hand = h; },
    keydown(e) {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const i = SLOT_KEYS.indexOf(k); if (i >= 0) s.slot = i;
      keys.add(k); if (e.shiftKey) keys.add("Shift");
      s.mode = "keys";
    },
    keyup(e) { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys.delete(k); if (!e.shiftKey) keys.delete("Shift"); },
    clear() { keys.clear(); Object.assign(touch, { x: 0, y: 0, mag: 0, attack: false, roll: false, tool: false, interact: false, use: false, lock: false }); },
    setSlot(i) { s.slot = i; },
    // -> {word, pad} for this frame
    read(pack0 = null) {
      let x = (down("d") || down("ArrowRight") ? 1 : 0) - (down("a") || down("ArrowLeft") ? 1 : 0);
      let y = (down("s") || down("ArrowDown") ? 1 : 0) - (down("w") || down("ArrowUp") ? 1 : 0);
      let mag = x || y ? (down("Shift") ? 1 : 2) : 0;
      const b = { attack: any(KEYMAP.attack), roll: any(KEYMAP.roll), tool: any(KEYMAP.tool), interact: any(KEYMAP.interact), use: any(KEYMAP.use), lock: any(KEYMAP.lock) };
      // touch
      if (touch.mag > 0.15) { x = touch.x; y = touch.y; mag = touch.walk || touch.mag < 0.55 ? 1 : 2; s.mode = "touch"; }
      for (const k of Object.keys(b)) if (touch[k]) { b[k] = true; s.mode = "touch"; }
      // the pad
      const p = readPad();
      if (p.connected) {
        const H = p.held, prev = s.padPrev || {};
        const left = s.hand === -1;
        const px = p.lmag > 0 ? p.lx : p.dx, py = p.lmag > 0 ? p.ly : p.dy, pm = p.lmag > 0 ? p.lmag : p.dx || p.dy ? 1 : 0;
        const lt = p.lt > 0.5, rt = p.rt > 0.5;
        const pb = left
          ? { attack: H.turnL, roll: H.turnR, tool: rt, interact: lt, use: H.find, lock: H.labels, next: H.back, run: false }
          : { attack: H.find, roll: H.back, tool: H.labels, interact: H.act, use: H.turnL, lock: lt, next: H.turnR, run: rt };
        if (pm > 0) { x = px; y = py; mag = pm >= 0.92 || pb.run ? 2 : 1; s.mode = "pad"; }
        for (const k of ["attack", "roll", "tool", "interact", "use", "lock"]) if (pb[k]) { b[k] = true; s.mode = "pad"; }
        if (pb.next && !prev.next) s.slot = (s.slot + 1) % 12;
        s.padPrev = { next: pb.next };
        s.lastFamily = p.family;
      }
      let head = s.head;
      if (mag) { head = headingFrom(x, y, s.head); s.head = head; }
      if (pack0) b.use = b.use || pack0.use;
      return pack({ head: head < 0 ? 0 : head, mag, slot: s.slot, ...b });
    },
  };
}
