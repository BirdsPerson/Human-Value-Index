// THE NIGHTLIFE QUARTERS at run time (docs/CITY_SPEC.md "THE NIGHTLIFE QUARTERS"): the civic fold's
// NIGHTLIFE factor, the PA's lines (TONIGHT AT ..., the rope, closing time) and the label under a
// venue's name. Pure: node checks run it; the browser reads the same clock.
import { lineupFor, NIGHT_SET, NIGHT_TYPE, HOURS, hoursLine, openAt, UPTOWN_VENUES, DOWNTOWN_VENUES, PERFORMER } from "./nightlifeSim.js";
import { NIGHT_PID } from "./nightlifeGeo.js";
import { PLACES } from "./sim.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (h) => { const x = ((h % 24) + 24) % 24; return `${String(Math.floor(x)).padStart(2, "0")}:${String(Math.round((x % 1) * 60)).padStart(2, "0")}`; };

// ---- the civic fold: a small NIGHTLIFE factor per district ----------------------------------------
// From the day's load (civic.js dayStats: per place, people per half hour 0-24): how full the quarter's
// venues ran from 21:00 to midnight. A busy quarter cheers its own district (up to +4); downtown at a
// roar costs itself a point (the noise) and costs the Sprawl next door one more, and the Archive (the
// bass carries) one at the very loudest. Every other district: 0. Bounded -3..4.
export const NIGHT_MOOD_MIN = -3, NIGHT_MOOD_MAX = 4;
function fill(load, ids) {
  let n = 0, cap = 0;
  for (const id of ids) {
    const a = load?.get(id), c = PLACES[id]?.cap || 0;
    cap += c * 6;
    if (a) for (let k = 42; k < 48 && k < a.length; k++) n += Math.min(a[k], c);
  }
  return cap ? n / cap : 0;
}
export function nightlifeMood(id, load) {
  if (!load) return 0;
  const up = fill(load, UPTOWN_VENUES), down = fill(load, DOWNTOWN_VENUES);
  let v = 0;
  if (id === "uptown") v = Math.round(up * 6);
  else if (id === "downtown") v = Math.round(down * 6) - (down > 0.55 ? 1 : 0);
  else if (id === "sprawl") v = down > 0.55 ? -1 : 0;
  else if (id === "archive") v = down > 0.8 ? -1 : 0;
  return clamp(v, NIGHT_MOOD_MIN, NIGHT_MOOD_MAX) || 0;
}

// ---- the PA ----------------------------------------------------------------------------------------
const NAME = { aurum: "AURUM", "minor-key": "THE MINOR KEY", "the-heckle": "THE HECKLE", cypher: "THE CYPHER", voltage: "VOLTAGE", strobe: "STROBE", basement: "BASEMENT 0x00", ceiling: "THE CEILING" };
const QUARTER = (pid) => (UPTOWN_VENUES.includes(pid) ? "uptown" : "downtown");
// Lines for the PA at machine time mt; here: the district the page is on (null on the map).
export function nightPa(mt, here = null) {
  const day = Math.floor(mt / 24) + 1, h = mt - (day - 1) * 24;
  const night = h < 6 ? day - 1 : day, hh = h < 6 ? h + 24 : h;
  if (here && here !== "uptown" && here !== "downtown") return [];
  if (hh < 17) return [];
  const sets = lineupFor(night).filter(g => !here || QUARTER(g.venue) === here);
  const out = [];
  for (const g of sets) {
    if (hh < g.from) out.push(`TONIGHT AT ${NAME[g.venue]}: ${g.name}, ${g.word}, ${fmt(g.from)}. ATTENDANCE IS RECORDED. ENJOYMENT IS ESTIMATED.`);
    else if (hh < g.to) out.push(`NOW AT ${NAME[g.venue]}: ${g.name} ${g.word}. THE DEPARTMENT IS ON THE GUEST LIST.`);
  }
  if ((!here || here === "uptown") && openAt("aurum", hh)) out.push("AURUM // THE ROPE IS UP. TOP TIERS, PROCEED. THE MIDDLE, WAIT. EVERYONE ELSE: DOWNTOWN IS THAT WAY.");
  if ((!here || here === "downtown") && hh >= 27.5 && hh < 28.2) out.push("DOWNTOWN // CLOSING TIME. THE LIGHTS ARE COMING UP. SO IS THE BILL. GO HOME. THE DEPARTMENT KNOWS WHERE THAT IS.");
  if ((!here || here === "uptown") && hh >= 26.6 && hh < 27.3) out.push("UPTOWN // LAST CALL AT AURUM. THE MEZZANINE CLOSES WHEN THE MEZZANINE DECIDES.");
  if ((!here || here === "downtown") && hh >= 22 && hh < 27) out.push("THE COOP // OPEN 24 HOURS. THE CHICKEN IS LICENSED. THE WHITE SAUCE IS UNDER REVIEW.");
  return out;
}

// ---- the label under a venue's name (CityIso's panel) ----------------------------------------------
const DOOR = { aurum: "THE ROPE: TOP TIERS WALK IN. THE REST WAIT, OR GO DOWNTOWN" };
export function nightLine(buildingId, mt, inside = 0) {
  const pid = NIGHT_PID[buildingId];
  if (!pid) return null;
  const day = Math.floor(mt / 24) + 1, h = mt - (day - 1) * 24, hh = h < 6 ? h + 24 : h, night = h < 6 ? day - 1 : day;
  const open = openAt(pid, h);
  const set = lineupFor(night).find(g => g.venue === pid && hh < g.to);
  const bits = [`${inside} INSIDE`, open ? hoursLine(pid) : `CLOSED // ${hoursLine(pid)}`];
  if (set) bits.push(`${hh < set.from ? `TONIGHT ${fmt(set.from)}` : "NOW"}: ${set.name}`);
  else if (DOOR[pid] && open) bits.push(DOOR[pid]);
  return bits.join(" // ");
}
export const nightTypeOf = (pid) => NIGHT_TYPE[pid] || null;
export { HOURS, PERFORMER };
