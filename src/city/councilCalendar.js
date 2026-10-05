// THE COUNCIL's calendar (docs/CITY_SPEC.md "Council elections"): the cycle windows, the terms,
// the seats a machine day holds, and when the Council sits in its chamber at THE ASSEMBLY. Light
// (no census reading): the civic fold and the city's drawing import it; council.js re-exports it.
import * as SIM from "./sim.js";

export const ELECTION_MS = 3 * 24 * 3600 * 1000;
export const TERM_SEASONS = 15, TERM_DAYS = TERM_SEASONS * 28;   // 420 machine days: fifteen of the SHORT (28-day) seasons; fixed, not tied to the season calendar (seasons.js)
export const MS_PER_DAY = (24 * 3600 * 1000) / SIM.DEFAULT_SCALE;   // one machine day in real ms (24 min)
export const TERM_MS = TERM_DAYS * MS_PER_DAY;                     // 7 real days
export const SEAT_LAG = 4;

// The machine day a real instant falls in, and the day a cycle's winners take their seats.
export const machineDayAt = (ms) => SIM.machineClock(ms).day;
export const seatDayOf = (closeAt) => machineDayAt(closeAt) + SEAT_LAG;
export const cycleWindow = (anchor, cycle) => { const openAt = anchor + (cycle - 1) * TERM_MS; return { openAt, closeAt: openAt + ELECTION_MS }; };
export const cycleAt = (anchor, now) => Math.max(1, Math.floor((now - anchor) / TERM_MS) + 1);

// The seats for a machine day, from the closed cycles [{cycle, closeAt, seats: {district:
// {key, name, by}}}]: the latest cycle seated by then. -> {district: {holder, name, by, cycle,
// term: [from, to]}} (districts with no holder are absent)
export function seatsOn(day, cycles) {
  const out = {};
  const list = (cycles || []).filter(c => c && c.seats && Number.isFinite(c.closeAt)).sort((a, b) => a.closeAt - b.closeAt);
  for (const c of list) {
    const from = seatDayOf(c.closeAt);
    if (from > day) continue;
    for (const [id, x] of Object.entries(c.seats)) if (x?.key) out[id] = { holder: x.key, name: x.name, by: x.by, cycle: c.cycle, term: [from, from + TERM_DAYS - 1] };
  }
  return out;
}

// The Council sits in its chamber at THE ASSEMBLY (the forum's dais) on machine Tuesdays and
// Fridays, 10:00-13:00. Its members attend by projection: the sim keeps them where they are.
export const COUNCIL_SITS = { days: [2, 5], from: 10, to: 13 };
export function councilSitting(mt) {
  const d0 = Math.floor(mt / 24), h = mt - d0 * 24;
  return COUNCIL_SITS.days.includes(SIM.weekdayOf(d0 + 1)) && h >= COUNCIL_SITS.from && h < COUNCIL_SITS.to;
}
