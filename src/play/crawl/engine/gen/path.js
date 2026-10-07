// The critical path FIRST (Spelunky's guarantee in Brogue's clothes): the arrival room, then N - 1
// rooms accreted as a chain, each against the previous room only. The last is the descent room.
import { place } from "./accrete.js";
import { TEMPLATES } from "./rooms.js";
import { drawInt } from "../rng.js";
import { T } from "../grid.js";

export function chain(B, r, plan, mk) {
  const { g } = B;
  const arrivalKind = plan.entryFloor ? "lift-lobby" : "stairwell";
  const m0 = TEMPLATES[arrivalKind](r);
  // the arrival room: anywhere it fits
  for (let a = 0; a < 30 && !B.rooms.length; a++) {
    const ox = drawInt(r, (g.w >> 2), g.w - (g.w >> 2) - m0.w), oy = drawInt(r, (g.h >> 2), g.h - (g.h >> 2) - m0.h), cells = [];
    for (const [x, y] of m0.cells) { const i = (y + oy) * g.w + x + ox; g.t[i] = T.FLOOR; g.room[i] = 0; cells.push(i); }
    B.rooms.push({ id: 0, kind: arrivalKind, cells, feat: m0.feature ? (m0.feature[1] + oy) * g.w + m0.feature[0] + ox : -1 });
  }
  // grow the chain; a link that will not fit takes the previous room back and re-slides it (bounded)
  let backs = 0;
  for (let k = 1; k < plan.path; k++) {
    const last = k === plan.path - 1;
    let id = -1;
    for (let t = 0; t < 6 && id < 0; t++) {
      const kind = last ? (plan.lift ? "lift-lobby" : "stairwell") : t < 3 ? mk.kind(r) : "storeroom";
      id = place(B, r, mk.make(kind, r), k - 1, kind, 60);
    }
    if (id < 0) {
      if (k < 2 || ++backs > 8) return false;
      unplace(B); k -= 2;
    }
  }
  return true;
}
function unplace(B) {
  const R = B.rooms.pop(), D = B.doors.pop(), g = B.g;
  for (const i of R.cells) { g.t[i] = T.WALL; g.room[i] = -1; }
  g.t[D.i] = T.WALL;
}
