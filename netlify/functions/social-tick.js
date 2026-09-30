// The hourly trigger for the social tick. A scheduled function gets 30 s, which the tick
// outgrew (the catch-up run was already at the limit at ~430 subjects), so this only calls
// the background worker (social-tick-background.js, 15 min), which answers 202 at once and
// does the work. The tick itself lives in netlify/lib/social-tick.js.
import { censusSubjects } from "../lib/census.js";
import { loadPlans } from "../lib/plans.js";
import { tickIo, tickSecret, TICK_HEADER } from "../lib/social-store.js";
import { tick as runTick, FAST_FORWARD_DAYS } from "../lib/social-tick.js";

export { FAST_FORWARD_DAYS };
const defaultIo = () => tickIo(undefined, () => censusSubjects({ strict: true }), { plans: loadPlans });
// Kept for scripts and checks: the same tick, by default against this site's Blobs.
export const tick = (nowMs = Date.now(), io = defaultIo(), opts) => runTick(nowMs, io, opts);

export default async (req, context) => {
  const secret = tickSecret();
  const base = context?.site?.url || process.env.URL || "https://humanvalueindex.com";
  if (!secret) { console.error("social tick trigger: no HVI_TICK_SECRET or ANTHROPIC_API_KEY; worker not called"); return; }
  try {
    const res = await fetch(`${base}/.netlify/functions/social-tick-background`, {
      method: "POST", headers: { [TICK_HEADER]: secret }, signal: AbortSignal.timeout(20_000),
    });
    console.log("social tick trigger", res.status, base);
    if (res.status !== 202) console.error("social tick trigger: worker answered", res.status, (await res.text()).slice(0, 200));
  } catch (err) {
    console.error("social tick trigger failed", err);
  }
};

export const config = { schedule: "@hourly" };
