// THE MARKET's input from the city: what each human on file did in one machine day, read from the
// day the builder has just published (netlify/lib/plans.js publishSplit calls this, server side).
// The market never writes a plan; this only reads one. Pure given its arguments.
//   -> {v, day, ver, n: {slug: [name, dead 0|1, flags]}, a: {slug: [work, crowd, sport, play, civic]}}
// flags: 1 untradable (the chess park's barred() rule, a harm review, the faiths' founders).
// The terms are raw; the engine (src/market/engine.js) puts each over the day's mean.
import * as SIM from "../city/sim.js";
import { NIGHT_SET } from "../city/nightlifeSim.js";
import { isExcludedQid } from "../../netlify/lib/excluded.js";

export const ACTIVITY_V = 1;
const r2 = (x) => Math.round(x * 100) / 100;

// Who may never be a stock: the park's rule (chess/roster.js barred(): documented harm, SOYLENT
// GREEN, threat 80 or more), a harm review pending or decided against, the faiths' founders, and
// every private citizen.
export function untradable(s) {
  if (!s || s.kind === "citizen") return true;
  if (s.harm || s.tier === "SOYLENT GREEN" || (s.breakdown?.threat ?? 0) >= 80) return true;
  if (s.harmReviewPending || s.harmReview?.decision === "serious" || s.harmReview?.decision === "gate") return true;
  if (s.wikidata && isExcludedQid(s.wikidata)) return true;
  return false;
}

// plan: format-1 json; people: key -> census subject; summary: the day's format-2 summary (its
// occupancy samples `p`, `civic`, `enterprise`); sat: key -> satisfaction (enterprise.js).
export function marketTerms(plan, people, summary, sat) {
  const P = plan.places, occ = summary?.p || {}, step = summary?.step || 0.5, samples = summary?.samples || 48;
  // SPORT: the leagues' rosters (rating x the team's form), the tennis ladder, the Pit
  const sport = {};
  const add = (k, x) => { sport[k] = (sport[k] || 0) + x; };
  const civ = summary?.civic;
  for (const d of Object.values(civ?.districts || {})) {
    const teams = d.teams ? Object.values(d.teams) : d.team ? [d.team] : [];
    for (const t of teams) {
      const form = String(t.form || ""), w = [...form].filter(c => c === "W").length;
      const f = form.length ? 0.5 + w / (2 * form.length) : 0.5;
      for (const r of t.roster || []) if (Array.isArray(r)) add(r[0], ((Number(r[2]) || 50) / 100) * f);
    }
  }
  const ladder = civ?.leagues?.tennis?.ladder || [];
  ladder.forEach((k, i) => add(k, 1 - i / Math.max(1, ladder.length)));
  const pit = civ?.leagues?.pit?.rank || [];
  pit.forEach((k, i) => add(k, 1 - i / Math.max(1, pit.length)));
  // CIVIC: the council's seat holders, by approval
  const civic = {};
  for (const d of Object.values(civ?.districts || {})) if (d.seat?.holder) civic[d.seat.holder] = Math.max(0.2, 1 + (Number(d.seat.approval) || 0) / 200);
  // THE MALL: owners and staff, thriving shops more
  const shop = {};
  for (const b of summary?.enterprise?.biz || []) {
    const bonus = b.status === "THRIVING" ? 2 : b.status === "STRUGGLING" ? 0.5 : 1;
    if (b.owner) shop[b.owner] = Math.max(shop[b.owner] || 0, bonus);
    for (const s of b.staff || []) if (Array.isArray(s)) shop[s[0]] = Math.max(shop[s[0]] || 0, bonus / 2);
  }
  const n = {}, a = {};
  for (const key of Object.keys(plan.subjects).sort()) {
    const s = people.get(key);
    if (!s || s.kind === "citizen") continue;
    n[key] = [String(s.name || key), s.died ? 1 : 0, untradable(s) ? 1 : 0];
    let work = 0, crowd = 0, play = 0;
    for (const g of SIM.rowSegs(P, plan.subjects[key])) {
      const hrs = Math.max(0, Math.min(24, g.to) - Math.max(0, g.from));
      if (!hrs) continue;
      if (g.activity === "work") work += hrs;
      else if (g.activity === "leisure") {
        play += NIGHT_SET.has(g.placeId) ? 2 * hrs : hrs;
        const arr = occ[g.placeId];
        if (arr) for (let k = Math.max(0, Math.floor(g.from / step)); k < samples && k * step < g.to; k++) crowd += (arr[k] || 0) * step;
      }
    }
    const x = sat?.get?.(key);
    const w = work * (x ? Math.max(0, x.s) / 100 : 0.5) + (shop[key] || 0);
    a[key] = [r2(w), r2(crowd), r2(sport[key] || 0), r2(play), r2(civic[key] || 0)];
  }
  return { v: ACTIVITY_V, day: plan.day, ver: null, n, a };
}
