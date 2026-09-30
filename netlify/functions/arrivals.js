// GET /api/arrivals: INTAKE, the processing hall (src/Arrivals.jsx). The newest arrivals on
// file that today's published plan does not hold yet (pending, with the machine day they
// are released on), and the most recent ones it does (released). netlify/lib/arrivals.js.
// -> {today, latest, releaseNext, releaseNextAt, pending: [...], released: [...], at}
import { getStore } from "@netlify/blobs";
import { censusSubjects } from "../lib/census.js";
import { classifyArrivals } from "../lib/arrivals.js";
import { STORE, manifest2Cached, partKey } from "../lib/plans.js";
import { machineClock } from "../../src/city/sim.js";

const json = (status, body, cache = "no-store") => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": cache },
});

// A built day never changes, so its membership is kept per (day, ver) on a warm instance.
const members = new Map();
function membersOf(day, ver) {
  const id = `${day}/${ver}`;
  if (!members.has(id)) {
    const p = getStore({ name: STORE, consistency: "strong" }).get(partKey(day, ver, "find"), { type: "json" }).then(f => {
      if (!f || !Array.isArray(f.subjects)) throw new Error(`no find index for day ${day}`);
      return new Set(f.subjects.map(r => r[0]));
    });
    p.catch(() => members.delete(id));
    members.set(id, p);
    while (members.size > 8) members.delete(members.keys().next().value);
  }
  return members.get(id);
}

let census = { at: 0, subjects: null };
const CENSUS_MS = 30 * 1000;
const LIST_DROP = ["breakdown", "stratum", "places"];   // the sim's inputs stay here (fields=list)

export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "Intake is observed, not joined. Joining is a separate process. It is called intake." });
  try {
    if (!census.subjects || Date.now() - census.at > CENSUS_MS) census = { at: Date.now(), subjects: await censusSubjects({ withTimes: true }) };
    const now = Date.now(), today = machineClock(now).day;
    const m2 = await manifest2Cached(15 * 1000);
    const days = Object.entries(m2?.days || {}).map(([d, e]) => [Number(d), e.ver]).filter(([d]) => d >= today);
    const latest = days.length ? Math.max(...days.map(([d]) => d)) : null;
    // A day whose membership cannot be read is left out: its subjects count as not yet in it.
    const plans = (await Promise.all(days.map(([d, ver]) => membersOf(d, ver).then(keys => [d, keys], () => null)))).filter(Boolean);
    const out = classifyArrivals({ subjects: census.subjects, plans, today, latest, nowMs: now });
    const slim = s => { const r = { ...s }; for (const k of LIST_DROP) delete r[k]; return r; };
    return json(200, { today, latest, releaseNext: out.releaseNext, releaseNextAt: out.releaseNextAt, pending: out.pending.map(slim), released: out.released.map(slim), at: new Date(now).toISOString() }, "public, max-age=20");
  } catch (err) {
    console.error("arrivals failed", err);
    return json(503, { error: "Intake is closed for cleaning. The Department does not clean. It is closed anyway.", pending: [], released: [] });
  }
};

export const config = { path: "/api/arrivals" };
