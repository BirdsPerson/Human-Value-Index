// The permit and the filing (docs/design/DUNGEON.md 3.11). D1 is practice: the cfg is made here, in
// the permit's exact shape, with a local seed and seats: [null], and nothing is filed anywhere.
// THE SEAM for D2: getPermit() becomes POST /api/crawl {caseId, action: "start", theme, level, entry,
// hand} -> a server-signed cfg (the seed, cfg.day, cfg.cleared, the seat's case hash and the clock
// are the server's); fileRun() becomes POST {caseId, action: "file", runId, logs, claim}, re-played in
// node before any reward exists. Callers already pass and keep the whole cfg untouched.
import { VERSION } from "./engine/index.js";

export const SERVER_FILING = false;   // D2 turns this on
export async function getPermit({ theme = "subbasements", level, entry = 4, hand = 1, controls = "assist" }) {
  const seed = (Math.floor(Math.random() * 0xfffffffe) + 1) >>> 0, at = Date.now();
  return { local: true, cfg: { runId: `local-${at.toString(36)}-${seed.toString(36)}`, theme, level, entry, day: Math.floor(at / 86400000), cleared: 0, seats: [null], seed, at, v: VERSION, hand, controls } };
}
export async function fileRun() { return { filed: false, local: true }; }
