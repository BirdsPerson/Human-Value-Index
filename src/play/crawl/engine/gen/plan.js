// The floor plan from the band: size, the critical path's length N, the room count, the flags.
import { drawInt, chance } from "../rng.js";
import { bandOf, isLiftFloor } from "../themes/index.js";

export function planFloor(th, f, r) {
  const b = bandOf(th, f), lift = isLiftFloor(th, f), arrival = f === th.entry;
  return {
    f, band: b, w: b.size[0], h: b.size[1],
    path: drawInt(r, b.path[0], b.path[1]), rooms: drawInt(r, b.rooms[0], b.rooms[1]),
    lift, last: f >= th.last, entryFloor: arrival,
    infested: !arrival && !lift && chance(r, b.infested),
    groups: b.groups[f] ?? b.groups[Math.max(...Object.keys(b.groups).map(Number))],
    roster: b.roster.filter(m => { const j = Object.entries(b.joins || {}).find(([, id]) => id === m); return !j || f >= Number(j[0]); }),
  };
}
