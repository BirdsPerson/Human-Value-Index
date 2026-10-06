// THE DAILY COMPLIANCE's press run (docs/PAPER.md), every 15 real minutes: wakes the worker
// (paper-build-background.js), which prints today's edition (America/New_York) if it is not
// printed yet. A run that finds it printed costs one blob read.
import { tickSecret, TICK_HEADER } from "../lib/social-store.js";

export default async (req, context) => {
  const secret = tickSecret();
  const base = context?.site?.url || process.env.URL || "https://humanvalueindex.com";
  if (!secret) { console.error("paper trigger: no HVI_TICK_SECRET or ANTHROPIC_API_KEY; worker not called"); return; }
  try {
    const res = await fetch(`${base}/.netlify/functions/paper-build-background`, {
      method: "POST", headers: { [TICK_HEADER]: secret }, signal: AbortSignal.timeout(20_000),
    });
    if (res.status !== 202) console.error("paper trigger: worker answered", res.status, (await res.text()).slice(0, 200));
  } catch (err) {
    console.error("paper trigger failed", err);
  }
};

export const config = { schedule: "*/15 * * * *" };
