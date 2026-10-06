// THE MARKET's tick (scheduled every 10 minutes): every completed machine day not yet priced, in
// order, through the engine (netlify/lib/market.js runTick): the NPCs' orders, the players' batch
// filled at the new price, the board. A machine day is 24 real minutes, so each run finds 0-1
// days; a run after an outage catches up. Idempotent: a day's batch is journaled before its fills,
// the fills are keyed by order, and the state is written under its etag.
import { runTick } from "../lib/market.js";

export default async () => {
  try {
    console.log("market-tick", JSON.stringify(await runTick()));
  } catch (err) {
    console.error("market-tick failed", err?.name, err?.message);
  }
};

export const config = { schedule: "*/10 * * * *" };
