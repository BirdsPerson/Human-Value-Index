// FIND: search the census for a person, and say where they are now. Pure, no DOM: the
// FIND field (CityFind.jsx), the camera (CityIso.jsx) and the checks all read it.
//
// buildIndex runs once per roster (when the census lands or your own file does), never
// per frame; searchIndex is a scan of that prepared index per keystroke.

import { PLACES, BUILDING, DISTRICTS, STATIONS, TRAIN, whereAt, keyOf } from "./sim.js";
import { displayName } from "../figures.js";

const DISTRICT_NAME = Object.fromEntries(DISTRICTS.map(d => [d.id, d.name]));
const HQ = new Set(["hq", "hq-tower"]);

// "André 3000" -> "andre 3000": lower case, accents off, punctuation to spaces.
export function fold(str) {
  return String(str || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// -> [{ s, key, name, hay, words }]; name is the display name (with its qualifier).
export function buildIndex(roster) {
  const out = [];
  const seen = new Set();
  for (const s of roster || []) {
    if (!s || !s.name) continue;
    const key = keyOf(s);
    if (seen.has(key)) continue;
    seen.add(key);
    const name = displayName(s);
    const hay = fold(`${name} ${s.baseName || ""} ${key.replace(/-/g, " ")}`);
    out.push({ s, key, name, hay, words: hay.split(" ") });
  }
  return out;
}

// Best first: the whole name, then the name's start, then a word's start (every word of the
// query must start some word), then anywhere. Your own file first on a tie, then A-Z.
export function searchIndex(index, query, n = 8) {
  const q = fold(query);
  if (!q) return [];
  const qw = q.split(" ");
  const hits = [];
  for (const e of index) {
    const nm = fold(e.name);
    let score = 0;
    if (nm === q || e.key === q.replace(/ /g, "-")) score = 100;
    else if (nm.startsWith(q)) score = 80;
    else if (qw.every(w => e.words.some(x => x.startsWith(w)))) score = 60;
    else if (e.hay.includes(q)) score = 30;
    // a whole word ("andre" -> André the Giant) beats a longer one it starts (Andrew)
    if (score && score < 100 && qw.every(w => e.words.includes(w))) score += 10;
    if (score) hits.push({ e, score: score + (e.s.you ? 5 : 0) });
  }
  hits.sort((a, b) => b.score - a.score || (a.e.name < b.e.name ? -1 : a.e.name > b.e.name ? 1 : 0));
  return hits.slice(0, n).map(h => h.e);
}

// The subject a #city?find=<slug> names (its key), or null.
export const bySlug = (index, slug) => {
  const k = String(slug || "").toLowerCase();
  return (k && index.find(e => e.key === k)) || null;
};

// Where the subject is at machine time mt, for the camera and the status line:
//   mode: "riding" (aboard trainId, car), "platform" (waiting/alighting at stationId),
//         "street" (walking), "inside" (on a floor of buildingId), "classified" (HQ)
//   x, y: map cells (the car's centre while riding; the building's for inside)
export function findTarget(s, mt) {
  const w = whereAt(s, mt);
  const base = { w, x: w.x, y: w.y, buildingId: null, floor: null, placeId: w.placeId };
  if (w.activity === "commute") {
    if (w.sub === "riding") return { ...base, mode: "riding", trainId: w.trainId, car: w.car };
    if (w.sub === "waiting" || w.sub === "alighting") return { ...base, mode: "platform", stationId: w.stationId };
    return { ...base, mode: "street" };
  }
  const b = BUILDING[w.buildingId];
  const t = { ...base, buildingId: w.buildingId, floor: w.floor, x: b ? b.pos.x : w.x, y: b ? b.pos.y : w.y };
  return { ...t, mode: HQ.has(w.buildingId) ? "classified" : "inside" };
}

const hourOf = (mt) => (((mt % 24) + 24) % 24);
export const asleepAt = (mt) => { const h = hourOf(mt); return h >= 22 || h < 7; };

// Where, in a few words, for the result list: "RADIANT CORE, THE WORKS // ON SHIFT".
export function whereShort(t, mt) {
  const w = t.w, pl = PLACES[w.placeId];
  switch (t.mode) {
    case "riding": return `ABOARD ${TRAIN[t.trainId]?.name || "THE LOOP"} // BOUND FOR ${DISTRICT_NAME[w.districtId] || "?"}`;
    case "platform": return `${STATIONS[t.stationId]?.name || "A PLATFORM"} // ${w.sub === "waiting" ? "WAITING" : "ALIGHTING"}`;
    case "street": return `ON FOOT, ${DISTRICT_NAME[w.atDistrictId] || "THE STREETS"} // TO ${pl?.name || "?"}`;
    case "classified": return "HEADQUARTERS // CLASSIFIED";
    default: return `${pl?.name || "?"}, ${DISTRICT_NAME[pl?.district] || ""} // ${activityWord(w, mt)}`;
  }
}
function activityWord(w, mt) {
  if (w.activity === "work") return "ON SHIFT";
  if (w.activity === "leisure") return w.haunt ? "NIGHT WANDER" : "LEISURE";
  return asleepAt(mt) ? "ASLEEP" : "AT HOME";
}

// The status line: "NAME — PLACE, FLOOR. ACTIVITY." in the Department's voice.
export function findLine(s, t, mt) {
  const name = displayName(s).toUpperCase() + (s.you ? " (YOU)" : "");
  const w = t.w, pl = PLACES[w.placeId], dist = DISTRICT_NAME[pl?.district] || "";
  switch (t.mode) {
    case "riding": return `${name} — ABOARD ${TRAIN[t.trainId]?.name || "THE LOOP"}, CAR ${t.car + 1}, BOUND FOR ${dist}. THE JOURNEY IS LOGGED.`;
    case "platform": return w.sub === "waiting"
      ? `${name} — ${STATIONS[t.stationId]?.name}, ON THE PLATFORM. WAITING FOR ${TRAIN[w.trainId]?.name || "THE LOOP"}. IT IS TIMED.`
      : `${name} — ${STATIONS[t.stationId]?.name}, ALIGHTING. BOUND FOR ${pl?.name}. MIND THE GAP.`;
    case "street": return `${name} — ON FOOT IN ${DISTRICT_NAME[w.atDistrictId] || "THE STREETS"}, BOUND FOR ${pl?.name}. THE PAVEMENT IS SCORED.`;
    case "classified": return `${name} — HEADQUARTERS. WHEREABOUTS CLASSIFIED. THE DEPARTMENT KNOWS. YOU NEED NOT.`;
    default: {
      const b = BUILDING[w.buildingId], f = b?.floors[w.floor];
      const where = `${pl?.name}${b && b.floors.length > 1 && f ? `, ${f.name === pl?.name ? f.code : `${f.code} ${f.name}`}` : ""}, ${dist}`;
      if (w.activity === "work") return `${name} — ${where}. ON SHIFT. OUTPUT IS BEING MEASURED.`;
      if (w.activity === "leisure") return w.haunt ? `${name} — ${where}. NIGHT WANDER. OFF-SHIFT HOURS ARE ALSO LOGGED.` : `${name} — ${where}. SANCTIONED LEISURE. ENJOYMENT IS LOGGED.`;
      return asleepAt(mt) ? `${name} — ${where}. HOME, ASLEEP. DO NOT WAKE THE SUBJECT. IT HAS A QUOTA.` : `${name} — ${where}. AT HOME, OFF SHIFT. IDLENESS IS NOTED.`;
    }
  }
}

// The hash for a shareable find: "#city?find=snoop-dogg", keeping ?at= and the like.
export function findHref(key, query = "") {
  const q = new URLSearchParams(String(query || "").replace(/^\?/, ""));
  q.delete("find"); q.delete("floor");
  q.set("find", key);
  return `#city?${q.toString()}`;
}
