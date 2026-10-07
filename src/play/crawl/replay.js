// Replay any saved run on the engine it was played on: {v, cfg, logs} -> its claim. v1 is frozen in
// ./engine-v1/ (scripts/freeze-crawl.mjs); the live engine is ./engine/. Not imported by the page
// (it plays a record of the live version on the live engine): for the checks, old tapes, and the
// server's verification in D2.
import * as v1 from "./engine-v1/index.js";
import * as live from "./engine/index.js";

export const versionOf = (rec) => Number(rec?.v ?? 1);
export const engineOf = (v) => (v === 1 ? v1 : live);
export function replayRecord(rec) { return engineOf(versionOf(rec)).replay(rec); }
