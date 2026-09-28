// The social tick (scheduled, hourly). Advances the Substrate's relationships to the
// current machine hour: 1 real minute = 1 machine hour, so each run covers ~60 machine
// hours. Pure JS, no LLM, deterministic from the seed and the stored state (see
// src/city/social.js). First run fast-forwards 30 machine days so the city isn't empty.
import { machineClock, SEED } from "../../src/city/sim.js";
import { emptyState, advance, publish, publishSubject } from "../../src/city/social.js";
import { fullRoster } from "../../src/city/roster.js";
import { censusSubjects } from "../lib/census.js";
import { getState, putState, putPublic } from "../lib/social-store.js";

export const FAST_FORWARD_DAYS = 30;
const MAX_HOURS_PER_RUN = 24 * 40;   // bounded work per invocation; a backlog catches up next hour

const defaultIo = { getState, putState, putPublic, census: censusSubjects };

// io is swappable so scripts/social-seed.mjs runs exactly this against production Blobs.
export async function tick(nowMs = Date.now(), io = defaultIo) {
  const nowHour = Math.floor(machineClock(nowMs).mt);
  let state = await io.getState().catch(() => null);
  if (!state || state.seed !== SEED) {
    const start = nowHour - 24 * FAST_FORWARD_DAYS;
    state = emptyState(start - (((start % 24) + 24) % 24), SEED);
  }
  const roster = fullRoster(await io.census());
  advance(state, roster, nowHour, { maxHours: MAX_HOURS_PER_RUN });
  const pub = publish(state, state.hour);
  pub.bySubject = {};
  for (const s of roster) {
    const k = s.slug;
    const one = publishSubject(state, k);
    if (one.relations.length || one.events.length) pub.bySubject[k] = { relations: one.relations.slice(0, 8), events: one.events.slice(0, 5) };
  }
  pub.at = new Date(nowMs).toISOString();
  await io.putState(state);
  await io.putPublic(pub);
  return { hour: state.hour, nowHour, behind: nowHour - state.hour, counts: pub.counts };
}

export default async () => {
  try {
    const r = await tick();
    console.log("social tick", JSON.stringify(r));
  } catch (err) {
    console.error("social tick failed", err);
  }
};

export const config = { schedule: "@hourly" };
