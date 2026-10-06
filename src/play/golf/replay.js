// Replay any saved round on the sim it was played on: {v, cfg, inputLog} -> the final state.
// v1 (circle greens, three-press putting, the first flight and roll) is frozen in ./v1/; v2 (the v2
// ball, button bits only) in ./v2/; v3 (the mouse's events in the log) is the live sim. Not imported
// by the game (the frozen code stays out of the golf chunk): for checks, and for the day a server
// verifies a round.
import * as v1 from "./v1/sim.js";
import * as v2 from "./v2/sim.js";
import * as v3 from "./sim.js";

export const versionOf = (rec) => Number(rec?.cfg?.v ?? rec?.v ?? 1);
export const simOf = (v) => (v >= 3 ? v3 : v === 2 ? v2 : v1);
export function replayRecord(rec, maxTicks) {
  return simOf(versionOf(rec)).replay(rec.cfg, rec.inputLog, maxTicks);
}
