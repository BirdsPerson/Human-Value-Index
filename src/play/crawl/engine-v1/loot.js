// Loot by band: what a container and a kill give (drawn from the loot stream), and the hatch: a
// shortcut down, opened by chance by what you break and kill (Stardew's ladder). Containers 2 %
// rising to 25 % as the floor's containers run out, kills 15 %, both x the level's hatch dial.
// Generator spawns never roll and never drop. A swarm's bodies (and a splitter's
// whole family) share one kill's chance.
import { sdraw } from "./rng.js";

export function rollTable(st, table) {
  let tot = 0; for (const [, w] of table) tot += w;
  let x = sdraw(st, "loot") * tot;
  for (const [k, w] of table) { x -= w; if (x < 0) return k; }
  return table[table.length - 1][0];
}
// BOUNTY PAPER's value: the band's range, weighted by depth (x1 at B4, +25 % a floor)
export function bountyValue(st, th, f, base, lt) {
  const lo = lt.bountyPaper[0], hi = lt.bountyPaper[1];
  const v = lo + Math.floor(sdraw(st, "loot") * (hi - lo + 1));
  return Math.max(1, Math.round((v + base) * (1 + (f - th.entry) * 0.25)));
}
// A swarm is one enemy of light bodies: each body rolls its share (0.15 / the group's size).
export function hatchChance(kind, left, total, dial, group = 1) {
  if (kind === "kill") return (0.15 * dial) / group;
  const gone = total > 0 ? 1 - left / total : 1;
  return (0.02 + 0.23 * gone) * dial;
}
export const hatchRoll = (st, kind, left, total, dial, group = 1) => sdraw(st, "loot") < hatchChance(kind, left, total, dial, group);
