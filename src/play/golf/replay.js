// Replay any saved round on the sim it was played on: {v, cfg, inputLog} -> the final state.
// v1 (circle greens, three-press putting, the first flight and roll) is frozen in ./v1/; v2 is the
// live sim. Not imported by the game (the v1 code stays out of the golf chunk): for checks, and for
// the day a server verifies a round.
import * as v1 from "./v1/sim.js";
import * as v2 from "./sim.js";

export const versionOf = (rec) => Number(rec?.cfg?.v ?? rec?.v ?? 1);
export const simOf = (v) => (v >= 2 ? v2 : v1);
export function replayRecord(rec, maxTicks) {
  return simOf(versionOf(rec)).replay(rec.cfg, rec.inputLog, maxTicks);
}
