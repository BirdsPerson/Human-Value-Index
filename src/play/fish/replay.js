// Any trip on the sim it was played on: v1 (the power meter, the lures, the tension gauge; the page's
// EXPERT mode) is frozen in ./v1/sim.js; v2 (one button) is ./sim.js. A trip or a donation without a
// version is v1 (everything filed before v2 was). Read by the page, netlify/functions/aquarium.js and
// scripts/check-fish.mjs.
import * as v1 from "./v1/sim.js";
import * as v2 from "./sim.js";

export const VERSIONS = [1, 2];
export const versionOf = (rec) => { const v = Number(rec?.v ?? rec?.cfg?.v ?? 1); return VERSIONS.includes(v) ? v : null; };
export const simOf = (v) => (Number(v) === 2 ? v2 : v1);
export const replayTrip = (v, cfg, log, o) => simOf(v).replay(cfg, log, o);
export const verifyCatchV = (v, cfg, log, n, claim, o) => simOf(v).verifyCatch(cfg, log, n, claim, o);
