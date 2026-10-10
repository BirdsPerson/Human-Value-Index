// THE HOUSING OFFICE's rounds (scheduled, every 15 minutes): every player on the census is given a
// door of their own if they have none (or one their tier no longer honors), and the movers carry the
// furniture of any move that has landed (netlify/lib/housing.js ensureHome), so a player who never
// opens their file still moves on the day, furniture and all. Idempotent: a file with nothing to do
// costs one read. Bounded per run; the next run picks up the rest.
import * as SIM from "../../src/city/sim.js";
import { listPenCards, getCase } from "../lib/store.js";
import { ensureHome } from "../lib/housing.js";

export const PER_RUN = 40;

export async function rounds(nowMs = Date.now()) {
  const today = SIM.machineClock(nowMs).day;
  const cards = await listPenCards(1000);
  const due = cards.filter(c => c?.key?.startsWith("citizen:") && typeof c.score === "number" && (!c.home || (today >= c.home.d && c.home.s !== c.home.d)));
  let assigned = 0, settled = 0;
  for (const c of due.slice(0, PER_RUN)) {
    const caseId = c.key.slice("citizen:".length);
    const rec = await getCase(caseId).catch(() => null);
    if (!rec) continue;
    const r = await ensureHome(caseId, rec, nowMs);
    if (r.assigned) assigned++;
    if (r.settled) settled++;
  }
  return { today, due: due.length, assigned, settled };
}

export default async () => {
  try {
    console.log("housing-tick", JSON.stringify(await rounds()));
  } catch (err) {
    console.error("housing-tick failed", err?.name, err?.message);
  }
};

export const config = { schedule: "*/15 * * * *" };
