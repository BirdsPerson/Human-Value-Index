// One floor from its seed: plan, the critical path first, side rooms, loops, (lakes), the in-sim
// verify, machines, populate. Draws only from the gen stream seeded by the floor's seed, so nothing
// the AI or the loot draws can move a wall. A chain that cannot grow retries on the stream's next
// seed (bounded and counted: fl.retries).
import { makeGrid, T } from "../grid.js";
import { stream, draw, pick } from "../rng.js";
import { planFloor } from "./plan.js";
import { chain } from "./path.js";
import { accreteSide, addLoops, addLakes } from "./accrete.js";
import { addMachines } from "./machines.js";
import { populate } from "./populate.js";
import { routeOf, offRoute, verifyFloor } from "./verify.js";
import { TEMPLATES } from "./rooms.js";

export const MAX_RETRIES = 40;

export function generateFloor(th, f, seed) {
  const r = stream(seed);
  let retries = 0;
  for (;;) {
    const plan = planFloor(th, f, r);
    const mk = { kind: (rr) => pick(rr, plan.band.templates), make: (kind, rr) => TEMPLATES[kind](rr) };
    const B = { g: makeGrid(plan.w, plan.h), rooms: [], doors: [] };
    if (!chain(B, r, plan, mk)) { if (++retries > MAX_RETRIES) throw new Error(`floor ${f}: the chain would not grow`); continue; }
    const arrivalRoom = 0, descentRoom = plan.path - 1;
    accreteSide(B, r, plan, mk);
    const loops = addLoops(B, r, plan, arrivalRoom, descentRoom);
    addLakes(B, r, plan);
    const g = B.g, A = B.rooms[arrivalRoom], D = B.rooms[descentRoom];
    const ai = A.feat >= 0 ? A.feat : A.cells[A.cells.length >> 1], di = D.feat;
    g.t[di] = plan.lift ? T.LIFT : T.STAIRS;
    const route = routeOf(B, arrivalRoom, descentRoom);
    const fl = {
      f, seed, band: { name: plan.band.name, path: plan.band.path }, lift: plan.lift, last: plan.last, infested: plan.infested, retries, loops,
      g, arrivalRoom, descentRoom, rooms: B.rooms.map(R => ({ id: R.id, kind: R.kind, n: R.cells.length })), doors: B.doors.map(Dd => ({ ...Dd })),
      arrival: { i: ai, x: (ai % g.w) + 0.5, y: Math.floor(ai / g.w) + 0.5 }, descent: { i: di, x: (di % g.w) + 0.5, y: Math.floor(di / g.w) + 0.5 },
      route, routeLen: route.length, off: offRoute(B, route), keycard: null, store: -1, copier: -1, form00: 0,
    };
    const mach = addMachines(B, r, plan, fl);
    fl.store = mach.store; fl.copier = mach.copier; fl.storeDoor = mach.storeDoor; fl.keyRoom = mach.keyRoom;
    fl.doors = B.doors.map(Dd => ({ ...Dd }));
    populate(B, r, plan, fl, th, mach);
    const v = verifyFloor(fl);
    if (!v.ok) { if (++retries > MAX_RETRIES) throw new Error(`floor ${f}: no valid floor`); continue; }
    fl.steps = v.steps; fl.draws = draw(r);   // one last draw: the floor's own salt for the hatch site order
    return fl;
  }
}
