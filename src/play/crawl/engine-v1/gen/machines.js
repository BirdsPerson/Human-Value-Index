// Machines from the theme's table, by budget (band 1: two). Never on the critical path when they
// lock a door.
//   store   a leaf room off the route behind a LOCKED door; its KEYCARD in another room two or more
//           doors away, reachable without the store's door (keycards are slotless: a full pack never
//           blocks one). Inside: a SALVAGE CRATE and a COFFEE.
//   copier  THE COPIER, a generator, in a room with one door (the chokepoint); never in the arrival
//           or the descent room.
import { T } from "../grid.js";
import { chance, pick } from "../rng.js";
import { graphDist } from "./accrete.js";

const doorsOf = (B, id) => B.doors.filter(D => D.a === id || D.b === id);
export function addMachines(B, r, plan, fl) {
  const off = fl.off, M = plan.band.machines || {};
  const out = { store: -1, storeDoor: -1, keyRoom: -1, copier: -1 };
  const special = (id) => id === fl.arrivalRoom || id === fl.descentRoom;
  if (chance(r, M.store ?? 0)) {
    const leaves = B.rooms.filter(R => !special(R.id) && off[R.id] >= 1 && doorsOf(B, R.id).length === 1 && R.cells.length >= 9).map(R => R.id);
    if (leaves.length) {
      const s = pick(r, leaves), keys = B.rooms.filter(R => R.id !== s && R.id !== fl.arrivalRoom && graphDist(B, R.id, s) >= 2 && R.cells.length >= 6).map(R => R.id);
      if (keys.length) {
        const D = doorsOf(B, s)[0];
        D.locked = true; B.g.t[D.i] = T.LOCKED;
        out.store = s; out.storeDoor = D.i; out.keyRoom = pick(r, keys);
      }
    }
  }
  if (plan.f >= (M.copierFrom ?? 0) && chance(r, M.copier ?? 0)) {
    const ok = (R) => !special(R.id) && R.id !== out.store && R.id !== out.keyRoom && R.cells.length >= 12;
    let c = B.rooms.filter(R => ok(R) && doorsOf(B, R.id).length === 1).map(R => R.id);
    if (!c.length) c = B.rooms.filter(R => ok(R) && off[R.id] >= 1).map(R => R.id);
    if (c.length) out.copier = pick(r, c);
  }
  return out;
}
