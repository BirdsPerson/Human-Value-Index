// Replay any saved game on the sim it was played on: {version, seed, cfg, inputLog} -> its result.
// v1 (no fouls, the first make model), v2 (the 2K-style game with one EASY MODE switch), v3 (the
// difficulty levels) and v4 (lead passes, icon passing, the half court) are frozen in ./v1/ .. ./v4/;
// from v5 a version is a frozen engine directory, ./engine-v5/ (the possession: throw-ins, the
// backcourt, no press, line awareness; scripts/freeze-hoops.mjs); the live engine is ./engine/
// (docs/design/BASKETBALL.md section 4.12).
// A record's camera metadata (rec.cam) never reaches a sim. Not imported by the game itself, so the
// frozen code stays out of the page's chunk unless an old tape is played (the page imports this file
// lazily for that): for the checks, old tapes, and the day a server verifies.
import * as v1 from "./v1/sim.js";
import * as v2 from "./v2/sim.js";
import * as v3 from "./v3/sim.js";
import * as v4 from "./v4/sim.js";
import * as v5 from "./engine-v5/index.js";
import * as live from "./engine/index.js";

export const versionOf = (rec) => Number(rec?.version ?? 1);
export const simOf = (v) => (v >= 6 ? live : v === 5 ? v5 : v === 4 ? v4 : v === 3 ? v3 : v === 2 ? v2 : v1);
export function replayRecord(rec) { return simOf(versionOf(rec)).replay(rec); }
