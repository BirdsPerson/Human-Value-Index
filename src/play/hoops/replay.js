// Replay any saved game on the sim it was played on: {version, seed, cfg, inputLog} -> its result.
// v1 (no fouls, the first make model) and v2 (the 2K-style game with one EASY MODE switch) are frozen
// in ./v1/ and ./v2/; the live sim is ./sim.js (v3, the difficulty levels). Not imported by the game
// itself, so the frozen code stays out of the page's chunk unless an old tape is played (the page
// imports this file lazily for that): for the checks, old tapes, and the day a server verifies.
import * as v1 from "./v1/sim.js";
import * as v2 from "./v2/sim.js";
import * as live from "./sim.js";

export const versionOf = (rec) => Number(rec?.version ?? 1);
export const simOf = (v) => (v >= 3 ? live : v === 2 ? v2 : v1);
export function replayRecord(rec) { return simOf(versionOf(rec)).replay(rec); }
