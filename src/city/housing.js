// THE HOUSING OFFICE (pure): which door a player (a citizen, `kind: "citizen"`) is given, and which
// doors a transfer may offer. A player is housed in a flat kept for players (tower.js marks them:
// famous residents never hash into one) that no other player holds, when one stands empty in their
// band; else the one fewest players hold. Deterministic given the census: the server
// (netlify/lib/housing.js) decides and writes the answer onto the file and its pen card (`home`), and
// every viewer reads that answer (sim.js homeAt), so no two consumers can disagree.
import * as SIM from "./sim.js";
import { towerPlan, residentFlat, h01 } from "./tower.js";
import { LINE_TOLERANCE } from "../figures.js";

// ---- the players' flats -------------------------------------------------------------------------
let UNITS = null;   // unit id -> {u, p, f, b, building, label, code, level, rooms}
function units() {
  if (UNITS) return UNITS;
  UNITS = new Map();
  for (const band of SIM.HOMES_BY_BAND) for (const p of band) {
    const b = SIM.BUILDING[SIM.PLACES[p]?.building], plan = b && towerPlan(b);
    if (!plan) continue;
    for (const st of plan.storeys) for (const u of st.units) {
      if (u.kind !== "flat" || u.placeId !== p || !u.citizen) continue;
      UNITS.set(u.id, { u: u.id, p, f: st.simFloor, b: b.id, building: String(b.name || b.id).toUpperCase(), label: u.label, code: st.code, level: st.level, rooms: u.rooms.map(r => r.purpose) });
    }
  }
  return UNITS;
}
export const unitInfo = (id) => units().get(id) || null;
export const playerUnits = (places) => { const want = new Set(places); return [...units().values()].filter(x => want.has(x.p)); };

// The flat a subject sleeps in on `day` (null: not a tower flat).
export function unitAt(s, day) {
  const p = SIM.homeOf(s, SIM.SEED, day), b = SIM.BUILDING[SIM.PLACES[p]?.building], plan = b && towerPlan(b);
  return plan ? residentFlat(plan, s, SIM.SEED, day)?.id || null : null;
}
// unit id -> how many of these players sleep there on `day`
export function occupancy(players, day) {
  const occ = new Map();
  for (const o of players || []) { const u = unitAt(o, day); if (u) occ.set(u, (occ.get(u) || 0) + 1); }
  return occ;
}
const rank = (key, salt) => (x) => h01(`${key}|${salt}|${x.u}`);
const byRank = (f) => (a, b) => f(a) - f(b) || (a.u < b.u ? -1 : 1);

// The score is ON THE LINE of the band above (within LINE_TOLERANCE points of its cut): a transfer
// may offer a door one band up.
export function qualifiesUp(s, day) {
  if (typeof s?.score !== "number") return false;
  const k = SIM.citizenBand(s, day);
  return k > 0 && SIM.citizenBand({ ...s, tier: undefined, score: s.score + LINE_TOLERANCE }, day) < k;
}

// -> {u, p, f} for a player with no assignment (or one their tier no longer honors), on `day`
// (the day it takes effect). others: every other player on the census.
export function allocate(s, others, day) {
  const cands = playerUnits(SIM.bandHomesFor(s, day));
  if (!cands.length) return null;
  const occ = occupancy(others, day), key = SIM.keyOf(s);
  const free = cands.filter(c => !occ.get(c.u));
  // the flat the hash already gives them (their door before the office wrote one), if it is free
  const was = unitAt({ ...s, home: undefined }, day);
  const pick = free.find(c => c.u === was) || free.sort(byRank(rank(key, "house")))[0]
    || cands.sort((a, b) => (occ.get(a.u) || 0) - (occ.get(b.u) || 0) || rank(key, "house")(a) - rank(key, "house")(b))[0];
  return { u: pick.u, p: pick.p, f: pick.f };
}

// REQUEST A TRANSFER's list: up to n empty players' flats in the band (not the one they hold), and
// up to 2 one band up when the score qualifies. The order is hashed from the file and the day the
// move would land, so the list holds still while it is read and the server re-derives it exactly.
export const OFFERS = 4, OFFERS_UP = 2;
export function transferOptions(s, others, day) {
  const occ = occupancy(others, day), key = SIM.keyOf(s), cur = unitAt(s, day);
  const r = rank(key, `offer|${day}`);
  const open = (places) => playerUnits(places).filter(c => !occ.get(c.u) && c.u !== cur).sort(byRank(r));
  const up = qualifiesUp(s, day);
  return { qualifiesUp: up, options: [...open(SIM.bandHomesFor(s, day)).slice(0, OFFERS), ...(up ? open(SIM.bandHomesFor(s, day, true)).slice(0, OFFERS_UP).map(c => ({ ...c, up: true })) : [])] };
}
