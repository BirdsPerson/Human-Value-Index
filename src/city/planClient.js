// The browser's door to the published plans (/api/plan, built by netlify/lib/plans.js):
// the machine day's city, built once server side, loaded into the sim (sim.js setPlan) so
// this browser never runs the whole roster's capacity allocation and routes on its main
// thread. Today's plan is fetched once per machine day (24 real minutes) and kept; the
// next day's is fetched in the last machine hours of today. No plan (not yet built, the
// office down): the sim computes the day locally, exactly as before.
import { machineClock, setPlan, dropPlan, plannedDays, planOf } from "./sim.js";

const MANIFEST_MS = 60 * 1000;
let manifest = null, manifestAt = 0, inflight = null;
const loading = new Map();   // day -> promise

function wanted(realMs) {
  const c = machineClock(realMs);
  const days = [c.day];
  if (c.hour >= 21) days.push(c.day + 1);   // ready before midnight
  if (c.hour < 2) days.push(c.day - 1);     // a quest report looks back 90 real seconds
  return { today: c.day, days };
}

async function readManifest(force) {
  if (!force && manifest && Date.now() - manifestAt < MANIFEST_MS) return manifest;
  const r = await fetch("/api/plan");
  if (!r.ok) throw new Error(`plan manifest ${r.status}`);
  manifest = await r.json(); manifestAt = Date.now();
  return manifest;
}

function loadDay(day, ver) {
  const key = `${day}/${ver}`;
  if (loading.has(key)) return loading.get(key);
  const p = fetch(`/api/plan/${day}/${ver}`).then(r => (r.ok ? r.json() : null)).then(json => {
    const changed = json ? setPlan(json, ver) : false;
    if (changed && typeof window !== "undefined") window.dispatchEvent(new Event("hvi-plans"));
    return changed;
  }).catch(() => false).finally(() => loading.delete(key));
  loading.set(key, p);
  return p;
}

// Resolves once today's plan is loaded (or known to be missing). Safe to call often.
export function ensurePlans(realMs = Date.now()) {
  if (typeof fetch !== "function") return Promise.resolve(false);
  if (inflight) return inflight;
  const { today, days } = wanted(realMs);
  const need = days.filter(d => !planOf(d));
  for (const d of plannedDays()) if (d < today - 1) dropPlan(d);
  if (!need.length) return Promise.resolve(true);
  inflight = readManifest(need.includes(today) && manifest && !manifest.days?.[today])
    .then(m => (m?.format === 1 ? Promise.all(need.filter(d => m.days?.[d]).map(d => loadDay(d, m.days[d]))) : null))
    .then(() => Boolean(planOf(today)))
    .catch(() => false)
    .finally(() => { inflight = null; });
  return inflight;
}

// Keep the plans current while the page is open (a machine day turns every 24 real minutes).
let timer = 0;
export function startPlans() {
  if (timer || typeof window === "undefined") return;
  ensurePlans();
  timer = setInterval(() => { if (!document.hidden) ensurePlans(); }, 30 * 1000);
}
