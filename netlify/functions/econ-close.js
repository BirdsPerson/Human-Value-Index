// THE TREASURY's daily close (scheduled, hourly; the first run after 00:00 UTC does the work):
// yesterday's returns on every industry position, from the last published machine day of that
// real day (netlify/lib/economy.js closeDay). A day is closed once: its returns rows are written
// once and every credit carries an idempotency key, so the other 23 runs, and any retry, change
// nothing. A missed day (up to 3 back) is closed on the next run. No ledger configured: nothing.
// UBI and the citizen's spending need no close: they are counted when the citizen COLLECTs.
import { ledger } from "../lib/economy-db.js";
import { closeDay } from "../lib/economy.js";
import { utcDay, addDays } from "../../src/economy/rules.js";

export const CATCH_UP_DAYS = 3;

export async function runClose(nowMs = Date.now()) {
  const L = ledger();
  if (!L) return { skipped: "closed" };
  const today = utcDay(nowMs);
  const b = await L.rpc("econ_board", { days: 1 });
  const through = b.closed_through ? String(b.closed_through).slice(0, 10) : addDays(today, -2);
  const done = [];
  for (let d = addDays(today, -CATCH_UP_DAYS); d < today; d = addDays(d, 1)) {
    if (d <= through) continue;
    done.push(await closeDay(d));
  }
  return { today, closed: done };
}

export default async () => {
  try {
    console.log("econ-close", JSON.stringify(await runClose()));
  } catch (err) {
    console.error("econ-close failed", err?.name, err?.message);
  }
};

export const config = { schedule: "@hourly" };
