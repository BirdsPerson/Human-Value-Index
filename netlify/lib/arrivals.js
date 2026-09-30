// INTAKE, the Department's processing hall (src/Arrivals.jsx, route #arrivals). Who is in
// the hall: the newest arrivals on file (referred and engine figures, assessed citizens)
// that today's published city plan does not hold yet, and the most recent few it does.
//
// A plan day is built once and never changes (netlify/lib/plans.js), so a subject filed
// after a day was built walks into the city only on the first built day that holds them:
// the next day the builder has not built yet. Pure: the function feeds it the census (with
// filing times) and the built days' membership (each day's find index keys).
import * as SIM from "../../src/city/sim.js";

export const RELEASED_N = 10;          // released arrivals kept in the hall so it is never empty
export const PENDING_MAX = 40;         // the bench seats this many; the rest wait off-screen
export const STALE_MS = 6 * 3600000;   // filed this long ago and still unplanned: not an arrival, skip

// Real ms at which machine day `day` begins (day 1 = CITY_EPOCH; a day is 24 real minutes).
export const dayStartMs = (day) => SIM.CITY_EPOCH + ((day - 1) * 24 * 3600000) / SIM.DEFAULT_SCALE;

const placeName = (id) => SIM.PLACES[id]?.name || String(id || "").toUpperCase();
const districtName = (id) => SIM.DISTRICTS.find(d => d.id === id)?.name || String(id || "").toUpperCase();

// "THE SPRAWL, HAB BLOCK A // SLAG RAKER, FOUNDRY": where the city will house and employ them.
export function assignmentOf(s) {
  try {
    const home = SIM.homeOf(s), job = SIM.assignJob(s);
    const hp = SIM.PLACES[home];
    const title = job.rankTitle && job.rankTitle !== job.title ? `${job.title} // ${job.rankTitle}` : job.title;
    return {
      home: `${districtName(hp?.district)}, ${placeName(home)}`.toUpperCase(),
      job: `${title}, ${placeName(job.place)}`.toUpperCase(),
      district: job.district || null,
    };
  } catch { return null; }
}

// subjects: census records, each with filedAt (ISO) where known. plans: [[day, Set(keys)]]
// for the built days from today on (any order). today: the machine day now. latest: the
// newest built day (or null). -> {pending, released, releaseNext}: newest first, each
// record plus {key, status, releaseDay, releaseAt, assign}.
export function classifyArrivals({ subjects, plans, today, latest = null, nowMs = Date.now(), releasedN = RELEASED_N, pendingMax = PENDING_MAX }) {
  const built = [...plans].filter(([d]) => d >= today).sort((a, b) => a[0] - b[0]);
  const todays = built.find(([d]) => d === today)?.[1] || null;
  const last = latest ?? (built.length ? built[built.length - 1][0] : null);
  const releaseNext = Math.max(today + 1, (last ?? today) + 1);
  const newest = [...subjects].filter(s => s && s.name && typeof s.score === "number")
    .sort((a, b) => String(b.filedAt || "").localeCompare(String(a.filedAt || "")));
  const pending = [], released = [];
  for (const s of newest) {
    const key = SIM.keyOf(s);
    // No plan published for today: the city runs its local sim over the census, which
    // holds everyone, so everyone on file is already out there.
    if (!todays || todays.has(key)) {
      if (released.length < releasedN) released.push({ ...s, key, status: "released", releaseDay: null, releaseAt: null, assign: assignmentOf(s) });
    } else {
      const age = s.filedAt ? nowMs - Date.parse(s.filedAt) : Infinity;
      const first = built.find(([, keys]) => keys.has(key))?.[0];
      if (first == null && !(age < STALE_MS)) continue;   // an old file the plans leave out is not an arrival
      if (pending.length < pendingMax) {
        const releaseDay = first ?? releaseNext;
        pending.push({ ...s, key, status: "pending", releaseDay, releaseAt: new Date(dayStartMs(releaseDay)).toISOString(), assign: assignmentOf(s) });
      }
    }
    if (released.length >= releasedN && pending.length >= pendingMax) break;
  }
  return { pending, released, releaseNext, releaseNextAt: new Date(dayStartMs(releaseNext)).toISOString() };
}
