// Replay any saved game on the sim it was played on: {version, seed, cfg, inputLog} -> its result.
// v1 (no fouls, the first make model) is frozen in ./v1/; the live sim is ./sim.js. Not imported by
// the game itself, so the v1 code stays out of the page's chunk unless an old tape is played (the
// page imports this file lazily for that): for the checks, old tapes, and the day a server verifies.
import * as v1 from "./v1/sim.js";
import * as live from "./sim.js";

export const versionOf = (rec) => Number(rec?.version ?? 1);
export const simOf = (v) => (v >= 2 ? live : v1);
export function replayRecord(rec) { return simOf(versionOf(rec)).replay(rec); }
