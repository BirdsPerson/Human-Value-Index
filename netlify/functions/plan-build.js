// Every 10 real minutes: wake the plan builder (plan-build-background.js, 15 min), which
// builds every missing machine day through today + LOOKAHEAD (netlify/lib/plans.js). A
// machine day is 24 real minutes, so a run that finds nothing to do costs one manifest read.
import { tickSecret, TICK_HEADER } from "../lib/social-store.js";

export default async (req, context) => {
  const secret = tickSecret();
  const base = context?.site?.url || process.env.URL || "https://humanvalueindex.com";
  if (!secret) { console.error("plan build trigger: no HVI_TICK_SECRET or ANTHROPIC_API_KEY; worker not called"); return; }
  try {
    const res = await fetch(`${base}/.netlify/functions/plan-build-background`, {
      method: "POST", headers: { [TICK_HEADER]: secret }, signal: AbortSignal.timeout(20_000),
    });
    if (res.status !== 202) console.error("plan build trigger: worker answered", res.status, (await res.text()).slice(0, 200));
  } catch (err) {
    console.error("plan build trigger failed", err);
  }
};

export const config = { schedule: "*/10 * * * *" };
